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
const AssistantDispatcher = require('./assistant/dispatcher');
const EngineManager = require('./lib/enginemanager');
const WebhookDispatcher = require('./lib/webhookdispatcher');

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
        if (_assistantdispatcher)
            return _assistantdispatcher.stop();
    }).then(function() {
        if (_enginemanager)
            return _enginemanager.stop();
    }).then(function() {
        platform.exit();
    }).done();
}

function main() {
    Q.longStackSupport = true;

    global.platform = require('./platform');

    platform.init().then(function() {
        _frontend = new Frontend();

        process.on('SIGINT', handleSignal);
        process.on('SIGTERM', handleSignal);

        // open the HTTP server
        return _frontend.open().then(function() {
            // we bound the socket, no need for root now
            dropCaps();

            new WebhookDispatcher();

            _enginemanager = new EngineManager(_frontend);
            _assistantdispatcher = new AssistantDispatcher();

            console.log('Starting EngineManager');
            return _enginemanager.start();
        }).then(function() {
            console.log('Starting AssistantDispatcher');
            return _assistantdispatcher.start();
        });
    }).done();
}

main();
