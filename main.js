// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

// FIXME we should not punch through the abstraction
require('thingengine-core/lib/polyfill');

const Q = require('q');

const Frontend = require('./frontend');
const EngineManager = require('./almond/enginemanagerclient');

function dropCaps() {
    if (process.getuid() == 0) {
        process.initgroups('thingengine', 'thingengine');
        process.setgid('thingengine');
        process.setuid('thingengine');
    }
}

var _frontend;
var _assistantdispatcher;
var _enginemanager;

function handleSignal() {
    _frontend.close().then(function() {
        platform.exit();
    }).done();
}

function main() {
    global.platform = require('./platform');
    platform.init();

    _frontend = new Frontend();

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    // open the HTTP server
    return _frontend.open().then(function() {
        // we bound the socket, no need for root now
        dropCaps();

        _enginemanager = new EngineManager();
        _enginemanager.start();
    });
}
main();
