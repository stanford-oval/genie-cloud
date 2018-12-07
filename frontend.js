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

/**
 * Module dependencies.
 */

const express = require('express');
const http = require('http');
const url = require('url');
const path = require('path');
const logger = require('morgan');
const favicon = require('serve-favicon');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const csurf = require('csurf');
const errorHandler = require('errorhandler');
const passport = require('passport');
const connect_flash = require('connect-flash');
const cacheable = require('cacheable-middleware');
const xmlBodyParser = require('express-xml-bodyparser');
const acceptLanguage = require('accept-language');

const passportUtil = require('./util/passport');
const secretKey = require('./util/secret_key');
const db = require('./util/db');
const i18n = require('./util/i18n');
const userUtils = require('./util/user');

const Config = require('./config');

module.exports = class Frontend {
    constructor() {
        // all environments
        this._app = express();

        this.server = http.createServer(this._app);
        require('express-ws')(this._app, this.server);

        this._app.set('port', process.env.PORT || 8080);
        this._app.set('views', path.join(__dirname, 'views'));
        this._app.set('view engine', 'pug');
        this._app.enable('trust proxy');

        // work around a crash in expressWs if a WebSocket route fails with an error
        // code and express-session tries to save the session
        this._app.use((req, res, next) => {
            if (req.ws) {
                const originalWriteHead = res.writeHead;
                res.writeHead = function(statusCode) {
                    originalWriteHead.apply(this, arguments);
                    http.ServerResponse.prototype.writeHead.apply(this, arguments);
                };
            }

            next();
        });

        this._app.use(favicon(__dirname + '/public/images/favicon.ico'));

        this._app.use(logger('dev'));


        const IS_ALMOND_WEBSITE = Config.SERVER_ORIGIN === 'https://almond.stanford.edu';

        const SERVER_NAME = url.parse(Config.SERVER_ORIGIN).hostname;
        if (Config.ENABLE_REDIRECT) {
            this._app.use((req, res, next) => {
                let redirect = false;
                if (req.headers['x-forwarded-proto'] === 'http')
                    redirect = true;
                // don't redirect if there is no hostname
                // (it's a health-check from the load balancer)
                if (req.hostname && req.hostname !== SERVER_NAME)
                    redirect = true;
                if (IS_ALMOND_WEBSITE && (!req.hostname || (!req.hostname.endsWith('.stanford.edu') && req.hostname !== 'www.thingpedia.org')))
                    redirect = false;
                // don't redirect certain API endpoints because the client code
                // doesn't cope well
                if (req.originalUrl.startsWith('/thingpedia/api') ||
                    req.originalUrl.startsWith('/thingpedia/download') ||
                    req.originalUrl.startsWith('/api/webhook') ||
                    req.originalUrl.startsWith('/ws') ||
                    req.originalUrl.startsWith('/cache'))
                    redirect = false;
                if (redirect) {
                    if (req.hostname === 'thingpedia.stanford.edu' && req.originalUrl === '/')
                        res.redirect(301, Config.SERVER_ORIGIN + '/thingpedia');
                    else
                        res.redirect(301, Config.SERVER_ORIGIN + req.originalUrl);
                    return;
                }
                next();
            });
        }
        if (Config.ENABLE_SECURITY_HEADERS) {
            // security headers
            this._app.use((req, res, next) => {
                res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
                //res.set('Content-Security-Policy', `default-src 'self'; connect-src 'self' https://*.stanford.edu ; font-src 'self' https://maxcdn.bootstrapcdn.com https://fonts.googleapis.com ; img-src * ; script-src 'self' https://code.jquery.com https://maxcdn.bootstrapcdn.com 'unsafe-inline' ; style-src 'self' https://fonts.googleapis.com https://maxcdn.bootstrapcdn.com 'unsafe-inline'`);
                res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
                res.set('X-Frame-Options', 'DENY');
                res.set('X-Content-Type-Options', 'nosniff');
                next();
            });
        }

        this._app.use(bodyParser.json());
        this._app.use(bodyParser.urlencoded({ extended: true }));
        this._app.use(xmlBodyParser({ explicitArray: true, trim: false }));
        this._app.use(cookieParser());

        this._sessionStore = new MySQLStore({}, db.getPool());
        this._app.use(session({ resave: false,
                                saveUninitialized: false,
                                store: this._sessionStore,
                                secret: secretKey.getSecretKey(this._app) }));
        this._app.use(connect_flash());

        this._app.use('/brassau/backgrounds', (req, res, next) => {
            res.set('Access-Control-Allow-Origin', '*');
            next();
        });
        this._app.use('/friendhub/backgrounds', (req, res, next) => {
            res.set('Access-Control-Allow-Origin', '*');
            next();
        });
        this._app.use('/friendhub/search', (req, res, next) => {
            res.set('Access-Control-Allow-Origin', '*');
            next();
        });
        this._app.use('/cache', (req, res, next) => {
            res.set('Access-Control-Allow-Origin', '*');
            next();
        });
        this._app.use(express.static(path.join(__dirname, 'public'),
                                     { maxAge: 86400000 }));
        this._app.use(cacheable());

        // development only
        if ('development' === this._app.get('env'))
            this._app.use(errorHandler());

        this._app.use(passport.initialize());
        this._app.use(passport.session());
        passportUtil.initialize();

        var basicAuth = passport.authenticate('basic', { failWithError: true });
        this._app.use((req, res, next) => {
            if (req.query.auth === 'app') {
                basicAuth(req, res, (err) => {
                    if (err)
                        res.status(401);
                    // eat the error
                    next();
                });
            } else {
                next();
            }
        });
        this._app.use((req, res, next) => {
            if (req.user) {
                res.locals.authenticated = true;
                res.locals.user = req.user;
            } else {
                res.locals.authenticated = false;
                res.locals.user = { isConfigured: true };
            }
            next();
        });
        this._app.use((req, res, next) => {
            // Capital C so we don't conflict with other parameters
            // set by various pages
            res.locals.Config = Config;
            res.locals.Constants = {
                Role: userUtils.Role,
                DeveloperStatus: userUtils.DeveloperStatus,
                ProfileFlags: userUtils.ProfileFlags
            };

            // the old way of doing things - eventually should be refactored
            res.locals.CDN_HOST = Config.CDN_HOST;
            res.locals.THINGPEDIA_URL = Config.THINGPEDIA_URL;
            res.locals.WITH_THINGPEDIA = Config.WITH_THINGPEDIA;
            res.locals.ENABLE_ANONYMOUS_USER = Config.ENABLE_ANONYMOUS_USER;
            next();
        });

        // i18n support
        acceptLanguage.languages(i18n.LANGS);
        this._app.use((req, res, next) => {
            let locale = req.session.locale;
            if (!locale && req.user)
                locale = req.user.locale;
            if (!locale && req.headers['accept-language'])
                locale = acceptLanguage.get(req.headers['accept-language']);
            if (!locale)
                locale = 'en-US';
            let lang = i18n.get(locale);

            req.locale = locale;
            req.gettext = lang.gettext.bind(lang);
            req._ = req.gettext;
            req.pgettext = lang.pgettext.bind(lang);
            req.ngettext = lang.ngettext.bind(lang);

            res.locals.locale = locale;
            res.locals.gettext = req.gettext;
            res.locals._ = req._;
            res.locals.pgettext = req.pgettext;
            res.locals.ngettext = req.ngettext;

            res.locals.timezone = req.user ? req.user.timezone : 'America/Los_Angeles';
            next();
        });

        this._app.get('/sinkhole', (req, res, next) => {
            res.send('');
        });
        this._app.post('/sinkhole', (req, res, next) => {
            res.send('');
        });

        if (Config.WITH_THINGPEDIA === 'embedded') {
            // apis are CORS enabled always
            this._app.use('/thingpedia/api', (req, res, next) => {
                res.set('Access-Control-Allow-Origin', '*');
                next();
            });
        }

        // mount /api before CSRF
        // as we don't need CSRF protection for that
        this._app.use('/api/webhook', require('./routes/webhook'));
        this._app.use('/me/api/oauth2', require('./routes/oauth2'));
        this._app.use('/me/api/alexa', require('./routes/alexa'));
        this._app.use('/me/api/gassistant', require('./routes/gassistant'));
        this._app.use('/me/api', require('./routes/my_api'));
        this._app.use('/ws', require('./routes/thingengine_ws'));
        if (Config.WITH_THINGPEDIA === 'embedded') {
            this._app.use('/thingpedia/api', require('./routes/thingpedia_api'));
            this._app.use('/thingpedia/download', require('./routes/thingpedia_download'));

            // initialize csurf after /upload and /entities too
            // because upload uses multer, which is incompatible
            // with csurf
            // MAKE SURE ALL ROUTES HAVE CSURF IN /upload
            this._app.use('/thingpedia/upload', require('./routes/thingpedia_upload'));
            this._app.use('/thingpedia/entities', require('./routes/thingpedia_entities'));
            this._app.use('/thingpedia/strings', require('./routes/thingpedia_strings'));
        }

        // MAKE SURE ALL ROUTES HAVE CSURF IN /upload
        this._app.use('/mturk', require('./routes/mturk'));
        this._app.use('/friendhub', require('./routes/friendhub'));
        this._app.use('/admin', require('./routes/admin_upload'));

        this._app.use(csurf({ cookie: false }));
        this._app.use((req, res, next) => {
            res.locals.csrfToken = req.csrfToken();
            next();
        });

        this._app.use('/', require('./routes/about'));
        this._app.use('/', require('./routes/qrcode'));
        this._app.use('/doc', (req, res) => {
            res.redirect(301, req.originalUrl.replace('/doc', '/thingpedia/developers'));
        });
        this._app.use('/blog', require('./routes/blog'));

        this._app.use('/me', require('./routes/my_stuff'));
        this._app.use('/me/devices', require('./routes/devices'));
        this._app.use('/me/status', require('./routes/status'));
        this._app.use('/devices', require('./routes/devices_compat'));

        if (Config.WITH_THINGPEDIA === 'embedded') {
            this._app.use('/thingpedia', require('./routes/thingpedia_portal'));
            this._app.use('/thingpedia/commands', require('./routes/commandpedia'));

            this._app.use('/thingpedia/examples', require('./routes/thingpedia_examples'));
            this._app.use('/thingpedia/devices', require('./routes/thingpedia_devices'));
            this._app.use('/thingpedia/classes', require('./routes/thingpedia_schemas'));
            this._app.use('/thingpedia/translate', require('./routes/thingpedia_translate'));
            this._app.use('/thingpedia/cheatsheet', require('./routes/thingpedia_cheatsheet'));
            this._app.use('/thingpedia/datasets', require('./routes/thingpedia_dataset'));
            this._app.use('/thingpedia/snapshots', require('./routes/thingpedia_snapshots'));
            this._app.use('/thingpedia/developers', require('./routes/thingpedia_developer_console'));
        }

        this._app.use('/profiles', require('./routes/thingpedia_profiles'));
        this._app.use('/user', require('./routes/user'));
        this._app.use('/admin', require('./routes/admin'));

        this._app.use((req, res) => {
            // if we get here, we have a 404 response
            res.status(404).render('error', {
                page_title: req._("Almond - Page Not Found"),
                message: req._("The requested page does not exist")
            });
        });

        this._app.use((err, req, res, next) => {
            if (err.code === 'EBADCSRFTOKEN') {
                res.status(403).render('error', {
                    page_title: req._("Almond - Forbidden"),
                    message: err,

                    // make sure we have a csrf token in the page
                    // (this error could be raised before we hit the general code that sets it
                    // everywhere)
                    csrfToken: req.csrfToken()
                });
            } else if (err.errno === 'ENOENT') {
                // if we get here, we have a 404 response
                res.status(404).render('error', {
                    page_title: req._("Almond - Page Not Found"),
                    message: req._("The requested page does not exist")
                });
            } else {
                console.error(err);
                res.status(500).render('error', {
                    page_title: req._("Almond - Internal Server Error"),
                    message: err
                });
            }
        });

        this._websocketEndpoints = {};
    }

    open() {
        // '::' means the same as 0.0.0.0 but for IPv6
        // without it, node.js will only listen on IPv4
        return new Promise((resolve, reject) => {
            this.server.listen(this._app.get('port'), '::', (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        }).then(() => {
            console.log('Express server listening on port ' + this._app.get('port'));
        });
    }

    close() {
        // close the server asynchronously to avoid waiting on open
        // connections
        this.server.close((error) => {
            if (error) {
                console.log('Error stopping Express server: ' + error);
                console.log(error.stack);
            } else {
                console.log('Express server stopped');
            }
        });
        this._sessionStore.close();
        return Promise.resolve();
    }
};
