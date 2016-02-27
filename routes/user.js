// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const passport = require('passport');
const nodemailer = require('nodemailer');

const user = require('../util/user');
const model = require('../model/user');
const db = require('../util/db');

var TITLE = "ThingPedia";

const EngineManager = require('../enginemanager');

var router = express.Router();

router.get('/oauth2/google', passport.authenticate('google', {
    scope: (['openid','profile','email',
             'https://www.googleapis.com/auth/fitness.activity.read',
             'https://www.googleapis.com/auth/fitness.location.read',
             'https://www.googleapis.com/auth/fitness.body.read']
            .join(' '))
}));
router.get('/oauth2/google/callback', passport.authenticate('google'),
           function(req, res, next) {
               if (req.user.newly_created) {
                   req.user.newly_created = false;
                   res.locals.authenticated = true;
                   res.locals.user = user;
                   res.render('register_success', {
                       page_title: "ThingPedia - Registration Successful",
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

router.get('/oauth2/facebook', passport.authenticate('facebook', {
    scope: 'public_profile email'
}));
router.get('/oauth2/facebook/callback', passport.authenticate('facebook'),
           function(req, res, next) {
               if (req.user.newly_created) {
                   req.user.newly_created = false;
                   res.locals.authenticated = true;
                   res.locals.user = user;
                   res.render('register_success', {
                       page_title: "ThingPedia - Registration Successful",
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


router.get('/login', function(req, res, next) {
    req.logout();
    res.render('login', {
        csrfToken: req.csrfToken(),
        errors: req.flash('error'),
        page_title: "ThingPedia - Login"
    });
});


router.post('/login', passport.authenticate('local', { failureRedirect: '/user/login',
                                                       failureFlash: true }),
            function(req, res, next) {
                // Redirection back to the original page
                var redirect_to = req.session.redirect_to ? req.session.redirect_to : '/';
                delete req.session.redirect_to;
                res.redirect(303, redirect_to);
            });


router.get('/register', function(req, res, next) {
    res.render('register', {
        csrfToken: req.csrfToken(),
        page_title: "ThingPedia - Register"
    });
});


router.post('/register', function(req, res, next) {
    var username, password, email;
    try {
        if (typeof req.body['username'] !== 'string' ||
            req.body['username'].length == 0 ||
            req.body['username'].length > 255)
            throw new Error("You must specify a valid username");
        username = req.body['username'];
        if (typeof req.body['email'] !== 'string' ||
            req.body['email'].length == 0 ||
            req.body['email'].indexOf('@') < 0 ||
            req.body['email'].length > 255)
            throw new Error("You must specify a valid email");
        email = req.body['email'];

        if (typeof req.body['password'] !== 'string' ||
            req.body['password'].length < 8 ||
            req.body['password'].length > 255)
            throw new Error("You must specifiy a valid password (of at least 8 characters)");

        if (req.body['confirm-password'] !== req.body['password'])
            throw new Error("The password and the confirmation do not match");
            password = req.body['password']

    } catch(e) {
        res.render('register', {
            csrfToken: req.csrfToken(),
            page_title: "ThingPedia - Register",
            error: e.message
        });
        return;
    }

    return db.withTransaction(function(dbClient) {
        return user.register(dbClient, username, password, email).then(function(user) {
            return EngineManager.get().startUser(user).then(function() {
                return Q.ninvoke(req, 'login', user);
            }).then(function() {
                res.locals.authenticated = true;
                res.locals.user = user;
                res.render('register_success', {
                    page_title: "ThingPedia - Registration Successful",
                    username: username,
                    cloudId: user.cloud_id,
                    authToken: user.auth_token });
            });
        });
    }).catch(function(error) {
        res.render('register', {
            csrfToken: req.csrfToken(),
            page_title: "ThingPedia - Register",
            error: error.message });
    }).done();
});


router.get('/logout', function(req, res, next) {
    req.logout();
    res.redirect(303, '/');
});

function getProfile(req, res, error) {
    return EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([engine.devices.getDevice('thingengine-own-server'),
                      engine.devices.getDevice('thingengine-own-phone')]);
    }).spread(function(server, phone) {
        return Q.all([server ? server.state : undefined, phone ? phone.state : undefined]);
    }).spread(function(serverState, phoneState) {
        var server, phone;
        if (serverState) {
            server = {
                isConfigured: true,
                name: serverState.host,
                port: serverState.port
            };
        } else {
            server = {
                isConfigured: false
            };
        }
        if (phoneState) {
            phone = {
                isConfigured: true,
            };
        } else {
            phone = {
                isConfigured: false,
                qrcodeTarget: 'https://thingengine.stanford.edu/qrcode-cloud/' + req.user.cloud_id + '/'
                    + req.user.auth_token
            }
        }

        res.render('user_profile', { page_title: "ThingPedia - User Profile",
                                     csrfToken: req.csrfToken(),
                                     error: error,
                                     server: server,
                                     phone: phone });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    });
}

router.get('/profile', user.redirectLogIn, function(req, res, next) {
    getProfile(req, res, undefined).done();
});

router.post('/profile', user.requireLogIn, function(req, res, next) {
    return db.withTransaction(function(dbClient) {
        if (typeof req.body.username !== 'string' ||
            req.body.username.length == 0 ||
            req.body.username.length > 255)
            req.body.username = req.user.username;
        // don't allow developers to change their own developer key
        if (req.user.developer_status > 0)
            req.body.developer_key = req.user.developer_key;
        if (!req.body.developer_key)
            req.body.developer_key = null;

        return model.update(dbClient, req.user.id,
                            { username: req.body.username,
                              human_name: req.body.human_name,
                              developer_key: req.body.developer_key });
    }).then(function() {
        req.user.username = req.body.username;
        req.user.human_name = req.body.human_name;
        req.user.developer_key = req.body.developer_key;
    }).then(function() {
        return getProfile(req, res, undefined);
    }).done();
});

router.post('/change-password', user.requireLogIn, function(req, res, next) {
    var username, password, oldpassword;
    Q.try(function() {
        if (typeof req.body['password'] !== 'string' ||
            req.body['password'].length < 8 ||
            req.body['password'].length > 255)
            throw new Error("You must specifiy a valid password (of at least 8 characters)");

        if (req.body['confirm-password'] !== req.body['password'])
            throw new Error("The password and the confirmation do not match");
        password = req.body['password'];

        if (req.user.password) {
            if (typeof req.body['old_password'] !== 'string')
                throw new Error("You must specifiy your old password");
            oldpassword = req.body['old_password'];
        }

        return db.withTransaction(function(dbClient) {
            return user.update(dbClient, req.user, oldpassword, password);
        }).then(function() {
            res.redirect(303, '/user/profile');
        });
    }).catch(function(e) {
        return getProfile(req, res, e.message);
    }).done();
});

router.post('/delete', user.requireLogIn, function(req, res, next) {
    db.withTransaction(function(dbClient) {
        return EngineManager.get().deleteUser(req.user.id).then(function() {
            return model.delete(dbClient, req.user.id);
        });
    }).then(function() {
        req.logout();
        res.redirect(303, '/');
    }).done();
});

function rot13(x) {
    return Array.prototype.map.call(x, function(ch) {
        var code = ch.charCodeAt(0);
        if (code >= 0x41 && code <= 0x5a)
            code = (((code - 0x41) + 13) % 26) + 0x41;
        else if (code >= 0x61 && code <= 0x7a)
            code = (((code - 0x61) + 13) % 26) + 0x61;

        return String.fromCharCode(code);
    }).join('');
}

var transporter = null;
function ensureTransporter() {
    // create reusable transporter object using SMTP transport
    if (transporter)
        return transporter;
    transporter = nodemailer.createTransport({
        service: 'Mailgun',
        auth: {
            user: 'postmaster@sandbox6e63e5318025445bae814f73a4361aea.mailgun.org',
            pass: rot13('57rp5q164652o265607ps32153pr8872'),
        }
    });
    return transporter;
}

router.get('/request-developer', user.redirectLogIn, function(req, res, next) {
    if (req.user.developer_status >= user.DeveloperStatus.DEVELOPER) {
        res.render('error', { page_title: "ThingPedia - Error",
                              message: "You are already an enrolled developer." });
        return;
    }

    res.render('developer_access_required',
               { page_title: "ThingPedia - Developer Program",
                 title: "Become a ThingPedia Developer",
                 csrfToken: req.csrfToken() });
});

router.post('/request-developer', user.requireLogIn, function(req, res, next) {
    if (req.user.developer_status >= user.DeveloperStatus.DEVELOPER) {
        res.render('error', { page_title: "ThingPedia - Error",
                              message: "You are already an enrolled developer." });
        return;
    }

    var mailOptions = {
        from: 'ThingPedia Spam <noreply@thingengine.stanford.edu>',
        to: 'gcampagn@cs.stanford.edu',
        subject: 'New Developer Access Requested',
        replyTo: {
            name: req.body.realname,
            address: req.body.email
        },
        text: req.body.realname + ' <' + req.body.email + '>, working for ' + req.body.organization
            + ', requests access to ThingPedia.\n\n'
            + 'Username: ' + req.user.username + '\n'
            + 'Reason:\n' + req.body.reason + '\n\nComments:\n'
            + req.body.comments + '\n\nBla bla bla no reply autogenerated spam spam spam.\nCheers,\n'
            + 'The ThingPedia AutoMailer',
    };

    Q.ninvoke(ensureTransporter(), 'sendMail', mailOptions).then(function() {
        res.render('developer_access_ok', { page_title: "ThingPedia - developer access required" });
    }).catch(function(e) {
        res.status(500).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    });
});

module.exports = router;
