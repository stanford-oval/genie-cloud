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
const Tp = require('thingpedia');
const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const util = require('util');

const userUtils = require('../util/user');
const exampleModel = require('../model/example');
const model = require('../model/user');
const oauthModel = require('../model/oauth2');
const db = require('../util/db');
const secret = require('../util/secret_key');
const SendMail = require('../util/sendmail');

const EngineManager = require('../almond/enginemanagerclient');

const Config = require('../config');

var router = express.Router();

router.get('/oauth2/google', passport.authenticate('google', {
    scope: userUtils.GOOGLE_SCOPES,
}));
router.get('/oauth2/google/callback', passport.authenticate('google'), (req, res, next) => {
   if (req.user.newly_created) {
       req.user.newly_created = false;
       res.locals.authenticated = true;
       res.locals.user = req.user;
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
    if (req.user) {
        res.redirect('/');
        return;
    }

    res.render('login', {
        csrfToken: req.csrfToken(),
        errors: req.flash('error'),
        page_title: req._("Thingpedia - Login")
    });
});


router.post('/login', passport.authenticate('local', { failureRedirect: '/user/login',
                                                       failureFlash: true }), (req, res, next) => {
    // Redirection back to the original page
    var redirect_to = req.session.redirect_to ? req.session.redirect_to : '/';
    delete req.session.redirect_to;
    if (redirect_to.startsWith('/user/login'))
        redirect_to = '/';
    res.redirect(303, redirect_to);
});


router.get('/register', (req, res, next) => {
    res.render('register', {
        csrfToken: req.csrfToken(),
        page_title: req._("Thingpedia - Register")
    });
});


async function sendValidationEmail(cloudId, username, email) {
    const token = await util.promisify(jwt.sign)({
        sub: cloudId,
        aud: 'email-verify',
        email: email
    }, secret.getJWTSigningKey(), { expiresIn: 1200 /* seconds */ });

    const mailOptions = {
        from: Config.EMAIL_FROM_USER,
        to: email,
        subject: 'Welcome To Almond!',
        text:
`Welcome to Almond!

To verify your email address, please click the following link:
<${Config.SERVER_ORIGIN}/user/verify-email/${token}>

----
You are receiving this email because someone used your address to
register an account on the Almond service at <${Config.SERVER_ORIGIN}>.
`
    };

    return SendMail.send(mailOptions);
}

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

    Promise.resolve().then(async () => {
        const user = await db.withTransaction(async (dbClient) => {
            let user;
            try {
                user = await userUtils.register(dbClient, req, options);
            } catch(e) {
                res.render('register', {
                    csrfToken: req.csrfToken(),
                    page_title: req._("Thingpedia - Register"),
                    error: e
                });
                return null;
            }
            await Q.ninvoke(req, 'login', user);
            return user;
        });
        if (!user)
            return;
        await Promise.all([
            EngineManager.get().startUser(user.id).catch((e) => {
                console.error(`Failed to start engine of newly registered user: ${e.message}`);
            }),
            sendValidationEmail(user.cloud_id, user.username, user.email)
        ]);

        res.locals.authenticated = true;
        res.locals.user = user;
        res.render('register_success', {
            page_title: req._("Thingpedia - Registration Successful"),
            username: options.username,
            cloudId: user.cloud_id,
            authToken: user.auth_token });
    }).catch(next);
});


router.get('/logout', (req, res, next) => {
    req.logout();
    res.redirect(303, '/');
});

router.post('/subscribe', (req, res, next) => {
    let email = req.body['email'];
    Tp.Helpers.Http.post('https://mailman.stanford.edu/mailman/subscribe/thingpedia-support',
                         `email=${encodeURIComponent(email)}&digest=0&email-button=Subscribe`,
                         { dataContentType: 'application/x-www-form-urlencoded' }).then(() => {
        res.json({ result: 'ok' });
    }).catch((e) => {
        res.status(400).json({ error: e });
    }).catch(next);
});

router.get('/verify-email/:token', userUtils.requireLogIn, (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        let decoded;
        try {
            decoded = await util.promisify(jwt.verify)(req.params.token, secret.getJWTSigningKey(), {
                algorithms: ['HS256'],
                audience: 'email-verify',
                subject: req.user.cloud_id
            });
        } catch(e) {
            res.status(400).render('error', {
                page_title: req._("Almond - Error"),
                message: req._("The verification link you have clicked is not valid. You might be logged-in as the wrong user, or the link might have expired.")
            });
            return;
        }

        await model.verifyEmail(dbClient, decoded.sub, decoded.email);
        res.render('email_verified', {
            page_title: req._("Almond - Verification Successful")
        });
    }).catch(next);
});

