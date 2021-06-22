// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

/// <reference types="./cacheable-middleware" />

import * as argparse from 'argparse';
import express from 'express';
import expressWS from 'express-ws';
import * as http from 'http';
import * as url from 'url';
import * as path from 'path';
import morgan from 'morgan';
import favicon from 'serve-favicon';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import session from 'express-session';
import mysqlSession from 'express-mysql-session';
import csurf from 'csurf';
import passport from 'passport';
import connect_flash from 'connect-flash';
import cacheable from 'cacheable-middleware';
import xmlBodyParser from 'express-xml-bodyparser';
import Prometheus from 'prom-client';
import escapeHtml from 'escape-html';
import rateLimit from 'express-rate-limit';

import './types';
import * as passportUtil from './util/passport';
import * as secretKey from './util/secret_key';
import * as db from './util/db';
import * as I18n from './util/i18n';
import * as userUtils from './util/user';
import Metrics from './util/metrics';
import * as errorHandling from './util/error_handling';
import * as codeStorage from './util/code_storage';
import EngineManager from './almond/enginemanagerclient';

import * as Config from './config';

class Frontend {
    private _app : express.Application;
    private _sessionStore : mysqlSession.MySQLStore;
    server : http.Server;

    constructor() {
        // all environments
        this._app = express();
        this.server = http.createServer(this._app);

        // FIXME the type definitions for express-mysql-session are not correct, the expressSession module is
        // imported with "import *" which is not correct
        const MySQLStore = mysqlSession(session as any);
        this._sessionStore = new MySQLStore({
            expiration: 86400000 // 1 day, in ms
        }, db.getPool());
    }

