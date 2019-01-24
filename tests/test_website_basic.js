// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;
require('thingengine-core/lib/polyfill');
require('./polyfill');
process.on('unhandledRejection', (up) => { throw up; });

const assert = require('assert');
const WebSocket = require('ws');
const Tp = require('thingpedia');
const ThingTalk = require('thingtalk');
const qs = require('qs');
const fs = require('fs');
const Url = require('url');

const Config = require('../config');

const { login, startSession } = require('./login');

const db = require('../util/db');
const EngineManagerClient = require('../almond/enginemanagerclient');

const DEBUG = false;

function dbQuery(query, args) {
    return db.withClient((dbClient) => {
        return db.selectAll(dbClient, query, args);
    });
}

function request(url, method, data, options = {}) {
    options['user-agent'] = 'Thingpedia-Cloud-Test/1.0.0';
    options.debug = DEBUG;

    return Tp.Helpers.Http.request(Config.SERVER_ORIGIN + url, method, data, options);
}

function sessionRequest(url, method, data, session, options = {}) {
    if (method === 'POST') {
        if (data !== null && typeof data !== 'string')
            data = qs.stringify(data);
        if (data)
            data += '&_csrf=' + session.csrfToken;
        else
            data = '_csrf=' + session.csrfToken;
        options.dataContentType = 'application/x-www-form-urlencoded';
    } else {
        if (data !== null && typeof data !== 'string') {
            url += '?' + qs.stringify(data);
            data = null;
        }
    }
    if (!options.extraHeaders)
        options.extraHeaders = {};
    options.extraHeaders.Cookie = session.cookie;

    return request(url, method, data, options);
}

function assertHttpError(request, httpStatus, expectedMessage) {
    return request.then(() => {
        assert.fail(new Error(`Expected HTTP error`));
    }, (err) => {
        if (!err.detail)
            throw err;
        if (typeof err.code === 'number')
            assert.deepStrictEqual(err.code, httpStatus);
        else
            throw err;
        if (expectedMessage) {
            let message;
            if (err.detail.startsWith('<!DOCTYPE html>')) {
                const match = /Sorry that did not work<\/p><p>([^<]+)<\/p>/.exec(err.detail);
                if (!match)
                    assert.fail(`cannot find error message`);
                message = match[1];
            } else if (err.detail.startsWith('{')) {
                message = JSON.parse(err.detail).error;
            } else {
                message = err.detail;
            }
            assert.strictEqual(message, expectedMessage);
        }
    });
}

function assertLoginRequired(request) {
    return request.then(() => {
        assert.fail(new Error(`Expected HTTP error`));
    }, (err) => {
        if (!err.detail || !err.code)
            throw err;
        assert.deepStrictEqual(err.code, 401);
        assert(err.detail.indexOf('Sorry but you must log in before opening this page') >= 0);
    });
}

function assertRedirect(request, redirect) {
    return request.then(() => {
        assert.fail(new Error(`Expected HTTP redirect`));
    }, (err) => {
        if (!err.detail || !err.code)
            throw err;
        assert.strictEqual(err.redirect, Url.resolve(Config.SERVER_ORIGIN, redirect));
    });
}

async function assertBanner(request, expected) {
    const response = await request;

    const match = /<div class="alert alert-[a-z]+ alert-dismissible fade in" role="alert">(?:(?!<\/div>).)*<p>([^<]+)<\/p><\/div>/.exec(response);
    if (!match)
        assert.fail(`cannot find banner`);
    assert.strictEqual(match[1], expected);
}

async function getAccessToken(session) {
    return JSON.parse(await sessionRequest('/me/api/token', 'POST', '', session, {
        accept: 'application/json',
    })).token;
}

