// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

/// <reference types="./thirty-two" />

import * as Url from 'url';
import * as Tp from 'thingpedia';
import express from 'express';
import passport from 'passport';
import * as jwt from 'jsonwebtoken';
import * as util from 'util';
import * as crypto from 'crypto';
import * as thirtyTwo from 'thirty-two';
import { totp } from 'notp';
import DiscourseSSO from 'discourse-sso';
import moment from 'moment-timezone';

import * as userUtils from '../util/user';
import * as exampleModel from '../model/example';
import * as model from '../model/user';
import * as oauthModel from '../model/oauth2';
import * as organization from '../model/organization';
import * as db from '../util/db';
import * as secret from '../util/secret_key';
import * as SendMail from '../util/sendmail';
import { makeRandom } from '../util/random';
import * as iv from '../util/input_validation';
import * as i18n from '../util/i18n';
import { tokenize } from '../util/tokenize';
import { BadRequestError } from '../util/errors';

import * as EngineManager from '../almond/enginemanagerclient';

import * as Config from '../config';

const TOTP_PERIOD = 30; // duration in second of TOTP code

const router = express.Router();

function registerSuccess(req : express.Request, res : express.Response) {
    if (req.user!.email_verified)
        req.flash('app-message', req._("Welcome to Genie! You are now ready to start using Genie to receive notifications."));
    else if (req.user!.email)
        req.flash('app-message', req._("Welcome to Genie! A verification email has been sent to your address. Some functionality on your account, such as receiving notifications, will be limited until you verify your email. You must click on the verification link to enable your account in full."));
    else
        req.flash('app-message', req._("Welcome to Genie! You did not provide an email address. Some functionality on your account, such as receiving notifications, will be limited until you provide and verify your email. You can do so from your user settings."));

    res.redirect(303, '/me');

    /**
    res.locals.authenticated = true;
    res.locals.user = user;
    res.render('register_success', {
        page_title: req._("Genie - Registration Successful"),
        username: options.username,
        cloudId: user.cloud_id,
        authToken: user.auth_token });
    */
}

router.get('/oauth2/google', passport.authenticate('google', {
    scope: userUtils.GOOGLE_SCOPES,
}));
router.get('/oauth2/google/callback', passport.authenticate('google'), (req, res, next) => {
    // skip 2fa if logged in with Google
    req.session.completed2fa = true;

    if (req.user!.newly_created) {
        req.user!.newly_created = false;
        registerSuccess(req, res);
    } else {
        // Redirection back to the original page
        const redirect_to = req.session.redirect_to ? req.session.redirect_to : '/';
        delete req.session.redirect_to;
        res.redirect(303, redirect_to);
    }
});

//oauth login with github
router.get('/oauth2/github', passport.authenticate('github', {
    scope: userUtils.GITHUB_SCOPES,
}));

router.get('/oauth2/github/callback', passport.authenticate('github'), (req, res, next) => {
    // skip 2fa if logged in with Github
    req.session.completed2fa = true;

    if (req.user!.newly_created) {
        req.user!.newly_created = false;
        registerSuccess(req, res);
    } else {
        // Redirection back to the original page
        const redirect_to = req.session.redirect_to ? req.session.redirect_to : '/';
        delete req.session.redirect_to;
        res.redirect(303, redirect_to);
    }
});

router.get('/login', (req, res, next) => {
    if (req.user) {
        if (req.session.completed2fa || req.user.totp_key === null)
            res.redirect('/');
        else
            res.redirect('/user/2fa/login');
        return;
    }

    res.render('login', {
        csrfToken: req.csrfToken(),
        errors: req.flash('error'),
        page_title: req._("Genie - Login")
    });
});


router.post('/login', passport.authenticate('local', { failureRedirect: '/user/login',
                                                       failureFlash: true }), (req, res, next) => {
    req.session.completed2fa = false;
    if (req.signedCookies['almond.skip2fa'] === 'yes')
        req.session.completed2fa = true;

    if (req.user!.totp_key && !req.session.completed2fa) {
        // if 2fa is enabled, redirect to the 2fa login page
        res.redirect(303, '/user/2fa/login');
    } else {
        // Redirection back to the original page
        let redirect_to = req.session.redirect_to ? req.session.redirect_to : '/';
        delete req.session.redirect_to;
        if (redirect_to.startsWith('/user/login'))
            redirect_to = '/';
        res.redirect(303, redirect_to);
    }
});

