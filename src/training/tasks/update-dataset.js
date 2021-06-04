// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as Stream from 'stream';
import * as seedrandom from 'seedrandom';
import assert from 'assert';

import * as ThingTalk from 'thingtalk';
import * as Genie from 'genie-toolkit';

import * as exampleModel from '../../model/example';

import AdminThingpediaClient from '../../util/admin-thingpedia-client';
import { makeFlags } from '../../util/genie_flag_utils';
import * as StreamUtils from '../../util/stream-utils';
import * as AbstractFS from '../../util/abstract_fs';

import * as db from '../../util/db';

import * as Config from '../../config';

const SYNTHETIC_DEPTH = 8;
const TARGET_PRUNING_SIZE = 1000;

class ForDevicesFilter extends Stream.Transform {
    constructor(pattern) {
        super({
            readableObjectMode: true,
            writableObjectMode: true,
        });

        this._pattern = pattern;
    }

    _transform(ex, encoding, callback) {
        if (this._pattern.test(ex.target_code))
            this.push(ex);
        callback();
    }

    _flush(callback) {
        process.nextTick(callback);
    }
}

class DatabaseInserter extends Stream.Writable {
    constructor(language, dbClient) {
        super({
            objectMode: true,
            highWaterMark: 1000,
        });

        this._language = language;
        this._dbClient = dbClient;
        this._batch = [];
    }

    async _insertBatch(examples) {
        return exampleModel.createMany(this._dbClient, examples.map((ex) => {
            return {
                utterance: ex.preprocessed,
                preprocessed: ex.preprocessed,
                target_code: ex.target_code,
                target_json: '',
                type: ex.type,
                flags: makeFlags(ex.flags) + ',training',
                is_base: 0,
                language: this._language
            };
        }));
    }

    async _process(ex) {
        this._batch.push(ex);
        if (this._batch.length >= 1000) {
            await this._insertBatch(this._batch, false);
            this._batch.length = 0;
        }
    }

    _write(ex, encoding, callback) {
        this._process(ex).then(() => callback(), (err) => callback(err));
    }

    _final(callback) {
        this._insertBatch(this._batch).then(() => callback(), (err) => callback(err));
    }
}

class DatasetUpdater {
    constructor(language, forDevices, options) {
        this._language = language;
        this._options = options;
        this._rng = seedrandom.alea('almond is awesome');

        this._forDevices = forDevices;
        if (forDevices !== null && forDevices.length > 0) {
            const escapedDevices = forDevices.map((d) => d.replace(/[.\\]/g, '\\$&')).join('|');
            const pat1 = ' @(' + escapedDevices + ')\\.[A-Za-z0-9_]+( |$)';
            const pat2 = ' device:(' + escapedDevices + ')( |$)';

            this._forDevicesPattern = '(' + pat1 + '|' + pat2 + ')';
            console.log(this._forDevicesPattern);
            this._forDevicesRegexp = new RegExp(this._forDevicesPattern);
        } else {
            this._forDevicesPattern = null;
            this._forDevicesRegexp = null;
        }

        this._dbClient = null;
        this._tpClient = null;
        this._schemas = null;
        this._approvedTpClient = null;
        this._approvedSchemas = null;
        this._augmenter = null;
    }

    async _clearExistingDataset() {
        if (this._forDevicesPattern !== null) {
            await db.query(this._dbClient, `delete from example_utterances where language = ? and type = 'generated'
                and target_code rlike ?`, [this._language, this._forDevicesPattern]);
        } else {
            await db.query(this._dbClient, `delete from example_utterances where language = ? and type = 'generated'`, [this._language]);
        }

        console.log(`Dataset cleaned`);
    }

