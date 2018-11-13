#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingTalk
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const stream = require('stream');
const assert = require('assert');
const fs = require('fs');
const util = require('util');
const byline = require('byline');
const ThingTalk = require('thingtalk');

const AdminThingpediaClient = require('../util/admin-thingpedia-client');

function escape(name) {
    return name.replace(/[:._]/g, (match) => {
        if (match === '_')
            return '__';
        let code = match.charCodeAt(0);
        return code < 16 ? '_0' + code.toString(16) : '_' + code.toString(16);
    });
}

const ENTITIES = {
    DURATION_0: { value: 2, unit: 'ms' },
    DURATION_1: { value: 3, unit: 'ms' },
    DURATION_3: { value: 4, unit: 'ms' },
    NUMBER_0: 2,
    NUMBER_1: 3,
    NUMBER_2: 4,
    NUMBER_3: 5,
    DATE_0: { day: 1, month: 1, year: 2018 },
    DATE_1: { day: 2, month: 1, year: 2018 },
    DATE_2: { day: 3, month: 1, year: 2018 },
    DATE_3: { day: 4, month: 1, year: 2018 },
    TIME_0: { hour: 0, minute: 1, second: 0 },
    TIME_1: { hour: 0, minute: 2, second: 0  },
    TIME_2: { hour: 0, minute: 3, second: 0  },
    TIME_3: { hour: 0, minute: 4, second: 0  },
    CURRENCY_0: { value: 2, unit: 'usd' },
    CURRENCY_1: { value: 3, unit: 'usd' },
    CURRENCY_2: { value: 4, unit: 'usd' },
    CURRENCY_3: { value: 5, unit: 'usd' },
    LOCATION_0: { latitude: 2, longitude: 2 },
    LOCATION_1: { latitude: 3, longitude: 3 },
    LOCATION_2: { latitude: 4, longitude: 4 },
    LOCATION_3: { latitude: 5, longitude: 5 },

};
Object.freeze(ENTITIES);

function replaceWithSlots(program) {
    program = program.split(' ');

    const entities = {};
    Object.assign(entities, ENTITIES);
    let j = 2;
    for (let i = 0; i < program.length; i++) {
        const token = program[i];
        if (/^GENERIC_ENTITY_/.test(token))
            entities[token] = { value: `generic-${j++}`, display: `generic-display-${j}` };
        else if (/^(QUOTED_STRING|USERNAME|PHONE_NUMBER|EMAIL_ADDRESS|URL|HASHTAG|PATH_NAME)_/.test(token))
            entities[token] = `dummy-${j++}`;
    }
    return [program, entities];
}

async function main() {
    const language = process.argv[2];

    const tpClient = new AdminThingpediaClient(language, null);
    const schemaRetriever = new ThingTalk.SchemaRetriever(tpClient, null, true);

    process.stdin.setEncoding('utf8');
    const input = byline(process.stdin);

    const transformer = new stream.Transform({
        writableObjectMode: true,

        flush() {},
        transform(line, encoding, callback) {
            if (!line) {
                callback();
                return;
            }

            const [id,sentence,program] = line.trim().split('\t');

            Promise.resolve().then(async () => {
                const [slottedProgram, entities] = replaceWithSlots(program);
                const parsed = ThingTalk.NNSyntax.fromNN(slottedProgram, entities);

                try {
                    await parsed.typecheck(schemaRetriever);
                } catch(e) {
                    console.error(`Failed to handle ${id}: ${e.message}`);
                    callback();
                    return;
                }

                const regenerated = ThingTalk.NNSyntax.toNN(parsed, sentence, entities).join(' ');

                // loose equality still preserved
                assert.deepStrictEqual(regenerated.replace(/ join /g, ' => '),
                                       program.replace(/ join /g, ' => '));

                callback(null, `${id}\t${sentence}\t${regenerated}\n`);
            }).catch((e) => {
                console.error(`Failed to handle ${id}: ${e.message}`);
                console.error(e.stack);
                callback();
            });
        }
    });

    input.pipe(transformer).pipe(process.stdout);
}
main();
