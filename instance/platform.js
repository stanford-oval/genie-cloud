// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

// Server platform

const Q = require('q');
const fs = require('fs');
const os = require('os');
const child_process = require('child_process');
const lang = require('lang');

// FIXME we should not punch through the abstraction
const sql = require('thingengine-core/lib/db/sql');
const prefs = require('thingengine-core/lib/prefs');

const graphics = require('./graphics');

var _unzipApi = {
    unzip: function(zipPath, dir) {
        var args = ['-uo', zipPath, '-d', dir];
        return Q.nfcall(child_process.execFile, '/usr/bin/unzip', args, {
            maxBuffer: 10 * 1024 * 1024 }).then(function(zipResult) {
            var stdout = zipResult[0];
            var stderr = zipResult[1];
            console.log('stdout', stdout);
            console.log('stderr', stderr);
        });
    }
};

const FrontendDispatcher = new lang.Class({
    Name: 'FrontendDispatcher',
    $rpcMethods: ['handleCallback'],

    _init: function() {
        this._webhooks = {};
        this._websockets = {};
    },

    addCloudId: function(cloudId, webhook, websocket) {
        this._webhooks[cloudId] = webhook;
        this._websockets[cloudId] = websocket;
    },

    handleCallback: function(cloudId, id, method, query, headers, payload) {
        this._webhooks[cloudId].handleCallback(id, method, query, headers, payload);
    },

    handleWebsocket: function(cloudId, req, upgradeHead, socket) {
        this._websockets[cloudId].handle(req, upgradeHead, socket);
    }
});

const WebhookApi = new lang.Class({
    Name: 'WebhookApi',

    _init: function(cloudId) {
        this._hooks = {};
        this._cloudId = cloudId;
    },

    handleCallback: function(id, method, query, headers, payload) {
        return Q.try(function() {
            if (id in this._hooks)
                return this._hooks[id](method, query, headers, payload);
            else
                console.log('Ignored webhook callback with ID ' + id);
        }.bind(this)).catch(function(e) {
            console.error(e.stack);
            throw e;
        });
    },

    getWebhookBase: function() {
        return module.exports.getOrigin() + '/api/webhook/' + this._cloudId;
    },

    registerWebhook: function(id, callback) {
        if (id in this._hooks)
            throw new Error('Duplicate webhook ' + id + ' registered');

        this._hooks[id] = callback;
    },

    unregisterWebhook: function(id) {
        delete this._hooks[id];
    }
});

const WebsocketApi = new lang.Class({
    Name: 'WebsocketApi',

    _init: function() {
        this._handler = null;
    },

    setHandler: function(handler) {
        this._handler = handler;
    },

    handle: function(req, upgradeHead, socket) {
        this._handler(req, upgradeHead, socket);
    }
});

