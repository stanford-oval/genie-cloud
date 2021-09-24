// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 Google LLC
//           2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

// Bootstrap an installation of Almond Cloud by creating the
// database schema and adding the requisite initial data

import assert from 'assert';
import * as argparse from 'argparse';
import * as path from 'path';
import { promises as pfs } from 'fs';
import * as mysql from 'mysql';
import * as Url from 'url';
import * as ThingTalk from 'thingtalk';

import * as db from '../util/db';
import * as user from '../util/user';
import * as I18n from '../util/i18n';
import * as userModel from '../model/user';
import * as organization from '../model/organization';
import * as entityModel from '../model/entity';
import * as stringModel from '../model/strings';
import * as nlpModelsModel from '../model/nlp_models';
import { makeRandom } from '../util/random';

import * as Importer from '../util/import_device';
import { clean } from '../util/tokenize';
import * as execSql from '../util/exec_sql';

import * as Config from '../config';

const req : {
    _(x : string) : string;

    user ?: Express.User
} = {
    _(x : string) { return x; },
};

const DEFAULT_TRAINING_CONFIG = JSON.stringify({
    dataset_target_pruning_size: 1000,
    dataset_contextual_target_pruning_size: 100,
    dataset_quoted_probability: 0.1,
    dataset_eval_probability: 0.5,
    dataset_split_strategy: 'sentence',
    synthetic_depth: 7,
    train_iterations: 50000,
    train_batch_tokens: 400,
    val_batch_size: 3000,
    model: 'TransformerSeq2Seq',
    pretrained_model: 'facebook/bart-large',
    gradient_accumulation_steps: 20,
    warmup: 40,
    lr_multiply: 0.01,
});

async function createRootOrg(dbClient : db.Client) {
    return organization.create(dbClient, {
        name: 'Site Administration',
        comment: '',
        id_hash: makeRandom(8),
        developer_key: Config.WITH_THINGPEDIA === 'external' ? (Config.ROOT_THINGPEDIA_DEVELOPER_KEY || makeRandom()) : makeRandom(),
        is_admin: true
    });
}

type BasicOrgRow = { id : number };

async function createDefaultUsers(dbClient : db.Client, rootOrg : BasicOrgRow) {
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

    for (const locale of Config.SUPPORTED_LANGUAGES) {
        const lang = I18n.localeToLanguage(locale);
        if (lang === 'en')
            continue;

        await user.register(dbClient, req, {
            username: 'anonymous-' + lang,
            password: 'rootroot',
            email: 'anonymous-' + lang + '@localhost',
            email_verified: true,
            locale: locale,
            timezone: 'America/Los_Angeles',
            developer_org: rootOrg.id,
            profile_flags: 0
        });
    }
}

