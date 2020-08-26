// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

// Cloud platform

const fs = require('fs');
const util = require('util');
const os = require('os');
const events = require('events');
const child_process = require('child_process');
const smtlib = require('smtlib');
const smtsolver = smtlib.LocalCVC4Solver;
const Tp = require('thingpedia');

const graphics = require('./graphics');
const i18n = require('../util/i18n');

var _unzipApi = {
    unzip(zipPath, dir) {
        var args = ['-uo', zipPath, '-d', dir];
        return util.promisify(child_process.execFile)('/usr/bin/unzip', args, {
            maxBuffer: 10 * 1024 * 1024 }).then(({ stdout, stderr }) => {
            console.log('stdout', stdout);
            console.log('stderr', stderr);
        });
    }
};

class WebhookApi {
    constructor(userId) {
        this._hooks = {};
        this._userId = userId;
    }

    handleCallback(id, method, query, headers, payload) {
        return Promise.resolve().then(() => {
            if (id in this._hooks)
                return this._hooks[id](method, query, headers, payload);
            else
                console.log('Ignored webhook callback with ID ' + id);
            return Promise.resolve();
        }).catch((e) => {
            console.error(e.stack);
            throw e;
        });
    }

    getWebhookBase() {
        return module.exports.getOrigin() + '/api/webhook/' + this._userId;
    }

    registerWebhook(id, callback) {
        if (id in this._hooks)
            throw new Error('Duplicate webhook ' + id + ' registered');

        this._hooks[id] = callback;
    }

    unregisterWebhook(id) {
        delete this._hooks[id];
    }
}
WebhookApi.prototype.$rpcMethods = ['handleCallback'];


class WebSocketWrapper extends events.EventEmitter {
    constructor(delegate) {
        super();

        this._delegate = delegate;
    }

    ping() {
        this._delegate.ping();
    }

    pong() {
        this._delegate.pong();
    }

    terminate() {
        this._delegate.terminate();
    }

    send(data) {
        this._delegate.send(data);
    }

    onPing() {
        this.emit('ping');
    }

    onPong() {
        this.emit('pong');
    }

    onMessage(data) {
        this.emit('message', data);
    }

    onClose() {
        this.emit('close');
    }
}
WebSocketWrapper.prototype.$rpcMethods = ['onPing', 'onPong', 'onMessage', 'onClose'];

class WebSocketApi extends events.EventEmitter {
    constructor() {
        super();
    }

    newConnection(delegate) {
        var wrapper = new WebSocketWrapper(delegate);
        this.emit('connection', wrapper);
        wrapper.on('close', () => {
            delegate.$free();
            wrapper.$free();
        });
        return wrapper;
    }
}
WebSocketApi.prototype.$rpcMethods = ['newConnection'];

class Platform extends Tp.BasePlatform {
    constructor(thingpediaClient, options) {
        super();
        this._cloudId = options.cloudId;
        this._authToken = options.authToken;
        this._developerKey = options.developerKey;
        this._thingpediaClient = thingpediaClient;
        this._locale = options.locale;
        this._timezone = options.timezone;
        this._sqliteKey = options.storageKey;

        this._gettext = i18n.get(this._locale);

        this._writabledir = _shared ? (process.cwd() + '/' + options.cloudId) : process.cwd();
        try {
            fs.mkdirSync(this._writabledir + '/cache');
        } catch(e) {
            if (e.code !== 'EEXIST')
                throw e;
        }
        this._prefs = new Tp.Helpers.FilePreferences(this._writabledir + '/prefs.db');

        this._webhookApi = new WebhookApi(this._cloudId);
        this._websocketApi = new WebSocketApi();
    }

    get type() {
        return 'cloud';
    }

    get locale() {
        return this._locale;
    }

    get timezone() {
        return this._timezone;
    }

    // Return the platform device for this platform, accessing platform-specific
    // functionality from natural language.
    //
    // Cloud has no platform device.
    getPlatformDevice() {
        return null;
    }

    // Obtain a shared preference store
    // Preferences are simple key/value store which is shared across all apps
    // but private to this instance (tier) of the platform
    // Preferences should be normally used only by the engine code, and a persistent
    // shared store such as DataVault should be used by regular apps
    getSharedPreferences() {
        return this._prefs;
    }

    // Check if we need to load and run the given thingengine-module on
    // this platform
    // (eg we don't need discovery on the cloud, and we don't need graphdb,
    // messaging or the apps on the phone client)
    hasFeature(feature) {
        switch(feature) {
        case 'discovery':
            return false;

        case 'permissions':
            return smtsolver !== null;

        default:
            return true;
        }
    }

