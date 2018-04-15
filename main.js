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

// FIXME we should not punch through the abstraction
require('thingengine-core/lib/polyfill');

const Q = require('q');
Q.longStackSupport = true;
process.on('unhandledRejection', (up) => { throw up; });

const Config = require('./config');
if (Config.WITH_THINGPEDIA !== 'embedded' && Config.WITH_THINGPEDIA !== 'external')
    throw new Error('Invalid configuration, WITH_THINGPEDIA must be either embeded or external');

const Frontend = require('./frontend');
const EngineManager = require('./almond/enginemanagerclient');

const platform = require('./util/platform');

function dropCaps() {
    if (process.getuid() === 0) {
        process.initgroups('thingengine', 'thingengine');
        process.setgid('thingengine');
        process.setuid('thingengine');
    }
}

var _frontend;
var _enginemanager;

function handleSignal() {
    _frontend.close().then(() => {
        _enginemanager.stop();
        process.exit();
    });
}

function main() {
    platform.init();

    _frontend = new Frontend();

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    // open the HTTP server
    return _frontend.open().then(() => {
        // we bound the socket, no need for root now
        dropCaps();

        _enginemanager = new EngineManager();
        _enginemanager.start();
    });
}
main();
