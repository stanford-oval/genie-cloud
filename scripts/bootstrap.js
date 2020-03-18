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

const path = require('path');
const fs = require('fs');
const util = require('util');
const yaml = require('js-yaml');
const child_process = require('child_process');

const db = require('../util/db');
const user = require('../util/user');
const userModel = require('../model/user');
const organization = require('../model/organization');
const entityModel = require('../model/entity');
const stringModel = require('../model/strings');
const nlpModelsModel = require('../model/nlp_models');
const templatePackModel = require('../model/template_files');
const { makeRandom } = require('../util/random');

const Importer = require('../util/import_device');
const { clean } = require('../util/tokenize');
const TokenizerService = require('../util/tokenizer_service');
const codeStorage = require('../util/code_storage');
const execSql = require('../util/exec_sql');

const Config = require('../config');

const req = { _(x) { return x; } };

const DEFAULT_TRAINING_CONFIG = JSON.stringify({
    dataset_target_pruning_size: 10000,
    dataset_contextual_target_pruning_size: 10000,
    dataset_ppdb_probability_synthetic: 0.1,
    dataset_ppdb_probability_paraphrase: 1.0,
    dataset_quoted_probability: 0.1,
    dataset_eval_probability: 0.5,
    dataset_split_strategy: 'sentence',
    synthetic_depth: 5,
    train_iterations: 100000,
    trainable_decoder_embedding: 50,
    no_glove_decoder: true,
});

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
        developer_status: user.DeveloperStatus.ORG_ADMIN,
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
        'tt:person_first_name': 'First names of people',
        'tt:path_name': 'File and directory names',
        'tt:location': 'Cities, points on interest and addresses',
    };

    await stringModel.createMany(dbClient, Object.keys(STRING_TYPES).map((id) => {
        const obj = {
            type_name: id,
            name: STRING_TYPES[id],
            language: 'en',
            license: 'public-domain',
            attribution: '',
        };
        if (id === 'tt:long_free_text' || id === 'tt:short_free_text') {
            obj.license = 'non-commercial';
            obj.attribution = 'The Brown Corpus <http://www.hit.uib.no/icame/brown/bcm.html>';
        }
        if (id === 'tt:person_first_name')
            obj.attribution = 'United States Census and Social Security data';
        if (id === 'tt:location') {
            obj.license = 'free-copyleft';
            obj.attribution = 'Copyright © OpenStreetMap contributors <https://www.openstreemap.org/copyright>. Distributed under the Open Data Commons Open Database License.';
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
        'org.thingpedia.builtin.thingengine.phone',
        'org.thingpedia.builtin.thingengine.remote',
        'org.thingpedia.builtin.test',
        'org.thingpedia.builtin.bluetooth.generic',
        'messaging',
        'org.thingpedia.builtin.matrix',
    ];

    for (let primaryKind of BUILTIN_DEVICES) {
        console.log(`Loading builtin device ${primaryKind}`);

        const filename = path.resolve(path.dirname(module.filename), '../data/' + primaryKind + '.yaml');
        const manifest = yaml.safeLoad((await util.promisify(fs.readFile)(filename)).toString(), { filename });

        const iconPath = path.resolve(path.dirname(module.filename),
                                      '../data/' + getBuiltinIcon(primaryKind) + '.png');

        await Importer.importDevice(dbClient, req, primaryKind, manifest, {
            owner: rootOrg.id,
            iconPath: iconPath
        });
    }
}

async function importStandardTemplatePack(dbClient, rootOrg) {
    const tmpl = await templatePackModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.genie.thingtalk',
        owner: rootOrg.id,
        description: 'Templates for the ThingTalk language',
        flags: JSON.stringify([
            'turking',
            'nofilter',
            'primonly',
            'policies',
            'remote_commands',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions',
            'timer',
            'projection',
            'undefined_filter',
            'projection_with_filter',
            'extended_timers',
            'screen_selection'
        ]),
        public: true,
        version: 0
    });

    const geniedir = path.resolve(path.dirname(module.filename), '../node_modules/genie-toolkit');
    const { stdout, stderr } = await util.promisify(child_process.execFile)(
        'make', ['-C', geniedir, 'bundle/en.zip'], { maxBuffer: 1024 * 1024 });
    process.stdout.write(stdout);
    process.stderr.write(stderr);

    await codeStorage.storeZipFile(fs.createReadStream(path.resolve(geniedir, 'bundle/en.zip')),
        'org.thingpedia.genie.thingtalk', 0, 'template-files/en');

    return tmpl.id;
}