router.get('/2fa/login', (req, res, next) => {
    if (!req.user) {
        // redirect to login page if we get here by accident
        res.redirect('/user/login');
        return;
    }
    if (req.session.completed2fa) {
        res.redirect('/');
        return;
    }

    res.render('2fa_login', {
        page_title: req._("Genie - Login"),
        errors: req.flash('error'),
    });
});

router.post('/2fa/login', passport.authenticate('totp', { failureRedirect: '/user/2fa/login',
                                                          failureFlash: 'Invalid OTP code' }), (req, res, next) => {
    req.session.completed2fa = true;

    if (req.body.remember_me) {
        res.cookie('almond.skip2fa', 'yes', {
            maxAge: 1 * 365 * 86400 * 1000, // 1 year, in milliseconds
            signed: true
        });
    }

    // Redirection back to the original page
    let redirect_to = req.session.redirect_to ? req.session.redirect_to : '/';
    delete req.session.redirect_to;
    if (redirect_to.startsWith('/user/login') || redirect_to.startsWith('/user/2fa/login'))
        redirect_to = '/';
    res.redirect(303, redirect_to);
});

router.get('/2fa/setup', userUtils.requireLogIn, iv.validateGET({ force: 'boolean' }), (req, res, next) => {
    if (req.user!.totp_key !== null && req.query.force !== '1') {
        res.status(400).render('error', {
            page_title: req._("Genie - Error"),
            message: req._("You already configured two-factor authentication.")
        });
        return;
    }

    // 128 bit key
    const totpKey = crypto.randomBytes(16);

    const encryptedKey = secret.encrypt(totpKey);
    const encodedKey = thirtyTwo.encode(totpKey).toString().replace(/=/g, '');

    // TRANSLATORS: this is the label used to represent Almond in 2-FA/MFA apps
    // such as Google Authenticator or Duo Mobile; %s is the username

    const hostname = Url.parse(Config.SERVER_ORIGIN).hostname;
    const label = encodeURIComponent(req.user!.username.replace(' ', '_')) + '@' + hostname;
    const qrUrl = `otpauth://totp/${label}?secret=${encodedKey}`;

    res.render('2fa_setup', {
        page_title: req._("Genie - Two-Factor Authentication"),
        encryptedKey,
        qrUrl
    });
});

router.post('/2fa/setup', userUtils.requireLogIn, iv.validatePOST({ encrypted_key: 'string', code: 'string' }), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        // recover the key that was passed to the client
        const encryptedKey = req.body.encrypted_key;
        const totpKey = secret.decrypt(encryptedKey);

        // check that the user provided a valid OTP token
        // this ensures that they set up their Authenticator app correctly
        const rv = totp.verify(req.body.code, totpKey, { window: 6, time: TOTP_PERIOD });
        if (!rv) {
            res.render('error', {
                page_title: req._("Genie - Two-Factor Authentication"),
                message: req._("Invalid OTP Code. Please check that your Authenticator app is properly configured.")
            });
            return;
        }

        // finally update the database, enabling 2fa
        await model.update(dbClient, req.user!.id, { totp_key: encryptedKey });

        // mark that 2fa was successful for this session
        req.session.completed2fa = true;

        res.render('message', {
            page_title: req._("Genie - Two-Factor Authentication"),
            message: req._("Two-factor authentication was set up successfully. You will need to use your Authenticator app at the next login.")
        });
    }).catch(next);
});

router.get('/register', (req, res, next) => {
    res.render('register', {
        csrfToken: req.csrfToken(),
        page_title: req._("Genie - Register"),
    });
});


async function sendValidationEmail(cloudId : string, username : string, email : string) {
    const token = await util.promisify<object, string, jwt.SignOptions, string>(jwt.sign)({
        sub: cloudId,
        aud: 'email-verify',
        email: email
    }, secret.getJWTSigningKey(), { expiresIn: 1200 /* seconds */ });

    const mailOptions = {
        from: Config.EMAIL_FROM_USER,
        to: email,
        subject: 'Welcome To Genie!',
        text:
`Welcome to Genie!

To verify your email address, please click the following link:
<${Config.SERVER_ORIGIN}/user/verify-email/${token}>

----
You are receiving this email because someone used your address to
register an account on the Genie service at <${Config.SERVER_ORIGIN}>.
`
    };

    return SendMail.send(mailOptions);
}

