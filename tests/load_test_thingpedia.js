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

// load thingpedia to initialize the polyfill
require('thingpedia');
process.on('unhandledRejection', (up) => { throw up; });
require('../util/config_init');

const assert = require('assert');
const path = require('path');
const util = require('util');
const fs = require('fs');
const yaml = require('js-yaml');

const db = require('../util/db');
const userModel = require('../model/user');
const organization = require('../model/organization');
const entityModel = require('../model/entity');
const exampleModel = require('../model/example');
const snapshotModel = require('../model/snapshot');
const alexaModelsModel = require('../model/alexa_model');

const user = require('../util/user');
const Importer = require('../util/import_device');
const { makeRandom } = require('../util/random');

const Config = require('../config');
assert.strictEqual(Config.WITH_THINGPEDIA, 'embedded');

const req = { _(x) { return x; } };

async function loadManifest(primaryKind) {
    const filename = path.resolve(path.dirname(module.filename), './data/' + primaryKind + '.yaml');
    return yaml.safeLoad((await util.promisify(fs.readFile)(filename)).toString(), { filename });
}

async function loadAllDevices(dbClient, bob, root) {
    // "login" as bob
    req.user = bob;

    // create a snapshot without the new stuff
    await snapshotModel.create(dbClient, {
        description: 'Test snapshot'
    });

    const invisible = await loadManifest('org.thingpedia.builtin.test.invisible');
    await Importer.importDevice(dbClient, req, 'org.thingpedia.builtin.test.invisible', invisible, {
        owner: req.user.developer_org,
        iconPath: path.resolve(path.dirname(module.filename), '../data/org.thingpedia.builtin.thingengine.builtin.png'),
        approve: false
    });

    const bing = await loadManifest('com.bing');
    await Importer.importDevice(dbClient, req, 'com.bing', bing, {
        owner: req.user.developer_org,
        zipFilePath: path.resolve(path.dirname(module.filename), './data/com.bing.zip'),
        iconPath: path.resolve(path.dirname(module.filename), './data/com.bing.png'),
        approve: true
    });

    // now "login" as root
    req.user = root;

    const adminonly = await loadManifest('org.thingpedia.builtin.test.adminonly');
    await Importer.importDevice(dbClient, req, 'org.thingpedia.builtin.test.adminonly', adminonly, {
        owner: req.user.developer_org,
        iconPath: path.resolve(path.dirname(module.filename), '../data/org.thingpedia.builtin.thingengine.builtin.png'),
        approve: false
    });

    await db.query(dbClient, `insert into device_class_tag(device_id,tag) select id,'featured' from device_class where primary_kind in ('com.bing', 'org.thingpedia.builtin.thingengine.phone')`);
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

const STRING_VALUES = [
    'tt:search_query',
    'tt:long_free_text',
    'tt:short_free_text',
    'tt:person_first_name',
    'tt:path_name',
    'tt:location',
];

async function loadStringValues(dbClient) {
    for (let type of STRING_VALUES) {
        const filename = path.resolve(path.dirname(module.filename), './data/' + type + '.txt');
        const data = (await util.promisify(fs.readFile)(filename)).toString().trim().split('\n');


        const {id:typeId} = await db.selectOne(dbClient,
            `select id from string_types where language='en' and type_name=?`, [type]);
        const mappedData = data.map((line) => {
            const parts = line.split('\t');
            if (parts.length === 1)
                return [typeId, parts[0], parts[0], 1];
            if (parts.length === 3)
                return [typeId, parts[0], parts[1], parseFloat(parts[2])];

            const weight = parseFloat(parts[1]);
            if (Number.isNaN(weight))
                return [typeId, parts[0], parts[1], 1];
            else
                return [typeId, parts[0], parts[0], weight];
        });
        await db.insertOne(dbClient,
            `insert into string_values(type_id,value,preprocessed,weight) values ?`, [mappedData]);
    }
}

async function loadExamples(dbClient, bob) {
    const { id: schemaId } = await db.selectOne(dbClient, `select id from device_schema where kind = 'org.thingpedia.builtin.test'`);

    await exampleModel.createMany(dbClient, [
    // commandpedia
    {
        id: 999,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'every day at 9:00 AM set my laptop background to pizza images',
        preprocessed: 'every day at TIME_0 set my laptop background to pizza images',
        target_json: '',
        target_code: '( attimer time = TIME_0 ) join ( @com.bing.image_search param:query:String = " pizza " ) => @org.thingpedia.builtin.thingengine.gnome.set_background on  param:picture_url:Entity(tt:picture) = param:picture_url:Entity(tt:picture)',
        type: 'commandpedia',
        owner: bob.id,
        click_count: 8,
        flags: 'exact',
    },

    // thingpedia
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
        click_count: 0,
        flags: 'template',
        name: 'EatData',
    },
    {
        id: 1001,
        schema_id: schemaId,
        is_base: true,
        language: 'en',
        utterance: 'get ${p_size} of data',
        preprocessed: 'get ${p_size} of data',
        target_json: '',
        target_code: 'let query x := \\(p_size : Measure(byte)) -> @org.thingpedia.builtin.test.get_data(size=p_size);',
        type: 'thingpedia',
        click_count: 7,
        flags: 'template',
        name: 'GenDataWithSize',
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
        click_count: 0,
        flags: 'template',
        name: 'GenDataThenEatData',
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
        click_count: 0,
        flags: 'template',
        name: null,
    },
    {
        id: 1004,
        schema_id: schemaId,
        is_base: true,
        language: 'en',
        utterance: 'more data eating...',
        preprocessed: 'more data eating ...',
        target_json: '',
        target_code: 'action := @org.thingpedia.builtin.test.eat_data();',
        type: 'thingpedia',
        click_count: 0,
        flags: 'template',
        name: null,
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
        click_count: 0,
        flags: 'template',
        name: 'GenData'
    },

    // online
    {
        id: 1010,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'dial USERNAME_0',
        preprocessed: 'dial USERNAME_0',
        target_json: '',
        target_code: 'now => @org.thingpedia.builtin.thingengine.phone.call param:number:Entity(tt:phone_number) = USERNAME_0',
        type: 'online',
        click_count: 0,
        flags: 'training,exact',
    },
    {
        id: 1011,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'make a call to USERNAME_0',
        preprocessed: 'make a call to USERNAME_0',
        target_json: '',
        target_code: 'now => @org.thingpedia.builtin.thingengine.phone.call param:number:Entity(tt:phone_number) = USERNAME_0',
        type: 'online',
        click_count: 0,
        flags: 'training,exact'
    },
    {
        id: 1012,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'place a call to USERNAME_0',
        preprocessed: 'place a call to USERNAME_0',
        target_json: '',
        target_code: 'now => @org.thingpedia.builtin.thingengine.phone.call param:number:Entity(tt:phone_number) = USERNAME_0',
        type: 'online',
        click_count: 0,
        flags: 'training,exact'
    },
    {
        id: 1013,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'search "pizza" on bing',
        preprocessed: 'search QUOTED_STRING_0 on bing',
        target_json: '',
        target_code: 'now => @com.bing.web_search param:query:String = QUOTED_STRING_0 => notify',
        type: 'online',
        click_count: 0,
        flags: 'training,exact'
    },
    {
        id: 1014,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'search "pizza" on bing images',
        preprocessed: 'search QUOTED_STRING_0 on bing images',
        target_json: '',
        target_code: 'now => @com.bing.image_search param:query:String = QUOTED_STRING_0 => notify',
        type: 'online',
        click_count: 0,
        flags: 'training,exact'
    },
    {
        id: 1015,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'take a screenshot',
        preprocessed: 'take a screenshot',
        target_json: '',
        target_code: 'now => @org.thingpedia.builtin.thingengine.gnome.get_screenshot => notify',
        type: 'online',
        click_count: 0,
        flags: 'training,exact'
    },
    {
        id: 1016,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'what time is it?',
        preprocessed: 'what time is it ?',
        target_json: '',
        target_code: 'now => @org.thingpedia.builtin.thingengine.builtin.get_time => notify',
        type: 'online',
        click_count: 0,
        flags: 'training,exact'
    },
    {
        id: 1017,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'what day is today?',
        preprocessed: 'what day is today ?',
        target_json: '',
        target_code: 'now => @org.thingpedia.builtin.thingengine.builtin.get_date => notify',
        type: 'online',
        click_count: 0,
        flags: 'training,exact'
    },
    {
        id: 1018,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'what\'s today date?',
        preprocessed: 'what \'s today date ?',
        target_json: '',
        target_code: 'now => @org.thingpedia.builtin.thingengine.builtin.get_date => notify',
        type: 'online',
        click_count: 0,
        flags: 'training,exact'
    },
    {
        id: 1019,
        schema_id: null,
        is_base: false,
        language: 'en',
        utterance: 'get my sms',
        preprocessed: 'get my sms',
        target_json: '',
        target_code: 'now => @org.thingpedia.builtin.thingengine.phone.sms => notify',
        type: 'online',
        click_count: 0,
        flags: 'training,exact'
    }

    ]);

    await exampleModel.like(dbClient, bob.id, 999);
}

