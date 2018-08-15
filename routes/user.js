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
const express = require('express');
const passport = require('passport');

const user = require('../util/user');
const model = require('../model/user');
const db = require('../util/db');
const SendMail = require('../util/sendmail');

const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

router.get('/oauth2/google', passport.authenticate('google', {
    scope: user.GOOGLE_SCOPES,
}));
router.get('/oauth2/google/callback', passport.authenticate('google'), (req, res, next) => {
   if (req.user.newly_created) {
       req.user.newly_created = false;
       res.locals.authenticated = true;
       res.locals.user = user;
       res.render('register_success', {
           page_title: req._("Thingpedia - Registration Successful"),
           username: req.user.username,
           cloudId: req.user.cloud_id,
           authToken: req.user.auth_token });
   } else {
       // Redirection back to the original page
       var redirect_to = req.session.redirect_to ? req.session.redirect_to : '/';
       delete req.session.redirect_to;
       res.redirect(303, redirect_to);
   }
});

router.get('/login', (req, res, next) => {
    req.logout();
    res.render('login', {
        csrfToken: req.csrfToken(),
        errors: req.flash('error'),
        page_title: req._("Thingpedia - Login")
    });
});


router.post('/login', passport.authenticate('local', { failureRedirect: '/user/login',
                                                       failureFlash: true }), (req, res, next) => {
    // Redirection back to the original page
    var redirect_to = req.session.redirect_to ? req.session.redirect_to : '/app';
    delete req.session.redirect_to;
    res.redirect(303, redirect_to);
});


router.get('/register', (req, res, next) => {
    res.render('register', {
        csrfToken: req.csrfToken(),
        page_title: req._("Thingpedia - Register")
    });
});


router.post('/register', (req, res, next) => {
    var options = {};
    try {
        if (typeof req.body['username'] !== 'string' ||
            req.body['username'].length === 0 ||
            req.body['username'].length > 255)
            throw new Error(req._("You must specify a valid username"));
        options.username = req.body['username'];
        if (typeof req.body['email'] !== 'string' ||
            req.body['email'].length === 0 ||
            req.body['email'].indexOf('@') < 0 ||
            req.body['email'].length > 255)
            throw new Error(req._("You must specify a valid email"));
        options.email = req.body['email'];

        if (typeof req.body['password'] !== 'string' ||
            req.body['password'].length < 8 ||
            req.body['password'].length > 255)
            throw new Error(req._("You must specifiy a valid password (of at least 8 characters)"));

        if (req.body['confirm-password'] !== req.body['password'])
            throw new Error(req._("The password and the confirmation do not match"));
        options.password = req.body['password'];

        if (!req.body['timezone'])
            req.body['timezone'] = 'America/Los_Angeles';
        if (typeof req.body['timezone'] !== 'string' ||
            typeof req.body['locale'] !== 'string' ||
            !/^([a-z+\-0-9_]+\/[a-z+\-0-9_]+|[a-z+\-0-9_]+)$/i.test(req.body['timezone']) ||
            !/^[a-z]{2,}-[a-z]{2,}/i.test(req.body['locale']))
            throw new Error("Invalid localization data");
        options.timezone = req.body['timezone'];
        options.locale = req.body['locale'];

    } catch(e) {
        res.render('register', {
            csrfToken: req.csrfToken(),
            page_title: req._("Thingpedia - Register"),
            error: e
        });
        return;
    }

    Promise.resolve().then(() => {
        return db.withTransaction((dbClient) => {
            return user.register(dbClient, req, options).then((user) => {
                return Q.ninvoke(req, 'login', user).then(() => user);
            });
        }).then((user) => {
            return EngineManager.get().startUser(user.id).then(() => user);
        }).then((user) => {
            res.locals.authenticated = true;
            res.locals.user = user;
            res.render('register_success', {
                page_title: req._("Thingpedia - Registration Successful"),
                username: options.username,
                cloudId: user.cloud_id,
                authToken: user.auth_token });
        });
    }).catch((error) => {
        res.render('register', {
            csrfToken: req.csrfToken(),
            page_title: req._("Thingpedia - Register"),
            error: error });
    });
});


router.get('/logout', (req, res, next) => {
    req.logout();
    res.redirect(303, '/app');
});