const Platform = new lang.Class({
    Name: 'Platform',
    type: 'cloud',

    _init: function(cloudId, authToken, developerKey, thingpediaClient) {
        this._cloudId = cloudId;
        this._authToken = authToken;
        this._developerKey = developerKey;
        this._thingpediaClient = thingpediaClient;

        this._writabledir = _shared ? (process.cwd() + '/' + cloudId) : process.cwd();
        try {
            fs.mkdirSync(this._writabledir + '/cache');
        } catch(e) {
            if (e.code != 'EEXIST')
                throw e;
        }
        this._prefs = new prefs.FilePreferences(this._writabledir + '/prefs.db');
        if (this._prefs.get('cloud-id') === undefined)
            this._prefs.set('cloud-id', cloudId);
        if (this._prefs.get('auth-token') === undefined)
            this._prefs.set('auth-token', authToken);

        this._websocketApi = new WebsocketApi();
        this._webhookApi = new WebhookApi();
    },

    start: function() {
        return sql.ensureSchema(this._writabledir + '/sqlite.db',
                                'schema.sql');
    },

    // Obtain a shared preference store
    // Preferences are simple key/value store which is shared across all apps
    // but private to this instance (tier) of the platform
    // Preferences should be normally used only by the engine code, and a persistent
    // shared store such as DataVault should be used by regular apps
    getSharedPreferences: function() {
        return this._prefs;
    },

    getCloudId: function() {
        return this._cloudId;
    },

    // Check if this platform has the required capability
    // (eg. long running, big storage, reliable connectivity, server
    // connectivity, stable IP, local device discovery, bluetooth, etc.)
    //
    // Which capabilities are available affects which apps are allowed to run
    hasCapability: function(cap) {
        switch(cap) {
        case 'code-download':
            // If downloading code from the thingpedia server is allowed on
            // this platform
            return true;

        case 'assistant':
            // If we can create a full AssistantManager (because the platform
            // will back with a Sabrina account)
            return true;

        case 'graphics-api':
        case 'thingpedia-client':
        case 'webhook-api':
        case 'websocket-api':
            return true;

        default:
            return false;
        }
    },

    // Retrieve an interface to an optional functionality provided by the
    // platform
    //
    // This will return null if hasCapability(cap) is false
    getCapability: function(cap) {
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

        default:
            return null;
        }
    },

    // Get the root of the application
    // (In android, this is the virtual root of the APK)
    getRoot: function() {
        return process.cwd();
    },

    // Get a directory that is guaranteed to be writable
    // (in the private data space for Android, in the current directory for server)
    getWritableDir: function() {
        return this._writabledir;
    },

    // Get a directory good for long term caching of code
    // and metadata
    getCacheDir: function() {
        return this._writabledir + '/cache';
    },

    // Make a symlink potentially to a file that does not exist physically
    makeVirtualSymlink: function(file, link) {
        fs.symlinkSync(file, link);
    },

    // Get a temporary directory
    // Also guaranteed to be writable, but not guaranteed
    // to persist across reboots or for long times
    // (ie, it could be periodically cleaned by the system)
    getTmpDir: function() {
        return os.tmpdir();
    },

    // Get the filename of the sqlite database
    getSqliteDB: function() {
        return this._writabledir + '/sqlite.db';
    },

    // Stop the main loop and exit
    // (In Android, this only stops the node.js thread)
    // This function should be called by the platform integration
    // code, after stopping the engine
    exit: function() {
        return process.exit();
    },

    // Get the ThingPedia developer key, if one is configured
    getDeveloperKey: function() {
        return this._developerKey;
    },

    // Change the ThingPedia developer key, if possible
    // Returns true if the change actually happened
    setDeveloperKey: function() {
        return false;
    },

    // Return a server/port URL that can be used to refer to this
    // installation. This is primarily used for OAuth redirects, and
    // so must match what the upstream services accept.
    getOrigin: function() {
        // Xor these comments for testing
        //return 'http://127.0.0.1:8080';
        return 'https://thingengine.stanford.edu';
    },

    getCloudId: function() {
        return this._cloudId;
    },

    // Change the auth token
    // Returns true if a change actually occurred, false if the change
    // was rejected
    setAuthToken: function(authToken) {
        var oldAuthToken = this._prefs.get('auth-token');
        if (oldAuthToken !== undefined && authToken !== oldAuthToken)
            return false;
        this._prefs.set('auth-token', authToken);
        return true;
    }
});

var _shared;

module.exports = {
    // Initialize the platform code
    // Will be called before instantiating the engine
    init: function(shared) {
        _shared = shared;
    },

    get shared() {
        return _shared;
    },

    dispatcher: new FrontendDispatcher(),

    newInstance: function(cloudId, authToken, developerKey, thingpediaClient) {
        return new Platform(cloudId, authToken, developerKey, thingpediaClient);
    },

    // for compat with existing code that does platform.getOrigin()
    getOrigin: function() {
        // Xor these comments for testing
        //return 'http://127.0.0.1:8080';
        return 'https://thingengine.stanford.edu';
    },

    // Check if this platform has the required capability
    // This is only about caps that don't consider the current context
    // for compat with existing code
    hasCapability: function(cap) {
        switch(cap) {
        case 'code-download':
        case 'graphics-api':
            return true;

        default:
            return false;
        }
    },

    // Check if this platform has the required capability
    // This is only about caps that don't consider the current context
    // for compat with existing code
    getCapability: function(cap) {
        switch(cap) {
        case 'code-download':
            return _unzipApi;
        case 'graphics-api':
            return graphics;
        default:
            return null;
        }
    },
};
