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

const fs = require('fs');
const express = require('express');
const multer = require('multer');
const os = require('os');
const iv = require('../../util/input_validation');
const { WaveFile } = require('wavefile');

const { SpeechToText, textToSpeech } = require('./backend-microsoft');

const upload = multer({ dest: os.tmpdir() });

const router = express.Router();

function restSTT(req, res, next) {
    const audioFn = `uploads/${req.file.filename}`;
    fs.readFile(audioFn, (err, wavData) => {
        if (err) {
            next(err);
            return;
        }

        const rawWavFile = new WaveFile(wavData);
        rawWavFile.toSampleRate(16000);

        fs.writeFile(audioFn, rawWavFile.toBuffer(), (err) => {
            if (err) {
                next(err);
                return;
            }

            const stt = new SpeechToText('en-US');
            stt.recognizeOnce(`uploads/${req.file.filename}`).then((text) => {
                res.json({
                    status: 'ok',
                    text: text
                });
            }).catch(next);
        });
    });
}

router.post('/voice/stt', upload.single('audio'), restSTT);
router.post('/voice/tts', iv.validatePOST({ text: 'string' }), (req, res, next) => {
    textToSpeech(req.body.text).then((stream) => {
        stream.pipe(res);
    }).catch(next);
});

// provide identical API keyed off to :model_tag, so people can change the NL_SERVER_URL
// to include the model tag

router.post('/@:model_tag/voice/stt', upload.single('audio'), restSTT);
router.post('/@:model_tag/voice/tts', iv.validatePOST({ text: 'string' }), (req, res, next) => {
    textToSpeech(req.body.text).then((stream) => {
        stream.pipe(res);
    }).catch(next);
});
