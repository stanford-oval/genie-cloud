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


import assert from 'assert';
import * as qs from 'qs';
import * as Url from 'url';

import { assertHttpError, assertRedirect, sessionRequest } from './scaffold';
import { login } from '../login';

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
export default main;
if (!module.parent)
    main();