function getProfile(req, res, pwError, profileError) {
    return EngineManager.get().getEngine(req.user.id).then((engine) => {
        return Promise.all([engine.devices.getDevice('thingengine-own-phone'),
                            engine.devices.getDevice('thingengine-own-desktop')]);
    }).then(([phone, desktop]) => {
        return Promise.all([phone ? phone.state : undefined, desktop ? desktop.state : undefined]);
    }).then(([phoneState, desktopState]) => {
        var phone;
        if (phoneState) {
            phone = {
                isConfigured: true,
            };
        } else {
            phone = {
                isConfigured: false,
                qrcodeTarget: 'https://thingengine.stanford.edu/qrcode-cloud/' + req.user.cloud_id + '/'
                    + req.user.auth_token
            };
        }
        var desktop;
        if (desktopState) {
            desktop = {
                isConfigured: true,
            };
        } else {
            desktop = {
                isConfigured: false,
            };
        }

        res.render('user_profile', { page_title: req._("Thingpedia - User Profile"),
                                     csrfToken: req.csrfToken(),
                                     pw_error: pwError,
                                     profile_error: profileError,
                                     phone: phone, desktop: desktop });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
}

router.get('/profile', user.redirectLogIn, (req, res, next) => {
    getProfile(req, res, undefined, undefined).catch(next);
});

router.post('/profile', user.requireLogIn, (req, res, next) => {
    return db.withTransaction((dbClient) => {
        if (typeof req.body.username !== 'string' ||
            req.body.username.length === 0 ||
            req.body.username.length > 255)
            req.body.username = req.user.username;
        if (typeof req.body['email'] !== 'string' ||
            req.body['email'].length === 0 ||
            req.body['email'].indexOf('@') < 0 ||
            req.body['email'].length > 255)
            req.body.email = req.user.email;

        return model.update(dbClient, req.user.id,
                            { username: req.body.username,
                              email: req.body.email,
                              human_name: req.body.human_name });
    }).then(() => {
        req.user.username = req.body.username;
        req.user.email = req.body.email;
        req.user.human_name = req.body.human_name;
    }).then(() => {
        return getProfile(req, res, undefined, undefined);
    }).catch((error) => {
        return getProfile(req, res, undefined, error);
    }).catch(next);
});

router.post('/change-password', user.requireLogIn, (req, res, next) => {
    var password, oldpassword;
    Promise.resolve().then(() => {
        if (typeof req.body['password'] !== 'string' ||
            req.body['password'].length < 8 ||
            req.body['password'].length > 255)
            throw new Error(req._("You must specifiy a valid password (of at least 8 characters)"));

        if (req.body['confirm-password'] !== req.body['password'])
            throw new Error(req._("The password and the confirmation do not match"));
        password = req.body['password'];

        if (req.user.password) {
            if (typeof req.body['old_password'] !== 'string')
                throw new Error(req._("You must specifiy your old password"));
            oldpassword = req.body['old_password'];
        }

        return db.withTransaction((dbClient) => {
            return user.update(dbClient, req.user, oldpassword, password);
        }).then(() => {
            res.redirect(303, '/user/profile');
        });
    }).catch((e) => {
        return getProfile(req, res, e, undefined);
    }).catch(next);
});

router.post('/delete', user.requireLogIn, (req, res, next) => {
    db.withTransaction((dbClient) => {
        return EngineManager.get().deleteUser(req.user.id).then(() => {
            return model.delete(dbClient, req.user.id);
        });
    }).then(() => {
        req.logout();
        res.redirect(303, '/');
    }).catch(next);
});

router.get('/request-developer', user.redirectLogIn, (req, res, next) => {
    if (req.user.developer_status >= user.DeveloperStatus.DEVELOPER) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You are already an enrolled developer.") });
        return;
    }

    res.render('developer_access_required',
               { page_title: req._("Thingpedia - Developer Program"),
                 title: req._("Become a Thingpedia Developer"),
                 csrfToken: req.csrfToken() });
});

router.post('/request-developer', user.requireLogIn, (req, res, next) => {
    if (req.user.developer_status >= user.DeveloperStatus.DEVELOPER) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You are already an enrolled developer.") });
        return;
    }

    const mailOptions = {
        from: 'Thingpedia <noreply@thingpedia.stanford.edu>',
        to: 'thingpedia-support@lists.stanford.edu',
        subject: 'New Developer Access Requested',
        replyTo: {
            name: req.body.realname,
            address: req.body.email
        },
        text:
`${req.body.realname} <${req.body.email}>, working for ${req.body.organization},
requests developer access to Thingpedia.

Username: ${req.user.username} (${req.user.human_name} <${req.user.email}>)
Reason:
${(req.body.reason || '').trim()}

Comments:
${(req.body.comments || '').trim()}
`
    };

    SendMail.send(mailOptions).then(() => {
        res.render('developer_access_ok', { page_title: req._("Thingpedia - developer access required") });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
});

module.exports = router;