function login(req : express.Request<any, any, any, any>, user : Express.User) {
    return new Promise<void>((resolve, reject) => {
        req.login(user, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}

function normalizePhoneNumber(text : string) {
    if (text.startsWith('1'))
        text = '+' + text;
    else if (!text.startsWith('+'))
        text = '+1' + text;

    return text.replace(/[() -]/g, '');
}

router.post('/register', iv.validatePOST({
    username: 'string',
    email: 'string',
    phone: '?string',
    password: 'string',
    'confirm-password': 'string',
    timezone: '?string',
    locale: 'string',
    agree_terms: 'boolean',
    agree_consent: 'boolean',
    conversation_state: '?string',
}), (req, res, next) => {
    let options : {
        username : string;
        email : string;
        phone ?: string;
        password : string;
        timezone : string;
        locale : string;
    };
    try {
        if (!userUtils.validateUsername(req.body.username))
            throw new BadRequestError(req._("You must specify a valid username of at most 60 characters. Special characters or spaces are not allowed."));
        if (req.body['email'].indexOf('@') < 0 ||
            req.body['email'].length > 255)
            throw new BadRequestError(req._("You must specify a valid email."));

        if (req.body['password'].length < 8 ||
            req.body['password'].length > 255)
            throw new BadRequestError(req._("You must specify a valid password, of at least 8 characters."));

        if (req.body['confirm-password'] !== req.body['password'])
            throw new BadRequestError(req._("The password and the confirmation do not match."));

        if (!req.body['timezone'])
            req.body['timezone'] = 'America/Los_Angeles';
        if (!moment.tz.zone(req.body.timezone) ||
            !/^[a-z]{2,}-[a-z]{2,}/i.test(req.body.locale) ||
            !i18n.get(req.body.locale, false))
            throw new BadRequestError("Invalid localization data.");

        if (!req.body.agree_terms)
            throw new BadRequestError(req._("You must agree to the terms of service to sign-up."));

        options = {
            username: req.body['username'],
            email: req.body['email'],
            password: req.body['password'],
            timezone: req.body['timezone'],
            locale: req.body['locale']
        };

        if (req.body['phone'])
            options.phone = normalizePhoneNumber(req.body['phone']);
    } catch(e) {
        res.render('register', {
            csrfToken: req.csrfToken(),
            page_title: req._("Genie - Register"),
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
                    page_title: req._("Genie - Register"),
                    error: e
                });
                return null;
            }
            await login(req, user);
            return user;
        });
        if (!user)
            return;
        await Promise.all([
            EngineManager.get().startUser(user.id).then(async () => {
                const engine = await EngineManager.get().getEngine(req.user!.id);
                await engine.setConsent(!!req.body.agree_consent);

                if (req.body.conversation_state) {
                    await engine.ensureConversation('main', {
                        showWelcome: true,
                        anonymous: false,
                        inactivityTimeout: -1
                    }, JSON.parse(req.body.conversation_state));
                }
            }).catch((e) => {
                console.error(`Failed to start engine of newly registered user: ${e.message}`);
            }),
            sendValidationEmail(user.cloud_id, user.username, user.email)
        ]);

        // skip login & 2fa for newly created users
        req.session.completed2fa = true;

        // go straight to My Genie
        registerSuccess(req, res);
    }).catch(next);
});


router.get('/logout', (req, res, next) => {
    req.logout();
    req.session.completed2fa = false;
    res.locals.authenticated = false;
    req.session.save(() => {
        res.redirect(303, '/');
    });
});

router.post('/subscribe', iv.validatePOST({ email: 'string' }), (req, res, next) => {
    const email = req.body['email'];
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
            decoded = await util.promisify<string, string, jwt.VerifyOptions, any>(jwt.verify)(req.params.token, secret.getJWTSigningKey(), {
                algorithms: ['HS256'],
                audience: 'email-verify',
                subject: req.user!.cloud_id
            });
        } catch(e) {
            res.status(400).render('error', {
                page_title: req._("Genie - Error"),
                message: req._("The verification link you have clicked is not valid. You might be logged-in as the wrong user, or the link might have expired.")
            });
            return;
        }

        await model.verifyEmail(dbClient, decoded.sub, decoded.email);
        res.render('email_verified', {
            page_title: req._("Genie - Verification Successful")
        });
    }).catch(next);
});

