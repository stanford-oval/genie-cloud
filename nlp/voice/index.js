// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Euirim Choi <euirim@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const multer = require('multer');
const os = require('os');
const iv = require('../../util/input_validation');
const I18n = require('../util/i18n');

const { SpeechToText, textToSpeech } = require('./backend-microsoft');

const upload = multer({ dest: os.tmpdir() });

const router = express.Router();

function restSTT(req, res, next) {
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

function tts(req, res, next) {
    if (!I18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    textToSpeech(req.params.locale, req.body.text).then((stream) => {
        stream.pipe(res);
    }).catch(next);
}

router.post('/:locale/voice/stt', upload.single('audio'), restSTT);
router.post('/:locale/voice/tts', iv.validatePOST({ text: 'string' }), tts);

// provide identical API keyed off to :model_tag, so people can change the NL_SERVER_URL
// to include the model tag

router.post('/@:model_tag/:locale/voice/stt', upload.single('audio'), restSTT);
router.post('/@:model_tag/:locale/voice/tts', iv.validatePOST({ text: 'string' }), tts);
