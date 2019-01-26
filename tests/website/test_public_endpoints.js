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
const { assertHttpError, sessionRequest, dbQuery } = require('./scaffold');
const { startSession } = require('../login');

const db = require('../../util/db');

const Config = require('../../config');

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
module.exports = main;
if (!module.parent)
    main();
