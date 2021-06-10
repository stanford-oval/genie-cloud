// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as Url from 'url';
import express from 'express';

import * as user from '../util/user';
import * as db from '../util/db';
import * as oauthModel from '../model/oauth2';
import * as oauth2orize from 'oauth2orize';

import server from '../util/oauth2';
let router = express.Router();

router.use(user.requireLogIn);

function verifyScope(client, requestedScopes) {
    if (!requestedScopes)
        throw new oauth2orize.AuthorizationError("missing scope query parameter", 'invalid_scope');

    const allowed = client.allowed_scopes.split(' ');
    for (let scope of requestedScopes) {
        if (allowed.indexOf(scope) < 0)
            throw new oauth2orize.AuthorizationError("invalid scope", 'invalid_scope');
    }
}

function verifyRedirectUrl(client, redirectURI) {
    if (!redirectURI)
        throw new oauth2orize.AuthorizationError("invalid redirect_uri", 'unauthorized_client');
    for (let url of JSON.parse(client.allowed_redirect_uris)) {
        if (redirectURI.startsWith(url))
            return;
    }

    throw new oauth2orize.AuthorizationError("invalid redirect_uri", 'unauthorized_client');
}

router.get('/authorize', server.authorization((clientID, redirectURI, scope, done) => {
    db.withClient((dbClient) => {
        return oauthModel.getClients(dbClient, clientID).then((rows) => {
            if (rows.length < 1)
                throw new oauth2orize.AuthorizationError("invalid client", 'unauthorized_client');
            else
                return rows[0];
        });
    }).then((client) => {
        try {
            verifyScope(client, scope);
            verifyRedirectUrl(client, redirectURI);
            done(null, client, redirectURI);
        } catch(err) {
            done(err);
        }
    }, (err) => {
        done(err);
    });
}, (client, user, scope, done) => {
    done(null, !!client.magic_power, { scope });
}), (req, res, next) => {
    const parsedUrl = Url.parse(req.oauth2.redirectURI);
    const origin = parsedUrl.port !== 443 ? (parsedUrl.hostname + ':' + parsedUrl.port) : parsedUrl.hostname;

    res.render('oauth2_authorize', {
        page_title: req._("Genie - Authorize Access"),
        transaction_id: req.oauth2.transactionID,
        client: req.oauth2.client,
        scope: req.oauth2.req.scope,
        origin,
    });
}, server.errorHandler({ mode: 'indirect' }));

router.post('/authorize', server.decision((req, done) => {
    done(null, { scope: req.body.scope.split(' ') });
}));

export default router;
