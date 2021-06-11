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

import express from 'express';
import * as Url from 'url';
import * as qs from 'querystring';

import * as user from '../util/user';
import EngineManager from '../almond/enginemanagerclient';

const router = express.Router();

router.get('/oauth2/callback/:kind', (req, res, next) => {
    if (req.session.redirect) {
        next();
        return;
    }
    user.requireLogIn(req, res, next);
}, (req, res, next) => {
    if (req.session.redirect) {
        const parsed = Url.parse(req.session.redirect);

        let redirect;
        // If we have a query string already, we append all the query parameters
        // to it and don't modify the path name
        // (This is the new protocol)
        //
        // If we don't have a query string, we assume redirect is only the
        // origin+base of the almond-server, and append the full path name and query
        if (parsed.query)
            redirect = req.session.redirect + '&' + qs.stringify(req.query as Record<string, string>);
        else
            redirect = req.session.redirect + '/devices' + req.url;
        delete req.session.redirect;
        res.redirect(303, redirect);
    } else {
        const kind = req.params.kind;

        EngineManager.get().getEngine(req.user!.id).then(async (engine) => {
            await engine.completeOAuth(kind, req.url, req.session as Record<string, string>);
            if (req.session['device-redirect-to']) {
                res.redirect(303, req.session['device-redirect-to']);
                delete req.session['device-redirect-to'];
            } else {
                res.redirect(303, '/me');
            }
        }).catch(next);
    }
});

export default router;
