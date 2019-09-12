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
const csvstringify = require('csv-stringify');
const FormData = require('form-data');
const minidom = require('../util/minidom');
const { assertHttpError, assertRedirect, sessionRequest, dbQuery } = require('./scaffold');
const { login, startSession } = require('../login');

const db = require('../../util/db');

// a version of deepStrictEqual that works with RowDataPacket objects returned from mysql
function deepStrictEqual(a, b, ...args) {
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(a)),
        JSON.parse(JSON.stringify(b)),
        ...args);
}

async function testCreateMTurkBatch(root) {
    const inputfile = csvstringify({ delimiter: '\t', header: true });
    for (let i = 0; i < 8; i++) {
        inputfile.write({
            id: String(i),
            utterance: `synthetic ${String.fromCharCode(97 + i)}`,
            target_code: `now => @com.bing.web_search() => notify;`
        });
    }
    inputfile.end();

    const fd1 = new FormData();
    fd1.append('name', 'Test Batch');
    fd1.append('submissions_per_hit', '3');
    await assertHttpError(sessionRequest('/mturk/create', 'POST', fd1, root),
        400, 'Must upload the CSV file');

    const fd2 = new FormData();
    fd2.append('name', 'Test Batch');
    fd2.append('submissions_per_hit', '3');
    fd2.append('upload', inputfile, { filename: 'input.tsv', contentType: 'text/tab-separated-values' });

    await assertRedirect(sessionRequest('/mturk/create', 'POST', fd2, root, { followRedirects: false }),
        '/mturk');

    const batches = await dbQuery(`select * from mturk_batch`);
    deepStrictEqual(batches, [{
        id: 1,
        language: 'en',
        name: 'Test Batch',
        submissions_per_hit: 3,
        status: 'created'
    }]);

    const hits = await dbQuery(`select * from mturk_input`);
    deepStrictEqual(hits, [{
        id: 1,
        batch: 1,
        hit_id: 0,
        thingtalk: `now => @com.bing.web_search() => notify;`,
        sentence: `synthetic a`
    }, {
        id: 2,
        batch: 1,
        hit_id: 0,
        thingtalk: `now => @com.bing.web_search() => notify;`,
        sentence: `synthetic b`
    }, {
        id: 3,
        batch: 1,
        hit_id: 0,
        thingtalk: `now => @com.bing.web_search() => notify;`,
        sentence: `synthetic c`
    }, {
        id: 4,
        batch: 1,
        hit_id: 0,
        thingtalk: `now => @com.bing.web_search() => notify;`,
        sentence: `synthetic d`
    }, {
        id: 5,
        batch: 1,
        hit_id: 1,
        thingtalk: `now => @com.bing.web_search() => notify;`,
        sentence: `synthetic e`
    }, {
        id: 6,
        batch: 1,
        hit_id: 1,
        thingtalk: `now => @com.bing.web_search() => notify;`,
        sentence: `synthetic f`
    }, {
        id: 7,
        batch: 1,
        hit_id: 1,
        thingtalk: `now => @com.bing.web_search() => notify;`,
        sentence: `synthetic g`
    }, {
        id: 8,
        batch: 1,
        hit_id: 1,
        thingtalk: `now => @com.bing.web_search() => notify;`,
        sentence: `synthetic h`
    }]);


}

