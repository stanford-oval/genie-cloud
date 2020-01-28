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

const Url = require('url');
const mysql = require('mysql');
const util = require('util');
const fs = require('fs');

const Config = require('../config');

module.exports = {
    async exec(filename) {
        const parsed = Url.parse(Config.DATABASE_URL);
        const [user, pass] = parsed.auth.split(':');

        const options = {
            host: parsed.hostname,
            port: parsed.port,
            database: parsed.pathname.substring(1),
            user: user,
            password: pass,
        };
        Object.assign(options, parsed.query);

        options.multipleStatements = true;

        const queries = await util.promisify(fs.readFile)(filename, { encoding: 'utf8' });

        await new Promise((resolve, reject) => {
            const connection = mysql.createConnection(options);
            connection.query(queries, (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                connection.end((error) => {
                    if (error)
                        reject(error);
                    else
                        resolve();
                });
            });
        });
    }
};