async function testMyApiCookie(bob, nobody) {
    const result = JSON.parse(await sessionRequest('/me/api/profile', 'GET', null, bob));

    const [bobInfo] = await dbQuery(`select * from users where username = ?`, ['bob']);

    assert.deepStrictEqual(result, {
        id: bobInfo.cloud_id,
        username: 'bob',
        full_name: bobInfo.human_name,
        email: bobInfo.email,
        email_verified: bobInfo.email_verified,
        locale: bobInfo.locale,
        timezone: bobInfo.timezone,
        model_tag: bobInfo.model_tag
    });

    await assertHttpError(request('/me/api/profile', 'GET', null, {
        extraHeaders: {
            'Cookie': 'connect.sid=invalid',
        }
    }), 401, 'Unauthorized');
    await assertHttpError(sessionRequest('/me/api/profile', 'GET', null, nobody), 401);

    await assertHttpError(sessionRequest('/me/api/profile', 'GET', null, bob, {
        extraHeaders: {
            'Origin': 'https://invalid.origin.example.com'
        }
    }), 403, 'Forbidden Cross Origin Request');

    await sessionRequest('/me/api/profile', 'GET', null, bob, {
        extraHeaders: {
            'Origin': Config.SERVER_ORIGIN
        }
    });
}

async function testMyApiProfileOAuth(auth) {
    const result = JSON.parse(await request('/me/api/profile', 'GET', null, { auth }));

    const [bobInfo] = await dbQuery(`select * from users where username = ?`, ['bob']);

    assert.deepStrictEqual(result, {
        id: bobInfo.cloud_id,
        username: 'bob',
        full_name: bobInfo.human_name,
        email: bobInfo.email,
        email_verified: bobInfo.email_verified,
        locale: bobInfo.locale,
        timezone: bobInfo.timezone,
        model_tag: bobInfo.model_tag
    });
}

async function testMyApiParse(auth) {
    const result = JSON.parse(await request('/me/api/parse?q=what+time+is+it', 'GET', null, { auth }));

    assert.deepStrictEqual(result.tokens, ['what', 'time', 'is', 'it']);
    assert.deepStrictEqual(result.entities, {});
    assert(result.candidates.length > 0);

    assert(!isNaN(parseFloat(result.candidates[0].score)));
    ThingTalk.Grammar.parse(result.candidates[0].code);
    assert.strictEqual(result.candidates[0].commandClass, 'query');
    assert.strictEqual(typeof result.candidates[0].devices, 'object');
    assert.strictEqual(typeof result.candidates[0].locations, 'object');
}

async function testMyApiCreateGetApp(auth) {
    const result = JSON.parse(await request('/me/api/apps/create', 'POST', JSON.stringify({
        code: `now => @org.thingpedia.builtin.test(id="org.thingpedia.builtin.test").get_data(count=2, size=10byte) => notify;`
    }), { auth, dataContentType: 'application/json' }));

    assert(result.uniqueId.startsWith('uuid-'));
    assert.strictEqual(result.description, 'get generate 10 byte of fake data with count equal to 2 and then notify you');
    assert.strictEqual(result.code, '{\n  now => @org.thingpedia.builtin.test(id="org.thingpedia.builtin.test").get_data(count=2, size=10byte) => notify;\n}');
    assert.strictEqual(result.icon, '/download/icons/org.thingpedia.builtin.test.png');
    assert.deepStrictEqual(result.errors, []);

    assert.deepStrictEqual(result.results, [{
        raw: {
            count: 2,
            data: '!!!!!!!!!!',
            size: 10
        },
        formatted: ['!!!!!!!!!!'],
        type: 'org.thingpedia.builtin.test:get_data'
    }, {
        raw: {
            count: 2,
            data: '""""""""""',
            size: 10
        },
        formatted: ['""""""""""'],
        type: 'org.thingpedia.builtin.test:get_data'
    }]);
}