async function testSubmitToMTurk(nobody) {
    await assertHttpError(sessionRequest('/mturk/submit/1/9', 'GET', null, nobody),
        404);

    await assertHttpError(sessionRequest('/mturk/submit/2/1', 'GET', null, nobody),
        404);

    await sessionRequest('/mturk/submit/1/0', 'GET', null, nobody);

    const data = {
        batch: '1',
        worker: 'FOOBARBAZ',
    };

    for (let i = 0; i < 4; i++) {
        data[`program_id${i+1}`] = String(i+1);
        data[`thingtalk${i+1}`] = `now => @com.bing.web_search() => notify;`;
        data[`sentence${i+1}`] = `synthetic ${String.fromCharCode(97 + i)}`;

        data[`paraphrase${i+1}-1`] = `paraphrase ${String.fromCharCode(97 + i)} first`;
        data[`paraphrase${i+1}-2`] = `paraphrase ${String.fromCharCode(97 + i)} second`;
    }

    delete data[`paraphrase1-2`];

    await assertHttpError(sessionRequest('/mturk/submit', 'POST', data, nobody),
        400, `Missing or invalid parameter paraphrase1-2`);

    data[`paraphrase1-2`] = `paraphrase with number 42`;
    await assertHttpError(sessionRequest('/mturk/submit', 'POST', data, nobody),
        400, `Unused entity NUMBER_0`);

    data[`paraphrase1-2`] = `paraphrase a second`;
    const result = await sessionRequest('/mturk/submit', 'POST', data, nobody);

    const root = minidom.parse(result);
    const tokenDiv = minidom.getElementById(root, 'token');

    const submission_id = minidom.getTextContent(tokenDiv).trim();
    console.log(submission_id);

    const output = await dbQuery(`select submission_id,program_id,target_count,accept_count,
        reject_count from mturk_output order by program_id`);

    const reference = [];
    for (let i = 0; i < 4; i++) {
        reference.push({
            submission_id,
            program_id: 1+i,
            target_count: 3,
            reject_count: 0,
            accept_count: 0,
        });
        reference.push({
            submission_id,
            program_id: 1+i,
            target_count: 3,
            reject_count: 0,
            accept_count: 0,
        });
    }

    deepStrictEqual(output, reference);

    const sentences = await dbQuery(`select type, flags, utterance, target_code from example_utterances,
        mturk_output where id = example_id and submission_id = ? order by utterance`, [submission_id]);

    deepStrictEqual(sentences, [{
        type: 'turking1',
        flags: '',
        utterance: 'paraphrase a first',
        target_code: 'now => @com.bing.web_search => notify'
    }, {
        type: 'turking1',
        flags: '',
        utterance: 'paraphrase a second',
        target_code: 'now => @com.bing.web_search => notify'
    }, {
        type: 'turking1',
        flags: '',
        utterance: 'paraphrase b first',
        target_code: 'now => @com.bing.web_search => notify'
    }, {
        type: 'turking1',
        flags: '',
        utterance: 'paraphrase b second',
        target_code: 'now => @com.bing.web_search => notify'
    }, {
        type: 'turking1',
        flags: '',
        utterance: 'paraphrase c first',
        target_code: 'now => @com.bing.web_search => notify'
    }, {
        type: 'turking1',
        flags: '',
        utterance: 'paraphrase c second',
        target_code: 'now => @com.bing.web_search => notify'
    }, {
        type: 'turking1',
        flags: '',
        utterance: 'paraphrase d first',
        target_code: 'now => @com.bing.web_search => notify'
    }, {
        type: 'turking1',
        flags: '',
        utterance: 'paraphrase d second',
        target_code: 'now => @com.bing.web_search => notify'
    }]);


    // submit again from two other workers so we have enough data for validation
    const data2 = {
        batch: '1',
        worker: 'FOOBARBAZ-2',
    };

    for (let i = 0; i < 4; i++) {
        data2[`program_id${i+1}`] = String(i+1);
        data2[`thingtalk${i+1}`] = `now => @com.bing.web_search() => notify;`;
        data2[`sentence${i+1}`] = `synthetic ${String.fromCharCode(97 + i)}`;

        data2[`paraphrase${i+1}-1`] = `paraphrase ${String.fromCharCode(97 + i)} first from second worker`;
        data2[`paraphrase${i+1}-2`] = `paraphrase ${String.fromCharCode(97 + i)} second from second worker`;
    }

    await sessionRequest('/mturk/submit', 'POST', data2, nobody);

    // submit again from two other workers so we have enough data for validation
    const data3 = {
        batch: '1',
        worker: 'FOOBARBAZ-3',
    };

    for (let i = 0; i < 4; i++) {
        data3[`program_id${i+1}`] = String(i+1);
        data3[`thingtalk${i+1}`] = `now => @com.bing.web_search() => notify;`;
        data3[`sentence${i+1}`] = `synthetic ${String.fromCharCode(97 + i)}`;

        data3[`paraphrase${i+1}-1`] = `paraphrase ${String.fromCharCode(97 + i)} first from third worker`;
        data3[`paraphrase${i+1}-2`] = `paraphrase ${String.fromCharCode(97 + i)} second from third worker`;
    }

    await sessionRequest('/mturk/submit', 'POST', data3, nobody);
}

