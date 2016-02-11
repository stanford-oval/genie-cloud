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

const ThingPediaClient = require('thingpedia-client');

// FIXME we should not punch through the abstraction
const sql = require('thingengine-core/lib/db/sql');
const prefs = require('thingengine-core/lib/prefs');

const graphics = require('./graphics');

var Config;
try {
Config = require('../platform_config');
} catch(e) {
Config = {};
}

var _cloudId = null;
var _writabledir = null;
var _frontend = null;
var _prefs = null;
var _developerKey = null;

function checkLocalStateDir() {
    fs.mkdirSync(_writabledir);
}

var _unzipApi = {
    unzip: function(zipPath, dir) {
        var args = ['-uo', zipPath, '-d', dir];
        return Q.nfcall(child_process.execFile, '/usr/bin/unzip', args).then(function(zipResult) {
            var stdout = zipResult[0];
            var stderr = zipResult[1];
            console.log('stdout', stdout);
            console.log('stderr', stderr);
        });
    }
};

var _websocketHandler;

module.exports = {
    // Initialize the platform code
    // Will be called before instantiating the engine
    init: function() {
        _cloudId = process.env.CLOUD_ID;
        var authToken = process.env.AUTH_TOKEN;
        if (!_cloudId || !authToken)
            throw new Error('Must specify CLOUD_ID and AUTH_TOKEN in the environment');
        _developerKey = process.env.DEVELOPER_KEY;

        _writabledir = process.cwd();
        try {
            fs.mkdirSync(_writabledir + '/cache');
        } catch(e) {
            if (e.code != 'EEXIST')
                throw e;
        }

        _prefs = new prefs.FilePreferences(_writabledir + '/prefs.db');
        if (_prefs.get('cloud-id') === undefined)
            _prefs.set('cloud-id', _cloudId);
        if (_prefs.get('auth-token') === undefined)
            _prefs.set('auth-token', authToken);

        _websocketHandler = {
            set: function(handler) {
                this._handler = handler;
            },
            handle: function(message, socket) {
                if (this._handler)
                    this._handler(message, socket);
                else
                    socket.destroy();
            }
        };

        return sql.ensureSchema(_writabledir + '/sqlite.db',
                                'schema.sql');
    },

    type: 'cloud',

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
            return true;

        case 'thingpedia-client':
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
            return new ThingPediaClient.ClientHttp(_developerKey);

        default:
            return null;
        }
    },

    // Obtain a shared preference store
    // Preferences are simple key/value store which is shared across all apps
    // but private to this instance (tier) of the platform
    // Preferences should be normally used only by the engine code, and a persistent
    // shared store such as DataVault should be used by regular apps
    getSharedPreferences: function() {
        return _prefs;
    },

    // Get the root of the application
    // (In android, this is the virtual root of the APK)
    getRoot: function() {
        return process.cwd();
    },

    // Get a directory that is guaranteed to be writable
    // (in the private data space for Android, in /var/lib for server)
    getWritableDir: function() {
        return _writabledir;
    },

    // Get a directory good for long term caching of code
    // and metadata
    getCacheDir: function() {
        return _writabledir + '/cache';
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
        return _writabledir + '/sqlite.db';
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
        return _developerKey;
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
        return _cloudId;
    },

    // Change the auth token
    // Returns true if a change actually occurred, false if the change
    // was rejected
    setAuthToken: function(authToken) {
        var oldAuthToken = _prefs.get('auth-token');
        if (oldAuthToken !== undefined && authToken !== oldAuthToken)
            return false;
        _prefs.set('auth-token', authToken);
        return true;
    },

    // For internal use only
    _getPrivateFeature: function(name) {
        switch(name) {
        case 'websocket-handler':
            return _websocketHandler;
        default:
            throw new Error('Invalid private feature name (what are you trying to do?)');
        }
    },

};