async function testMyApiCreateWhenApp(auth) {
    const ws = new WebSocket(Config.SERVER_ORIGIN + '/me/api/results', {
        headers: {
            'Authorization': auth
        }
    });

    const result = JSON.parse(await request('/me/api/apps/create', 'POST', JSON.stringify({
        code: `monitor @org.thingpedia.builtin.test(id="org.thingpedia.builtin.test").get_data(size=10byte) => notify;`
    }), { auth, dataContentType: 'application/json' }));

    assert(result.uniqueId.startsWith('uuid-'));
    assert.strictEqual(result.description, 'notify you when generate 10 byte of fake data change');
    assert.strictEqual(result.code, '{\n  monitor (@org.thingpedia.builtin.test(id="org.thingpedia.builtin.test").get_data(size=10byte)) => notify;\n}');
    assert.strictEqual(result.icon, '/download/icons/org.thingpedia.builtin.test.png');
    assert.deepStrictEqual(result.results, []);
    assert.deepStrictEqual(result.errors, []);

    await new Promise((resolve, reject) => {
        let count = 0;
        ws.on('message', (data) => {
            const parsed = JSON.parse(data);
            if (parsed.result.appId !== result.uniqueId)
                return;
            delete parsed.result.raw.__timestamp;
            if (count === 0) {
                assert.deepStrictEqual(parsed, { result:
                    { appId: result.uniqueId,
                      raw: { data: '!!!!!!!!!!', size: 10 },
                      type: 'org.thingpedia.builtin.test:get_data',
                      formatted: [ '!!!!!!!!!!' ],
                      icon: '/download/icons/org.thingpedia.builtin.test.png' }
                });
            } else {
                assert.deepStrictEqual(parsed, { result:
                    { appId: result.uniqueId,
                      raw: { data: '""""""""""', size: 10 },
                      type: 'org.thingpedia.builtin.test:get_data',
                      formatted: [ '""""""""""' ],
                      icon: '/download/icons/org.thingpedia.builtin.test.png' }
                });
            }
            if (++count === 2) {
                ws.close();
                resolve();
            }
        });
    });

    return result.uniqueId;
}

async function testMyApiListApps(auth, uniqueId) {
    const listResult = JSON.parse(await request('/me/api/apps/list', 'GET', null, { auth }));
    assert.deepStrictEqual(listResult, [{
        uniqueId,
        description: 'notify you when generate 10 byte of fake data change',
        error: null,
        code:
         '{\n  monitor (@org.thingpedia.builtin.test(id="org.thingpedia.builtin.test").get_data(size=10byte)) => notify;\n}',
        slots: { '$icon': 'org.thingpedia.builtin.test' },
        icon: '/download/icons/org.thingpedia.builtin.test.png'
    }]);

    const getResult = JSON.parse(await request('/me/api/apps/get/' + uniqueId, 'GET', null, { auth }));
    assert.deepStrictEqual(getResult, {
        uniqueId,
        description: 'notify you when generate 10 byte of fake data change',
        error: null,
        code:
         '{\n  monitor (@org.thingpedia.builtin.test(id="org.thingpedia.builtin.test").get_data(size=10byte)) => notify;\n}',
        slots: { '$icon': 'org.thingpedia.builtin.test' },
        icon: '/download/icons/org.thingpedia.builtin.test.png'
    });

    await assertHttpError(request('/me/api/apps/get/uuid-invalid', 'GET', null, { auth }), 404);
}

async function testMyApiDeleteApp(auth, uniqueId) {
    const result = JSON.parse(await request('/me/api/apps/delete/' + uniqueId, 'POST', '', { auth }));
    assert.deepStrictEqual(result, { status: 'ok' });

    const listResult = JSON.parse(await request('/me/api/apps/list', 'GET', null, { auth }));
    assert.deepStrictEqual(listResult, []);

    await assertHttpError(request('/me/api/apps/delete/uuid-invalid', 'POST', '', { auth }), 404);
}

async function testMyApiOAuth(accessToken) {
    const auth = 'Bearer ' + accessToken;

    // /profile
    await testMyApiProfileOAuth(auth);
    await testMyApiParse(auth);
    await testMyApiCreateGetApp(auth);
    const uniqueId = await testMyApiCreateWhenApp(auth);
    await testMyApiListApps(auth, uniqueId);
    await testMyApiDeleteApp(auth, uniqueId);
}