router.post('/resend-verification', userUtils.requireLogIn, (req, res, next) => {
    if (req.user!.email_verified) {
        res.status(400).render('error', {
            page_title: req._("Genie - Error"),
            message: req._("Your email address was already verified.")
        });
        return;
    }
    if (!req.user!.email) {
        res.status(400).render('error', {
            page_title: req._("Genie - Error"),
            message: req._("You must set an email address before sending a verification email.")
        });
        return;
    }

    sendValidationEmail(req.user!.cloud_id, req.user!.username, req.user!.email).then(() => {
        res.render('message', {
            page_title: req._("Genie - Verification Sent"),
            message: req._("A verification email was sent to %s. If you did not receive it, please check your Spam folder.").format(req.user!.email)
        });
    }).catch(next);
});

router.get('/recovery/start', (req, res, next) => {
    res.render('password_recovery_start', {
        page_title: req._("Genie - Password Reset")
    });
});

async function sendRecoveryEmail(cloudId : string, username : string, email : string) {
    const token = await util.promisify<object, string, jwt.SignOptions, string>(jwt.sign)({
        sub: cloudId,
        aud: 'pw-recovery',
    }, secret.getJWTSigningKey(), { expiresIn: 1200 /* seconds */ });

    const mailOptions = {
        from: Config.EMAIL_FROM_USER,
        to: email,
        subject: 'Genie Password Reset',
        text:
`Hi ${username},

We have been asked to reset your Genie password.
To continue, please click the following link:
<${Config.SERVER_ORIGIN}/user/recovery/continue/${token}>

----
You are receiving this email because someone tried to recover
your Genie password. Not you? You can safely ignore this email.
`
    };

    return SendMail.send(mailOptions);
}

router.post('/recovery/start', iv.validatePOST({ username: 'string' }), (req, res, next) => {
    db.withClient(async (dbClient) => {
        const users = await model.getByName(dbClient, req.body.username);

        if (users.length === 0) {
            // the username was not valid
            // pretend that we sent an email, even though we did not
            // this eliminates the ability to check for the existance of
            // a username by initiating password recovery
            res.render('message', {
                page_title: req._("Genie - Password Reset Sent"),
                message: req._("A recovery email was sent to the address on file for %s. If you did not receive it, please check the spelling of your username, and check your Spam folder.").format(req.body.username)
            });
            return;
        }

        if (!users[0].email_verified) {
            res.render('error', {
                page_title: req._("Genie - Error"),
                message: req._("You did not verify your email address, hence you cannot recover your password automatically. Please contact the website adminstrators to recover your password.")
            });
            return;
        }

        // note: we must not reveal the email address in this message
        await sendRecoveryEmail(users[0].cloud_id, users[0].username, users[0].email);
        res.render('message', {
            page_title: req._("Genie - Password Reset Sent"),
            message: req._("A recovery email was sent to the address on file for %s. If you did not receive it, please check the spelling of your username, and check your Spam folder.").format(req.body.username)
        });
    }).catch(next);
});

router.get('/recovery/continue/:token', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const decoded = await util.promisify<string, string, jwt.VerifyOptions, any>(jwt.verify)(req.params.token, secret.getJWTSigningKey(), {
            algorithms: ['HS256'],
            audience: 'pw-recovery',
        });
        const users = await model.getByCloudId(dbClient, decoded.sub);
        if (users.length === 0) {
            res.status(404).render('error', {
                page_title: req._("Genie - Error"),
                message: req._("The user for which you're resetting the password no longer exists.")
            });
            return;
        }

        res.render('password_recovery_continue', {
            page_title: req._("Genie - Password Reset"),
            token: req.params.token,
            recoveryUser: users[0],
            error: undefined
        });
    }).catch((err) => {
        res.status(400).render('error', {
            page_title: req._("Genie - Password Reset"),
            message: req._("The verification link you have clicked is not valid.")
        });
    }).catch(next);
});

