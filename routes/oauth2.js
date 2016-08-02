// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const crypto = require('crypto');
const express = require('express');
const passport = require('passport');
const oauth2orize = require('oauth2orize');

const BasicStrategy = require('passport-http').BasicStrategy;
const ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy;

// create OAuth 2.0 server
var server = oauth2orize.createServer();

const model = require('../model/oauth2');
const user = require('../util/user');
const db = require('../util/db');

var router = express.Router();

function makeRandom() {
    return crypto.randomBytes(32).toString('hex');
}

// These strategies are used to authenticate oauth2 clients, not
// to authenticate users
function authOAuth2Client(clientId, clientSecret, done) {
    db.withClient(function(dbClient) {
        return model.getClients(dbClient, clientId).then(function(rows) {
            if (rows.length < 1 || rows[0].secret !== clientSecret)
                return false;
            else
                return rows[0];
        });
    }).nodeify(done);
}

passport.use('oauth2-client-basic', new BasicStrategy(authOAuth2Client));
passport.use(new ClientPasswordStrategy(authOAuth2Client));

server.serializeClient(function(client, done) {
    return done(null, client.id);
});

server.deserializeClient(function(id, done) {
    db.withClient(function(dbClient) {
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

server.grant(oauth2orize.grant.code(function(client, redirectURI, user, ares, done) {
    var code = makeRandom();

    db.withTransaction(function(dbClient) {
        return model.createCode(dbClient, { user_id: user.id,
                                            client_id: client.id,
                                            code: code,
                                            redirectURI: redirectURI })
    }).then(function() {
        return code;
    }).nodeify(done);
}));

// Exchange authorization codes for access tokens.  The callback accepts the
// `client`, which is exchanging `code` and any `redirectURI` from the
// authorization request for verification.  If these values are validated, the
// application issues an access token on behalf of the user who authorized the
// code.

server.exchange(oauth2orize.exchange.code(function(client, code, redirectURI, done) {
    var token = makeRandom();

    db.withTransaction(function(dbClient) {
        return model.getCodes(dbClient, client.id, code).then(function(rows) {
            if (rows.length < 1)
                return false;
            var oauth2Code = rows[0];
            if (redirectURI !== oauth2Code.redirectURI)
                return false;

            var user_id = oauth2Code.user_id;
            return model.deleteCode(dbClient, client.id, oauth2Code.user_id).then(function() {
                return model.createToken(dbClient, { user_id: user_id,
                                                     client_id: client.id,
                                                     token: token });
            }).then(function() {
                return true;
            });
        });
    }).then(function(ok) {
        if (ok)
            return token;
        else
            return false;
    }).nodeify(done);
}));

router.get('/authorize', user.redirectLogIn,
           server.authorization(function(clientID, redirectURI, done) {
               db.withClient(function(dbClient) {
                   return model.getClients(dbClient, clientID).then(function(rows) {
                       if (rows.length < 1)
                           return false;
                       else
                           return rows[0];
                   });
               }).done(function(result) {
                   done(null, result, redirectURI);
               }, function(err) {
                   done(err);
               });
           }, function(client, user, done) {
               done(null, !!client.magic_power);
           }),
           function(req, res, next) {
               return res.render('oauth2_authorize', {
                   page_title: req._("ThingEngine - Authorize Access"),
                   transaction_id: req.oauth2.transactionID
               });
           });

router.post('/authorize', user.requireLogIn,
            server.decision());

router.post('/token',
            passport.authenticate(['oauth2-client-basic', 'oauth2-client-password'], { session: false }),
            server.token(), server.errorHandler());

module.exports = router;
