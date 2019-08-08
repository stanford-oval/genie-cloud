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

const Url = require('url');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const qs = require('qs');
const FormData = require('form-data');
const { assertHttpError, assertRedirect, assertLoginRequired, request, sessionRequest, dbQuery } = require('./scaffold');
const { login, startSession } = require('../login');
const minidom = require('../util/minidom');

const db = require('../../util/db');

//const Config = require('../../config');

async function testCreateOAuthClient(bob, david, nobody) {
    await assertLoginRequired(sessionRequest('/developers/oauth/create', 'POST', null, nobody));

    // david is not a developer
    await assertHttpError(sessionRequest('/developers/oauth/create', 'POST', null, david),
        403, 'You do not have permission to perform this operation.');


    const fd1 = new FormData();
    const iconpath = path.resolve(path.dirname(module.filename), '../data/test-oauth-logo.png');
    fd1.append('icon', fs.createReadStream(iconpath));
    fd1.append('name', 'Test OAuth Client');
    fd1.append('scope', 'profile');
    fd1.append('scope', 'user-read');
    fd1.append('redirect_uri', 'https://example.com/oauth https://dev.example.com/oauth http://127.0.0.1:1010/oauth');

    await assertRedirect(sessionRequest('/developers/oauth/create', 'POST', fd1, bob, { followRedirects: false }),
        '/developers/oauth');

    const clients = await dbQuery(`select * from oauth2_clients where name = ?`, ['Test OAuth Client']);
    assert.strictEqual(clients.length, 1);
    const client = clients[0];
    assert(client);

    return [client.id, client.secret];
}

async function testAuthorize(clientId, david, nobody) {
    await assertHttpError(sessionRequest('/me/api/oauth2/authorize', 'GET', { client_id: 'invalid' }, david),
        400, 'Missing required parameter: response_type');

    await assertHttpError(sessionRequest('/me/api/oauth2/authorize', 'GET', {
        client_id: 'invalid',
        response_type: 'code',
        scope: 'profile',
    }, david), 403, 'invalid client');

    await assertHttpError(sessionRequest('/me/api/oauth2/authorize', 'GET', {
        client_id: clientId,
        response_type: 'code',
        scope: 'profile',
    }, david), 403, 'invalid redirect_uri');

    await assertHttpError(sessionRequest('/me/api/oauth2/authorize', 'GET', {
        client_id: clientId,
        response_type: 'code',
        redirect_uri: 'https://example.com/invalid',
        scope: 'profile',
    }, david), 403, 'invalid redirect_uri');

    await assertHttpError(sessionRequest('/me/api/oauth2/authorize', 'GET', {
        client_id: clientId,
        response_type: 'code',
        redirect_uri: 'https://example.com/oauth',
        scope: 'profile user-write',
    }, david), 400, 'invalid scope');

    const page = await sessionRequest('/me/api/oauth2/authorize', 'GET', {
        client_id: clientId,
        response_type: 'code',
        redirect_uri: 'https://example.com/oauth',
        scope: 'profile',
    }, david);

    let transaction_id;
    for (let input of minidom.getElementsByTagName(minidom.parse(page), 'input')) {
        if (minidom.getAttribute(input, 'name') === 'transaction_id') {
            transaction_id = minidom.getAttribute(input, 'value');
            break;
        }
    }
    assert(transaction_id, 'missing transaction_id in authorization page');

    return sessionRequest('/me/api/oauth2/authorize', 'POST', {
        transaction_id,
        scope: 'profile',
    }, david, { followRedirects: false }).then(() => {
        assert.fail(new Error(`Expected HTTP redirect`));
    }, (err) => {
        if (!err.code)
            throw err;
        assert.strictEqual(err.code, 302);
        assert(err.redirect.startsWith('https://example.com/oauth?'));
        const parsed = Url.parse(err.redirect, { parseQueryString: true });
        return parsed.query.code;
    });
}

