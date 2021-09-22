// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Euirim Choi <euirim@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>

import WebSocket from 'ws';
import express from 'express';
import multer from 'multer';
import * as os from 'os';
import * as iv from '../../util/input_validation';
import * as I18n from '../../util/i18n';

import { SpeechToText, textToSpeech } from './backend-microsoft';
import runNLU from '../nlu';

const upload = multer({ dest: os.tmpdir() });

const router = express.Router();

async function streamSTT(ws : WebSocket, req : express.Request) {
    if (!I18n.get(req.params.locale, false)) {
        await ws.send(JSON.stringify({ error: 'Unsupported language' }));
        await ws.close();
        return;
    }

    /* WS close codes:
     * 1000 - indicates a normal closure, meaning that the purpose for which the connection was established has been fulfilled.
     * 1002 - indicates that an endpoint is terminating the connection due to a protocol error.
     * 1003 - indicates that an endpoint is terminating the connection because it has received a type of data it cannot accept.
     */
    function errorClose(e : { error : string }, code = 1002) {
        if (ws.readyState === 1) {
          // OPEN
          ws.send(JSON.stringify(e));
          ws.close(code);
        }
    }

    const sessionTimeout = setTimeout(() => {
        errorClose({ error: 'Session timeout' });
    }, 5000);

    ws.on('close', () => {
        if (sessionTimeout) clearTimeout(sessionTimeout);
    });

    function initialPacket(msg : string) {
        ws.removeListener('message', initialPacket);
        clearTimeout(sessionTimeout);

        let parsed : { ver : number };
        try {
            parsed = JSON.parse(msg);
        } catch(e) {
          errorClose({ error: 'Malformed initial packet: ' + e.message });
          return;
        }

        if (parsed.ver && parsed.ver === 1) {
          const stt = new SpeechToText(req.params.locale);
          stt.recognizeStream(ws).then((text) => {
              const result = { result: 'ok', text: text };
              ws.send(JSON.stringify(result));
              ws.close(1000);
          }).catch((e) => {
              errorClose(e, e.status !== 400 ? 1003 : 1000);
          });
        } else {
            errorClose({ error: 'Unsupported protocol' });
        }
    }

    ws.on('message', initialPacket);
}

function restSTT(req : express.Request, res : express.Response, next : express.NextFunction) {
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
            result: 'ok',
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
} as const;

async function restSTTAndNLU(req : express.Request, res : express.Response, next : express.NextFunction) {
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
    for (const key in NLU_METADATA_KEYS) {
        if (!iv.checkKey(metadata[key], NLU_METADATA_KEYS[key as keyof typeof NLU_METADATA_KEYS])) {
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

function ttspost(req : express.Request, res : express.Response, next : express.NextFunction) {
    if (!I18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    textToSpeech(req.params.locale, req.body.gender || 'male', req.body.text).then((stream) => {
        // audio/x-wav is strictly-speaking non-standard, yet it seems to be
        // widely used for .wav files
        if (stream.statusCode === 200)
            res.set('Content-Type', 'audio/x-wav');
        stream.pipe(res);
    }).catch(next);
}

function ttsget(req : express.Request, res : express.Response, next : express.NextFunction) {
    if (!I18n.get(req.params.locale, false)) {
        res.status(404).json({ error: 'Unsupported language' });
        return;
    }

    textToSpeech(req.params.locale, req.query.gender as 'male'|'female'|'' || 'male', req.query.text as string).then((stream) => {
        // audio/x-wav is strictly-speaking non-standard, yet it seems to be
        // widely used for .wav files
        if (stream.statusCode === 200)
            res.set('Content-Type', 'audio/x-wav');
        stream.pipe(res);
    }).catch(next);
}

router.ws('/:locale/voice/stream', streamSTT);

router.post('/:locale/voice/stt', upload.single('audio'), restSTT);
router.post('/:locale/voice/query', upload.single('audio'),
    iv.validatePOST({ metadata: 'string' }), restSTTAndNLU);
router.post('/:locale/voice/tts', iv.validatePOST({
    gender: /^(|male|female)$/,
    text: 'string'
}, { json: true }), ttspost);
router.get('/:locale/voice/tts', iv.validateGET({
    gender: /^(|male|female)$/,
    text: 'string'
}, { json: true }), ttsget);

// provide identical API keyed off to :model_tag, so people can change the NL_SERVER_URL
// to include the model tag

router.post('/@:model_tag/:locale/voice/stt', upload.single('audio'), restSTT);
router.post('/@:model_tag/:locale/voice/query', upload.single('audio'),
    iv.validatePOST({ metadata: 'string' }, { json: true }), restSTTAndNLU);
router.post('/@:model_tag/:locale/voice/tts', iv.validatePOST({
    gender: /^(|male|female)$/,
    text: 'string'
}, { json: true }), ttspost);
router.get('/@:model_tag/:locale/voice/tts', iv.validateGET({
    gender: /^(|male|female)$/,
    text: 'string'
}, { json: true }), ttsget);

export default router;