    // Check if this platform has the required capability
    // (eg. long running, big storage, reliable connectivity, server
    // connectivity, stable IP, local device discovery, bluetooth, etc.)
    //
    // Which capabilities are available affects which apps are allowed to run
    hasCapability(cap) {
        switch(cap) {
        case 'code-download':
            // If downloading code from the thingpedia server is allowed on
            // this platform
            return true;

        case 'thingpedia-client':
            return module.exports.thingpediaUrl === '/thingpedia';

        case 'graphics-api':
        case 'webhook-api':
        case 'websocket-api':
            return true;

        case 'gettext':
            return true;

        case 'smt-solver':
            return smtsolver !== null;

        default:
            return false;
        }
    }

    // Retrieve an interface to an optional functionality provided by the
    // platform
    //
    // This will return null if hasCapability(cap) is false
    getCapability(cap) {
        switch(cap) {
        case 'code-download':
            // We have the support to download code
            return _unzipApi;

        case 'graphics-api':
            return graphics;

        case 'thingpedia-client':
            return this._thingpediaClient;

        case 'webhook-api':
            return this._webhookApi;

        case 'websocket-api':
            return this._websocketApi;

        case 'gettext':
            return this._gettext;

        case 'smt-solver':
            return smtsolver;

        default:
            return null;
        }
    }

    // Get the root of the application
    // (In android, this is the virtual root of the APK)
    getRoot() {
        return process.cwd();
    }

    // Get a directory that is guaranteed to be writable
    // (in the private data space for Android, in the current directory for server)
    getWritableDir() {
        return this._writabledir;
    }

    // Get a directory good for long term caching of code
    // and metadata
    getCacheDir() {
        return this._writabledir + '/cache';
    }

    // Make a symlink potentially to a file that does not exist physically
    makeVirtualSymlink(file, link) {
        fs.symlinkSync(file, link);
    }

    // Get a temporary directory
    // Also guaranteed to be writable, but not guaranteed
    // to persist across reboots or for long times
    // (ie, it could be periodically cleaned by the system)
    getTmpDir() {
        return os.tmpdir();
    }

    // Get the filename of the sqlite database
    getSqliteDB() {
        return this._writabledir + '/sqlite.db';
    }

    // Get the encryption key of the sqlite database
    getSqliteKey() {
        return this._sqliteKey;
    }

    // Get the Thingpedia developer key, if one is configured
    getDeveloperKey() {
        return this._developerKey;
    }

    // Change the Thingpedia developer key, if possible
    // Returns true if the change actually happened
    setDeveloperKey() {
        return false;
    }

    // Return a server/port URL that can be used to refer to this
    // installation. This is primarily used for OAuth redirects, and
    // so must match what the upstream services accept.
    getOrigin() {
        return module.exports.getOrigin();
    }

    getCloudId() {
        return this._cloudId;
    }

    getAuthToken() {
        return this._authToken;
    }

    // Change the auth token
    // Returns true if a change actually occurred, false if the change
    // was rejected
    setAuthToken(authToken) {
        // the auth token is stored outside in the mysql db, we can never
        // change it
        return false;
    }
}

var _shared;

module.exports = {
    // Initialize the platform code
    // Will be called before instantiating the engine
    init(options) {
        _shared = options.shared;
        this._thingpediaUrl = options.thingpedia_url;
        this._nlServerUrl = options.nl_server_url;
        this._cdnHost = options.cdn_host;
        this._oauthRedirectOrigin = options.oauth_redirect_origin;
    },

    get thingpediaUrl() {
        return this._thingpediaUrl;
    },
    get nlServerUrl() {
        return this._nlServerUrl;
    },
    get cdnHost() {
        return this._cdnHost;
    },

    get shared() {
        return _shared;
    },

    newInstance(thingpediaClient, options) {
        return new Platform(thingpediaClient, options);
    },

    // for compat with existing code that does platform.getOrigin()
    getOrigin() {
        return this._oauthRedirectOrigin;
    },

    // Check if this platform has the required capability
    // This is only for compat with existing code
    hasCapability(cap) {
        switch(cap) {
        case 'graphics-api':
            return true;
        default:
            return false;
        }
    },

    // Check if this platform has the required capability
    // This is only about caps that don't consider the current context
    // for compat with existing code
    getCapability(cap) {
        switch(cap) {
        case 'graphics-api':
            return graphics;
        default:
            return null;
        }
    },

    // Stop the main loop and exit
    // (In Android, this only stops the node.js thread)
    // This function should be called by the platform integration
    // code, after stopping the engine
    exit() {
        return process.exit();
    },
};
