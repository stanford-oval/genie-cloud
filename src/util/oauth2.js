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

import passport from 'passport';
import * as oauth2orize from 'oauth2orize';
import * as util from 'util';
import * as jwt from 'jsonwebtoken';

import { BasicStrategy } from 'passport-http';
import { Strategy as ClientPasswordStrategy } from 'passport-oauth2-client-password';

import * as model from '../model/oauth2';
import * as db from '../util/db';
import * as secret from '../util/secret_key';

// create OAuth 2.0 server
const server = oauth2orize.createServer();

// These strategies are used to authenticate oauth2 clients, not
// to authenticate users
function authOAuth2Client(clientId, clientSecret, done) {
    if (typeof clientId !== 'string' || typeof clientSecret !== 'string') {
        done(null, false);
        return;
    }
    db.withClient((dbClient) => {
        return model.getClients(dbClient, clientId).then((rows) => {
            if (rows.length < 1 || rows[0].secret !== clientSecret)
                return false;
            else
                return rows[0];
        });
    }).then((client) => done(null, client), done);
}

passport.use('oauth2-client-basic', new BasicStrategy(authOAuth2Client));
passport.use(new ClientPasswordStrategy(authOAuth2Client));

server.serializeClient((client, done) => {
    return done(null, client.id);
});

server.deserializeClient((id, done) => {
    db.withClient((dbClient) => {
        return model.getClient(dbClient, id);
    }).then((client) => done(null, client), done);
});

// Register supported grant types.
//
// OAuth 2.0 specifies a framework that allows users to grant client
// applications limited access to their protected resources.  It does this
// through a process of the user granting access, and the client exchanging
// the grant for an access token.

// Grant authorization codes.  The callback takes the `client` requesting
// authorization, the `redirectURI` (which is used as a verifier in the
// subsequent exchange), the authenticated `user` granting access, and
// their response, which contains approved scope, duration, etc. as parsed by
// the application.  The application issues a code, which is bound to these
// values, and will be exchanged for an access token.

server.grant(oauth2orize.grant.code((client, redirectURI, user, ares, done) => {
    jwt.sign({
        sub: client.id,
        grant_type: 'authorization_code',
        user_id: user.cloud_id,
        redirect_uri: redirectURI,
        scope: ares.scope
    }, secret.getJWTSigningKey(), { expiresIn: 600 /* seconds */ }, done);
}));

// Exchange authorization codes for access tokens.  The callback accepts the
// `client`, which is exchanging `code` and any `redirectURI` from the
// authorization request for verification.  If these values are validated, the
// application issues an access token on behalf of the user who authorized the
// code.

server.exchange(oauth2orize.exchange.code((client, code, redirectURI, done) => {
    jwt.verify(code, secret.getJWTSigningKey(), {
        algorithms: ['HS256'],
        subject: client.id,
        clockTolerance: 30,
    }, (err, decoded) => {
        // if an error occurs, or the code is wrong, just return false,
        // which will fail with invalid_grant error
        if (err || decoded.grant_type !== 'authorization_code' ||
            (redirectURI && decoded.redirect_uri !== redirectURI)) {
            done(null, false);
            return;
        }

        db.withTransaction(async (dbClient) => {
            // issue the refresh token
            const refreshToken = await util.promisify(jwt.sign)({
                sub: client.id,
                user_id: decoded.user_id,
                grant_type: 'refresh_token',
                scope: decoded.scope
            }, secret.getJWTSigningKey(), { /* never expires */ });

            // store the fact that the permission was granted in the database
            let allScopes = new Set;
            try {
                allScopes = new Set((await model.getPermission(dbClient, client.id, decoded.user_id)).scope.split(' '));
            } catch(e) {
                if (e.code !== 'ENOENT')
                    throw e;
                // ignore if not existing
            }
            for (let scope of decoded.scope)
                allScopes.add(scope);
            await model.createPermission(dbClient, client.id, decoded.user_id, Array.from(allScopes).join(' '));

            // now issue the access token, valid for one hour
            const accessToken = await util.promisify(jwt.sign)({
                sub: decoded.user_id,
                aud: 'oauth2',
                scope: decoded.scope
            }, secret.getJWTSigningKey(), { expiresIn: 3600 });
            done(null, accessToken, refreshToken, { expires_in: 3600 });
        }).catch((e) => {
            console.error(e);
            done(e);
        });
    });
}));

server.exchange(oauth2orize.exchange.refreshToken((client, refreshToken, scope, done) => {
    db.withClient(async (dbClient) => {
        // check that the token is valid
        let decoded;
        try {
            decoded = await util.promisify(jwt.verify)(refreshToken, secret.getJWTSigningKey(), {
                algorithms: ['HS256'],
                subject: client.id,
                clockTolerance: 30,
            });

            // check that the permission is still in the database (has not been revoked or superseded)
            const permission = await model.getPermission(dbClient, client.id, decoded.user_id);
            const allScopes = permission.scope.split(' ');
            for (let scope of decoded.scope) {
                if (allScopes.indexOf(scope) < 0)
                    throw new oauth2orize.AuthorizationError("invalid scope", 'invalid_scope');
            }
        } catch(e) {
            // reject the token with invalid_grant
            done(null, false);
            return;
        }

        // now issue the access token, valid for one hour
        const accessToken = await util.promisify(jwt.sign)({
            sub: decoded.user_id,
            aud: 'oauth2',
            scope: decoded.scope
        }, secret.getJWTSigningKey(), { expiresIn: 3600 });
        done(null, accessToken, refreshToken, { expires_in: 3600 });
    }).catch(done);
}));

export default server;
