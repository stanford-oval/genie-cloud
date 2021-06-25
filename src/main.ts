#!/usr/bin/env node
// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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

// load thingpedia to initialize the polyfill
import 'thingpedia';
import * as argparse from 'argparse';

// common initialization code
process.on('unhandledRejection', (up) => { throw up; });
import './util/config_init';
import * as i18n from './util/i18n';
import * as localfs from './util/local_fs';

import * as Config from './config';

async function main() {
    i18n.init(Config.SUPPORTED_LANGUAGES);
    localfs.init();

    interface SubCommand {
        initArgparse(subparsers : argparse.SubParser) : void;

        main(args : any) : void|Promise<void>;
    }

    const commands : Record<string, SubCommand> = {
        // administrative commands
        'bootstrap': await import('./scripts/bootstrap'),
        'execute-sql-file': await import('./scripts/execute-sql-file'),
        'migrate-dataset': await import('./scripts/migrate-dataset'),

        // daemons
        'run-almond': await import('./almond/master'),
        'run-worker': await import('./almond/worker_k8s'),
        'run-frontend': await import('./frontend'),
        'run-nlp': await import('./nlp/main'),
        'run-training': await import('./training/daemon'),

        // batch jobs
        'run-training-task': await import('./training/run-training-task'),

        // utility commands
        'get-config': await import('./scripts/get-config'),
        'get-user-shards': await import('./scripts/get-user-shards'),
        'generate-cheatsheet': await import('./scripts/generate-cheatsheet'),
        'sync-discourse-sso': await import('./scripts/sync-discourse-sso'),
        'download-dataset': await import('./scripts/download-dataset'),
        'download-log': await import('./scripts/download-log'),
        'upload-dataset': await import('./scripts/upload-dataset'),
        'compile-exact-btrie': await import('./scripts/compile-exact-btrie'),
    };

    const parser = new argparse.ArgumentParser({
        add_help: true,
        description: "The Almond Virtual Assistant - Cloud Edition"
    });

    const subparsers = parser.add_subparsers({
        title: 'Available sub-commands',
        dest: 'subcommand',
        required: true
    } as argparse.SubparserOptions);
    for (const subcommand in commands)
        commands[subcommand].initArgparse(subparsers);

    const args = parser.parse_args();
    commands[args.subcommand].main(args);
}
main();
