// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const fs = require('fs');
const events = require('events');
const byline = require('byline');
const csv = require('csv');
const readline = require('readline');
const argparse = require('argparse');

const ParserClient = require('almond-dialog-agent').ParserClient;
const Genie = require('genie-toolkit');
// FIXME
const TpClient = require('genie-toolkit/tool/lib/file_thingpedia_client');
const ThingTalk = require('thingtalk');

const Config = require('../config');

const _mockSharedPrefs = {
    get(key) {
        return undefined;
    },
    set(key, value) {
        return false;
    }
};

function waitFinish(stream) {
    return new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
}
function waitEnd(stream) {
    return new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
    });
}

class Trainer extends events.EventEmitter {
    constructor(rl, lines, options) {
        super();

        this._rl = rl;

        const tpClient = new TpClient(options.locale, options.thingpedia);
        this._schemas = new ThingTalk.SchemaRetriever(tpClient, null, true);
        this._parser = new ParserClient(Config.NL_SERVER_URL, 'en-US', _mockSharedPrefs);

        this._nextLine = lines[Symbol.iterator]();

        this._state = 'loading';
        this._candidates = undefined;
        this._utterance = undefined;
        this._preprocessed = undefined;
        this._entities = undefined;
        this._serial = options.offset - 2;
        this._id = undefined;

        rl.on('line', async (line) => {
            if (line.trim().length === 0 || this._state === 'loading') {
                rl.prompt();
                return;
            }

            if (line === 'd') {
                this.emit('dropped', { id: this._id, utterance: this._utterance });
                this.next();
                return;
            }

            if (this._state === 'code') {
                this._learnThingTalk(line).catch((e) => this.emit('error', e));
                return;
            }

            if (Number.isFinite(parseInt(line))) {
                this._learnNumber(parseInt(line));
            } else if (line === 'n') {
                this._more();
            } else if (line.startsWith('e ')) {
                this._edit(parseInt(line.substring(2).trim()));
            } else if (line === 't') {
                this._state = 'code';
                rl.setPrompt('TT: ');
                rl.prompt();
            } else {
                console.log('Invalid command');
                rl.prompt();
            }
        });
    }

    async _learnThingTalk(code) {
        let targetCode;
        try {
            let program = await ThingTalk.Grammar.parseAndTypecheck(code, this._schemas);

            let clone = {};
            Object.assign(clone, this._entities);
            targetCode = ThingTalk.NNSyntax.toNN(program, this._preprocessed, clone).join(' ');
        } catch(e) {
            console.log(`${e.name}: ${e.message}`);
            this._rl.setPrompt('TT: ');
            this._rl.prompt();
            return;
        }
        console.log(`Learned: ${targetCode}`);
        this.emit('learned', {
            id: this._id,
            flags: {},
            preprocessed: this._preprocessed,
            target_code: targetCode
        });
        this.next();
    }

    _edit(i) {
        if (Number.isNaN(i) || i < 1 || i > this._candidates.length) {
            console.log('Invalid number');
            this._rl.setPrompt('$ ');
            this._rl.prompt();
            return;
        }
        i -= 1;
        const program = ThingTalk.NNSyntax.fromNN(this._candidates[i].code, this._entities);
        console.log('Code: ' + program.prettyprint(true));
        this._state = 'code';
        this._rl.setPrompt('TT: ');
        this._rl.prompt();
    }

    _learnNumber(i) {
        if (i < 1 || i > this._candidates.length) {
            console.log('Invalid number');
            this._rl.setPrompt('$ ');
            this._rl.prompt();
            return;
        }
        i -= 1;
        this.emit('learned', {
            id: this._id,
            flags: {},
            preprocessed: this._preprocessed,
            target_code: this._candidates[i].code.join(' ')
        });
        this.next();
    }

    _more() {
        if (this._state === 'top3') {
            this._state = 'full';
            console.log(`Sentence #${this._serial+1} (${this._id}): ${this._utterance}`);
            for (let i = 0; i < this._candidates.length; i++)
                console.log(`${i+1}) ${this._candidates[i].code.join(' ')}`);
            this._rl.setPrompt('$ ');
            this._rl.prompt();
        } else {
            this._state = 'code';
            this._rl.setPrompt('TT: ');
            this._rl.prompt();
        }
    }

