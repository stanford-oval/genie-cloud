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

const Q = require('q');
const crypto = require('crypto');
const db = require('./db');
const model = require('../model/user');

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleOAuthStrategy = require('passport-google-oauth').OAuth2Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const BearerStrategy = require('passport-http-bearer').Strategy;
const BasicStrategy = require('passport-http').BasicStrategy;

const EngineManager = require('../almond/enginemanagerclient');

var GOOGLE_CLIENT_ID = '739906609557-o52ck15e1ge7deb8l0e80q92mpua1p55.apps.googleusercontent.com';
var FACEBOOK_APP_ID = '979879085397010';

const { GOOGLE_CLIENT_SECRET, FACEBOOK_APP_SECRET } = require('../config');

function hashPassword(salt, password) {
    return Q.nfcall(crypto.pbkdf2, password, salt, 10000, 32, 'sha1')
        .then((buffer) => buffer.toString('hex'));
}

function makeRandom(size = 32) {
    return crypto.randomBytes(size).toString('hex');
}

function authenticateGoogle(accessToken, refreshToken, profile, done) {
    db.withTransaction(function(dbClient) {
        return model.getByGoogleAccount(dbClient, profile.id).then(function(rows) {
            if (rows.length > 0)
                return model.recordLogin(dbClient, rows[0].id).then(() => rows[0]);

            var username = profile.username || profile.emails[0].value;
            return model.create(dbClient, { username: username,
                                            email: profile.emails[0].value,
                                            locale: 'en-US',
                                            timezone: 'America/Los_Angeles',
                                            google_id: profile.id,
                                            human_name: profile.displayName,
                                            cloud_id: makeRandom(8),
                                            auth_token: makeRandom(),
                                            storage_key: makeRandom() }).then((user) => {
                user.newly_created = true;
                return user;
            });
        });
    }).then(function(user) {
        if (!user.newly_created)
            return user;

        // NOTE: we must start the user here because if we do it earlier we're
        // still inside the transaction, and the master process (which uses a different
        // database connection) will not see the new user in the database
        return EngineManager.get().startUser(user.id).then(function() {
            // asynchronously inject google-account device
            EngineManager.get().getEngine(user.id).then(function(engine) {
                return engine.devices.loadOneDevice({ kind: 'com.google',
                                                      profileId: profile.id,
                                                      accessToken: accessToken,
                                                      refreshToken: refreshToken }, true);
            }).done();
            return user;
        });
    }).nodeify(done);
}

function associateGoogle(user, accessToken, refreshToken, profile, done) {
    db.withTransaction(function(dbClient) {
        return model.update(dbClient, user.id, { google_id: profile.id })
            .then(function() {
                // asynchronously inject google-account device
                EngineManager.get().getEngine(user.id).then(function(engine) {
                    return engine.devices.loadOneDevice({ kind: 'com.google',
                                                          profileId: profile.id,
                                                          accessToken: accessToken,
                                                          refreshToken: refreshToken }, true);
                }).done();

                return user;
            });
    }).nodeify(done);
}

function authenticateFacebook(accessToken, refreshToken, profile, done) {
    db.withTransaction(function(dbClient) {
        return model.getByFacebookAccount(dbClient, profile.id).then(function(rows) {
            if (rows.length > 0)
                return model.recordLogin(dbClient, rows[0].id).then(() => rows[0]);

            var username = profile.username || profile.emails[0].value;
            return model.create(dbClient, { username: username,
                                            email: profile.emails[0].value,
                                            locale: 'en-US',
                                            timezone: 'America/Los_Angeles',
                                            facebook_id: profile.id,
                                            human_name: profile.displayName,
                                            cloud_id: makeRandom(8),
                                            auth_token: makeRandom(),
                                            storage_key: makeRandom() });
        });
    }).then(function(user) {
        return EngineManager.get().startUser(user.id).then(function() {
             // asynchronously inject facebook device
             EngineManager.get().getEngine(user.id).then(function(engine) {
                 return engine.devices.loadOneDevice({ kind: 'com.facebook',
                                                       profileId: profile.id,
                                                       accessToken: accessToken,
                                                       refreshToken: refreshToken }, true);
             }).done();

             user.newly_created = true;
             return user;
        });
    }).nodeify(done);
}