async function testStartValidation(root, nobody) {
    await assertHttpError(sessionRequest('/mturk/start-validation', 'POST', { batch: 1 }, nobody),
        401);

    await assertHttpError(sessionRequest('/mturk/start-validation', 'POST', { batch: 2 }, root),
        404);

    await sessionRequest('/mturk/start-validation', 'POST', { batch: 1 }, root);

    const hits = await dbQuery(`select * from mturk_validation_input`);

    assert.strictEqual(hits.length, 32);
    const paraset = new Set;
    for (let hit of hits) {
        if (hit.type === 'fake-same') {
            assert(hit.paraphrase.startsWith('synthetic '));
            assert.strictEqual(hit.example_id, null);
        } else if (hit.type === 'fake-different') {
            assert.strictEqual(hit.paraphrase, 'if reddit front page updated, get a #dog gif');
            assert.strictEqual(hit.example_id, null);
        } else {
            assert.strictEqual(hit.type, 'real');
            assert(hit.paraphrase.startsWith('paraphrase '));
            paraset.add(hit.paraphrase);
            assert(hit.example_id >= 1020);
        }

        assert.strictEqual(hit.batch, 1);
        assert.strictEqual(hit.hit_id, 0);
    }
    assert.strictEqual(paraset.size, 32 - 8);
}

