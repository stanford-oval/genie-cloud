// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 Google LLC
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const assert = require('assert');
const path = require('path');

const db = require('../util/db');
const userModel = require('../model/user');
const Importer = require('../util/import_device');

const platform = require('../util/platform');

const Config = require('../config');
assert.strictEqual(Config.WITH_THINGPEDIA, 'embedded');

const req = { _(x) { return x; } };

async function loadAllDevices(dbClient) {
    const invisible = require('./data/org.thingpedia.builtin.test.invisible.manifest.json');
    await Importer.importDevice(dbClient, req, 'org.thingpedia.builtin.test.invisible', invisible, {
        owner: req.user.developer_org,
        approve: false
    });

    const bing = require('./data/com.bing.manifest.json');
    await Importer.importDevice(dbClient, req, 'com.bing', bing, {
        owner: req.user.developer_org,
        zipFilePath: path.resolve(path.dirname(module.filename), './data/com.bing.zip'),
        approve: true
    });
}

async function main() {
    platform.init();

    await db.withTransaction(async (dbClient) => {
        const [root] = await userModel.getByName(dbClient, 'root');
        // "login"
        req.user = root;

        await loadAllDevices(dbClient);
    });

    await db.tearDown();
}
main();