function associateFacebook(user, accessToken, refreshToken, profile, done) {
    db.withTransaction(function(dbClient) {
        return model.update(dbClient, user.id, { facebook_id: profile.id })
            .then(function() {
                // asynchronously inject facebook device
                EngineManager.get().getEngine(user.id).then(function(engine) {
                    return engine.devices.loadOneDevice({ kind: 'com.facebook',
                                                          profileId: profile.id,
                                                          accessToken: accessToken,
                                                          refreshToken: refreshToken }, true);
                }).done();

                return user;
            });
    }).nodeify(done);
}

exports.initialize = function() {
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser((id, done) => {
        db.withClient((client) => model.get(client, id)).nodeify(done);
    });

    passport.use(new BearerStrategy((accessToken, done) => {
        db.withClient((dbClient) => {
            return model.getByAccessToken(dbClient, accessToken).then((rows) => {
                if (rows.length < 1)
                    return [false, null];

                return model.recordLogin(dbClient, rows[0].id).then(() => {
                    return [rows[0], { scope: '*' }];
                });
            });
        }).then((result) => {
            done(null, result[0], result[1]);
        }, (err) => {
            done(err);
        }).done();
    }));

    function verifyCloudIdAuthToken(username, password, done) {
        db.withClient((dbClient) => {
            return model.getByCloudId(dbClient, username).then((rows) => {
                if (rows.length < 1 || rows[0].auth_token !== password)
                    return false;

                return model.recordLogin(dbClient, rows[0].id).then(() => rows[0]);
            });
        }).nodeify(done);
    }

    passport.use(new BasicStrategy(verifyCloudIdAuthToken));

    passport.use('local-omlet',
        new LocalStrategy({ usernameField: 'cloudId', passwordField: 'authToken' },
        verifyCloudIdAuthToken));

    passport.use(new LocalStrategy((username, password, done) => {
        db.withClient((dbClient) => {
            return model.getByName(dbClient, username).then((rows) => {
                if (rows.length < 1)
                    return [false, "An user with this username does not exist"];

                return hashPassword(rows[0].salt, password).then((hash) => {
                    if (hash !== rows[0].password)
                        return [false, "Invalid username or password"];

                    return model.recordLogin(dbClient, rows[0].id).then(() => {
                        return [rows[0], null];
                    });
                });
            });
        }).then((result) => {
            done(null, result[0], { message: result[1] });
        }, (err) => {
            done(err);
        }).done();
    }));

    passport.use(new GoogleOAuthStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: platform.getOrigin() + '/user/oauth2/google/callback',
        passReqToCallback: true,
    }, (req, accessToken, refreshToken, profile, done) => {
        if (!req.user) {
            // authenticate the user
            authenticateGoogle(accessToken, refreshToken, profile, done);
        } else {
            associateGoogle(req.user, accessToken, refreshToken, profile, done);
        }
    }));

    passport.use(new FacebookStrategy({
        clientID: FACEBOOK_APP_ID,
        clientSecret: FACEBOOK_APP_SECRET,
        callbackURL: platform.getOrigin() + '/user/oauth2/facebook/callback',
        enableProof: true,
        profileFields: ['id', 'displayName', 'emails'],
        passReqToCallback: true,
    }, (req, accessToken, refreshToken, profile, done) => {
        if (!req.user) {
            // authenticate the user
            authenticateFacebook(accessToken, refreshToken, profile, done);
        } else {
            associateFacebook(req.user, accessToken, refreshToken, profile, done);
        }
    }));
};
