// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

const Url = require('url');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const qs = require('qs');
const FormData = require('form-data');
const { assertHttpError, assertRedirect, assertLoginRequired, request, sessionRequest, dbQuery } = require('./scaffold');
const { login, startSession } = require('../login');
const minidom = require('../util/minidom');

async function testWithoutQueryString(session) {
    const response = await sessionRequest('/proxy', 'GET', {
        kind: 'com.spotify',
        redirect: 'http://localhost:1234/subpath'
     }, session);

    assert(response.includes(`<h2>OAuth request for: </h2><span> </span><h3>com.spotify</h3><span> </span><h2>from: </h2><h3>localhost:1234</h3>`));

    assertRedirect(sessionRequest('/proxy/oauth2', 'POST', { device_type: 'com.spotify' }, session, { followRedirects: false }), (redirect) => {
        assert(redirect.startsWith('https://accounts.spotify.com/authorize'));
    });

    assertRedirect(sessionRequest('/devices/oauth2/callback/com.spotify', 'GET', {
        authorization_code: 'code-123456',
        state: 'abcdef'
    }, session, { followRedirects: false }), 'http://localhost:1234/subpath/devices/oauth2/callback/com.spotify?authorization_code=code-123456&state=abcdef');
}

async function testWithQueryString(session) {
    const response = await sessionRequest('/proxy', 'GET', {
        kind: 'com.spotify',
        redirect: 'http://localhost:1235/subpath?foo=1&bar=2'
     }, session);

    assert(response.includes(`<h2>OAuth request for: </h2><span> </span><h3>com.spotify</h3><span> </span><h2>from: </h2><h3>localhost:1235</h3>`));

    assertRedirect(sessionRequest('/proxy/oauth2', 'POST', { device_type: 'com.spotify' }, session, { followRedirects: false }), (redirect) => {
        assert(redirect.startsWith('https://accounts.spotify.com/authorize'));
    });

    assertRedirect(sessionRequest('/devices/oauth2/callback/com.spotify', 'GET', {
        authorization_code: 'code-123457',
        state: 'abcdef'
    }, session, { followRedirects: false }), 'http://localhost:1235/subpath?foo=1&bar=2&authorization_code=code-123457&state=abcdef');
}

async function main() {
    let session = await startSession();
    await testWithoutQueryString(session);

    session = await startSession();
    await testWithQueryString(session);
}
module.exports = main;
if (!module.parent)
    main();
