// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
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

import express from 'express';

import * as user from '../util/user';
import * as model from '../model/example';
import * as db from '../util/db';

const router = express.Router();

router.post('/upvote/:id', user.requireLogIn, (req, res, next) => {
    db.withClient((dbClient) => {
        return model.like(dbClient, req.user!.id, Number(req.params.id));
    }).then((liked) => {
        res.json({ result: (liked ? 'ok' : 'no_change') });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).catch(next);
});

router.post('/downvote/:id', user.requireLogIn, (req, res, next) => {
    db.withClient((dbClient) => {
        return model.unlike(dbClient, req.user!.id, Number(req.params.id));
    }).then((unliked) => {
        res.json({ result: (unliked ? 'ok' : 'no_change') });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).catch(next);
});

router.post('/hide/:id', user.requireLogIn, user.requireRole(user.Role.THINGPEDIA_ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return model.hide(dbClient, Number(req.params.id));
    }).then(() => {
        res.json({ result: 'ok' });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).catch(next);
});

router.post('/delete/:id', user.requireLogIn, user.requireRole(user.Role.THINGPEDIA_ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return model.deleteById(dbClient, Number(req.params.id));
    }).then(() => {
        res.json({ result: 'ok' });
    }, (e) => {
        res.status(400).json({ error: e.message });
    }).catch(next);
});

export default router;