router.post('/recovery/continue', iv.validatePOST({ token: 'string', password: 'string', 'confirm-password': 'string', code: '?string', }), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        let decoded;
        try {
            decoded = await util.promisify<string, string, jwt.VerifyOptions, any>(jwt.verify)(req.body.token, secret.getJWTSigningKey(), {
                algorithms: ['HS256'],
                audience: 'pw-recovery',
            });
        } catch(e) {
            res.status(400).render('error', {
                page_title: req._("Genie - Error"),
                message: e
            });
            return;
        }
        try {
            if (req.body['password'].length < 8 ||
                req.body['password'].length > 255)
                throw new BadRequestError(req._("You must specifiy a valid password (of at least 8 characters)"));

            if (req.body['confirm-password'] !== req.body['password'])
                throw new BadRequestError(req._("The password and the confirmation do not match"));
        } catch(e) {
            res.render('password_recovery_continue', {
                page_title: req._("Genie - Password Reset"),
                token: req.body.token,
                error: e
            });
        }

        const users = await model.getByCloudId(dbClient, decoded.sub);
        if (users.length === 0) {
            res.status(404).render('error', {
                page_title: req._("Genie - Error"),
                message: req._("The user for which you're resetting the password no longer exists.")
            });
            return;
        }

        const user = users[0];
        if (user.totp_key !== null) {
            if (!req.body.code) {
                res.status(400).render('error', {
                    page_title: req._("Almond - Error"),
                    message: req._("OTP code missing.")
                });
                return;
            }
            const rv = totp.verify(req.body.code, secret.decrypt(user.totp_key), { window: 6, time: TOTP_PERIOD });
            if (!rv) {
                res.render('password_recovery_continue', {
                    page_title: req._("Genie - Password Reset"),
                    token: req.body.token,
                    error: req._("Invalid OTP code")
                });
                return;
            }
        }

        await userUtils.resetPassword(dbClient, user, req.body.password);
        await login(req, user);
        await model.recordLogin(dbClient, user.id);

        // we have completed 2fa above
        req.session.completed2fa = true;
        res.locals.authenticated = true;
        res.locals.user = user;
        res.render('message', {
            page_title: req._("Genie - Password Reset"),
            message: req._("Your password was reset successfully.")
        });
    }).catch(next);
});


async function getProfile(req : express.Request, res : express.Response, pw_error : string|undefined, profile_error : string|undefined) {
    const phone = {
        isConfigured: false,
        qrcodeTarget: 'https://thingengine.stanford.edu/qrcode-cloud/' + req.user!.cloud_id + '/'
            + req.user!.auth_token
    };
    const desktop = {
        isConfigured: false,
    };
    let dataConsent = false;
    try {
        const engine = await EngineManager.get().getEngine(req.user!.id);

        dataConsent = await engine.getConsent();
        const [hasPhone, hasDesktop] = await Promise.all([
            engine.hasDevice('thingengine-own-phone'),
            engine.hasDevice('thingengine-own-desktop')
        ]);
        if (hasPhone)
            phone.isConfigured = true;
        if (hasDesktop)
            desktop.isConfigured = true;
    } catch(e) {
        // ignore the error if the engine is down
    }

    const [oauth_permissions, org_invitations] = await db.withClient((dbClient) => {
        return Promise.all([
            oauthModel.getAllPermissionsOfUser(dbClient, req.user!.cloud_id),
            req.user!.developer_org ? [] : organization.getInvitationsOfUser(dbClient, req.user!.id)
        ]);
    });

    res.render('user_profile', { page_title: req._("Thingpedia - User Profile"),
                                 csrfToken: req.csrfToken(),
                                 pw_error,
                                 profile_error,
                                 oauth_permissions,
                                 org_invitations,
                                 data_collection: dataConsent,
                                 phone,
                                 desktop });
}

router.get('/profile', userUtils.requireLogIn, (req, res, next) => {
    getProfile(req, res, undefined, undefined).catch(next);
});