async function importDefaultNLPModels(dbClient, rootOrg, templatePack) {
    await nlpModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.models.default',
        owner: rootOrg.id,
        template_file: templatePack,
        flags: JSON.stringify([
            'policies',
            'remote_commands',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions',
            'timer',
            'projection',
            'undefined_filter',
        ]),
        config: DEFAULT_TRAINING_CONFIG,
        contextual: false,
        all_devices: true,
        use_approved: true,
        use_exact: true
    });

    await nlpModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.models.contextual',
        owner: rootOrg.id,
        template_file: templatePack,
        flags: JSON.stringify([
            'policies',
            'remote_commands',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions',
            'timer',
            'projection',
            'undefined_filter',
        ]),
        config: DEFAULT_TRAINING_CONFIG,
        contextual: true,
        all_devices: true,
        use_approved: true,
        use_exact: true
    });

    await nlpModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.models.developer',
        owner: rootOrg.id,
        template_file: templatePack,
        flags: JSON.stringify([
            'policies',
            'remote_commands',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions',
            'timer',
            'projection',
            'undefined_filter',
            'projection_with_filter',
        ]),
        config: DEFAULT_TRAINING_CONFIG,
        contextual: false,
        all_devices: true,
        use_approved: false,
        use_exact: true
    });

    await nlpModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.models.developer.contextual',
        owner: rootOrg.id,
        template_file: templatePack,
        flags: JSON.stringify([
            'policies',
            'remote_commands',
            'aggregation',
            'bookkeeping',
            'triple_commands',
            'configure_actions',
            'timer',
            'projection',
            'undefined_filter',
            'projection_with_filter',
        ]),
        config: DEFAULT_TRAINING_CONFIG,
        contextual: true,
        all_devices: true,
        use_approved: false,
        use_exact: true
    });
}

async function isAlreadyBootstrapped() {
    try {
        return await db.withClient(async (dbClient) => {
            // check if we have a root user, and consider us bootstrapped if so
            const [root] = await userModel.getByName(dbClient, 'root');
            return !!root;
        });
    } catch(e) {
        // on error, we likely do not even have the necessary tables
        return false;
    }
}

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('bootstrap', {
            description: 'Bootstrap an installation of Almond Cloud'
        });
        parser.addArgument(['--force'], {
            nargs: 0,
            action: 'storeTrue',
            defaultValue: false,
            help: 'Force bootstrapping even if it appears to have occurred already.'
        });
    },

    async main(argv) {
        // Check if we bootstrapped already
        if (!argv.force) {
            if (await isAlreadyBootstrapped()) {
                console.error(`Almond appears to be already bootstrapped, refusing to bootstrap again.`);

                await db.tearDown();
                TokenizerService.tearDown();
                return;
            }
        }

        // initialize the schema
        await execSql.exec(path.resolve(path.dirname(module.filename), '../model/schema.sql'));

        // initialize the default data in the database
        await db.withTransaction(async (dbClient) => {
            const rootOrg = await createRootOrg(dbClient);
            await createDefaultUsers(dbClient, rootOrg);

            if (Config.WITH_LUINET === 'embedded') {
                const templatePack = await importStandardTemplatePack(dbClient, rootOrg);
                await importDefaultNLPModels(dbClient, rootOrg, templatePack);
            }

            if (Config.WITH_THINGPEDIA === 'embedded') {
                await importStandardEntities(dbClient);
                await importStandardStringTypes(dbClient, rootOrg);
                await importStandardSchemas(dbClient, rootOrg);
                await importBuiltinDevices(dbClient, rootOrg);
            }
        });

        await db.tearDown();
        TokenizerService.tearDown();
    }
};