router.post('/resend-verification', userUtils.requireLogIn, (req, res, next) => {
    if (req.user.email_verified) {
        res.status(400).render('error', {
            page_title: req._("Almond - Error"),
            message: req._("Your email address was already verified.")
        });
        return;
    }

    sendValidationEmail(req.user.cloud_id, req.user.username, req.user.email).then(() => {
        res.render('message', {
            page_title: req._("Almond - Verification Sent"),
            message: req._("A verification email was sent to %s. If you did not receive it, please check your Spam folder.").format(req.user.email)
        });
    }).catch(next);
});

router.get('/recovery/start', (req, res, next) => {
    res.render('password_recovery_start', {
        page_title: req._("Almond - Password Reset")
    });
});

async function sendRecoveryEmail(cloudId, username, email) {
    const token = await util.promisify(jwt.sign)({
        sub: cloudId,
        aud: 'pw-recovery',
    }, secret.getJWTSigningKey(), { expiresIn: 1200 /* seconds */ });

    const mailOptions = {
        from: Config.EMAIL_FROM_USER,
        to: email,
        subject: 'Almond Password Reset',
        text:
`Hi ${username},

We have been asked to reset your Almond password.
To continue, please click the following link:
<${Config.SERVER_ORIGIN}/user/recovery/continue/${token}>

----
You are receiving this email because someone tried to recover
your Almond password. Not you? You can safely ignore this email.
`
    };

    return SendMail.send(mailOptions);
}

router.post('/recovery/start', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const users = await model.getByName(dbClient, req.body.username);

        if (users.length === 0) {
            // the username was not valid
            // pretend that we sent an email, even though we did not
            // this eliminates the ability to check for the existance of
            // a username by initiating password recovery
            res.render('message', {
                page_title: req._("Almond - Password Reset Sent"),
                message: req._("A recovery email was sent to the address on file for %s. If you did not receive it, please check the spelling of your username, and check your Spam folder.").format(req.body.username)
            });
            return;
        }

        if (!users[0].email_verified) {
            res.render('error', {
                page_title: req._("Almond - Error"),
                message: req._("You did not verify your email address, hence you cannot recover your password automatically. Please contact the website adminstrators to recover your password.")
            });
            return;
        }

        // note: we must not reveal the email address in this message
        await sendRecoveryEmail(users[0].cloud_id, users[0].username, users[0].email);
        res.render('message', {
            page_title: req._("Almond - Password Reset Sent"),
            message: req._("A recovery email was sent to the address on file for %s. If you did not receive it, please check the spelling of your username, and check your Spam folder.").format(req.body.username)
        });
    }).catch(next);
});

router.get('/recovery/continue/:token', (req, res, next) => {
    util.promisify(jwt.verify)(req.params.token, secret.getJWTSigningKey(), {
        algorithms: ['HS256'],
        audience: 'pw-recovery',
    }).then((decoded) => {
        res.render('password_recovery_continue', {
            page_title: req._("Almond - Password Reset"),
            token: req.params.token,
            error: undefined
        });
    }, (err) => {
        res.status(400).render('error', {
            page_title: req._("Almond - Password Reset"),
            message: req._("The verification link you have clicked is not valid.")
        });
    }).catch(next);
});

router.post('/recovery/continue', (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        let decoded;
        try {
            decoded = await util.promisify(jwt.verify)(req.body.token, secret.getJWTSigningKey(), {
                algorithms: ['HS256'],
                audience: 'pw-recovery',
            });
        } catch(e) {
            res.status(400).render('error', {
                page_title: req._("Almond - Error"),
                message: e
            });
            return;
        }
        try {
            if (typeof req.body['password'] !== 'string' ||
                req.body['password'].length < 8 ||
                req.body['password'].length > 255)
                throw new Error(req._("You must specifiy a valid password (of at least 8 characters)"));

            if (req.body['confirm-password'] !== req.body['password'])
                throw new Error(req._("The password and the confirmation do not match"));
        } catch(e) {
            res.render('password_recovery_continue', {
                page_title: req._("Almond - Password Reset"),
                token: req.body.token,
                error: e
            });
        }

        const users = await model.getByCloudId(dbClient, decoded.sub);
        if (users.length === 0) {
            res.status(404).render('error', {
                page_title: req._("Almond - Error"),
                message: req._("The user for which you're resetting the password no longer exists.")
            });
            return;
        }

        const user = users[0];
        await userUtils.resetPassword(dbClient, user, req.body.password);
        await Q.ninvoke(req, 'login', user);
        await model.recordLogin(dbClient, user.id);
        res.locals.authenticated = true;
        res.locals.user = user;
        res.render('message', {
            page_title: req._("Almond - Password Reset"),
            message: req._("Your password was reset successfully.")
        });
    }).catch(next);
});


