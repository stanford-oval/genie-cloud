// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Url = require('url');
const crypto = require('crypto');
const express = require('express');
const passport = require('passport');
const oauth2orize = require('oauth2orize');
const multer = require('multer');
const csurf = require('csurf');
const util = require('util');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const BasicStrategy = require('passport-http').BasicStrategy;
const ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy;

// create OAuth 2.0 server
var server = oauth2orize.createServer();

const model = require('../model/oauth2');
const user = require('../util/user');
const db = require('../util/db');
const code_storage = require('../util/code_storage');
const graphics = require('../almond/graphics');
const platform = require('../util/platform');
const secret = require('../util/secret_key');
const iv = require('../util/input_validation');

var router = express.Router();

function makeRandom(size = 32) {
    return crypto.randomBytes(size).toString('hex');
}

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
    }).nodeify(done);
}

passport.use('oauth2-client-basic', new BasicStrategy(authOAuth2Client));
passport.use(new ClientPasswordStrategy(authOAuth2Client));

server.serializeClient((client, done) => {
    return done(null, client.id);
});

server.deserializeClient((id, done) => {
    db.withClient((dbClient) => {
        return model.getClient(dbClient, id);
    }).nodeify(done);
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

function verifyScope(client, scopes) {
    const allowed = client.allowed_scopes.split(' ');
    for (let scope of scopes) {
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

router.get('/authorize', user.requireLogIn, server.authorization((clientID, redirectURI, scope, done) => {
    db.withClient((dbClient) => {
        return model.getClients(dbClient, clientID).then((rows) => {
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
    let origin = parsedUrl.port !== 443 ? (parsedUrl.hostname + ':' + parsedUrl.port) : parsedUrl.hostname;

    return res.render('oauth2_authorize', {
        page_title: req._("Almond - Authorize Access"),
        transaction_id: req.oauth2.transactionID,
        client: req.oauth2.client,
        scope: req.oauth2.req.scope,
        origin
    });
}, server.errorHandler({ mode: 'indirect' }));

// no need for csurf here, oauth2orize has a uniquely-generated transaction ID that cannot
// be spoofed with CSRF
router.post('/authorize', user.requireLogIn, server.decision((req, done) => {
    done(null, { scope: req.body.scope.split(' ') });
}));

router.post('/token',
    passport.authenticate(['oauth2-client-basic', 'oauth2-client-password'], { session: false }),
    server.token(), server.errorHandler());

async function uploadIcon(clientId, file) {
    try {
        try {
            const image = graphics.createImageFromPath(file.path);
            image.resizeFit(512, 512);
            const [stdout,] = await image.stream('png');
            await code_storage.storeIcon(stdout, 'oauth:' + clientId);
        } finally {
            await util.promisify(fs.unlink)(file.path);
        }
    } catch(e)  {
        console.error('Failed to upload icon to S3: ' + e);
    }
}

function validateScopes(allowedScopes) {
    if (!Array.isArray(allowedScopes))
        allowedScopes = [allowedScopes];
    for (let scope of allowedScopes) {
        if (typeof scope !== 'string' || !user.OAuthScopes.has(scope))
            throw new Error(`Invalid scope`);
    }
    return allowedScopes;
}

function validateRedirectUrls(urls) {
    for (let url of urls) {
        const parsed = Url.parse(url);
        if (parsed.protocol === null || parsed.hostname === null ||
            (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1'))
            throw new Error(`Invalid redirect URI (must be an absolute https: URL)`);
    }
    return urls;
}

router.post('/clients/create', multer({ dest: platform.getTmpDir() }).single('icon'), csurf({ cookie: false }), user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ scope: ['array', '?string'], name: 'string', redirect_uri: 'string' }), (req, res, next) => {
    const name = req.body.name;
    let scopes, redirectUrls;
    try {
        if (!name)
            throw new Error(req._("Name must be provided"));
        if (!req.file)
            throw new Error(req._("Must upload an icon"));
        scopes = validateScopes(req.body.scope);

        if (scopes.indexOf('profile') < 0)
            scopes.push('profile');
        scopes.sort();

        if ((req.user.roles & user.Role.ADMIN) === 0 &&
            scopes.indexOf('user-sync') >= 0)
            throw new Error(req._("user-sync scope is valid only for administrators"));

        redirectUrls = validateRedirectUrls(req.body.redirect_uri.split(/ +/));
    } catch(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
        return;
    }

    db.withTransaction(async (dbClient) => {
        const clientId = makeRandom(8);
        const clientSecret = makeRandom();
        await model.createClient(dbClient, {
            id: clientId,
            secret: clientSecret,
            name: name,
            owner: req.user.developer_org,
            allowed_scopes: scopes.join(' '),
            allowed_redirect_uris: JSON.stringify(redirectUrls)
        });

        // upload the icon asynchronously to avoid blocking the request
        uploadIcon(clientId, req.file);
    }).then(() => {
        res.redirect(303, '/thingpedia/developers/oauth');
    }).catch(next);
});

module.exports = router;