    async _typecheckParaphrasesAndOnline() {
        let rows;
        if (this._forDevicesPattern !== null) {
            rows = await db.selectAll(this._dbClient, `select id,type,preprocessed,target_code from example_utterances
                where type not in ('generated', 'thingpedia') and find_in_set('training', flags)
                and not find_in_set('obsolete', flags) and language = ? and target_code rlike ?`,
                [this._language, this._forDevicesPattern]);
        } else {
            rows = await db.selectAll(this._dbClient, `select id,type,preprocessed,target_code from example_utterances
                where type not in ('generated', 'thingpedia') and find_in_set('training', flags)
                and not find_in_set('obsolete', flags) and language = ?`,
                [this._language]);
        }

        for (let i = 0; i < rows.length+1000-1; i += 1000) {
            const batch = rows.slice(i, i+1000);

            const toUpdate = [];
            await Promise.all(batch.map(async (ex) => {
                const entities = Genie.EntityUtils.makeDummyEntities(ex.preprocessed);
                try {
                    await Genie.ThingTalkUtils.parsePrediction(ex.target_code.split(' '), entities, {
                        thingpediaClient: ex.type === 'commandpedia' ? this._approvedTpClient : this._tpClient,
                        schemaRetriever: ex.type === 'commandpedia' ? this._approvedSchemas : this._schemas,
                    }, true);
                } catch(e) {
                    toUpdate.push(ex.id);
                }
            }));

            if (toUpdate.length > 0) {
                await db.query(this._dbClient, `update example_utterances set
                    flags = concat(flags, ',obsolete') where id in (?)`, [toUpdate]);
            }
        }
    }

    async _generateNewSynthetic() {
        const templateFile = require.resolve('genie-toolkit/languages-dist/thingtalk/' + this._language + '/basic.genie.js');
        const options = {
            thingpediaClient: this._tpClient,
            schemaRetriever: this._schemas,

            // remove the .js at the end so we refer to the genie file
            templateFiles: [templateFile.replace(/\.js$/, '')],
            targetLanguage: 'thingtalk',

            rng: this._rng,
            locale: this._language,
            flags: {
                bookkeeping: true,
                unbalanced: true,
            },
            maxDepth: SYNTHETIC_DEPTH,
            targetPruningSize: TARGET_PRUNING_SIZE,
            debug: this._options.debug ? 3 : 0,
        };

        let generator = new Genie.BasicSentenceGenerator(options);
        if (this._forDevicesRegexp !== null)
            generator = generator.pipe(new ForDevicesFilter(this._forDevicesRegexp));

        const transform = new Stream.Transform({
            readableObjectMode: true,
            writableObjectMode: true,

            transform(ex, encoding, callback) {
                ex.type = 'generated';
                // do not set the training flag, we will regenerate the synthetic portion of the dataset
                // for training later
                ex.flags.exact = true;
                callback(null, ex);
            },

            flush(callback) {
                process.nextTick(callback);
            }
        });
        const writer = generator
            .pipe(transform)
            .pipe(new DatabaseInserter(this._language, this._dbClient));

        await StreamUtils.waitFinish(writer);
    }

    async _transaction() {
        this._tpClient = new AdminThingpediaClient(this._language, this._dbClient);
        this._schemas = new ThingTalk.SchemaRetriever(this._tpClient, null, !this._options.debug);

        this._approvedTpClient = new AdminThingpediaClient(this._language, this._dbClient, true);
        this._approvedSchemas = new ThingTalk.SchemaRetriever(this._approvedTpClient, null, !this._options.debug);

        await this._clearExistingDataset();
        await this._typecheckParaphrasesAndOnline();
        await this._generateNewSynthetic();
    }

    async _updateExactMatch() {
        const matcher = new Genie.ExactMatcher;

        const rows = await db.withClient((dbClient) => {
            return exampleModel.getExact(dbClient, this._language);
        });
        for (let row of rows)
            matcher.add(row.preprocessed.split(' '), row.target_code.split(' '));

        const builder = new Genie.BTrie.BTrieBuilder((existing, newValue) => {
            assert(typeof newValue === 'string');
            if (existing === undefined)
                return newValue;
            else
                return existing + '\0' + newValue;
        });
        for (let [key, value] of matcher)
            builder.insert(key, value);

        const url = AbstractFS.resolve(Config.NL_EXACT_MATCH_DIR, this._language + '.btrie');
        await AbstractFS.writeFile(url, builder.build());
    }

    async run() {
        await db.withTransaction((dbClient) => {
            this._dbClient = dbClient;
            return this._transaction();
        }, 'read committed');

        await this._updateExactMatch();
    }
}

export default async function main(task, argv) {
    task.handleKill();

    const updater = new DatasetUpdater(task.language, task.forDevices, {
        debug: argv.debug
    });
    await updater.run();
}
