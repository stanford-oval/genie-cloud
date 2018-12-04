#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const assert = require('assert');
const stream = require('stream');
const seedrandom = require('seedrandom');
const argparse = require('argparse');
const byline = require('byline');

const ThingTalk = require('thingtalk');

const BinaryPPDB = require('../util/binary_ppdb');
const PPDBUtils = require('../util/ppdb');
const ParameterReplacer = require('../training/replace_parameters');
const AdminThingpediaClient = require('../util/admin-thingpedia-client');

const db = require('../util/db');

class DatasetAugmenter extends stream.Transform {
    constructor(language, options) {
        super({
            readableObjectMode: true,
            writableObjectMode: true,
        });

        this._language = language;
        this._options = options;
        this._rng = seedrandom.alea('almond is awesome');

        this._ppdb = null;
        this._paramReplacer = null;

        this._dbClient = null;
        this._tpClient = null;
        this._schemas = null;

        this._init = this._initialize();
    }

    async _initialize() {
        this._ppdb = await BinaryPPDB.mapFile(this._options.ppdbFile);

        const [dbClient, done] = await db.connect();
        this._dbClient = dbClient;
        await db.query(this._dbClient, 'set transaction isolation level repeatable read');
        await db.query(this._dbClient, 'start transaction read only');
        this.once('finish', () => {
            // close the transaction
            //
            // this is strictly speaking optional because we're closing
            // the connection soon
            this._dbClient.query('commit');
            done();
        });

        this._tpClient = new AdminThingpediaClient(this._language, this._dbClient);
        this._schemas = new ThingTalk.SchemaRetriever(this._tpClient, null, !this._options.debug);

        this._paramReplacer = new ParameterReplacer(this._language, this._schemas, this._dbClient, {
            rng: this._rng,
            addFlag: true,
            quotedProbability: this._options.quotedProbability
        });
        await this._paramReplacer.initialize();
    }

    async _process(ex) {
        await this._init;

        const ppdbProb = ex.flags === 'synthetic' ?
            this._options.ppdbProbabilitySynthetic :
            this._options.ppdbProbabilityParaphrase;

        const output = [ex, ...(await this._paramReplacer.process(ex))];

        const ppdbex = PPDBUtils.apply(ex, this._ppdb, {
            probability: ppdbProb,
            debug: this._debug,
            rng: this._rng
        });
        if (ppdbex)
            output.push(ppdbex, ...(await this._paramReplacer.process(ppdbex)));
        return output;
    }

    _flush() {}

    _transform(inex, encoding, callback) {
        this._process(inex).then((output) => {
            for (let ex of output)
                this.push(ex);
            callback();
        }, (err) => {
            callback(err);
        });
    }
}

function parseFlags(flags) {
    const parsed = {};
    for (let flag of flags.split(','))
        parsed[flag] = true;
    return parsed;
}

function makeId(id, flags) {
    let prefix = '';
    if (flags.replaced)
        prefix += 'R';
    if (flags.augmented)
        prefix += 'P';
    if (flags.synthetic)
        prefix += 'S';
    return prefix + id;
}

async function main() {
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Update Thingpedia Dataset'
    });
    parser.addArgument(['-l', '--language'], {
        required: true,
    });
    parser.addArgument('--ppdb', {
        defaultValue: './ppdb-2.0-m-lexical.bin',
        metavar: 'FILENAME',
        help: 'Path to the binary PPDB file',
    });
    parser.addArgument('--ppdb-synthetic-fraction', {
        type: Number,
        defaultValue: 0.1,
        metavar: 'FRACTION',
        help: 'Fraction of synthetic sentences to augment with PPDB',
    });
    parser.addArgument('--ppdb-paraphrase-fraction', {
        type: Number,
        defaultValue: 1.0,
        metavar: 'FRACTION',
        help: 'Fraction of paraphrase sentences to augment with PPDB',
    });
    parser.addArgument('--quoted-fraction', {
        type: Number,
        defaultValue: 0.1,
        metavar: 'FRACTION',
        help: 'Fraction of sentences that will not have their quoted parameters replaced',
    });

    const args = parser.parseArgs();

    const input = new stream.Transform({
        readableObjectMode: true,
        writableObjectMode: true,

        flush() {},

        transform(line, encoding, callback) {
            let [id, sentence, program] = line.trim().split('\t');

            // assert that the only possible flag is synthetic, as
            // there should be no replaced/augmented sentences in the
            // input
            assert(/^S?[0-9]+$/.test(id));
            let flags = '';
            if (id.startsWith('S')) {
                flags = 'synthetic';
                id = id.substring(1);
            }

            callback(null, {
                id, flags,
                utterance: sentence,
                preprocessed: sentence,
                target_code: program
            });
        }
    });

    const updater = new DatasetAugmenter(args.language, {
        ppdbFile: args.ppdb,
        ppdbProbabilitySynthetic: args.ppdb_synthetic_fraction,
        ppdbProbabilityParaphrase: args.ppdb_paraphrase_fraction,
        quotedProbability: args.quoted_fraction
    });

    const output = new stream.Transform({
        objectMode: true,

        flush() {},
        transform(ex, encoding, callback) {
            const parsedFlags = parseFlags(ex.flags);
            const id = makeId(ex.id, parsedFlags);

            callback(null, id + '\t' + ex.preprocessed + '\t' + ex.target_code + '\n');
        }
    });

    process.stdin.setEncoding('utf8');
    byline(process.stdin).pipe(input).pipe(updater).pipe(output).pipe(process.stdout);
    process.stdin.resume();
    await new Promise((resolve, reject) => {
        process.stdout.on('finish', resolve);
        process.stdout.on('error', reject);
    });

    await db.tearDown();
}
main();

