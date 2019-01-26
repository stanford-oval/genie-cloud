// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const fs = require('fs');
const { assertHttpError, assertBanner, assertLoginRequired, sessionRequest, dbQuery } = require('./scaffold');
const { startSession } = require('../login');

const db = require('../../util/db');
const EngineManagerClient = require('../../almond/enginemanagerclient');

async function testRegister(charlie) {
    await assertHttpError(sessionRequest('/user/register', 'POST', {}, charlie),
        400, 'Missing or invalid parameter username');

    await assertHttpError(sessionRequest('/user/register', 'POST', { username: { foo: 'bar' } }, charlie),
        400, 'Missing or invalid parameter username');

    await assertHttpError(sessionRequest('/user/register', 'POST', { username: 'charlie' }, charlie),
        400, 'Missing or invalid parameter email');

    await assertHttpError(sessionRequest('/user/register', 'POST', { username: 'charlie', email: 'foo' }, charlie),
        400, 'Missing or invalid parameter password');

    await assertHttpError(sessionRequest('/user/register', 'POST', { username: 'charlie', email: ['foo', 'bar'] }, charlie),
        400, 'Missing or invalid parameter email');

    await assertHttpError(sessionRequest('/user/register', 'POST', { username: 'charlie', email: 'foo', password: 'lol', 'confirm-password': 'lol' }, charlie),
        400, 'Missing or invalid parameter locale');

    await assertBanner(sessionRequest('/user/register', 'POST', {
        username: 'charlie',
        email: 'foo',
        password: 'lol',
        'confirm-password': 'lol',
        locale: 'en-US',
        timezone: 'America/Los_Angeles'
    }, charlie), 'You must specify a valid email');

    await assertBanner(sessionRequest('/user/register', 'POST', {
        username: 'charlie',
        email: 'foo@bar',
        password: 'lol',
        'confirm-password': 'lol',
        locale: 'en-US',
        timezone: 'America/Los_Angeles'
    }, charlie), 'You must specifiy a valid password (of at least 8 characters)');

    await assertBanner(sessionRequest('/user/register', 'POST', {
        username: 'charlie',
        email: 'foo@bar',
        password: '12345678',
        'confirm-password': 'lol',
        locale: 'en-US',
        timezone: 'America/Los_Angeles'
    }, charlie), 'The password and the confirmation do not match');

    await assertBanner(sessionRequest('/user/register', 'POST', {
        username: 'bob', // <- NOTE
        email: 'foo@bar',
        password: '12345678',
        'confirm-password': '12345678',
        locale: 'en-US',
        timezone: 'America/Los_Angeles'
    }, charlie), 'A user with this name already exists');

    await sessionRequest('/user/register', 'POST', {
        username: 'charlie',
        email: 'foo@bar',
        password: '12345678',
        'confirm-password': '12345678',
        locale: 'en-US',
        timezone: 'America/Los_Angeles'
    }, charlie);

    // check that now we're registered
    const result = JSON.parse(await sessionRequest('/me/api/profile', 'GET', null, charlie));

    delete result.id;
    assert.deepStrictEqual(result, {
        username: 'charlie',
        email: 'foo@bar',
        email_verified: 0,
        full_name: null,
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
        model_tag: null
    });
}

async function testDeleteUser(charlie, nobody) {
    const [charlieInfo] = await dbQuery(`select * from users where username = ?`, ['charlie']);
    assert(charlieInfo);
    assert(fs.existsSync('./' + charlieInfo.cloud_id));
    assert(await EngineManagerClient.get().isRunning(charlieInfo.id));
    assert(await EngineManagerClient.get().getEngine(charlieInfo.id));

    await assertLoginRequired(sessionRequest('/user/delete', 'POST', {}, nobody));

    await sessionRequest('/user/delete', 'POST', {}, charlie);

    // check that the user is gone from the database
    const users = await dbQuery(`select * from users where username = ?`, ['charlie']);
    assert.strictEqual(users.length, 0);

    // check that the user is not running any more
    assert(!await EngineManagerClient.get().isRunning(charlieInfo.id));
    await assert.rejects(() => EngineManagerClient.get().getEngine(charlieInfo.id));
    assert(!fs.existsSync('./' + charlieInfo.cloud_id));
}


async function main() {
    const emc = new EngineManagerClient();
    await emc.start();

    const nobody = await startSession();
    const charlie = await startSession();

    await testRegister(charlie);
    await testDeleteUser(charlie, nobody);

    await db.tearDown();
    await emc.stop();
}
module.exports = main;
if (!module.parent)
    main();
