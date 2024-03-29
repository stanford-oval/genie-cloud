// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Silei Xu <silei@cs.stanford.edu>

import express from 'express';

import * as user from '../util/user';
import * as iv from '../util/input_validation';
import * as EngineManager from '../almond/enginemanagerclient';

const router = express.Router();

router.post('/anonymous/vote/:vote', (req, res, next) => {
    if (req.params.vote !== 'up' && req.params.vote !== 'down') {
        res.status(400);
        res.json({ error: 'Invalid voting option' });
        return;
    }
    const vote = req.params.vote;

    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine((await user.getAnonymousUser(req.locale)).id);
        return engine.getRecordingController(req.body.id, { anonymous: true, showWelcome: true });
    }).then(async (conversation) => {
        if (!conversation) {
            res.status(404);
            return res.json({ error: 'No conversation found' });
        }
        try {
            await conversation.voteLast(vote);
            return res.json({ status:'ok' });
        } finally {
            await conversation.destroy();
            conversation.$free();
        }
    }).catch(next);
});

router.post('/anonymous/comment', iv.validatePOST({ comment: 'string', id: 'string' }), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine((await user.getAnonymousUser(req.locale)).id);
        return engine.getRecordingController(req.body.id, { anonymous: true, showWelcome: true });
    }).then(async (conversation) => {
        if (!conversation) {
            res.status(404);
            return res.json({ error: 'No conversation found' });
        }
        try {
            await conversation.commentLast(req.body.comment);
            return res.json({ status:'ok' });
        } finally {
            await conversation.destroy();
            conversation.$free();
        }
    }).catch(next);
});

router.use(user.requireLogIn);

router.post('/start', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        engine.warnRecording();
        return engine.getRecordingController(req.body.id, { anonymous: false, showWelcome: true });
    }).then(async (conversation) => {
        if (!conversation) {
            res.status(404);
            return res.json({ error: 'No conversation found' });
        }
        try {
            await conversation.startRecording();
            return res.json({ status: 'ok' });
        } finally {
            await conversation.destroy();
            conversation.$free();
        }
    }).catch(next);
});

router.post('/stop', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        return engine.getRecordingController(req.body.id, { anonymous: false, showWelcome: true });
    }).then(async (conversation) => {
        if (!conversation) {
            res.status(404);
            return res.json({ error: 'No conversation found' });
        }
        try {
            await conversation.endRecording();
            return res.json({ status:'ok' });
        } finally {
            await conversation.destroy();
            conversation.$free();
        }
    }).catch(next);
});

router.get('/warned', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        res.json({ warned: await engine.recordingWarned() ? 'yes' : 'no' });
    }).catch(next);
});

router.get('/status/:id', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        return engine.getRecordingController(req.params.id, { anonymous: false, showWelcome: true });
    }).then(async (conversation) => {
        if (!conversation) {
            res.status(404);
            res.json({ error: 'No conversation found' });
        } else {
            try {
                res.json({ status: await conversation.inRecordingMode() ? 'on' : 'off' });
            } finally {
                await conversation.destroy();
                conversation.$free();
            }
        }
    }).catch(next);
});

router.post('/vote/:vote', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        return engine.getRecordingController(req.body.id, { anonymous: false, showWelcome: true });
    }).then(async (conversation) => {
        if (req.params.vote !== 'up' && req.params.vote !== 'down') {
            res.status(400);
            return res.json({ error: 'Invalid voting option' });
        } else if (!conversation) {
            res.status(404);
            return res.json({ error: 'No conversation found' });
        } else {
            try {
                await conversation.voteLast(req.params.vote);
                return res.json({ status:'ok' });
            } finally {
                await conversation.destroy();
                conversation.$free();
            }
        }
    }).catch(next);
});

router.post('/comment', iv.validatePOST({ comment: 'string', id: 'string' }), (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        return engine.getRecordingController(req.body.id, { anonymous: false, showWelcome: true });
    }).then(async (conversation) => {
        if (!conversation) {
            res.status(404);
            return res.json({ error: 'No conversation found' });
        } else {
            try {
                await conversation.commentLast(req.body.comment);
                return res.json({ status:'ok' });
            } finally {
                await conversation.destroy();
                conversation.$free();
            }
        }
    }).catch(next);
});

router.get<Record<string, string>>('/log/:id.txt', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        return engine.getRecordingController(req.params.id, { anonymous: false, showWelcome: true });
    }).then(async (conversation) => {
        if (!conversation) {
            res.status(404);
            res.json({ error: 'No conversation found' });
        } else {
            try {
                const log = await conversation.readLog();
                if (!log) {
                    res.status(404);
                    res.json({ error: 'No conversation log found' });
                } else {
                    res.set('Content-Type', 'text/plain');
                    res.set('Content-Disposition', `attachment; filename="log-${req.params.id}.txt"`);
                    res.send(log);
                }
            } finally {
                await conversation.destroy();
                conversation.$free();
            }
        }
    }).catch(next);
});

router.get('/log/:id', (req, res, next) => {
    Promise.resolve().then(async () => {
        const engine = await EngineManager.get().getEngine(req.user!.id);
        return engine.getRecordingController(req.params.id, { anonymous: false, showWelcome: true });
    }).then(async (conversation) => {
        if (!conversation) {
            res.status(404);
            res.json({ status : 'not found' });
        } else {
            try {
                const log = await conversation.readLog();
                if (!log) {
                    res.status(404);
                    res.json({ status: 'not found' });
                } else {
                    res.json({
                        status: 'ok',
                        log: log
                    });
                }
            } finally {
                await conversation.destroy();
                conversation.$free();
            }
        }
    }).catch(next);
});

export default router;
