// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>


const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const db = require('../util/db');
const i18n = require('../util/i18n');

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

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.add_parser('migrate-dataset', {
            description: 'Migrate the dataset to the latest version of ThingTalk'
        });
        parser.add_argument('-l', '--locale', {
            required: false,
            default: 'en-US',
            help: `BGP 47 locale tag of the language to migrate (defaults to 'en-US', English)`
        });
    },

    async main(argv) {
        const language = i18n.localeToLanguage(argv.locale);
        await db.withTransaction(async (dbClient) => {
            const tpClient = new AdminThingpediaClient('en', dbClient);
            const schemaRetriever = new ThingTalk.SchemaRetriever(tpClient, null, true);

            const rows = await db.selectAll(dbClient, `select id,preprocessed,target_code from example_utterances where type not in ('thingpedia','log','generated') and target_code<>'' and not find_in_set('obsolete', flags) and not find_in_set('replaced', flags) and not find_in_set('augmented', flags) and language = ?`, [language]);

            await Promise.all(rows.map(async (row) => {
                    try {
                        const entities = Genie.EntityUtils.makeDummyEntities(row.preprocessed);
                        let parsed;
                        try {
                            parsed = await Genie.ThingTalkUtils.parsePrediction(row.target_code, entities, {
                                thingpediaClient: tpClient,
                                schemaRetriever: schemaRetriever
                            }, true);
                        } catch(e) {
                            console.error(`Failed to handle ${row.id}: ${e.message}`);
                            return;
                        }

                        const regenerated = Genie.ThingTalkUtils.serializePrediction(parsed, row.preprocessed, entities, {
                            locale: argv.locale
                        }).join(' ');

                        // if strictly equal, nothing to do
                        if (row.target_code === regenerated)
                            return;

                        await db.query(dbClient, `update example_utterances set target_code = ? where id = ?`,
                                       [regenerated, row.id]);
                    } catch(e) {
                        console.error(`Failed to handle ${row.id}: ${e.message}`);
                        console.error(e.stack);
                    }
            }));
        });

        await db.tearDown();
    }
};
