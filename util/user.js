// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const crypto = require('crypto');
const db = require('./db');
const model = require('../model/user');
const oauth2 = require('../model/oauth2');

function hashPassword(salt, password) {
    return Q.nfcall(crypto.pbkdf2, password, salt, 10000, 32)
        .then(function(buffer) {
            return buffer.toString('hex');
        });
}

function makeRandom() {
    return crypto.randomBytes(32).toString('hex');
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

    GOOGLE_SCOPES: ['openid','profile','email',
                    'https://mail.google.com/',
                    'https://www.googleapis.com/auth/plus.me',
                    'https://www.googleapis.com/auth/drive',
                    'https://www.googleapis.com/auth/drive.appdata',
                    'https://www.googleapis.com/auth/drive.file']
                    .join(' '),

    FACEBOOK_SCOPES: ['email', 'public_profile', 'user_friends', 'user_photos', 'publish_actions'].join(' '),

    register: function(dbClient, username, password, email) {
        return model.getByName(dbClient, username).then(function(rows) {
            if (rows.length > 0)
                throw new Error("An user with this name already exists");

            var salt = makeRandom();
            var cloudId = makeRandom();
            var authToken = makeRandom();
            return hashPassword(salt, password)
                .then(function(hash) {
                    return model.create(dbClient, {
                        username: username,
                        password: hash,
                        email: email,
                        salt: salt,
                        cloud_id: cloudId,
                        auth_token: authToken
                    });
                });
        });
    },

    registerWithOmlet: function(dbClient, username, salt, passwordHash, omletId, email) {
        return model.getByName(dbClient, username).then(function(rows) {
            if (rows.length > 0)
                throw new Error("An user with this name already exists");

            var cloudId = makeRandom();
            var authToken = makeRandom();
            return model.create(dbClient, {
                username: username,
                password: passwordHash,
                email: email,
                salt: salt,
                cloud_id: cloudId,
                auth_token: authToken,
                omlet_id: omletId,
            });
        });
    },

    update: function(dbClient, user, oldpassword, password) {
        return Q.try(function() {
            if (user.salt && user.password) {
                return hashPassword(user.salt, oldpassword)
                    .then(function(providedHash) {
                        if (user.password !== providedHash)
                            throw new Error('Invalid old password');
                    });
            }
        }).then(function() {
            var salt = makeRandom();
            return hashPassword(salt, password).then(function(newhash) {
                return model.update(dbClient, user.id, { salt: salt,
                                                         password: newhash })
                    .then(function() {
                        user.salt = salt;
                        user.password = newhash;
                    });
            });
        });
    },

    requireLogIn: function(req, res, next) {
        if (!req.user) {
            res.status(401).render('login_required',
                                   { page_title: "ThingPedia - Error" });
        } else {
            next();
        }
    },

    redirectLogIn: function(req, res, next) {
        if (!req.user) {
            req.session.redirect_to = req.originalUrl;
            res.redirect('/user/login');
        } else {
            next();
        };
    },

    requireRole: function(role) {
        return function(req, res, next) {
            if (!req.user || ((req.user.roles & role) !== role)) {
                res.status(401).render('login_required',
                                       { page_title: "ThingPedia - Error" });
            } else {
                next();
            }
        }
    },

    redirectRole: function(role) {
        return function(req, res, next) {
            if (!req.user || ((req.user.roles & role) !== role)) {
                req.session.redirect_to = req.originalUrl;
                res.redirect('/user/login');
            } else {
                next();
            };
        }
    },

    requireDeveloper: function(required) {
        if (required === undefined)
            required = 1; // DEVELOPER

        return function(req, res, next) {
            if (req.user.developer_status < required) {
                res.status(403).render('developer_access_required',
                                       { page_title: "ThingPedia - Error",
                                         title: "Developer Access required",
                                         csrfToken: req.csrfToken() });
            } else {
                next();
            }
        };
    }
};
