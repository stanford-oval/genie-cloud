#!/usr/bin/env node
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

async function main() {
    try {
        const parsed = Url.parse(process.env.DATABASE_URL);
        const [user, pass] = parsed.auth.split(':');

        const argv = [
            '-h', parsed.hostname,
            '-u', user,
            '-p' + pass,
            '-D', parsed.pathname.substring(1),
            '--batch'
        ];

        const stdin = await util.promisify(fs.open)(process.argv[2], 'r');
        const child = child_process.spawn('mysql', argv, {
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
main();
