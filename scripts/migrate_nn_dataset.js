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

const assert = require('assert');
const ThingTalk = require('thingtalk');

const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const db = require('../util/db');

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
};
Object.freeze(ENTITIES);

function replaceWithSlots(program) {
    program = program.split(' ');

    const entities = {};
    Object.assign(entities, ENTITIES);
    let j = 0;
    for (let i = 0; i < program.length; i++) {
        const token = program[i];
        if (/^(QUOTED_STRING|GENERIC_ENTITY|USERNAME|PHONE_NUMBER|EMAIL_ADDRESS|URL|HASHTAG|CURRENCY|PATH_NAME|LOCATION)_/.test(token)) {
            const slot = `SLOT_${j++}`;
            entities[slot] = ThingTalk.Ast.Value.VarRef(`__const_${escape(token)}`);
            program[i] = slot;
        }
    }
    return [program, entities];
}

async function main() {
    const language = process.argv[2];

    await db.withTransaction((dbClient) => {
        const tpClient = new AdminThingpediaClient(language, dbClient);
        const schemaRetriever = new ThingTalk.SchemaRetriever(tpClient, null, true);

        const query = dbClient.query(`select id,preprocessed,target_code from example_utterances where type not in ('thingpedia','log','generated') and target_code<>'' and not find_in_set('obsolete', flags) and not find_in_set('replaced', flags) and language =? and target_code not like 'bookkeeping %' and target_code not like 'policy %' `, [language]);

        const promises = [];
        query.on('result', (row) => {
            promises.push(Promise.resolve().then(async () => {
                try {
                    const [slottedProgram, entities] = replaceWithSlots(row.target_code);
                    const parsed = ThingTalk.NNSyntax.fromNN(slottedProgram, entities);

                    try {
                        await parsed.typecheck(schemaRetriever);
                    } catch(e) {
                        return;
                    }

                    const regenerated = ThingTalk.NNSyntax.toNN(parsed, row.preprocessed, entities).join(' ');

                    // if strictly equal, nothing to do
                    if (row.target_code === regenerated)
                        return;

                    // loose equality still preserved
                    assert.deepStrictEqual(regenerated.replace(/ join /g, ' => '),
                                           row.target_code.replace(/ join /g, ' => '));

                    await db.query(dbClient, `update example_utterances set target_code = ? where id = ?`,
                                   [regenerated, row.id]);
                } catch(e) {
                    console.error(`Failed to handle ${row.id}: ${e.message}`);
                    console.error(e.stack);
                }
            }).catch((e) => query.emit('error', e)));
        });

        return new Promise((resolve, reject) => {
            query.on('end', () => resolve(Promise.all(promises)));
            query.on('error', reject);
        });
    });

    await db.tearDown();
}
main();
