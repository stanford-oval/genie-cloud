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
    async exec(filename) {
        const parsed = Url.parse(Config.DATABASE_URL);
        const [user, pass] = parsed.auth.split(':');

        const args = [
            '-h', parsed.hostname,
            '-u', user,
            '-p' + pass,
            '-D', parsed.pathname.substring(1),
            '--batch'
        ];

        const stdin = filename === '-' ? 'inherit' :
            await util.promisify(fs.open)(filename, 'r');
        const child = child_process.spawn('mysql', args, {
            stdio: [stdin, 'inherit', 'inherit'],
        });

        await new Promise((resolve, reject) => {
            child.on('exit', (code, signal) => {
                if (signal)
                    reject(new Error(`Crashed with signal ${signal}`));
                else
                    resolve(code);
            });
            child.on('error', reject);
        });

        if (stdin !== 'inherit')
            await util.promisify(fs.close)(stdin);
    }
};
