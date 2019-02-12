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
const qs = require('qs');
const Url = require('url');

const { assertHttpError, assertRedirect, sessionRequest } = require('./scaffold');
const { login } = require('../login');

async function testSSO() {
    const session = await login('bob', '12345678');

    // structurally invalid (wrong length, not hex)
    await assertHttpError(sessionRequest('/user/sso/discourse', 'GET', { sso: 'bm9uY2U9Y2I2ODI1MWVlZmI1MjExZTU4YzAwZmYxMzk1ZjBjMGI\n' , sig: 'invalid' }, session),
        403, 'Invalid signature');

    // cryptographically invalid (wrong key)
    await assertHttpError(sessionRequest('/user/sso/discourse', 'GET', { sso: 'bm9uY2U9Y2I2ODI1MWVlZmI1MjExZTU4YzAwZmYxMzk1ZjBjMGI\n' , sig: '2828aa29899722b35a2f191d34ef9b3ce695e0e6eeec47deb46d588d70c7cb56' }, session),
        403, 'Invalid signature');

    await assertRedirect(sessionRequest('/user/sso/discourse', 'GET', { sso: 'bm9uY2U9Y2I2ODI1MWVlZmI1MjExZTU4YzAwZmYxMzk1ZjBjMGI\n' , sig: '0d7facea785e25b2b30e9dc653df1f3cff3abc564aa5ca397010a49b77bc405a' }, session, { followRedirects: false }), (redirect) => {
        assert(redirect.startsWith('https://discourse.almond.stanford.edu/session/sso_login'));

        const parsed = Url.parse(redirect, { parseQueryString: true });
        const decoded = qs.parse(Buffer.from(parsed.query.sso, 'base64').toString());
        assert.strictEqual(decoded.email, 'bob@localhost');
        assert.strictEqual(decoded.username, 'bob');
        assert.strictEqual(decoded.admin, 'false');
        assert.strictEqual(decoded.nonce, 'cb68251eefb5211e58c00ff1395f0c0b');
    });
}

async function main() {
    await testSSO();
}
module.exports = main;
if (!module.parent)
    main();
