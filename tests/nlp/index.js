// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('../polyfill');
process.on('unhandledRejection', (up) => { throw up; });
process.env.TEST_MODE = '1';

const assert = require('assert');
const ThingTalk = require('thingtalk');
const Gettext = require('node-gettext');

const Almond = require('almond-dialog-agent');
const Intent = Almond.Intent;
// FIXME
const ValueCategory = require('almond-dialog-agent/lib/semantic').ValueCategory;
const ParserClient = require('./parserclient');

const AdminThingpediaClient = require('../../util/admin-thingpedia-client');
const db = require('../../util/db');
const Config = require('../../config');

const gettext = new Gettext();
gettext.setLocale('en-US');

const schemas = new ThingTalk.SchemaRetriever(new AdminThingpediaClient(), null, true);

function candidateToString(cand) {
    if (cand.isProgram)
        return `Program(${cand.program.prettyprint(true)})`;
    else if (cand.isSetup)
        return `Setup(${cand.program.prettyprint(true)})`;
    else if (cand.isPermissionRule)
        return `PermissionRule(${cand.rule.prettyprint(true)})`;
    else
        return String(cand);
}

async function testEverything() {
    const TEST_CASES = require('./parser_test_cases');
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    for (let i = 0; i < TEST_CASES.length; i++) {
        const test = TEST_CASES[i];
        const analyzed = await parser.sendUtterance(test);
        assert(Array.isArray(analyzed.candidates));

        // everything should typecheck because the server filters server side
        let candidates = await Promise.all(analyzed.candidates.map(async (candidate, beamposition) => {
            return Intent.parse({ code: candidate.code, entities: analyzed.entities }, schemas, analyzed, null, null);
        }));

        candidates = candidates.filter((c) => c !== null);

        if (candidates.length === 0)
            console.log(`${i+1}: ${test} => null`);
        else
            console.log(`${i+1}: ${test} => ${candidateToString(candidates[0])}`);
    }
}

function testExpect() {
    const parser = new ParserClient(process.env.SEMPRE_URL, 'en-US');

    return Promise.all([
        parser.sendUtterance('42', ValueCategory.Number),
        parser.sendUtterance('yes', ValueCategory.YesNo),
        parser.sendUtterance('21 C', ValueCategory.Measure('C')),
        parser.sendUtterance('69 F', ValueCategory.Measure('C')),
    ]);
}

async function testMultipleChoice(text, expected) {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    const analyzed = await parser.sendUtterance(text, ValueCategory.MultipleChoice,
        [{ title: 'choice number one' }, { title: 'choice number two' }]);

    assert.deepStrictEqual(analyzed.entities, {});
    assert.deepStrictEqual(analyzed.candidates[0].code, ['bookkeeping', 'choice', expected]);
}

async function testOnlineLearn() {
    const parser = new ParserClient(Config.NL_SERVER_URL, 'en-US');

    await parser.onlineLearn('send sms', ['now', '=>', '@org.thingpedia.builtin.thingengine.phone.send_sms'], 'no');

    await parser.onlineLearn('abcdef', ['now', '=>', '@org.thingpedia.builtin.thingengine.phone.send_sms'], 'online');
    const analyzed = await parser.sendUtterance('abcdef');

    assert.deepStrictEqual(analyzed.candidates[0], {
        score: 'Infinity',
        code: ['now', '=>', '@org.thingpedia.builtin.thingengine.phone.send_sms']
    });
}

async function main() {
    await testEverything();
    await testExpect();
    await testMultipleChoice('choice number one', '0');
    await testMultipleChoice('choice number two', '1');
    await testOnlineLearn();

    await db.tearDown();
}
module.exports = main;
if (!module.parent)
    main();
