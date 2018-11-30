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
const { makeRandom } = require('./random');

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

    ProfileFlags: {
        VISIBLE_ORGANIZATION_PROFILE: 1,
        SHOW_HUMAN_NAME: 2,
        SHOW_EMAIL: 4,
        SHOW_PROFILE_PICTURE: 8,
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
                    human_name: options.human_name || null,
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
                    profile_flags: options.profile_flags || 0,
                });
            });
        });
    },

    recordLogin(dbClient, userId) {
        return model.recordLogin(dbClient, userId);
    },

    async update(dbClient, user, oldpassword, password) {
        if (user.salt && user.password) {
            const providedHash = await hashPassword(user.salt, oldpassword);
            if (user.password !== providedHash)
                throw new Error('Invalid old password');
        }
        const salt = makeRandom();
        const newhash = await hashPassword(salt, password);
        await model.update(dbClient, user.id, { salt: salt,
                                                 password: newhash });
        user.salt = salt;
        user.password = newhash;
    },

    requireLogIn(req, res, next) {
        if (!req.user) {
            if (req.method === 'GET' || req.method === 'HEAD') {
                req.session.redirect_to = req.originalUrl;
                res.redirect('/user/login');
            } else {
                res.status(401).render('login_required',
                                       { page_title: req._("Thingpedia - Error") });
            }
        } else {
            next();
        }
    },

    requireRole(role) {
        return function(req, res, next) {
            if ((req.user.roles & role) !== role) {
                res.status(403).render('error', {
                    page_title: req._("Thingpedia - Error"),
                    message: req._("You do not have permission to perform this operation.")
                });
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