async function importStandardEntities(dbClient : db.Client) {
    const ENTITIES : Record<string, string> = {
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

    // this entity types are not a well known entity
    // you must import the values separately
    await entityModel.create(dbClient, {
        id: 'org.freedesktop:app_id',
        name: 'Freedesktop App Identifier',
        is_well_known: false,
        has_ner_support: true
    });
    await entityModel.create(dbClient, {
        id: 'tt:command_id',
        name: 'Thingpedia Command ID',
        is_well_known: false,
        has_ner_support: false
    });
    await entityModel.create(dbClient, {
        id: 'tt:iso_lang_code',
        name: 'Language Identifier',
        is_well_known: false,
        has_ner_support: true
    });
    await entityModel.create(dbClient, {
        id: 'tt:timezone',
        name: 'Timezone Identifier',
        is_well_known: false,
        has_ner_support: true
    });
}

async function importStandardStringTypes(dbClient : db.Client, rootOrg : BasicOrgRow) {
    const STRING_TYPES : Record<string, string> = {
        'tt:search_query': 'Web Search Query',
        'tt:short_free_text': 'General Text (short phrase)',
        'tt:long_free_text': 'General Text (paragraph)',
        'tt:person_first_name': 'First names of people',
        'tt:path_name': 'File and directory names',
        'tt:location': 'Cities, points on interest and addresses',
        'tt:word': 'Individual words'
    };

    await stringModel.createMany(dbClient, Object.keys(STRING_TYPES).map((id) => {
        const obj : db.WithoutID<stringModel.Row> = {
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

async function importStandardSchemas(dbClient : db.Client, rootOrg : BasicOrgRow) {
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

function getBuiltinIcon(kind : string) {
    switch (kind) {
    case 'org.thingpedia.builtin.bluetooth.generic':
    case 'org.thingpedia.builtin.matrix':
        return kind + '/icon.png';
    default:
        return 'icon.png';
    }
}

async function importBuiltinDevices(dbClient : db.Client, rootOrg : BasicOrgRow) {
    const BUILTIN_DEVICES = [
        // interfaces
        'messaging',
        'org.thingpedia.volume-control',

        // devices
        'org.thingpedia.builtin.thingengine',
        'org.thingpedia.builtin.thingengine.builtin',
        'org.thingpedia.builtin.thingengine.gnome',
        'org.thingpedia.builtin.thingengine.phone',
        'org.thingpedia.builtin.test',
        'org.thingpedia.builtin.bluetooth.generic',
    ] as const;

    for (const primaryKind of BUILTIN_DEVICES) {
        console.log(`Loading builtin device ${primaryKind}`);

        const directory = path.resolve(path.dirname(module.filename), '../../data/' + primaryKind);

        const manifest = await pfs.readFile(path.join(directory, 'manifest.tt'), { encoding: 'utf8' });
        const library = ThingTalk.Syntax.parse(manifest, ThingTalk.Syntax.SyntaxType.Normal, { locale: 'en-US', timezone: 'UTC' });
        assert(library instanceof ThingTalk.Ast.Library);
        const classDef = library.classes[0];

        const dataset = await pfs.readFile(path.join(directory, 'dataset.tt'), { encoding: 'utf8' });

        const data = {
            class: manifest,
            dataset,
            thingpedia_name: classDef.nl_annotations.thingpedia_name,
            thingpedia_description: classDef.nl_annotations.thingpedia_description,
            subcategory: classDef.getImplementationAnnotation<string>('subcategory') ?? 'service',
            license: classDef.getImplementationAnnotation<string>('license') ?? 'Apache-2.0',
            license_gplcompatible: classDef.getImplementationAnnotation<boolean>('license_gplcompatible') ?? true,
            website: classDef.getImplementationAnnotation<string>('website'),
            repository: classDef.getImplementationAnnotation<string>('repository'),
            issue_tracker: classDef.getImplementationAnnotation<string>('issue_tracker'),
        };

        const iconPath = path.resolve(path.dirname(module.filename),
                                      '../../data/' + getBuiltinIcon(primaryKind));

        await Importer.importDevice(dbClient, req, primaryKind, data, {
            owner: rootOrg.id,
            iconPath: iconPath
        });
    }
}

async function importDefaultNLPModels(dbClient : db.Client, rootOrg : BasicOrgRow) {
    await nlpModelsModel.create(dbClient, {
        language: 'en',
        tag: 'org.thingpedia.models.default',
        owner: rootOrg.id,
        flags: JSON.stringify([
            'aggregation',
            'bookkeeping',
            'configure_actions',
            'multifilters',
            'policies',
            'projection',
            'projection_with_filter',
            'remote_commands',
            'schema_org',
            'screen_selection',
            'timer',
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
        flags: JSON.stringify([
            'aggregation',
            'bookkeeping',
            'configure_actions',
            'extended_timers',
            'multifilters',
            'policies',
            'projection',
            'projection_with_filter',
            'remote_commands',
            'schema_org',
            'screen_selection',
            'timer',
            'undefined_filter',
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

export function initArgparse(subparsers : argparse.SubParser) {
    const parser = subparsers.add_parser('bootstrap', {
        description: 'Bootstrap an installation of Almond Cloud'
    });
    parser.add_argument('--force', {
        action: 'store_true',
        default: false,
        help: 'Force bootstrapping even if it appears to have occurred already.'
    });
}

async function waitForDB() {
    // FIXME    This is terrible code, written hastily. Needs clean up.

    console.log(`Waiting for the database to come up...`);

    const parsed = Url.parse(Config.DATABASE_URL!);
    const [user, pass] = parsed.auth!.split(':');

    const options = {
        host: parsed.hostname!,
        port: parseInt(parsed.port!),
        database: parsed.pathname!.substring(1),
        user: user,
        password: pass,
        multipleStatements: true
    };
    Object.assign(options, parsed.query);

    const TIMEOUT_MS = 30000; // 30 seconds
    const SLEEP_MS = 1000; // 1 second
    const start_time = Date.now();
    const sleep = (ms : number) => {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    };

    while (Date.now() - start_time < TIMEOUT_MS) {
        console.log(`Attempting to connect to the db...`);

        const ok = await new Promise<boolean>((resolve, _reject) => {
            const connection = mysql.createConnection(options);
            connection.query(`SHOW TABLES;`, (error : any) => {
                if (error) {
                    console.error(`FAILED to connect to the db: ${error}`);
                    resolve(false);
                } else {
                    connection.end((error : any) => {
                        if (error) {
                            console.error(
                                `FAILED to end connection to the db: ${error}`
                            );
                            resolve(false);
                        } else {
                            console.log(`SUCCESS connected to db!`);
                            resolve(true);
                        }
                    });
                }
            });
        });
        if (ok)
            return;

        console.log(`Going to sleep for ${SLEEP_MS}ms...`);
        await sleep(SLEEP_MS);
    }

    throw new Error(`Failed to connect to db after ${TIMEOUT_MS}ms`);
}

export async function main(argv : any) {
    await waitForDB();

    // Check if we bootstrapped already
    if (!argv.force) {
        if (await isAlreadyBootstrapped()) {
            console.error(`Almond appears to be already bootstrapped, refusing to bootstrap again.`);

            await db.tearDown();
            return;
        }
    }

    // initialize the schema
    await execSql.exec(path.resolve(path.dirname(module.filename), '../../model/schema.sql'));

    // initialize the default data in the database
    await db.withTransaction(async (dbClient) => {
        const rootOrg = await createRootOrg(dbClient);
        await createDefaultUsers(dbClient, rootOrg);

        if (Config.WITH_LUINET === 'embedded')
            await importDefaultNLPModels(dbClient, rootOrg);

        if (Config.WITH_THINGPEDIA === 'embedded') {
            await importStandardEntities(dbClient);
            await importStandardStringTypes(dbClient, rootOrg);
            await importStandardSchemas(dbClient, rootOrg);
            await importBuiltinDevices(dbClient, rootOrg);
        }
    });

    await db.tearDown();
}
