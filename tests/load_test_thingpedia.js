// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 Google LLC
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const assert = require('assert');
const path = require('path');

const db = require('../util/db');
const userModel = require('../model/user');
const organization = require('../model/organization');
const entityModel = require('../model/entity');
const exampleModel = require('../model/example');

const user = require('../util/user');
const Importer = require('../util/import_device');
const makeRandom = require('../util/random');
const TokenizerService = require('../util/tokenizer_service');

const platform = require('../util/platform');

const Config = require('../config');
assert.strictEqual(Config.WITH_THINGPEDIA, 'embedded');

const req = { _(x) { return x; } };

async function loadAllDevices(dbClient, bob, root) {
    // "login" as bob
    req.user = bob;

    const invisible = require('./data/org.thingpedia.builtin.test.invisible.manifest.json');
    await Importer.importDevice(dbClient, req, 'org.thingpedia.builtin.test.invisible', invisible, {
        owner: req.user.developer_org,
        approve: false
    });

    const bing = require('./data/com.bing.manifest.json');
    await Importer.importDevice(dbClient, req, 'com.bing', bing, {
        owner: req.user.developer_org,
        zipFilePath: path.resolve(path.dirname(module.filename), './data/com.bing.zip'),
        approve: true
    });

    // now "login" as root
    req.user = root;

    const adminonly = require('./data/org.thingpedia.builtin.test.adminonly.manifest.json');
    await Importer.importDevice(dbClient, req, 'org.thingpedia.builtin.test.adminonly', adminonly, {
        owner: req.user.developer_org,
        approve: false
    });
}

async function loadEntityValues(dbClient) {
    await entityModel.createMany(dbClient, [{
        id: 'tt:stock_id',
        name: 'Company Stock ID',
        language: 'en',
        is_well_known: false,
        has_ner_support: true,
    }]);

    await db.insertOne(dbClient,
        `insert ignore into entity_lexicon(language,entity_id,entity_value,
        entity_canonical,entity_name) values ?`,
         [[
         ['en', 'org.freedesktop:app_id', 'edu.stanford.Almond', 'almond', 'Almond'],
         ['en', 'org.freedesktop:app_id', 'org.gnome.Builder', 'gnome builder', 'GNOME Builder'],
         ['en', 'org.freedesktop:app_id', 'org.gnome.Weather.Application', 'gnome weather', 'GNOME Weather'],
         ['en', 'tt:stock_id', 'goog', 'alphabet inc.', 'Alphabet Inc.'],
         ['en', 'tt:stock_id', 'msft', 'microsoft corp.', 'Microsoft Corp.'],
         ]]);
}

async function loadExamples(dbClient) {
    const { id: schemaId } = await db.selectOne(dbClient, `select id from device_schema where kind = 'org.thingpedia.builtin.test'`);

    await exampleModel.createMany(dbClient, [
    {
        id: 1000,
        schema_id: schemaId,
        is_base: true,
        language: 'en',
        utterance: 'eat some data',
        preprocessed: 'eat some data',
        target_json: '',
        target_code: 'let action x := @org.thingpedia.builtin.test.eat_data();',
        type: 'thingpedia',
        click_count: 0
    },
    {
        id: 1001,
        schema_id: schemaId,
        is_base: true,
        language: 'en',
        utterance: 'get some data',
        preprocessed: 'get some data',
        target_json: '',
        target_code: 'let query x := \\(p_size : Measure(byte)) -> @org.thingpedia.builtin.test.get_data(size=p_size);',
        type: 'thingpedia',
        click_count: 7
    },
    {
        id: 1002,
        schema_id: schemaId,
        is_base: true,
        language: 'en',
        utterance: 'keep eating data!',
        preprocessed: 'keep eating data !',
        target_json: '',
        target_code: 'monitor (@org.thingpedia.builtin.test.get_data()) => @org.thingpedia.builtin.test.eat_data();',
        type: 'thingpedia',
        click_count: 0
    },
    {
        id: 1003,
        schema_id: schemaId,
        is_base: true,
        language: 'en',
        utterance: 'keep eating data! (v2)',
        preprocessed: 'keep eating data ! -lrb- v2 -rrb-',
        target_json: '',
        target_code: 'program := monitor (@org.thingpedia.builtin.test.get_data()) => @org.thingpedia.builtin.test.eat_data();',
        type: 'thingpedia',
        click_count: 0
    },
    {
        id: 1004,
        schema_id: schemaId,
        is_base: true,
        language: 'en',
        utterance: 'more data eating...',
        preprocessed: 'more data eating ...',
        target_json: '',
        target_code: 'action (p_data : String) := @org.thingpedia.builtin.test.eat_data(data=p_data);',
        type: 'thingpedia',
        click_count: 0
    },
    {
        id: 1005,
        schema_id: schemaId,
        is_base: true,
        language: 'en',
        utterance: 'more data genning...',
        preprocessed: 'more data genning ...',
        target_json: '',
        target_code: 'let table _ := @org.thingpedia.builtin.test.get_data();',
        type: 'thingpedia',
        click_count: 0
    }
    ]);
}

async function main() {
    platform.init();

    await db.withTransaction(async (dbClient) => {
        const newOrg = await organization.create(dbClient, {
            name: 'Test Org',
            comment:  '',
            developer_key: makeRandom(),
            is_admin: false
        });

        const bob = await user.register(dbClient, req, {
            username: 'bob',
            password: '12345678',
            email: 'bob@localhost',
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
            developer_org: newOrg.id,

            // must be a TRUSTED_DEVELOPER to self-approve the new device
            // w/o hacks
            developer_status: user.DeveloperStatus.TRUSTED_DEVELOPER,
        });

        const [root] = await userModel.getByName(dbClient, 'root');
        await loadAllDevices(dbClient, bob, root);
        await loadEntityValues(dbClient);
        await loadExamples(dbClient);

        console.log(`export DEVELOPER_KEY="${newOrg.developer_key}"`);
    });

    await db.tearDown();
    TokenizerService.tearDown();
}
main();
