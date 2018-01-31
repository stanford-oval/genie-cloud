// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

/**
 * Module dependencies.
 */

const Q = require('q');

const express = require('express');
const http = require('http');
const path = require('path');
const logger = require('morgan');
const favicon = require('serve-favicon');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const csurf = require('csurf');
const errorHandler = require('errorhandler');
const url = require('url');
const passport = require('passport');
const connect_flash = require('connect-flash');
const cacheable = require('cacheable-middleware');
const xmlBodyParser = require('express-xml-bodyparser');
const acceptLanguage = require('accept-language');

const passportUtil = require('./util/passport');
const secretKey = require('./util/secret_key');
const db = require('./util/db');
const i18n = require('./util/i18n');

const Config = require('./config');

function Frontend() {
    this._init.apply(this, arguments);
}

Frontend.prototype._init = function _init() {
    // all environments
    this._app = express();

    this.server = http.createServer(this._app);
    require('express-ws')(this._app, this.server);

    this._app.set('port', process.env.PORT || 8080);
    this._app.set('views', path.join(__dirname, 'views'));
    this._app.set('view engine', 'pug');
    this._app.enable('trust proxy');
    this._app.use(favicon(__dirname + '/public/images/favicon.ico'));

    this._app.use(logger('dev'));

    if (Config.IS_PRODUCTION_THINGPEDIA) {
        this._app.use(function(req, res, next) {
            let redirect = false;
            if (req.headers['x-forwarded-proto'] === 'http')
                redirect = true;
            if (req.hostname !== 'thingpedia.stanford.edu')
                redirect = true;
            // don't redirect unless it's one of the stanford.edu hostnames
            // (it's a health-check from the load balancer)
            if (!req.hostname || !req.hostname.endsWith('.stanford.edu'))
                redirect = false;
            // don't redirect /thingpedia/api because the client code
            // doesn't cope well
            if (req.originalUrl.startsWith('/thingpedia/api'))
                redirect = false;
            if (redirect) {
                res.redirect(301, 'https://thingpedia.stanford.edu' + req.originalUrl);
                return;
            }
            next();
        });
        // security headers
        this._app.use(function(req, res, next) {
            res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            //res.set('Content-Security-Policy', `default-src 'self'; connect-src 'self' https://*.stanford.edu ; font-src 'self' https://maxcdn.bootstrapcdn.com https://fonts.googleapis.com ; img-src * ; script-src 'self' https://code.jquery.com https://maxcdn.bootstrapcdn.com 'unsafe-inline' ; style-src 'self' https://fonts.googleapis.com https://maxcdn.bootstrapcdn.com 'unsafe-inline'`);
            res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
            //res.set('X-Frame-Options', 'DENY');
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
    this._app.use(express.static(path.join(__dirname, 'public'),
                                 { maxAge: 86400000 }));
    this._app.use(cacheable());

    // development only
    if ('development' == this._app.get('env')) {
        this._app.use(errorHandler());
    }

    this._app.use(passport.initialize());
    this._app.use(passport.session());
    passportUtil.initialize();

    var basicAuth = passport.authenticate('basic', { failWithError: true });
    var omletAuth = passport.authenticate('local-omlet', { failureRedirect: '/user/login',
                                                           failureFlash: false });
    this._app.use(function(req, res, next) {
        if (req.query.auth === 'app') {
            basicAuth(req, res, function(err) {
                if (err)
                    res.status(401);
                // eat the error
                next();
            });
        } else if (req.query.auth === 'omlet') {
            omletAuth(req, res, next);
        } else
            next();
    });
    this._app.use(function(req, res, next) {
        if (req.user) {
            res.locals.authenticated = true;
            res.locals.user = req.user;
        } else {
            res.locals.authenticated = false;
            res.locals.user = { isConfigured: true };
        }
        next();
    });
    this._app.use(function(req, res, next) {
        res.locals.S3_CLOUDFRONT_HOST = Config.S3_CLOUDFRONT_HOST;
        res.locals.THINGPEDIA_URL = Config.THINGPEDIA_URL;
        res.locals.WITH_THINGPEDIA = Config.WITH_THINGPEDIA;
        next();
    });

    // i18n support
    acceptLanguage.languages(i18n.LANGS);
    this._app.use(function(req, res, next) {
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

        res.locals.gettext = req.gettext;
        res.locals._ = req._;
        res.locals.pgettext = req.pgettext;
        res.locals.ngettext = req.ngettext;
        next();
    });

    this._app.get('/sinkhole', function(req, res, next) {
        res.send('');
    });
    this._app.post('/sinkhole', function(req, res, next) {
        res.send('');
    });

    if (Config.WITH_THINGPEDIA === 'embedded') {
        // apis are CORS enabled always
        this._app.use('/thingpedia/api', function(req, res, next) {
            res.set('Access-Control-Allow-Origin', '*');
            next();
        });
    }

    // mount /api before CSRF
    // as we don't need CSRF protection for that
    this._app.use('/api/webhook', require('./routes/webhook'));
    this._app.use('/me/api/oauth2', require('./routes/oauth2'));
    this._app.use('/me/api', require('./routes/my_api'));
    this._app.use('/ws', require('./routes/thingengine_ws'));
    if (Config.WITH_THINGPEDIA === 'embedded') {
        this._app.use('/thingpedia/api', require('./routes/thingpedia_api'));
        this._app.use('/thingpedia/download', require('./routes/thingpedia_download'));
        // initialize csurf after /upload too
        // because upload uses multer, which is incompatible
        // with csurf
        // MAKE SURE ALL ROUTES HAVE CSURF IN /upload
        this._app.use('/thingpedia/upload', require('./routes/thingpedia_upload'));
        this._app.use('/thingpedia/apps', require('./routes/thingpedia_app_upload'));
    }

    this._app.use(csurf({ cookie: false }));
    this._app.use('/', require('./routes/index'));
    this._app.use('/', require('./routes/qrcode'));

    this._app.use('/me', require('./routes/my_stuff'));
    this._app.use('/me/devices', require('./routes/devices'));
    this._app.use('/me/status', require('./routes/status'));
    this._app.use('/devices', require('./routes/devices_compat'));

    if (Config.WITH_THINGPEDIA === 'embedded') {
        this._app.use('/thingpedia/examples', require('./routes/thingpedia_examples'));
        this._app.use('/thingpedia/apps', require('./routes/thingpedia_apps'));
        this._app.use('/thingpedia/training', require('./routes/train_almond'));
        this._app.use('/thingpedia/devices', require('./routes/thingpedia_devices'));
        this._app.use('/thingpedia/schemas', require('./routes/thingpedia_schemas'));
        this._app.use('/thingpedia/translate', require('./routes/thingpedia_translate'));
        this._app.use('/thingpedia/developers', require('./routes/thingpedia_doc'));
        this._app.use('/thingpedia/cheatsheet', require('./routes/thingpedia_cheatsheet'));
        this._app.use('/thingpedia/entities', require('./routes/thingpedia_entities'));
    }
    this._app.use('/user', require('./routes/user'));
    this._app.use('/admin', require('./routes/admin'));
    this._app.use('/omlet', require('./routes/omlet'));

    this._websocketEndpoints = {};
}

var server = null;

Frontend.prototype.open = function() {

    // '::' means the same as 0.0.0.0 but for IPv6
    // without it, node.js will only listen on IPv4
    return Q.ninvoke(this.server, 'listen', this._app.get('port'), '::')
        .then(function() {
            console.log('Express server listening on port ' + this._app.get('port'));
        }.bind(this));
}

Frontend.prototype.close = function() {
    // close the server asynchronously to avoid waiting on open
    // connections
    this.server.close(function(error) {
        if (error) {
            console.log('Error stopping Express server: ' + error);
            console.log(error.stack);
        } else {
            console.log('Express server stopped');
        }
    });
    this._sessionStore.close();

    return Q();
}

Frontend.prototype.getApp = function() {
    return this._app;
}

module.exports = Frontend;