async function loadAlexaModel(dbClient, bob, alexaUser) {
    await alexaModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.alexa.test',
        owner: bob.developer_org,
        call_phrase: 'Bob Assistant',
        access_token: null,
        anonymous_user: alexaUser.id
    }, ['com.bing', 'org.thingpedia.builtin.test']);
}

async function main() {
    await db.withTransaction(async (dbClient) => {
        const newOrg = await organization.create(dbClient, {
            name: 'Test Org',
            comment:  '',
            id_hash: makeRandom(8),
            developer_key: makeRandom(),
            is_admin: false
        });

        const bob = await user.register(dbClient, req, {
            username: 'bob',
            human_name: 'Bob Builder',
            password: '12345678',
            email: 'bob@localhost',
            email_verified: true,
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
            developer_org: newOrg.id,
            profile_flags: user.ProfileFlags.VISIBLE_ORGANIZATION_PROFILE|user.ProfileFlags.SHOW_HUMAN_NAME|user.ProfileFlags.SHOW_PROFILE_PICTURE,

            // must be a TRUSTED_DEVELOPER to self-approve the new device
            // w/o hacks
            developer_status: user.DeveloperStatus.ORG_ADMIN,
            roles: user.Role.TRUSTED_DEVELOPER
        });
        await user.register(dbClient, req, {
            username: 'david',
            password: '12345678',
            email: 'david@localhost',
            email_verified: true,
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
        });
        const alexaUser = await user.register(dbClient, req, {
            username: 'alexa_user',
            password: '12345678',
            email: 'alexa_user@localhost',
            email_verified: true,
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
        });

        const [root] = await userModel.getByName(dbClient, 'root');
        await loadAllDevices(dbClient, bob, root);
        await loadEntityValues(dbClient);
        await loadStringValues(dbClient);
        await loadExamples(dbClient, bob);
        await loadAlexaModel(dbClient, bob, alexaUser);

        console.log(`export DEVELOPER_KEY="${newOrg.developer_key}" ROOT_DEVELOPER_KEY="${root.developer_key}"`);
    });

    await db.tearDown();
}
main();