async function testCommandpediaSuggest(nobody) {
    await assertHttpError(sessionRequest('/thingpedia/commands/suggest', 'POST', { description: '' }, nobody),
        400, 'Missing or invalid parameter description');

    await sessionRequest('/thingpedia/commands/suggest', 'POST', { description: 'lemme watch netflix' }, nobody);

    const [suggestion] = await dbQuery(`select * from command_suggestions order by suggest_time desc limit 1`);

    assert.strictEqual(suggestion.command, 'lemme watch netflix');
}

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
    assert.rejects(EngineManagerClient.get().getEngine(charlieInfo.id));
    assert(!fs.existsSync('./' + charlieInfo.cloud_id));
}

async function testMyStuff(bob, nobody) {
    await assertRedirect(sessionRequest('/me', 'GET', null, nobody, { followRedirects: false }), '/user/login');

    await assertLoginRequired(sessionRequest('/me', 'POST', { command: 'show me the cat pictures' }, nobody));
    await assertLoginRequired(sessionRequest('/me', 'POST', {}, nobody));

    await assertHttpError(sessionRequest('/me', 'POST', {}, bob),
        400, 'Missing or invalid parameter command');

    let response = await sessionRequest('/me', 'POST', { command: 'show me the cat pictures' }, bob);
    assert(response.indexOf('value="show me the cat pictures"') >= 0);

    response = await sessionRequest('/me', 'POST', { command: '<script>evil()</script>' }, bob);
    assert(response.indexOf('<script>evil()</script>') < 0);

    await assertRedirect(sessionRequest('/me/conversation', 'GET', null, nobody, { followRedirects: false }), '/user/login');

    await assertLoginRequired(sessionRequest('/me/conversation', 'POST', { command: 'show me the cat pictures' }, nobody));

    await assertHttpError(sessionRequest('/me/conversation', 'POST', {}, bob),
        400, 'Missing or invalid parameter command');

    response = await sessionRequest('/me/conversation', 'POST', { command: 'show me the cat pictures' }, bob);
    assert(response.indexOf('value="show me the cat pictures"') >= 0);
}

async function testMyDevices(bob, nobody) {
    await assertRedirect(sessionRequest('/me/devices/create', 'GET', { class: ['foo', 'bar'] }, nobody, { followRedirects: false }), '/user/login');

    await assertHttpError(sessionRequest('/me/devices/create', 'GET', { class: ['foo', 'bar'] }, bob),
        400, 'Missing or invalid parameter class');
    await assertHttpError(sessionRequest('/me/devices/create', 'GET', { class: 'foo' }, bob),
        404, 'Invalid device class');

    // no need to test the non-error case for /me/devices, linkchecker does that

    await assertLoginRequired(sessionRequest('/me/devices/create', 'POST', { kind: 'com.nytimes' }, nobody));

    await assertHttpError(sessionRequest('/me/devices/create', 'POST', { kind: '' }, bob),
        400, 'Missing or invalid parameter kind');
    await assertHttpError(sessionRequest('/me/devices/create', 'POST', { kind: '' }, bob),
        400, 'Missing or invalid parameter kind');
    await assertHttpError(sessionRequest('/me/devices/create', 'POST', { kind: 'com.foo', invalid: [1, 2] }, bob),
        400, 'Missing or invalid parameter invalid');
    await assertHttpError(sessionRequest('/me/devices/create', 'POST', { kind: 'com.foo' }, bob),
        400, (Config.WITH_THINGPEDIA === 'external' ? 'Unexpected HTTP error 404' : 'Not Found'));

    if (Config.WITH_THINGPEDIA === 'external') {
        await assertRedirect(sessionRequest('/me/devices/create', 'POST', {
            kind: 'org.thingpedia.rss',
            url: 'https://almond.stanford.edu/blog/feed.rss'
        }, bob, { followRedirects: false }), '/me');

        // FIXME there should be a /me/api to list devices
        const [bobInfo] = await dbQuery(`select * from users where username = ?`, ['bob']);
        assert(bobInfo);
        const engine = await EngineManagerClient.get().getEngine(bobInfo.id);
        const device = await engine.devices.getDevice('org.thingpedia.rss-url-https://almond.stanford.edu/blog/feed.rss');
        assert(device);

        await assertLoginRequired(sessionRequest('/me/devices/delete', 'POST', { id: 'foo' }, nobody));

        await assertHttpError(sessionRequest('/me/devices/delete', 'POST', { id: '' }, bob),
            400, 'Missing or invalid parameter id');

        await assertHttpError(sessionRequest('/me/devices/delete', 'POST', { id: 'com.foo' }, bob),
            404, 'Not found.');

        await sessionRequest('/me/devices/delete', 'POST', { id: 'org.thingpedia.rss-url-https://almond.stanford.edu/blog/feed.rss' }, bob);

        assert(!await engine.devices.hasDevice('org.thingpedia.rss-url-https://almond.stanford.edu/blog/feed.rss'));


        await assertLoginRequired(sessionRequest('/me/devices/oauth2/com.linkedin', 'POST', { id: 'foo' }, nobody));

        await assertHttpError(sessionRequest('/me/devices/oauth2/com.foo', 'GET', null, bob),
            400, 'Unexpected HTTP error 404');
        await assertHttpError(sessionRequest('/me/devices/oauth2/com.thecatapi', 'GET', null, bob),
            400, 'factory.runOAuth2 is not a function');

        await assertRedirect(sessionRequest('/me/devices/oauth2/com.google', 'GET', null, bob, { followRedirects: false }),
            'https://accounts.google.com/o/oauth2/auth?response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8080%2Fdevices%2Foauth2%2Fcallback%2Fcom.google&access_type=offline&scope=openid%20profile%20email&client_id=739906609557-o52ck15e1ge7deb8l0e80q92mpua1p55.apps.googleusercontent.com');
    }
}

