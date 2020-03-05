// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Euirim Choi <euirim@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const multer = require('multer');
const os = require('os');
const iv = require('../../util/input_validation');
const I18n = require('../../util/i18n');

const { SpeechToText, textToSpeech } = require('./backend-microsoft');
const runNLU = require('../nlu');

const upload = multer({ dest: os.tmpdir() });

const router = express.Router();

function restSTT(req, res, next) {
    if (!req.file) {
        iv.failKey(req, res, 'audio', { json: true });
        return;
    }
    if (!I18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const stt = new SpeechToText(req.params.locale);
    stt.recognizeOnce(req.file.path).then((text) => {
        res.json({
            status: 'ok',
            text: text
        });
    }).catch(next);
}

const NLU_METADATA_KEYS = {
    store: '?string',
    access_token: '?string',
    thingtalk_version: '?string',
    limit: '?integer',
    expect: '?string',
    choices: '?array',
    context: '?string',
    entities: '?object',
    tokenized: 'boolean',
    skip_typechecking: 'boolean',
    developer_key: '?string',
};

async function restSTTAndNLU(req, res, next) {
    if (!req.file) {
        iv.failKey(req, res, 'audio', { json: true });
        return;
    }
    let metadata;
    try {
        metadata = JSON.parse(req.body.metadata);
    } catch(e) {
        iv.failKey(req, res, 'metadata', { json: true });
        return;
    }
    for (let key in NLU_METADATA_KEYS) {
        if (!iv.checkKey(metadata[key], NLU_METADATA_KEYS[key])) {
            iv.failKey(req, res, key, { json: true });
            return;
        }
    }

    if (!I18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    const stt = new SpeechToText(req.params.locale);
    const text = await stt.recognizeOnce(req.file.path);

    const result = await runNLU(text, req.params, req.body, res.app.service, res);
    if (result === undefined)
        return;

    result.text = text;
    res.json(result);
}

function tts(req, res, next) {
    if (!I18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    textToSpeech(req.params.locale, req.body.text).then((stream) => {
        // audio/x-wav is strictly-speaking non-standard, yet it seems to be
        // widely used for .wav files
        if (stream.statusCode === 200)
            res.set('Content-Type', 'audio/x-wav');
        stream.pipe(res);
    }).catch(next);
}

router.post('/:locale/voice/stt', upload.single('audio'), restSTT);
router.post('/:locale/voice/query', upload.single('audio'),
    iv.validatePOST({ metadata: 'string' }), restSTTAndNLU);
router.post('/:locale/voice/tts', iv.validatePOST({ text: 'string' }, { json: true }), tts);

// provide identical API keyed off to :model_tag, so people can change the NL_SERVER_URL
// to include the model tag

router.post('/@:model_tag/:locale/voice/stt', upload.single('audio'), restSTT);
router.post('/@:model_tag/:locale/voice/query', upload.single('audio'),
    iv.validatePOST({ metadata: 'string' }, { json: true }), restSTTAndNLU);
router.post('/@:model_tag/:locale/voice/tts', iv.validatePOST({ text: 'string' }, { json: true }), tts);

module.exports = router;
