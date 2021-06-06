// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Ryan Cheng

import express from 'express';
import * as Url from 'url';

import EngineManager from '../almond/enginemanagerclient';
import * as user from '../util/user';
import * as iv from '../util/input_validation';

const router = express.Router();

router.get('/', iv.validateGET({ redirect: 'string', kind: 'string' }), (req, res, next) => {
    const redirect_address = req.query.redirect;
    const kind = req.query.kind;

    req.session.redirect = redirect_address;
    req.session.kind = kind;

    // show to the user only the hostname and optionally the port
    // because the path name and query are potentially ugly strings
    const parsed = Url.parse(redirect_address);

    res.render('proxy_confirmation', {
        page_title: req._("OAuth Confirmation"),
        redirect_address: parsed.host,
        kind: kind
    });
});

router.post('/oauth2', (req, res, next) => {
    const kind = req.body.device_type;
    user.getAnonymousUser().then((new_user) => {
        EngineManager.get().getEngine(new_user.id).then(async (engine) => {
            const [redirect, session] = await engine.startOAuth(kind);
            for (const key in session)
                 req.session[key] = session[key];
            res.redirect(303, redirect);
        }).catch((e) => {
            res.status(400).render('error', {
                page_title: req._("Thingpedia - Error"),
                message: e
            });
        }).catch(next);
    });

});

export default router;