async function assertBlocked(path, bob, nobody) {
    await assertRedirect(sessionRequest(path, 'GET', null, nobody, { followRedirects: false }), '/user/login');
    await assertHttpError(sessionRequest(path, 'GET', null, bob),
            403, 'You do not have permission to perform this operation.');
}

async function testAdminUsers(root, bob, nobody) {
    await assertBlocked('/admin/users', bob, nobody);
    const usersPage = await sessionRequest('/admin/users', 'GET', null, root);
    assert(usersPage.indexOf('bob@localhost') >= 0);
    assert(usersPage.indexOf('root@localhost') >= 0);
    const usersPage2 = await sessionRequest('/admin/users', 'GET', { page: -1 }, root);
    assert(usersPage2.indexOf('bob@localhost') >= 0);
    assert(usersPage2.indexOf('root@localhost') >= 0);

    const nextUserPage = await sessionRequest('/admin/users', 'GET', { page: 1 }, root);
    assert(nextUserPage.indexOf('bob@localhost') < 0);
    assert(nextUserPage.indexOf('root@localhost') < 0);

    await assertBlocked('/admin/users/search', bob, nobody);
    await assertHttpError(sessionRequest('/admin/users/search', 'GET', null, root),
        400, 'Missing or invalid parameter q');
    const rootUserPage = await sessionRequest('/admin/users/search', 'GET', { q: 'root' }, root);
    assert(rootUserPage.indexOf('bob@localhost') < 0);
    assert(rootUserPage.indexOf('root@localhost') >= 0);

    const rootUserPage2 = await sessionRequest('/admin/users/search', 'GET', { q: '1' }, root);
    assert(rootUserPage2.indexOf('bob@localhost') < 0);
    assert(rootUserPage2.indexOf('root@localhost') >= 0);
}

function delay(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
}

