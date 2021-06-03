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
import { assertHttpError, sessionRequest, dbQuery } from './scaffold';
import { startSession } from '../login';

import * as db from '../../src/util/db';

import * as Config from '../../src/config';

async function testCommandpediaSuggest(nobody) {
    await assertHttpError(sessionRequest('/thingpedia/commands/suggest', 'POST', { description: '' }, nobody),
        400, 'Missing or invalid parameter description');

    await sessionRequest('/thingpedia/commands/suggest', 'POST', { description: 'lemme watch netflix' }, nobody);

    const [suggestion] = await dbQuery(`select * from command_suggestions order by suggest_time desc limit 1`);

    assert.strictEqual(suggestion.command, 'lemme watch netflix');
}

async function main() {
    const nobody = await startSession();

    if (Config.WITH_THINGPEDIA === 'embedded')
        await testCommandpediaSuggest(nobody);

    await db.tearDown();
}
export default main;
if (!module.parent)
    main();