async function testGetAccessToken(clientId, clientSecret, authorizationCode) {
    await assertHttpError(request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: 'invalid',
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: 'https://example.com/oauth'
    }), { dataContentType: 'application/x-www-form-urlencoded' }), 401, 'Unauthorized');

    await assertHttpError(request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: clientId,
        client_secret: 'invalid',
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: 'https://example.com/oauth'
    }), { dataContentType: 'application/x-www-form-urlencoded' }), 401, 'Unauthorized');

    await assertHttpError(request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'code',
        code: 'foof',
        redirect_uri: 'https://example.com/oauth'
    }), { dataContentType: 'application/x-www-form-urlencoded' }), 501, 'unsupported_grant_type');

    await assertHttpError(request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: 'foof',
        redirect_uri: 'https://example.com/oauth'
    }), { dataContentType: 'application/x-www-form-urlencoded' }), 403, 'invalid_grant');

    await assertHttpError(request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: 'https://example.com/invalid'
    }), { dataContentType: 'application/x-www-form-urlencoded' }), 403, 'invalid_grant');

    await assertHttpError(request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: 'https://dev.example.com/oauth' // valid but not the one we just used
    }), { dataContentType: 'application/x-www-form-urlencoded' }), 403, 'invalid_grant');

    const result = JSON.parse(await request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: 'https://example.com/oauth'
    }), { dataContentType: 'application/x-www-form-urlencoded' }));

    assert.strictEqual(result.expires_in, 3600);
    assert.strictEqual(result.token_type, 'Bearer');

    return [result.access_token, result.refresh_token];
}

async function testUseAccessToken(accessToken) {
    const result = JSON.parse(await request('/me/api/profile', 'GET', null, { auth: `Bearer ${accessToken}` }));

    const [davidInfo] = await dbQuery(`select * from users where username = ?`, ['david']);

    assert.deepStrictEqual(result, {
        id: davidInfo.cloud_id,
        username: 'david',
        full_name: davidInfo.human_name,
        email: davidInfo.email,
        email_verified: davidInfo.email_verified,
        locale: davidInfo.locale,
        timezone: davidInfo.timezone,
        model_tag: davidInfo.model_tag
    });

    // the grant was for "profile" only: check that we cannot do "user-read" things
    await assertHttpError(request('/me/api/apps/list', 'GET', null, { auth: `Bearer ${accessToken}` }), 403, 'invalid scope');
}

async function testRefreshToken(clientId, clientSecret, refreshToken) {
    await assertHttpError(request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: 'foo',
    }), { dataContentType: 'application/x-www-form-urlencoded' }), 403, 'invalid_grant');

    const result = JSON.parse(await request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    }), { dataContentType: 'application/x-www-form-urlencoded' }));

    return result.access_token;
}

async function testUseRefreshTokenAsAccessToken(refreshToken) {
    await assertHttpError(request('/me/api/profile', 'GET', null, { auth: `Bearer ${refreshToken}` }),
        403, 'jwt audience invalid. expected: oauth2');
}

async function testRevokePermission(david, nobody, clientId, clientSecret, accessToken, refreshToken) {
    await assertLoginRequired(sessionRequest('/user/revoke-oauth2', 'POST', { client_id: clientId }, nobody));

    await sessionRequest('/user/revoke-oauth2', 'POST', { client_id: clientId }, david);

    // refreshing the token now fails
    await assertHttpError(request('/me/api/oauth2/token', 'POST', qs.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    }), { dataContentType: 'application/x-www-form-urlencoded' }), 403, 'invalid_grant');

    // but the old access token still works (for 1h, until expiration)
    await request('/me/api/profile', 'GET', null, { auth: `Bearer ${accessToken}` });
}

async function main() {
    const nobody = await startSession();
    const bob = await login('bob', '12345678');
    const david = await login('david', '12345678');

    try {
        const [clientId, clientSecret] = await testCreateOAuthClient(bob, david, nobody);

        const authorizationCode = await testAuthorize(clientId, david, nobody);

        const [accessToken, refreshToken] = await testGetAccessToken(clientId, clientSecret, authorizationCode);
        await testUseAccessToken(accessToken);

        const newAccessToken = await testRefreshToken(clientId, clientSecret, refreshToken);
        await testUseAccessToken(newAccessToken);

        await testUseRefreshTokenAsAccessToken(refreshToken);

        await testRevokePermission(david, nobody, clientId, clientSecret, accessToken, refreshToken);

    } finally {
        // clean up after the tests so we can run them multiple times
        await db.withClient((dbClient) => {
            return db.query(dbClient, `delete from oauth2_clients where owner = 2`);
        });

        await db.tearDown();
    }
}
module.exports = main;
if (!module.parent)
    main();
