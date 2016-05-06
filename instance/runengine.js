// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const events = require('events');
const stream = require('stream');
const rpc = require('transparent-rpc');

const Engine = require('thingengine-core');
const Assistant = require('./assistant');
const PlatformModule = require('./platform');

class ParentProcessSocket extends stream.Duplex {
    constructor() {
        super({ objectMode: true });

        process.on('message', function(message) {
            if (message.type !== 'rpc')
                return;

            this.push(message.data);
        }.bind(this));
    }

    _read() {}

    _write(data, encoding, callback) {
        process.send({ type: 'rpc', data: data }, null, callback);
    }
}

var _engines = [];
var _stopped = false;

function handleSignal() {
    _engines.forEach(function(obj) {
        console.log('Stopping engine of ' + obj.cloudId);
        if (obj.running)
            obj.engine.stop();
    });

    _stopped = true;
    if (process.connected)
        process.disconnect();

    // give ourselves 10s to die gracefully, then just exit
    setTimeout(function() {
        process.exit();
    }, 10000);
}

function runEngine(cloudId, authToken, developerKey, thingpediaClient) {
    var platform = PlatformModule.newInstance(cloudId, authToken, developerKey, thingpediaClient);
    if (!PlatformModule.shared)
        global.platform = platform;

    return platform.start().then(function() {
        var engine = new Engine(platform);
        engine.assistant = new Assistant(engine);

        var obj = { cloudId: cloudId, engine: engine, running: false };
        engine.open().then(function() {
            obj.running = true;
            engine.assistant.start().done();

            if (_stopped)
                return engine.close();
            _engines.push(obj);
            return engine.run();
        }).then(function() {
            engine.assistant.stop().done();
            return engine.close();
        }).catch(function(e) {
            console.error('Engine ' + cloudId + ' had a fatal error: ' + e.message);
            console.error(e.stack);
        }).done();

        return [engine, platform.getCapability('webhook-api')];
    });
}

function killEngine(cloudId) {
    var idx = -1;
    for (var i = 0; i < _engines.length; i++) {
        if (_engines[i].cloudId === cloudId) {
            idx = i;
            break;
        }
    }

    if (idx < 0)
        return;
    var obj = _engines[idx];
    _engines.splice(idx, 1);
    obj.engine.stop();
}

function main() {
    var shared = (process.argv[2] === '--shared');

    // for compat with platform.getOrigin()
    // (but not platform.getCapability())
    if (shared)
        global.platform = PlatformModule;

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    var socket = new ParentProcessSocket();
    var rpcSocket = new rpc.Socket(socket);
    process.on('message', function(message, socket) {
        if (message.type !== 'websocket')
            return;

        PlatformModule.dispatcher.handleWebsocket(message.cloudId, message.req, message.upgradeHead, socket);
    });

    var factory = {
        $rpcMethods: ['runEngine', 'killEngine'],

        runEngine: runEngine,
        killEngine: killEngine,
    };
    var rpcId = rpcSocket.addStub(factory);
    PlatformModule.init(shared);
    process.send({ type:'rpc-ready', id: rpcId });

    // wait 10000 seconds for a newEngine message
    setTimeout(function() {}, 10000);
}

main();
