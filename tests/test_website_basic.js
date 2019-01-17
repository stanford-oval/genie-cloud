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

const Config = require('../config');

const csrf = require('./util/csrf');

const db = require('../util/db');

function dbQuery(query, args) {
    return db.withClient((dbClient) => {
        return db.selectOne(dbClient, query, args);
    });
}

function request(url, method, data, options = {}) {
    options['user-agent'] = 'Thingpedia-Cloud-Test/1.0.0';

    return Tp.Helpers.Http.request(Config.SERVER_ORIGIN + url, method, data, options);
}

function assertHttpError(request, httpStatus) {
    return request.then(() => {
        assert.fail(new Error(`Expected HTTP error`));
    }, (err) => {
        if (typeof err.code === 'number')
            assert.deepStrictEqual(err.code, httpStatus);
        else
            throw err;
    });
}

async function getAccessToken() {
    const csrfToken = csrf.getCsrfToken(await request('/', 'GET', null, {
        extraHeaders: { 'Cookie': process.env.COOKIE }
    }));

    return JSON.parse(await request('/me/api/token', 'POST', '_csrf=' + csrfToken, {
        accept: 'application/json',
        extraHeaders: { 'Cookie': process.env.COOKIE }
    })).token;
}

async function testMyApiCookie() {
    const result = JSON.parse(await request('/me/api/profile', 'GET', null, {
        extraHeaders: { 'Cookie': process.env.COOKIE }
    }));

    const bobInfo = await dbQuery(`select * from users where username = ?`, ['bob']);

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
    }), 401);

    await assertHttpError(request('/me/api/profile', 'GET', null, {
        extraHeaders: {
            'Cookie': process.env.COOKIE,
            'Origin': 'https://invalid.origin.example.com'
        }
    }), 403);

    await request('/me/api/profile', 'GET', null, {
        extraHeaders: {
            'Cookie': process.env.COOKIE,
            'Origin': Config.SERVER_ORIGIN
        }
    });
}

async function testMyApiProfileOAuth(auth) {
    const result = JSON.parse(await request('/me/api/profile', 'GET', null, { auth }));

    const bobInfo = await dbQuery(`select * from users where username = ?`, ['bob']);

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

async function main() {
    await testMyApiCookie();

    const token = await getAccessToken();

    await testMyApiOAuth(token);

    await db.tearDown();
}
main();
