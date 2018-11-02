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

const crypto = require('crypto');
const express = require('express');
const passport = require('passport');
const oauth2orize = require('oauth2orize');
const multer = require('multer');
const csurf = require('csurf');
const util = require('util');
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

var router = express.Router();

function makeRandom(size = 32) {
    return crypto.randomBytes(size).toString('hex');
}

// These strategies are used to authenticate oauth2 clients, not
// to authenticate users
function authOAuth2Client(clientId, clientSecret, done) {
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
        redirect_uri: redirectURI
    }, secret.getJWTSigningKey(), { expiresIn: 600 /* seconds */ }, done);
}));

function sha256(string) {
    const hash = crypto.createHash('sha256');
    hash.update(string);
    return hash.digest().toString('hex');
}

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
            }, secret.getJWTSigningKey(), { /* never expires */ });

            // store a hash of it in the database
            // note that we don't need a salt or slow hash function because
            // the original token is unforgeable
            await model.createRefreshToken(dbClient, { user_id: decoded.user_id,
                                                       client_id: client.id,
                                                       token: sha256(refreshToken) });

            // now issue the access token, valid for one hour
            const accessToken = await util.promisify(jwt.sign)({
                sub: decoded.user_id,
            }, secret.getJWTSigningKey(), { expiresIn: 3600 });
            done(null, accessToken, refreshToken, { expires_in: 3600 });
        }).catch(done);
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

            // check that the token is still in the database (has not been revoked or superseded)
            await model.getRefreshToken(dbClient, sha256(refreshToken));
        } catch(e) {
            // reject the token with invalid_grant
            done(null, false);
            return;
        }

        // now issue the access token, valid for one hour
        const accessToken = await util.promisify(jwt.sign)({
            sub: decoded.user_id,
        }, secret.getJWTSigningKey(), { expiresIn: 3600 });
        done(null, accessToken, refreshToken, { expires_in: 3600 });
    }).catch(done);
}));

router.get('/authorize', user.requireLogIn, server.authorization((clientID, redirectURI, done) => {
   db.withClient((dbClient) => {
       return model.getClients(dbClient, clientID).then((rows) => {
           if (rows.length < 1)
               return false;
           else
               return rows[0];
       });
   }).then((result) => {
       done(null, result, redirectURI);
   }, (err) => {
       done(err);
   });
}, (client, user, done) => {
   done(null, !!client.magic_power);
}), (req, res, next) => {
   return res.render('oauth2_authorize', {
       page_title: req._("Thingpedia - Authorize Access"),
       transaction_id: req.oauth2.transactionID,
       client: req.oauth2.client
   });
});

// no need for csurf here, oauth2orize has a uniquely-generated transaction ID that cannot
// be spoofed with CSRF
router.post('/authorize', user.requireLogIn, server.decision());

router.post('/token',
    passport.authenticate(['oauth2-client-basic', 'oauth2-client-password'], { session: false }),
    server.token(), server.errorHandler());

function uploadIcon(clientId, req) {
    if (req.files.icon && req.files.icon.length) {
        // upload the icon asynchronously to avoid blocking the request
        Promise.resolve().then(() => {
            const image = graphics.createImageFromPath(req.files.icon[0].path);
            image.resizeFit(512, 512);
            return image.stream('png');
        }).then(([stdout, stderr]) => {
            return code_storage.storeIcon(stdout, 'oauth:' + clientId);
        }).catch((e) => {
            console.error('Failed to upload icon to S3: ' + e);
        });
    }
}

router.post('/clients/create', multer({ dest: platform.getTmpDir() }).fields([
    { name: 'icon', maxCount: 1 }
]), csurf({ cookie: false }), user.requireLogIn, user.requireDeveloper(), (req, res, next) => {
    db.withTransaction((dbClient) => {
        var name = req.body.name;
        if (!name)
            throw new Error(req._("Name must be provided"));
        if (!req.files.icon || !req.files.icon.length)
            throw new Error(req._("Must upload an icon"));

        var clientId = makeRandom(8);
        var clientSecret = makeRandom();
        return model.createClient(dbClient, {
            id: clientId,
            secret: clientSecret,
            name: name,
            owner: req.user.developer_org
        }).then(() => uploadIcon(clientId, req));
    }).then(() => {
        res.redirect(303, '/thingpedia/developers');
    }).catch((e) => {
        console.error(e.stack);
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).catch(next);
});

module.exports = router;
