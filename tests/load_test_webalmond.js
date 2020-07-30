// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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
process.on('unhandledRejection', (up) => { throw up; });
require('../util/config_init');

const assert = require('assert');

const db = require('../util/db');
const user = require('../util/user');

const Config = require('../config');
assert.strictEqual(Config.WITH_THINGPEDIA, 'external');

const req = { _(x) { return x; } };

async function main() {
    await db.withTransaction(async (dbClient) => {
        await user.register(dbClient, req, {
            username: 'bob',
            password: '12345678',
            email: 'bob@localhost',
            email_verified: true,
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
        });
        await user.register(dbClient, req, {
            username: 'david',
            password: '12345678',
            email: 'david@localhost',
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
        });
        await user.register(dbClient, req, {
            username: 'emma',
            password: '12345678',
            email: 'emma@localhost',
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
        });
    });

    await db.tearDown();
}
main();
