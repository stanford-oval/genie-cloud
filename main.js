#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

// load thingpedia to initialize the polyfill
require('thingpedia');

// common initialization code
const Q = require('q');
Q.longStackSupport = true;
process.on('unhandledRejection', (up) => { throw up; });
require('./util/config_init');
const i18n = require('./util/i18n');
const localfs = require('./util/local_fs');

const Config = require('./config');
i18n.init(Config.SUPPORTED_LANGUAGES);
localfs.init();

const argparse = require('argparse');

const commands = {
    // administrative commands
    'bootstrap': require('./scripts/bootstrap'),
    'execute-sql-file': require('./scripts/execute-sql-file'),
    'migrate-dataset': require('./scripts/migrate-dataset'),

    // daemons
    'run-almond': require('./almond/master'),
    'run-frontend': require('./frontend'),
    'run-nlp': require('./nlp/main'),
    'run-training': require('./training/daemon'),

    // batch jobs
    'apply-credits': require('./scripts/apply-credits'),
    'run-training-task': require('./training/run-training-task'),

    // utility commands
    'get-config': require('./scripts/get-config'),
    'get-user-shards': require('./scripts/get-user-shards'),
    'generate-cheatsheet': require('./scripts/generate-cheatsheet'),
    'sync-discourse-sso': require('./scripts/sync-discourse-sso'),
    'download-dataset': require('./scripts/download-dataset'),
    'upload-dataset': require('./scripts/upload-dataset'),
    'compile-exact-btrie': require('./scripts/compile-exact-btrie'),
};

const parser = new argparse.ArgumentParser({
    addHelp: true,
    description: "The Almond Virtual Assistant - Cloud Edition"
});

const subparsers = parser.addSubparsers({ title: 'Available sub-commands', dest: 'subcommand' });
for (let subcommand in commands)
    commands[subcommand].initArgparse(subparsers);

const args = parser.parseArgs();
commands[args.subcommand].main(args);
