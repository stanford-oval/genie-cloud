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
const makeRandom = require('../util/random');

const Config = require('../config');

function hashPassword(salt, password) {
    return Q.nfcall(crypto.pbkdf2, password, salt, 10000, 32, 'sha1')
        .then((buffer) => buffer.toString('hex'));
}

module.exports = {
    DeveloperStatus: {
        USER: 0,
        DEVELOPER: 1,
        TRUSTED_DEVELOPER: 2,
        ADMIN: 3,
    },

    Role: {
        ADMIN: 1,
    },

    GOOGLE_SCOPES: ['openid','profile','email'].join(' '),

    register(dbClient, req, options) {
        return model.getByName(dbClient, options.username).then((rows) => {
            if (rows.length > 0)
                throw new Error(req._("An user with this name already exists"));

            var salt = makeRandom();
            var cloudId = makeRandom(8);
            var authToken = makeRandom();
            var storageKey = makeRandom();
            return hashPassword(salt, options.password).then((hash) => {
                return model.create(dbClient, {
                    username: options.username,
                    password: hash,
                    email: options.email,
                    locale: options.locale,
                    timezone: options.timezone,
                    salt: salt,
                    cloud_id: cloudId,
                    auth_token: authToken,
                    storage_key: storageKey,
                    developer_org: options.developer_org || null,
                    developer_status: options.developer_status || 0,
                    roles: options.roles || 0,
                });
            });
        });
    },

    recordLogin(dbClient, userId) {
        return model.recordLogin(dbClient, userId);
    },

    update(dbClient, user, oldpassword, password) {
        return Q.try(() => {
            if (user.salt && user.password) {
                return hashPassword(user.salt, oldpassword).then((providedHash) => {
                    if (user.password !== providedHash)
                        throw new Error('Invalid old password');
                });
            } else {
                return Promise.resolve();
            }
        }).then(() => {
            const salt = makeRandom();
            return hashPassword(salt, password).then((newhash) => {
                return model.update(dbClient, user.id, { salt: salt,
                                                         password: newhash }).then(() => {
                    user.salt = salt;
                    user.password = newhash;
                });
            });
        });
    },

    requireLogIn(req, res, next) {
        if (!req.user) {
            res.status(401).render('login_required',
                                   { page_title: req._("Thingpedia - Error") });
        } else {
            next();
        }
    },

    redirectLogIn(req, res, next) {
        if (!req.user) {
            req.session.redirect_to = req.originalUrl;
            res.redirect('/user/login');
        } else {
            next();
        }
    },

    requireRole(role) {
        return function(req, res, next) {
            if (!req.user || ((req.user.roles & role) !== role)) {
                res.status(401).render('login_required',
                                       { page_title: req._("Thingpedia - Error") });
            } else {
                next();
            }
        };
    },

    redirectRole(role) {
        return function(req, res, next) {
            if (!req.user || ((req.user.roles & role) !== role)) {
                req.session.redirect_to = req.originalUrl;
                res.redirect('/user/login');
            } else {
                next();
            }
        };
    },

    requireDeveloper(required) {
        if (required === undefined)
            required = 1; // DEVELOPER

        return function(req, res, next) {
            if (req.user.developer_status < required) {
                res.status(403).render('developer_access_required',
                                       { page_title: req._("Thingpedia - Error"),
                                         title: req._("Developer Access required"),
                                         csrfToken: req.csrfToken() });
            } else {
                next();
            }
        };
    },

    getAnonymousUser() {
        return db.withClient((dbClient) => {
            return model.getByName(dbClient, 'anonymous');
        }).then(([user]) => user);
    },

    anonymousLogin(req, res, next) {
        if (req.user) {
            next();
            return;
        }

        if (!Config.ENABLE_ANONYMOUS_USER) {
            res.status(401).render('login_required',
                                   { page_title: req._("Thingpedia - Error") });
            return;
        }

        this.getAnonymousUser().then((user) => {
            if (!user)
                throw new Error('Invalid configuration (missing anonymous user)');
            req.login(user, next);
        }).catch((e) => next(e));
    }
};
