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

// FIXME we should not punch through the abstraction
const prefs = require('thingengine-core/lib/util/prefs');

const graphics = require('./instance/graphics');

var _writabledir = null;
var _cachedir = null;
var _prefs = null;

function safeMkdirSync(dir) {
    try {
        fs.mkdirSync(dir);
    } catch(e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
}

// Most of this code is compat code to run engine modules from the main cloud process
// and so it is stubbed out. But this also helps with relocation and dynamic paths
// Look in instance/platform.js for the actual cloud platform code
module.exports = {
    // Initialize the platform code
    init: function() {
        _writabledir = process.cwd() + '/shared';
        safeMkdirSync(_writabledir);
        _cachedir = _writabledir + '/cache';
        safeMkdirSync(_cachedir);

        _prefs = new prefs.FilePreferences(_writabledir + '/prefs.db');
        return Q();
    },

    type: 'cloud',

    hasCapability: function(cap) {
        switch(cap) {
        case 'graphics-api':
            return true;

        default:
            return false;
        }
    },

    getCapability: function(cap) {
        switch(cap) {
        case 'graphics-api':
            return graphics;

        default:
            return null;
        }
    },

    getSharedPreferences: function() {
        return _prefs;
    },

    getRoot: function() {
        return process.cwd();
    },

    getWritableDir: function() {
        return _writabledir;
    },

    getCacheDir: function() {
        return _cachedir;
    },

    makeVirtualSymlink: function(file, link) {
        fs.symlinkSync(file, link);
    },

    getTmpDir: function() {
        return os.tmpdir();
    },

    getSqliteDB: function() {
        return null;
    },

    exit: function() {
        return process.exit();
    },

    // Return a server/port URL that can be used to refer to this
    // installation. This is primarily used for OAuth redirects, and
    // so must match what the upstream services accept.
    getOrigin: function() {
        // Xor these comments for testing
        //return 'http://127.0.0.1:8080';
        return 'https://thingengine.stanford.edu';
    },

    setAuthToken: function(authToken) {
        throw new Error();
    }
};