async function testSubmitValidation(nobody) {
    await assertHttpError(sessionRequest('/mturk/validate/1/1', 'GET', null, nobody),
        404);

    await assertHttpError(sessionRequest('/mturk/validate/2/1', 'GET', null, nobody),
        404);

    await sessionRequest('/mturk/validate/1/0', 'GET', null, nobody);

    const hits = await dbQuery(`select * from mturk_validation_input`);

    const data = {
        batch: '1',
        hit: '0',
        worker: 'FOOBARBAZ'
    };

    // missing data
    await assertHttpError(sessionRequest('/mturk/validate', 'POST', data, nobody),
        400, 'Missing or invalid parameter validation-1');

    // all same
    for (let hit of hits)
        data[`validation-${hit.id}`] = 'same';
    await assertHttpError(sessionRequest('/mturk/validate', 'POST', data, nobody),
        400, 'You have made too many mistakes. Please go back and try again.');

    // all different
    for (let hit of hits)
        data[`validation-${hit.id}`] = 'different';
    await assertHttpError(sessionRequest('/mturk/validate', 'POST', data, nobody),
        400, 'You have made too many mistakes. Please go back and try again.');

    // "correct" HIT

    for (let hit of hits) {
        if (hit.type === 'fake-same')
            data[`validation-${hit.id}`] = 'same';
        else if (hit.type === 'fake-different')
            data[`validation-${hit.id}`] = 'different';
        else if (/ [abcd] first/.test(hit.paraphrase))
            data[`validation-${hit.id}`] = 'same';
        else
            data[`validation-${hit.id}`] = 'different';
    }

    const result = await sessionRequest('/mturk/validate', 'POST', data, nobody);
    const root = minidom.parse(result);
    const tokenDiv = minidom.getElementById(root, 'token');

    const submission_id = minidom.getTextContent(tokenDiv).trim();
    console.log(submission_id);

    deepStrictEqual(await dbQuery(`select * from mturk_validation_log`), [{
        submission_id,
        worker: 'FOOBARBAZ',
        batch: 1,
        hit: 0
    }]);

    const mturk_output = await dbQuery(`select mvi.paraphrase, mvo.* from
        mturk_validation_output mvo, mturk_validation_input mvi
        where mvi.id = mvo.validation_sentence_id`);
    assert.strictEqual(mturk_output.length, 24);

    for (let hit of mturk_output) {
        assert.strictEqual(hit.submission_id, submission_id);
        if (/ [abcd] first/.test(hit.paraphrase))
            assert.strictEqual(hit.answer, 'same');
        else
            assert.strictEqual(hit.answer, 'different');
    }

    const paraphrase_output = await dbQuery(`select submission_id,program_id,target_count,accept_count,
        reject_count,utterance from mturk_output, example_utterances
        where example_utterances.id = mturk_output.example_id
        order by program_id`);

    for (let hit of paraphrase_output) {
        if (/ [abcd] first/.test(hit.utterance)) {
            assert.strictEqual(hit.accept_count, 1);
            assert.strictEqual(hit.reject_count, 0);
        } else {
            assert.strictEqual(hit.accept_count, 0);
            assert.strictEqual(hit.reject_count, 1);
        }
    }

    // if we submit again nothing happens and the submission ID is the same
    const result2 = await sessionRequest('/mturk/validate', 'POST', data, nobody);
    const root2 = minidom.parse(result2);
    const tokenDiv2 = minidom.getElementById(root2, 'token');

    const submission_id2 = minidom.getTextContent(tokenDiv2).trim();
    assert.strictEqual(submission_id2, submission_id);

    const [{ mturk_output_count2 }] = await dbQuery(`select count(*) as mturk_output_count2
        from mturk_validation_output`);
    assert.strictEqual(mturk_output_count2, 24);

    // submit two more validations to get to the threshold of 3
    data.worker = 'FOOBARBAZ-2';
    await sessionRequest('/mturk/validate', 'POST', data, nobody);

    data.worker = 'FOOBARBAZ-3';
    await sessionRequest('/mturk/validate', 'POST', data, nobody);

    const paraphrase_output2 = await dbQuery(`select submission_id,program_id,target_count,accept_count,
        reject_count,utterance,flags from mturk_output, example_utterances
        where example_utterances.id = mturk_output.example_id
        order by program_id`);

    for (let hit of paraphrase_output2) {
        if (/ [abcd] first/.test(hit.utterance)) {
            assert.strictEqual(hit.accept_count, 3);
            assert.strictEqual(hit.reject_count, 0);
            assert.strictEqual(hit.flags, 'training');
        } else {
            assert.strictEqual(hit.accept_count, 0);
            assert.strictEqual(hit.reject_count, 3);
            assert.strictEqual(hit.flags, '');
        }
    }

    // submit another validation for all different (except the decoy)
    data.worker = 'FOOBARBAZ-4';
    for (let hit of hits) {
        if (hit.type === 'fake-same')
            data[`validation-${hit.id}`] = 'same';
        else
            data[`validation-${hit.id}`] = 'different';
    }

    await sessionRequest('/mturk/validate', 'POST', data, nobody);

    const paraphrase_output3 = await dbQuery(`select submission_id,program_id,target_count,accept_count,
        reject_count,utterance,flags from mturk_output, example_utterances
        where example_utterances.id = mturk_output.example_id
        order by program_id`);

    for (let hit of paraphrase_output3) {
        if (/ [abcd] first/.test(hit.utterance)) {
            assert.strictEqual(hit.accept_count, 3);
            assert.strictEqual(hit.reject_count, 1);
        } else {
            assert.strictEqual(hit.accept_count, 0);
            assert.strictEqual(hit.reject_count, 4);
        }

        // in either case, reject_count > 0, so we're not training with this sentence
        assert.strictEqual(hit.flags, '');
    }

    // check that there are no left over sentences with the training flag
    const training1 = await dbQuery(`select * from example_utterances where language = 'en'
        and type = 'turking1' and find_in_set('training', flags)`);
    deepStrictEqual(training1, []);

    // insert a dummy entry into the training set to fix the ID deterministically (which
    // is necessary for latest tests), and also have a paraphrase with the training flag in
    // the dataset
    await dbQuery(`insert into example_utterances set id = 1500, is_base = 0, language = 'en',
        type = 'turking1', flags = 'training', utterance = 'search on bing',
        preprocessed = 'search on bing', target_code = 'now => @com.bing.web_search => notify',
        target_json = ''`);
}

async function main() {
    const nobody = await startSession();
    const root = await login('root', 'rootroot');

    await testCreateMTurkBatch(root);

    await testSubmitToMTurk(nobody);

    await testStartValidation(root, nobody);

    await testSubmitValidation(nobody);

    await db.tearDown();
}
module.exports = main;
if (!module.parent)
    main();
