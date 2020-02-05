// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const os = require('os');

const { safeMkdirSync } = require('./fsutils');

var _writabledir = null;
var _cachedir = null;

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