async function getProfile(req, res, pw_error, profile_error) {
    const phone = {
        isConfigured: false,
        qrcodeTarget: 'https://thingengine.stanford.edu/qrcode-cloud/' + req.user.cloud_id + '/'
            + req.user.auth_token
    };
    const desktop = {
        isConfigured: false,
    };
    try {
        const engine = await EngineManager.get().getEngine(req.user.id);

        const [phoneProxy, desktopProxy] = await Promise.all([
            engine.devices.getDevice('thingengine-own-phone'),
            engine.devices.getDevice('thingengine-own-desktop')
        ]);
        if (phoneProxy)
            phone.isConfigured = true;
        if (desktopProxy)
            desktop.isConfigured = true;
    } catch(e) {
        // ignore the error if the engine is down
    }

    const oauth_permissions = await db.withClient((dbClient) => {
        return oauthModel.getAllPermissionsOfUser(dbClient, req.user.cloud_id);
    });

    res.render('user_profile', { page_title: req._("Thingpedia - User Profile"),
                                 csrfToken: req.csrfToken(),
                                 pw_error,
                                 profile_error,
                                 oauth_permissions,
                                 phone,
                                 desktop });
}

router.get('/profile', userUtils.requireLogIn, (req, res, next) => {
    getProfile(req, res, undefined, undefined).catch(next);
});

router.post('/profile', userUtils.requireLogIn, (req, res, next) => {
    return db.withTransaction(async (dbClient) => {
        if (typeof req.body.username !== 'string' ||
            req.body.username.length === 0 ||
            req.body.username.length > 255)
            req.body.username = req.user.username;
        if (typeof req.body['email'] !== 'string' ||
            req.body['email'].length === 0 ||
            req.body['email'].indexOf('@') < 0 ||
            req.body['email'].length > 255)
            req.body.email = req.user.email;

        let profile_flags = 0;
        if (req.body.visible_organization_profile)
            profile_flags |= userUtils.ProfileFlags.VISIBLE_ORGANIZATION_PROFILE;
        if (req.body.show_human_name)
            profile_flags |= userUtils.ProfileFlags.SHOW_HUMAN_NAME;
        if (req.body.show_profile_picture)
            profile_flags |= userUtils.ProfileFlags.SHOW_PROFILE_PICTURE;

        const mustSendEmail = req.body.email !== req.user.email;

        await model.update(dbClient, req.user.id,
                            { username: req.body.username,
                              email: req.body.email,
                              email_verified: !mustSendEmail,
                              human_name: req.body.human_name,
                              profile_flags });
        req.user.username = req.body.username;
        req.user.email = req.body.email;
        req.user.human_name = req.body.human_name;
        req.user.profile_flags = profile_flags;
        if (mustSendEmail)
            await sendValidationEmail(req.user.cloud_id, req.body.username, req.body.email);

        return getProfile(req, res, undefined,
            mustSendEmail ?
            req._("A verification email was sent to your new email address. Account functionality will be limited until you verify your new address.")
            : undefined);
    }).catch((error) => {
        return getProfile(req, res, undefined, error);
    }).catch(next);
});

router.post('/revoke-oauth2', userUtils.requireLogIn, (req, res, next) => {
    return db.withTransaction((dbClient) => {
        return oauthModel.revokePermission(dbClient, req.body.client_id, req.user.cloud_id);
    }).then(() => {
            res.redirect(303, '/user/profile');
    }).catch(next);
});

router.post('/change-password', userUtils.requireLogIn, (req, res, next) => {
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
            return userUtils.update(dbClient, req.user, oldpassword, password);
        }).then(() => {
            res.redirect(303, '/user/profile');
        });
    }).catch((e) => {
        return getProfile(req, res, e, undefined);
    }).catch(next);
});

router.post('/delete', userUtils.requireLogIn, (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        await EngineManager.get().deleteUser(req.user.id);
        await exampleModel.deleteAllLikesFromUser(dbClient, req.user.id);
        await model.delete(dbClient, req.user.id);
    }).then(() => {
        req.logout();
        res.redirect(303, '/');
    }).catch(next);
});

router.get('/request-developer', userUtils.requireLogIn, (req, res, next) => {
    if (req.user.developer_status >= userUtils.DeveloperStatus.DEVELOPER) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You are already an enrolled developer.") });
        return;
    }

    res.render('developer_access_required',
               { page_title: req._("Thingpedia - Developer Program"),
                 title: req._("Become a Thingpedia Developer"),
                 csrfToken: req.csrfToken() });
});

router.post('/request-developer', userUtils.requireLogIn, (req, res, next) => {
    if (req.user.developer_status >= userUtils.DeveloperStatus.DEVELOPER) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You are already an enrolled developer.") });
        return;
    }

    const mailOptions = {
        from: Config.EMAIL_FROM_ADMIN,
        to: Config.EMAIL_TO_ADMIN,
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