    async init(port : number) {
        expressWS(this._app, this.server);

        this._app.set('port', port);
        this._app.set('views', path.join(path.dirname(module.filename), '../views'));
        this._app.set('view engine', 'pug');
        this._app.enable('trust proxy');

        // provide a very-early version of req._ in case something
        // early in the request stack fails and we hit the error handler,
        // or if we hit a page that is not authenticated
        this._app.use(I18n.handler);
        this._app.use((req, res, next) => {
            // Capital C so we don't conflict with other parameters
            // set by various pages
            res.locals.Config = Config;
            res.locals.Constants = {
                Role: userUtils.Role,
                DeveloperStatus: userUtils.DeveloperStatus,
                ProfileFlags: userUtils.ProfileFlags
            };
            res.locals.escapeHtml = escapeHtml;

            // the old way of doing things - eventually should be refactored
            res.locals.CDN_HOST = Config.CDN_HOST;
            res.locals.THINGPEDIA_URL = Config.THINGPEDIA_URL;
            res.locals.WITH_THINGPEDIA = Config.WITH_THINGPEDIA;
            res.locals.ENABLE_ANONYMOUS_USER = Config.ENABLE_ANONYMOUS_USER;
            next();
        });

        // work around a crash in expressWs if a WebSocket route fails with an error
        // code and express-session tries to save the session
        this._app.use((req, res, next) => {
            if ((req as any).ws) {
                const originalWriteHead = res.writeHead as any;
                res.writeHead = function(statusCode : number) : any {
                    // eslint-disable-next-line prefer-rest-params
                    originalWriteHead.apply(this, arguments);
                    // eslint-disable-next-line prefer-rest-params
                    return (http.ServerResponse.prototype.writeHead as any).apply(this, arguments);
                };
            }

            next();
        });

        // set up logging first
        this._app.use(morgan('dev'));
        if (Config.ENABLE_PROMETHEUS)
            Metrics(this._app);

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
                    req.originalUrl.startsWith('/ws'))
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
                res.set('Strict-Transport-Security', 'max-age=31536000');
                //res.set('Content-Security-Policy', `default-src 'self'; connect-src 'self' https://*.stanford.edu ; font-src 'self' https://maxcdn.bootstrapcdn.com https://fonts.googleapis.com ; img-src * ; script-src 'self' https://code.jquery.com https://maxcdn.bootstrapcdn.com 'unsafe-inline' ; style-src 'self' https://fonts.googleapis.com https://maxcdn.bootstrapcdn.com 'unsafe-inline'`);
                res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
                res.set('X-Frame-Options', 'DENY');
                res.set('X-Content-Type-Options', 'nosniff');
                next();
            });
        }

        this._app.use('/assets', (req, res, next) => {
            res.set('Access-Control-Allow-Origin', '*');
            next();
        });
        this._app.use(favicon(path.resolve(path.dirname(module.filename), '../public/images/favicon.ico')));
        this._app.use('/assets', express.static(path.resolve(path.dirname(module.filename), '../public'),
                                                { maxAge: 86400000 }));
        codeStorage.initFrontend(this._app);
        this._app.use(cacheable());
        passportUtil.initialize();

        this._app.use(bodyParser.json());
        this._app.use(bodyParser.urlencoded({ extended: true }));
        this._app.use(xmlBodyParser({ explicitArray: true, trim: false }));

        // mount the public APIs before passport.session, so cookie authentication
        // does not leak into them (which prevents cross-origin attacks because the APIs are CORS-enabled)

        // sinkholes are dummy routes used by demo devices
        this._app.get('/sinkhole', (req, res, next) => {
            res.send('');
        });
        this._app.post('/sinkhole', (req, res, next) => {
            res.send('');
        });

        this._app.use(rateLimit({
            max: 1000,
        }));

        this._app.use('/api/webhook', (await import('./routes/webhook')).default);
        this._app.use('/me/api/gassistant', (await import('./routes/bridges/gassistant')).default);
        this._app.use('/me/api', (await import('./routes/my_api')).default);

        // legacy route for /me/api/sync, uses auth tokens instead of full OAuth2
        this._app.use('/ws', (await import('./routes/thingengine_ws')).default);

        if (Config.WITH_THINGPEDIA === 'embedded')
            this._app.use('/thingpedia/api', (await import('./routes/thingpedia_api')).default);

        // now initialize cookies, session and session-based logins

        this._app.use(cookieParser(secretKey.getSecretKey()));
        this._app.use(session({ resave: false,
                                saveUninitialized: false,
                                store: this._sessionStore,
                                secret: secretKey.getSecretKey() }));
        this._app.use(connect_flash());
        this._app.use(passport.initialize());
        this._app.use(passport.session());

        // this is an authentication kludge used by the Android app
        // the app loads the index with ?app, which causes us to respond with
        // a WWW-Authenticate header, and then the app injects basic authentication
        // info (cloud id + auth token) in the browser
        // this is not great, but we must keep it until the app is updated to
        // use OAuth tokens instead
        const basicAuth = passport.authenticate('basic', { failWithError: true });
        this._app.use((req, res, next) => {
            if (req.query.auth === 'app') {
                basicAuth(req, res, (err : Error) => {
                    if (err)
                        res.status(401);
                    // eat the error

                    // skip 2fa if successful
                    if (!err && req.user)
                        req.session.completed2fa = true;

                    next();
                });
            } else {
                next();
            }
        });
        this._app.use((req, res, next) => {
            res.locals.user = req.user;
            res.locals.authenticated = userUtils.isAuthenticated(req);
            next();
        });
        this._app.use(I18n.handler);

        // initialize csurf after any route that uses file upload.
        // because file upload uses multer, which must be initialized before csurf
        // MAKE SURE ALL ROUTES HAVE CSURF
        if (Config.WITH_THINGPEDIA === 'embedded') {
            this._app.use('/thingpedia/upload', (await import('./routes/thingpedia_upload')).default);
            this._app.use('/thingpedia/entities', (await import('./routes/thingpedia_entities')).default);
            this._app.use('/thingpedia/strings', (await import('./routes/thingpedia_strings')).default);
        }
        if (Config.WITH_LUINET === 'embedded')
            this._app.use('/developers/mturk', (await import('./routes/developer_mturk')).default);
        this._app.use('/developers/oauth', (await import('./routes/developer_oauth2')).default);
        this._app.use('/admin/blog/upload', (await import('./routes/admin_upload')).default);

        this._app.use(csurf({ cookie: false }));
        this._app.use((req, res, next) => {
            res.locals.csrfToken = req.csrfToken();
            next();
        });

        this._app.use('/', (await import('./routes/about')).default);
        this._app.use('/', (await import('./routes/qrcode')).default);
        this._app.use('/blog', (await import('./routes/blog')).default);
        this._app.use('/mturk', (await import('./routes/mturk')).default);

        this._app.use('/me/ws', (await import('./routes/my_internal_api')).default);
        this._app.use('/me/api/oauth2', (await import('./routes/my_oauth2')).default);
        this._app.use('/me/devices', (await import('./routes/devices')).default);
        this._app.use('/me/status', (await import('./routes/status')).default);
        this._app.use('/me/recording', (await import('./routes/my_recording')).default);
        this._app.use('/me', (await import('./routes/my_stuff')).default);
        this._app.use('/devices', (await import('./routes/devices_compat')).default);

        this._app.use('/developers', (await import('./routes/developer_console')).default);

        if (Config.WITH_THINGPEDIA === 'embedded') {
            this._app.use('/thingpedia', (await import('./routes/thingpedia_portal')).default);
            this._app.use('/thingpedia/commands', (await import('./routes/commandpedia')).default);

            this._app.use('/thingpedia/examples', (await import('./routes/thingpedia_examples')).default);
            this._app.use('/thingpedia/devices', (await import('./routes/thingpedia_devices')).default);
            this._app.use('/thingpedia/classes', (await import('./routes/thingpedia_schemas')).default);
            this._app.use('/thingpedia/translate', (await import('./routes/thingpedia_translate')).default);
            this._app.use('/thingpedia/cheatsheet', (await import('./routes/thingpedia_cheatsheet')).default);
            this._app.use('/thingpedia/snapshots', (await import('./routes/thingpedia_snapshots')).default);
        }

        this._app.use('/profiles', (await import('./routes/thingpedia_profiles')).default);
        this._app.use('/user', (await import('./routes/user')).default);
        this._app.use('/admin', (await import('./routes/admin')).default);
        this._app.use('/admin/mturk', (await import('./routes/admin_mturk')).default);
        this._app.use('/proxy', (await import('./routes/proxy')).default);

        this._app.use((req, res) => {
            // if we get here, we have a 404 response
            res.status(404).render('error', {
                page_title: req._("Genie - Page Not Found"),
                message: req._("The requested page does not exist.")
            });
        });
        this._app.use(errorHandling.html);
    }

    open() {
        // '::' means the same as 0.0.0.0 but for IPv6
        // without it, node.js will only listen on IPv4
        return new Promise<void>((resolve, reject) => {
            this.server.listen(this._app.get('port') as number, '::', () => {
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
}

export function initArgparse(subparsers : argparse.SubParser) {
    const parser = subparsers.add_parser('run-frontend', {
        description: 'Run a Web Almond frontend'
    });
    parser.add_argument('-p', '--port', {
        required: false,
        type: Number,
        help: 'Listen on the given port',
        default: 8080
    });
}

export async function main(argv : any) {
    const frontend = new Frontend();
    await frontend.init(argv.port);
    const enginemanager = new EngineManager();
    enginemanager.start();

    if (Config.ENABLE_PROMETHEUS)
        Prometheus.collectDefaultMetrics();

    async function handleSignal() {
        await frontend.close();
        await enginemanager.stop();
        await db.tearDown();
        process.exit();
    }

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    // open the HTTP server
    frontend.open();
}