router.post('/profile', userUtils.requireLogIn, iv.validatePOST({
    username: 'string',
    email: 'string',
    phone: '?string',
    human_name: '?string',
    locale: 'string',
    visible_organization_profile: 'boolean',
    show_human_name: 'boolean',
    show_profile_picture: 'boolean',
    data_collection: 'boolean',
}), (req, res, next) => {
    let mustRestartEngine = false;
    db.withTransaction(async (dbClient) => {
        if (!userUtils.validateUsername(req.body.username))
            req.body.username = req.user!.username;
        if (req.body['email'].indexOf('@') < 0 ||
            req.body['email'].length > 255)
            req.body.email = req.user!.email;
        if (req.body.phone)
            req.body.phone = normalizePhoneNumber(req.body.phone);

        let profile_flags = 0;
        if (req.body.visible_organization_profile)
            profile_flags |= userUtils.ProfileFlags.VISIBLE_ORGANIZATION_PROFILE;
        if (req.body.show_human_name)
            profile_flags |= userUtils.ProfileFlags.SHOW_HUMAN_NAME;
        if (req.body.show_profile_picture)
            profile_flags |= userUtils.ProfileFlags.SHOW_PROFILE_PICTURE;

        if (!i18n.get(req.body.locale, false))
            req.body.locale = req.user!.locale;

        mustRestartEngine = req.body.locale !== req.user!.locale;
        const mustSendEmail = req.body.email !== req.user!.email;

        await model.update(dbClient, req.user!.id,
                            { username: req.body.username,
                              email: req.body.email,
                              email_verified: !mustSendEmail,
                              phone: req.body.phone,
                              locale: req.body.locale,
                              human_name: req.body.human_name || '',
                              profile_flags });
        req.user!.username = req.body.username;
        req.user!.email = req.body.email;
        req.user!.human_name = req.body.human_name || '';
        req.user!.profile_flags = profile_flags;
        if (mustSendEmail)
            await sendValidationEmail(req.user!.cloud_id, req.body.username, req.body.email);

        try {
            const engine = await EngineManager.get().getEngine(req.user!.id);
            await engine.setConsent(!!req.body.data_collection);
        } catch(e) {
            // ignore if the engine is down
            console.error(`Ignored error setting user consent preference: ${e.message}`);
        }

        return getProfile(req, res, undefined,
            mustSendEmail ?
            req._("A verification email was sent to your new email address. Account functionality will be limited until you verify your new address.")
            : undefined);
    }).catch((error) => {
        return getProfile(req, res, undefined, error);
    }).then(async () => {
        // this must happen outside of the transaction, or the restarted engine will not see the new locale data
        if (mustRestartEngine)
            await EngineManager.get().restartUser(req.user!.id);
    }).catch(next);
});

router.post('/revoke-oauth2', userUtils.requireLogIn, iv.validatePOST({ client_id: 'string' }), (req, res, next) => {
    return db.withTransaction((dbClient) => {
        return oauthModel.revokePermission(dbClient, req.body.client_id, req.user!.cloud_id);
    }).then(() => {
            res.redirect(303, '/user/profile');
    }).catch(next);
});

router.post('/change-password', userUtils.requireLogIn, iv.validatePOST({ password: 'string', old_password: '?string', 'confirm-password': 'string' }), (req, res, next) => {
    Promise.resolve().then(() => {
        if (req.body['password'].length < 8 ||
            req.body['password'].length > 255)
            throw new BadRequestError(req._("You must specifiy a valid password (of at least 8 characters)"));

        if (req.body['confirm-password'] !== req.body['password'])
            throw new BadRequestError(req._("The password and the confirmation do not match"));
        const password = req.body['password'];

        let oldpassword : string|undefined;
        if (req.user!.password) {
            if (!req.body['old_password'])
                throw new BadRequestError(req._("You must specifiy your old password"));
            oldpassword = req.body['old_password'];
        }

        return db.withTransaction((dbClient) => {
            return userUtils.update(dbClient, req.user!, oldpassword, password);
        }).then(() => {
            res.redirect(303, '/user/profile');
        });
    }).catch((e) => {
        return getProfile(req, res, e, undefined);
    }).catch(next);
});

router.post('/delete', userUtils.requireLogIn, (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        await EngineManager.get().deleteUser(req.user!.id);
        await exampleModel.deleteAllLikesFromUser(dbClient, req.user!.id);
        await model.delete(dbClient, req.user!.id);
    }).then(() => {
        req.logout();
        req.session.save(() => {
            res.redirect(303, '/');
        });
    }).catch(next);
});

function sendNewOrgNotificationEmail(req : express.Request) {
    const mailOptions = {
        from: Config.EMAIL_FROM_ADMIN,
        to: Config.EMAIL_TO_ADMIN,
        subject: 'New Developer Access Requested',
        replyTo: {
            name: req.user!.human_name || req.user!.username,
            address: req.user!.email
        },
        text:
`${req.user!.username} (${req.user!.human_name} <${req.user!.email}>), working for ${req.body.company},
has created the organization ${req.body.name} in Thingpedia.

Reason:
${(req.body.reason || '').trim()}

Comments:
${(req.body.comments || '').trim()}
`
    };

    return SendMail.send(mailOptions);
}

