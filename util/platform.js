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

// Cloud platform

const fs = require('fs');
const os = require('os');

var _writabledir = null;
var _cachedir = null;

function safeMkdirSync(dir) {
    try {
        fs.mkdirSync(dir);
    } catch(e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
}

module.exports = {
    init() {
        const rootdir = process.env.THINGENGINE_ROOTDIR || process.cwd();
        process.env.THINGENGINE_ROOTDIR = rootdir;

        _writabledir = rootdir + '/shared';
        safeMkdirSync(_writabledir);
        _cachedir = _writabledir + '/cache';
        safeMkdirSync(_cachedir);
    },

    getWritableDir() {
        return _writabledir;
    },

    getCacheDir() {
        return _cachedir;
    },

    getTmpDir() {
        return os.tmpdir();
    }
};
