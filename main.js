#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// load thingpedia to initialize the polyfill
require('thingpedia');

// common initialization code
const Q = require('q');
Q.longStackSupport = true;
process.on('unhandledRejection', (up) => { throw up; });
require('./util/config_init');

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
    'download-dataset': require('./scripts/download-dataset')
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
