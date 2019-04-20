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
const util = require('util');
const jwt = require('jsonwebtoken');

const db = require('./db');
const model = require('../model/user');
const secret = require('./secret_key');

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleOAuthStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github').Strategy;
const BearerStrategy = require('passport-http-bearer').Strategy;
const BasicStrategy = require('passport-http').BasicStrategy;
const TotpStrategy = require('passport-totp').Strategy;

const EngineManager = require('../almond/enginemanagerclient');

var GOOGLE_CLIENT_ID = '739906609557-o52ck15e1ge7deb8l0e80q92mpua1p55.apps.googleusercontent.com';

const { OAUTH_REDIRECT_ORIGIN, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_SECRET, GITHUB_CLIENT_ID} = require('../config');

const TOTP_PERIOD = 30; // duration in second of TOTP code

function hashPassword(salt, password) {
    return Q.nfcall(crypto.pbkdf2, password, salt, 10000, 32, 'sha1')
        .then((buffer) => buffer.toString('hex'));
}

function makeRandom(size = 32) {
    return crypto.randomBytes(size).toString('hex');
}

function authenticateGoogle(accessToken, refreshToken, profile, done) {
    db.withTransaction((dbClient) => {
        return model.getByGoogleAccount(dbClient, profile.id).then((rows) => {
            if (rows.length > 0)
                return model.recordLogin(dbClient, rows[0].id).then(() => rows[0]);

            var username = profile.username || profile.emails[0].value;
            return model.create(dbClient, { username: username,
                                            email: profile.emails[0].value,
                                            // we assume the email associated with a Google account is valid
                                            // and we don't need extra validation
                                            email_verified: true,
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
    }).then((user) => {
        if (!user.newly_created)
            return user;

        // NOTE: we must start the user here because if we do it earlier we're
        // still inside the transaction, and the master process (which uses a different
        // database connection) will not see the new user in the database
        return EngineManager.get().startUser(user.id).then(() => {
            // asynchronously inject google-account device
            EngineManager.get().getEngine(user.id).then((engine) => {
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
    db.withTransaction((dbClient) => {
        return model.update(dbClient, user.id, { google_id: profile.id }).then(() => {
            // asynchronously inject google-account device
            EngineManager.get().getEngine(user.id).then((engine) => {
                return engine.devices.loadOneDevice({ kind: 'com.google',
                                                      profileId: profile.id,
                                                      accessToken: accessToken,
                                                      refreshToken: refreshToken }, true);
            }).done();
            return user;
        });
    }).nodeify(done);
}

function authenticateGithub(accessToken, refreshToken, profile, done) {
    db.withTransaction((dbClient) => {
        return model.getByGithubAccount(dbClient, profile.id).then((rows) => {
            if (rows.length > 0)
                return model.recordLogin(dbClient, rows[0].id).then(() => rows[0]);

            var username = profile.username || profile.email;
            return model.create(dbClient, { username: username,
                                            email: profile.email,
                                            // we assume the email associated with a Github account is valid
                                            // and we don't need extra validation
                                            email_verified: true,
                                            locale: 'en-US',
                                            timezone: 'America/Los_Angeles',
                                            github_id: profile.id,
                                            human_name: profile.displayName,
                                            cloud_id: makeRandom(8),
                                            auth_token: makeRandom(),
                                            storage_key: makeRandom() }).then((user) => {
                user.newly_created = true;
                return user;
            });
        });
    }).then((user) => {
        if (!user.newly_created)
            return user;

        // NOTE: we must start the user here because if we do it earlier we're
        // still inside the transaction, and the master process (which uses a different
        // database connection) will not see the new user in the database
        return EngineManager.get().startUser(user.id).then(() => {
            // asynchronously inject github-account device
            EngineManager.get().getEngine(user.id).then((engine) => {
                return engine.devices.loadOneDevice({ kind: 'com.github',
                                                      userId: profile.id,
                                                      userName: profile.username,
                                                      accessToken: accessToken,
                                                      refreshToken: refreshToken }, true);
            }).done();
            return user;
        });
    }).nodeify(done);
}

function associateGithub(user, accessToken, refreshToken, profile, done) {
    db.withTransaction((dbClient) => {
        return model.update(dbClient, user.id, { github_id: profile.id }).then(() => {
            // asynchronously inject github-account device

            EngineManager.get().getEngine(user.id).then((engine) => {
                return engine.devices.loadOneDevice({ kind: 'com.github',
                                                      userId: profile.id,
                                                      userName: profile.username,
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

    passport.use(new BearerStrategy(async (accessToken, done) => {
        try {
            const decoded = await util.promisify(jwt.verify)(accessToken, secret.getJWTSigningKey(), {
                algorithms: ['HS256'],
                audience: 'oauth2',
                clockTolerance: 30,
            });
            const scope = decoded.scope || ['profile'];
            const [user, options] = await db.withClient(async (dbClient) => {
                const rows = await model.getByCloudId(dbClient, decoded.sub);
                if (rows.length < 1)
                    return [false, null];

                await model.recordLogin(dbClient, rows[0].id);
                return [rows[0], { scope, authMethod: 'oauth2' }];
            });
            done(null, user, options);
        } catch(err) {
            done(err);
        }
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

    passport.use(new LocalStrategy((username, password, done) => {
        db.withClient((dbClient) => {
            return model.getByName(dbClient, username).then((rows) => {
                if (rows.length < 1)
                    return [false, "Invalid username or password"];

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
        callbackURL: OAUTH_REDIRECT_ORIGIN + '/user/oauth2/google/callback',
        passReqToCallback: true,
    }, (req, accessToken, refreshToken, profile, done) => {
        if (!req.user) {
            // authenticate the user
            authenticateGoogle(accessToken, refreshToken, profile, done);
        } else {
            associateGoogle(req.user, accessToken, refreshToken, profile, done);
        }
    }));

    passport.use(new GitHubStrategy({
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: OAUTH_REDIRECT_ORIGIN + '/user/oauth2/github/callback',
        passReqToCallback: true,
  },   (req, accessToken, refreshToken, profile, done) => {
        if (!req.user) {

            // authenticate the user
            authenticateGithub(accessToken, refreshToken, profile, done);
        } else {
            associateGithub(req.user, accessToken, refreshToken, profile, done);
        }
    }));

    passport.use(new TotpStrategy((user, done) => {
        if (user.totp_key === null)
            done(new Error('2-factor authentication not setup'));
        else
            done(null, secret.decrypt(user.totp_key), TOTP_PERIOD);
    }));
};
