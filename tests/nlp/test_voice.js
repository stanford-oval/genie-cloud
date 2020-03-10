// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const Tp = require('thingpedia');
const ThingTalk = require('thingtalk');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');

const Config = require('../../config');
assert.strictEqual(Config.WITH_THINGPEDIA, 'external');

const { assertHttpError, } = require('../website/scaffold');

function formRequest(url, fd, options = {}) {
    options.dataContentType = 'multipart/form-data; boundary=' + fd.getBoundary();
    return Tp.Helpers.Http.postStream(url, fd, options);
}

async function testSTT() {
    const fd1 = new FormData();
    await assertHttpError(formRequest(Config.NL_SERVER_URL + '/en-US/voice/stt', fd1),
        400, 'missing or invalid parameter audio');

    const pathname = path.resolve(path.dirname(module.filename), '../data/stt-test1.wav');

    const fd2 = new FormData();
    fd2.append('foo', fs.createReadStream(pathname), { filename: 'test1.wav', contentType: 'audio/x-wav' });

    await assertHttpError(formRequest(Config.NL_SERVER_URL + '/en-US/voice/stt', fd2),
        400, 'Unexpected field');

    const fd3 = new FormData();
    fd3.append('audio', fs.createReadStream(pathname), { filename: 'test1.wav', contentType: 'audio/x-wav' });

    const response = await formRequest(Config.NL_SERVER_URL + '/en-US/voice/stt', fd3);
    const parsed = JSON.parse(response);
    assert.deepStrictEqual(parsed, {
        result: 'ok',
        text: 'Hello, this is a test.'
    });
}

async function testCombinedSTTAndNLU() {
    const pathname = path.resolve(path.dirname(module.filename), '../data/stt-test2.wav');
    const fd = new FormData();
    fd.append('audio', fs.createReadStream(pathname), { filename: 'test2.wav', contentType: 'audio/x-wav' });
    fd.append('metadata', JSON.stringify({
        thingtalk_version: ThingTalk.version
    }));

    const response = await formRequest(Config.NL_SERVER_URL + '/en-US/voice/query', fd);
    const parsed = JSON.parse(response);
    assert(Array.isArray(parsed.candidates));
    assert.deepStrictEqual(parsed.candidates[0], {
        code: ['now', '=>', '@com.thecatapi.get', '=>', 'notify'],
        score: 'Infinity'
    });
}

async function testTTS() {
    const [wav, contentType] = await Tp.Helpers.Http.post(Config.NL_SERVER_URL + '/en-US/voice/tts', JSON.stringify({
        text: 'This is a test.',
    }), {
        dataContentType: 'application/json',
        raw: true
    });

    assert.strictEqual(contentType, 'audio/x-wav');
    assert(wav instanceof Buffer);
    assert.strictEqual(wav.slice(0, 4).toString(), 'RIFF');
}

async function main() {
    if (!Config.MS_SPEECH_SUBSCRIPTION_KEY) {
        console.error(`WARNING: skipping voice API tests because MS subscription key is not present`);
        return;
    }

    await testSTT();
    await testCombinedSTTAndNLU();
    await testTTS();
}
module.exports = main;
if (!module.parent)
    main();