if (Config.ENABLE_DEVELOPER_PROGRAM) {
router.get('/request-developer', userUtils.requireLogIn, (req, res, next) => {
    if (req.user!.developer_status >= userUtils.DeveloperStatus.DEVELOPER) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You are already an enrolled developer.") });
        return;
    }
    if (!req.user!.email_verified) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You must validate your email address before you can apply to be a Thingpedia developer.") });
        return;
    }

    res.render('developer_access_required',
               { page_title: req._("Thingpedia - Developer Program"),
                 title: req._("Become a Thingpedia Developer"),
                 csrfToken: req.csrfToken() });
});

router.post('/request-developer', userUtils.requireLogIn, iv.validatePOST({
    name: 'string',
    company: '?string',
    reason: '?string',
    comments: '?string',
    accept_tos: '?boolean'
}), (req, res, next) => {
    if (req.user!.developer_org !== null) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("You are already an enrolled developer.") });
        return;
    }
    for (const token of tokenize(req.body.name)) {
        if (['stanford', 'almond'].indexOf(token) >= 0) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("You cannot use the word “%s” in your organization name.").format(token) });
            return;
        }
    }
    if (req.body.accept_tos !== '1') {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("You must acknowledge that you read the Terms of Service.") });
        return;
    }

    db.withTransaction(async (dbClient) => {
        const org = await organization.create(dbClient, {
            name: req.body.name,
            comment: '',
            id_hash: makeRandom(8),
            developer_key: makeRandom(),
        });
        await userUtils.makeDeveloper(dbClient, req.user!.id, org.id);
        await model.update(dbClient, req.user!.id, {
            profile_flags: req.user!.profile_flags | userUtils.ProfileFlags.VISIBLE_ORGANIZATION_PROFILE
        });
        await sendNewOrgNotificationEmail(req);
        return org;
    }).then(async (org) => {
        await EngineManager.get().restartUser(req.user!.id);
        req.user!.developer_org = org.id;
        req.user!.developer_org_name = org.name;
        req.user!.developer_key = org.developer_key;

        res.render('developer_access_ok', { page_title: req._("Thingpedia - Developer Program") });
    }).catch(next);
});
}

router.post('/token', userUtils.requireLogIn, (req, res, next) => {
    // issue an access token for valid for one month, with all scopes
    jwt.sign({
        sub: req.user!.cloud_id,
        aud: 'oauth2',
        scope: Array.from(userUtils.OAuthScopes)
    }, secret.getJWTSigningKey(), { expiresIn: 30*24*3600 }, (err, token) => {
        if (err)
            next(err);
        else
            res.json({ result: 'ok', token });
    });
});

if (Config.DISCOURSE_SSO_SECRET && Config.DISCOURSE_SSO_REDIRECT) {
    router.get('/sso/discourse', userUtils.requireLogIn, iv.validateGET({ sso: 'string', sig: 'string' }), (req, res, next) => {
        const sso = new DiscourseSSO(Config.DISCOURSE_SSO_SECRET!);

        // FIXME the definition in @types/discourse-sso are incomplete
        const hmac : crypto.Hmac = (sso as any).getHmac();
        hmac.update(req.query.sso);
        const expectedsig = hmac.digest();
        const sigbuffer = Buffer.from(req.query.sig, 'hex');
        if (expectedsig.length !== sigbuffer.length || !crypto.timingSafeEqual(expectedsig, sigbuffer)) {
            res.status(403).render('error', {
                page_title: req._("Genie - Error"),
                message: "Invalid signature"
            });
            return;
        }

        if (!req.user!.email_verified) {
            res.status(400).render('error', {
                page_title: req._("Genie - Error"),
                message: req._("You must verify your email before accessing Genie's Discourse.")
            });
            return;
        }

        const payload = {
            nonce: sso.getNonce(req.query.sso),
            external_id: req.user!.cloud_id,
            email: req.user!.email,
            username: req.user!.username,
            name: req.user!.human_name!,
            admin: (req.user!.roles & userUtils.Role.DISCOURSE_ADMIN) === userUtils.Role.DISCOURSE_ADMIN
        };
        res.redirect(302, Config.DISCOURSE_SSO_REDIRECT + '/session/sso_login?' + sso.buildLoginString(payload));
    });
}

export default router;