    next() {
        this._next().catch((e) => this.emit('error', e));
    }

    async _next() {
        this._serial++;

        const { value: line, done } = this._nextLine.next();
        if (done) {
            this.emit('end');
            return;
        }

        this._state = 'loading';
        let { id, utterance, preprocessed, target_code: oldTargetCode } = line;
        this._utterance = utterance;
        if (!oldTargetCode)
            oldTargetCode = preprocessed;

        if (!id)
            id = this._serial;

        const parsed = await this._parser.sendUtterance(utterance, /* expecting */ null, /* choices */ []);

        if (oldTargetCode) {
            try {
                const program = ThingTalk.NNSyntax.fromNN(oldTargetCode.split(' '), parsed.entities);
                await program.typecheck(this._schemas);
            } catch(e) {
                console.log(`Sentence ${id}'s existing code is incorrect: ${e}`); //'
                oldTargetCode = undefined;
            }
        }
        if (oldTargetCode)
            parsed.candidates.unshift({ code: oldTargetCode.split(' '), score: 'Infinity' });

        this._state = 'top3';
        this._id = id;
        this._preprocessed = parsed.tokens.join(' ');
        this._entities = parsed.entities;
        this._candidates = (await Promise.all(parsed.candidates.map(async (cand) => {
            try {
                const program = ThingTalk.NNSyntax.fromNN(cand.code, parsed.entities);
                await program.typecheck(this._schemas);
                return cand;
            } catch(e) {
                return null;
            }
        }))).filter((c) => c !== null);

        console.log(`Sentence #${this._serial+1} (${this._id}): ${utterance}`);
        for (var i = 0; i < 3 && i < this._candidates.length; i++)
            console.log(`${i+1}) ${this._candidates[i].code.join(' ')}`);
        this._rl.setPrompt('$ ');
        this._rl.prompt();
    }
}

async function main() {
    const argparser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Import a manually annotated dataset'
    });
    argparser.addArgument('--learned', {
        required: false,
        defaultValue: './learned.txt',
    });
    argparser.addArgument('--dropped', {
        required: false,
        defaultValue: './dropped.txt',
    });
    argparser.addArgument('input', {
        type: fs.createReadStream
    });
    argparser.addArgument('--offset', {
        required: false,
        type: parseInt,
        defaultValue: 1,
    });
    argparser.addArgument(['-l', '--locale'], {
        required: false,
        defaultValue: 'en-US',
        help: `BGP 47 locale tag of the natural language being processed (defaults to en-US).`
    });
    argparser.addArgument('--thingpedia', {
        required: false,
        defaultValue: 'thingpedia.json',
    });
    const args = argparser.parseArgs();


    const learned = new Genie.DatasetStringifier();
    learned.pipe(fs.createWriteStream(args.learned, { flags: (args.offset > 0 ? 'a' : 'w') }));
    const dropped = fs.createWriteStream(args.dropped, { flags: (args.offset > 0 ? 'a' : 'w') });

    let lines = [];
    args.input.setEncoding('utf8');
    const input = args.input.pipe(csv.parse({ columns: true, relax: true, delimiter: '\t' }));
    input.on('data', (line) => {
        lines.push(line);
    });
    await waitEnd(input);

    if (args.offset > 1)
        lines = lines.slice(args.offset-1);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.setPrompt('$ ');

    function quit() {
        learned.end();
        dropped.end();

        console.log('Bye\n');
        rl.close();
        //process.exit();
    }

    const trainer = new Trainer(rl, lines, args);
    trainer.on('end', quit);
    trainer.on('learned', (ex) => {
        learned.write(ex);
    });
    trainer.on('dropped', ({ id, utterance }) => {
        dropped.write(id + '\t' + utterance + '\n');
    });
    rl.on('SIGINT', quit);
    trainer.next();
    //process.stdin.on('end', quit);

    await Promise.all([
        waitFinish(learned),
        waitFinish(dropped),
    ]);
}

main();
