#!/usr/bin/env node
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

// Bootstrap an installation of Almond Cloud by creating the
// database schema and adding the requisite initial data

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const path = require('path');
const fs = require('fs');
const util = require('util');

const yaml = require('js-yaml');

const db = require('../util/db');
const user = require('../util/user');
const organization = require('../model/organization');
const entityModel = require('../model/entity');
const stringModel = require('../model/strings');
const { makeRandom } = require('../util/random');

const Importer = require('../util/import_device');
const { clean } = require('../util/tokenize');
const TokenizerService = require('../util/tokenizer_service');
const platform = require('../util/platform');

const Config = require('../config');

const req = { _(x) { return x; } };

async function createRootOrg(dbClient) {
    return organization.create(dbClient, {
        name: 'Site Administration',
        comment:  '',
        id_hash: makeRandom(8),
        developer_key: makeRandom(),
        is_admin: true
    });
}

async function createDefaultUsers(dbClient, rootOrg) {
    req.user = await user.register(dbClient, req, {
        username: 'root',
        password: 'rootroot',
        email: 'root@localhost',
        email_verified: true,
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
        developer_org: rootOrg.id,
        developer_status: user.DeveloperStatus.DEVELOPER,
        roles: user.Role.ROOT,
        profile_flags: user.ProfileFlags.VISIBLE_ORGANIZATION_PROFILE,
    });

    await user.register(dbClient, req, {
        username: 'anonymous',
        password: 'rootroot',
        email: 'anonymous@localhost',
        email_verified: true,
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
        developer_org: rootOrg.id,
        profile_flags: 0
    });
}

async function importStandardEntities(dbClient) {
    const ENTITIES = {
        'tt:contact': 'Contact Identity',
        'tt:contact_name': 'Contact Name',
        'tt:device': 'Device Name',
        'tt:email_address': 'Email Address',
        'tt:flow_token': 'Flow Identifier',
        'tt:function': 'Function Name',
        'tt:hashtag': 'Hashtag',
        'tt:path_name': 'Unix Path',
        'tt:phone_number': 'Phone Number',
        'tt:picture': 'Picture',
        'tt:program': 'Program',
        'tt:url': 'URL',
        'tt:username': 'Username'
    };

    await entityModel.createMany(dbClient, Object.keys(ENTITIES).map((id) => {
        return {
            id: id,
            name: ENTITIES[id],
            language: 'en',
            is_well_known: true,
            has_ner_support: false
        };
    }));

    // this entity type is required by Almond GNOME, but is not a well known entity
    // you must import the values separately
    await entityModel.create(dbClient, {
        id: 'org.freedesktop:app_id',
        name: 'Freedesktop App Identifier',
        is_well_known: false,
        has_ner_support: true
    });
}

async function importStandardStringTypes(dbClient, rootOrg) {
    const STRING_TYPES = {
        'tt:search_query': 'Web Search Query',
        'tt:short_free_text': 'General Text (short phrase)',
        'tt:long_free_text': 'General Text (paragraph)',
    };

    await stringModel.createMany(dbClient, Object.keys(STRING_TYPES).map((id) => {
        const obj = {
            type_name: id,
            name: STRING_TYPES[id],
            language: 'en',
            license: 'public-domain',
            attribution: '',
        };
        if (id === 'tt:long_free_text') {
            obj.license = 'non-commercial';
            obj.attribution = 'The Brown Corpus <http://www.hit.uib.no/icame/brown/bcm.html>';
        }

        return obj;
    }));
}

async function importStandardSchemas(dbClient, rootOrg) {
    const CATEGORIES = ['online-account', 'data-source', 'thingengine-system',
        'communication', 'data-management', 'health', 'home',
        'media', 'service', 'social-network'];

    // the category and subcategory markers are not used by Thingpedia
    // anymore, but they are still used by the client in certain cases,
    // and still exposed by BaseDevice.hasKind()
    // (for example, the platform layers call device.hasKind('thingengine-system')
    // to filter out system devices)
    // so we register them as types to avoid users creating regular
    // types with the same name, which would be dangerous (eg it would
    // let the user call @online-account in ThingTalk)

    // these types are very special in the system, so we use a raw
    // SQL query to create them
    await db.query(dbClient, `insert into device_schema(kind,
        kind_type, owner, developer_version, approved_version, kind_canonical) values ?`,
        [CATEGORIES.map((c) => [c, 'category', rootOrg.id, 0, 0, clean(c)])]);
}

function getBuiltinIcon(kind) {
    switch (kind) {
    case 'org.thingpedia.builtin.bluetooth.generic':
    case 'org.thingpedia.builtin.matrix':
        return kind;
    default:
        return 'org.thingpedia.builtin.thingengine.builtin';
    }
}

async function importBuiltinDevices(dbClient, rootOrg) {
    const BUILTIN_DEVICES = [
        'org.thingpedia.builtin.thingengine',
        'org.thingpedia.builtin.thingengine.builtin',
        'org.thingpedia.builtin.thingengine.gnome',
        'org.thingpedia.builtin.thingengine.home',
        'org.thingpedia.builtin.thingengine.phone',
        'org.thingpedia.builtin.thingengine.remote',
        'org.thingpedia.builtin.test',
        'org.thingpedia.builtin.bluetooth.generic',
        'messaging',
        'org.thingpedia.builtin.matrix',
    ];

    for (let primaryKind of BUILTIN_DEVICES) {
        console.log(`Loading builtin device ${primaryKind}`);

        let manifest;
        try {
            manifest = require('../data/' + primaryKind + '.manifest.json');
        } catch(e) {
            const filename = path.resolve(path.dirname(module.filename), '../data/' + primaryKind + '.yaml');
            manifest = yaml.safeLoad((await util.promisify(fs.readFile)(filename)).toString(), { filename });
        }

        const iconPath = path.resolve(path.dirname(module.filename),
                                      '../data/' + getBuiltinIcon(primaryKind) + '.png');

        await Importer.importDevice(dbClient, req, primaryKind, manifest, {
            owner: rootOrg.id,
            iconPath: iconPath
        });
    }
}

async function main() {
    platform.init();

    await db.withTransaction(async (dbClient) => {
        const rootOrg = await createRootOrg(dbClient);
        await createDefaultUsers(dbClient, rootOrg);

        if (Config.WITH_THINGPEDIA === 'embedded') {
            await importStandardEntities(dbClient, rootOrg);
            await importStandardStringTypes(dbClient, rootOrg);
            await importStandardSchemas(dbClient, rootOrg);
            await importBuiltinDevices(dbClient, rootOrg);
        }
    });

    await db.tearDown();
    TokenizerService.tearDown();
}
main();
