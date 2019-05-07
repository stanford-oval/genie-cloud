// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 The Board of Trustees of The Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });
require('../util/config_init');

const assert = require('assert');

const db = require('../util/db');
const user = require('../util/user');
const platform = require('../util/platform');

const Config = require('../config');
assert.strictEqual(Config.WITH_THINGPEDIA, 'external');

const req = { _(x) { return x; } };

async function main() {
    platform.init();

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
    });

    await db.tearDown();
}
main();
