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
const { assertHttpError, assertRedirect, assertLoginRequired, sessionRequest, dbQuery } = require('./scaffold');
const { login, startSession } = require('../login');

const db = require('../../util/db');
const EngineManagerClient = require('../../almond/enginemanagerclient');

const Config = require('../../config');

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

async function main() {
    const emc = new EngineManagerClient();
    await emc.start();

    const nobody = await startSession();
    const bob = await login('bob', '12345678');

    // user pages
    await testMyStuff(bob, nobody);
    await testMyDevices(bob, nobody);

    await db.tearDown();
    await emc.stop();
}
module.exports = main;
if (!module.parent)
    main();
