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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>


const express = require('express');

const user = require('../util/user');
const EngineManager = require('../almond/enginemanagerclient');

let router = express.Router();

router.get('/oauth2/callback/:kind', (req, res, next) => {
    if (req.session.redirect) {
        next();
        return;
    }
    user.requireLogIn(req, res, next);
}, (req, res, next) => {
    if (req.session.redirect) {
        const server_redirect = req.session.redirect + '/devices' + req.url;
        delete req.session.redirect;
        res.redirect(303, server_redirect);
    } else {
        const kind = req.params.kind;

        EngineManager.get().getEngine(req.user.id).then(async (engine) => {
            await engine.completeOAuth(kind, req.url, req.session);
            if (req.session['device-redirect-to']) {
                res.redirect(303, req.session['device-redirect-to']);
                delete req.session['device-redirect-to'];
            } else {
                res.redirect(303, '/me');
            }
        }).catch(next);
    }
});

module.exports = router;
