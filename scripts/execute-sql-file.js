// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const child_process = require('child_process');
const Url = require('url');
const util = require('util');
const fs = require('fs');

const Config = require('../config');

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('execute-sql-file', {
            description: 'Execute a SQL script against the configured Almond Cloud database'
        });
        parser.addArgument('filename', {
            help: "The file to execute"
        });
    },

    async main(argv) {
        try {
            const parsed = Url.parse(Config.DATABASE_URL);
            const [user, pass] = parsed.auth.split(':');

            const args = [
                '-h', parsed.hostname,
                '-u', user,
                '-p' + pass,
                '-D', parsed.pathname.substring(1),
                '--batch'
            ];

            const stdin = await util.promisify(fs.open)(argv.filename, 'r');
            const child = child_process.spawn('mysql', args, {
                stdio: [stdin, 'inherit', 'inherit'],
            });
            process.exit(await new Promise((resolve, reject) => {
                child.on('exit', (code, signal) => {
                    if (signal)
                        reject(new Error(`Crashed with signal ${signal}`));
                    else
                        resolve(code);
                });
                child.on('error', reject);
            }));
        } catch(e) {
            console.error(e);
            process.exit(1);
        }
    }
};
