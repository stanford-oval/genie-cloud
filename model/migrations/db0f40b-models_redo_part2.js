#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

process.on('unhandledRejection', (up) => { throw up; });
require('../../util/config_init');

const Tp = require('thingpedia');

const db = require('../../util/db');
const nlpModelsModel = require('../../model/nlp_models');
const templatePackModel = require('../../model/template_files');

const platform = require('../../util/platform');
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
    platform.init();
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