async function testAdminKillRestart(root, bob, nobody) {
    const emc = EngineManagerClient.get();
    assert (await emc.isRunning(1)); // root
    assert (await emc.isRunning(2)); // anonymous
    assert (await emc.isRunning(3)); // bob
    assert (await emc.isRunning(4)); // david

    // /kill/all is very aggressive, and kills also the shared processes (it's sort of a killswitch for
    // when things go awry, short of "systemctl stop thingengine-cloud@.service"
    // hence, after we run it, we sleep for a couple seconds so that the shared processes restart
    await assertLoginRequired(sessionRequest('/admin/users/kill/all', 'POST', '', nobody));
    await assertRedirect(sessionRequest('/admin/users/kill/all', 'POST', '', root, { followRedirects: false }), '/admin/users');

    assert (!await emc.isRunning(1)); // root
    assert (!await emc.isRunning(2)); // anonymous
    assert (!await emc.isRunning(3)); // bob
    assert (!await emc.isRunning(4)); // david

    // the shared processes will be restarted in 5s
    await delay(10000);

    await assertLoginRequired(sessionRequest('/admin/users/start/1', 'POST', '', nobody));
    await assertRedirect(sessionRequest('/admin/users/start/1', 'POST', '', root, { followRedirects: false }), '/admin/users/search?q=1');

    assert (await emc.isRunning(1)); // root

    // start everybody else too
    await sessionRequest('/admin/users/start/2', 'POST', '', root);
    await sessionRequest('/admin/users/start/3', 'POST', '', root);
    await sessionRequest('/admin/users/start/4', 'POST', '', root);

    assert (await emc.isRunning(2)); // anonymous
    assert (await emc.isRunning(3)); // bob
    assert (await emc.isRunning(4)); // david

    // kill root
    await assertLoginRequired(sessionRequest('/admin/users/kill/1', 'POST', '', nobody));
    await assertRedirect(sessionRequest('/admin/users/kill/1', 'POST', '', root, { followRedirects: false }), '/admin/users/search?q=1');

    assert (!await emc.isRunning(1)); // root
    assert (await emc.isRunning(2)); // anonymous
    assert (await emc.isRunning(3)); // bob
    assert (await emc.isRunning(4)); // david


    await sessionRequest('/admin/users/start/1', 'POST', '', root);
    assert (await emc.isRunning(1));

    // noop
    await sessionRequest('/admin/users/start/1', 'POST', '', root);
    assert (await emc.isRunning(1));
}

async function testAdminOrgs(root, bob, nobody) {
    await assertBlocked('/admin/organizations', bob, nobody);
    const orgsPage = await sessionRequest('/admin/organizations', 'GET', null, root);
    assert(orgsPage.indexOf('Test Org') >= 0);
    assert(orgsPage.indexOf('Site Administration') >= 0);
    const orgsPage2 = await sessionRequest('/admin/organizations', 'GET', { page: -1 }, root);
    assert(orgsPage2.indexOf('Test Org') >= 0);
    assert(orgsPage2.indexOf('Site Administration') >= 0);

    const nextOrgPage = await sessionRequest('/admin/organizations', 'GET', { page: 1 }, root);
    assert(nextOrgPage.indexOf('Test Org') < 0);
    assert(nextOrgPage.indexOf('Site Administration') < 0);

    await assertBlocked('/admin/users/search', bob, nobody);
    await assertHttpError(sessionRequest('/admin/organizations/search', 'GET', null, root),
        400, 'Missing or invalid parameter q');
    const rootOrgPage = await sessionRequest('/admin/organizations/search', 'GET', { q: 'site' }, root);
    assert(rootOrgPage.indexOf('Test Org') < 0);
    assert(rootOrgPage.indexOf('Site Administration') >= 0);
}

async function testAdmin(root, bob, nobody) {
    await assertBlocked('/admin', bob, nobody);
    await sessionRequest('/admin', 'GET', null, root);

    await testAdminUsers(root, bob, nobody);
    await testAdminKillRestart(root, bob, nobody);
    await testAdminOrgs(root, bob, nobody);
}

async function main() {
    const emc = new EngineManagerClient();
    await emc.start();

    const nobody = await startSession();
    const bob = await login('bob', '12345678');
    const root = await login('root', 'rootroot');
    const charlie = await startSession();

    // public endpoints
    if (Config.WITH_THINGPEDIA === 'embedded')
        await testCommandpediaSuggest(nobody);

    // registration & user deletion
    await testRegister(charlie);
    await testDeleteUser(charlie, nobody);

    // user pages
    await testMyStuff(bob, nobody);
    await testMyDevices(bob, nobody);

    // user (web almond) api
    await testMyApiCookie(bob, nobody);
    const token = await getAccessToken(bob);
    await testMyApiOAuth(token);

    // admin pages
    await testAdmin(root, bob, nobody);

    await db.tearDown();
    await emc.stop();
}
main();
