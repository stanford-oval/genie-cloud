#!/usr/bin/env node
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
"use strict";

process.on('unhandledRejection', (up) => { throw up; });
require('../../util/config_init');

const Tp = require('thingpedia');

const db = require('../../util/db');
const nlpModelsModel = require('../../model/nlp_models');
const templatePackModel = require('../../model/template_files');

const codeStorage = require('../../util/code_storage');

const Config = require('../../config');

async function importStandardTemplatePack(dbClient, rootOrg) {
    const tmpl = await templatePackModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.genie.thingtalk',
        owner: rootOrg,
        description: 'Templates for the ThingTalk language',
        flags: JSON.stringify([
            'turking',
            'nofilter',
            'primonly',
            'policies',
            'remote_programs',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions'
        ]),
        public: true,
        version: 0
    });

    await codeStorage.storeZipFile(await Tp.Helpers.Http.getStream('https://almond-static.stanford.edu/test-data/en-thingtalk.zip'),
        'org.thingpedia.genie.thingtalk', 0, 'template-files');

    return tmpl.id;
}

async function importDefaultNLPModels(dbClient, rootOrg, templatePack) {
    await nlpModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.models.default',
        owner: rootOrg,
        template_file: templatePack,
        flags: JSON.stringify([
            'policies',
            'remote_programs',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions'
        ]),
        all_devices: true,
        use_approved: true
    });

    await nlpModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.models.contextual',
        owner: rootOrg,
        template_file: templatePack,
        flags: JSON.stringify([
            'policies',
            'remote_programs',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions'
        ]),
        all_devices: true,
        use_approved: true
    });

    await nlpModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.models.developer',
        owner: rootOrg,
        template_file: templatePack,
        flags: JSON.stringify([
            'policies',
            'remote_programs',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions'
        ]),
        all_devices: true,
        use_approved: false
    });

    await nlpModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.models.developer.contextual',
        owner: rootOrg,
        template_file: templatePack,
        flags: JSON.stringify([
            'policies',
            'remote_programs',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions'
        ]),
        all_devices: true,
        use_approved: false
    });
}


async function main() {
    if (Config.WITH_LUINET !== 'embedded')
        return;

    await db.withTransaction(async (dbClient) => {
        const rootOrg = 1;
        const templatePack = await importStandardTemplatePack(dbClient, rootOrg);
        await importDefaultNLPModels(dbClient, rootOrg, templatePack);
    });

    await db.tearDown();
}
main();
