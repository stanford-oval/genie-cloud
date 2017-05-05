// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;
const events = require('events');
const stream = require('stream');
const rpc = require('transparent-rpc');

const Engine = require('thingengine-core');
const PlatformModule = require('./platform');
const JsonDatagramSocket = require('./json_datagram_socket');

class ParentProcessSocket extends stream.Duplex {
    constructor() {
        super({ objectMode: true });
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

function runEngine(thingpediaClient, options) {
    var platform = PlatformModule.newInstance(thingpediaClient, options);
    if (!PlatformModule.shared)
        global.platform = platform;

    return platform.start().then(function() {
        var engine = new Engine(platform);
        platform.createAssistant(engine);

        var obj = { userId: options.userId, cloudId: options.cloudId, engine: engine, running: false };
        engine.open().then(function() {
            obj.running = true;

            if (_stopped)
                return engine.close();
            _engines.push(obj);
            return engine.run();
        }).then(function() {
            return engine.close();
        }).catch(function(e) {
            console.error('Engine ' + options.cloudId + ' had a fatal error: ' + e.message);
            console.error(e.stack);
        }).done();
    });
}

function killEngine(userId) {
    var idx = -1;
    for (var i = 0; i < _engines.length; i++) {
        if (_engines[i].userId === userId) {
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

function handleDirectSocket(userId, replyId, socket) {
    console.log('Handling direct connection for ' + userId);

    var rpcSocket = new rpc.Socket(new JsonDatagramSocket(socket, socket, 'utf8'));
    rpcSocket.on('error', (e) => {
        console.log('Error on direct RPC socket: ' + e.message);
    });

    for (var i = 0; i < _engines.length; i++) {
        if (_engines[i].userId === userId) {
            var obj = _engines[i];
            var platform = obj.engine.platform;
            rpcSocket.call(replyId, 'ready', [obj.engine,
                platform.getCapability('websocket-api'),
                platform.getCapability('webhook-api'),
                platform.getCapability('assistant')]);
            return;
        }
    }

    console.log('Could not find an engine with the required user ID');
    rpcSocket.end();
}

function main() {
    var shared = (process.argv[2] === '--shared');

    // for compat with platform.getOrigin()
    // (but not platform.getCapability())
    if (shared)
        global.platform = PlatformModule;

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    var rpcWrapped = new ParentProcessSocket();
    var rpcSocket = new rpc.Socket(rpcWrapped);
    process.on('message', function(message, socket) {
        switch (message.type) {
            case 'direct':
                handleDirectSocket(message.target, message.replyId, socket);
                break;
            case 'rpc':
                rpcWrapped.push(message.data);
                break;
        }
    });

    var factory = {
        $rpcMethods: ['runEngine', 'killEngine'],

        runEngine: runEngine,
        killEngine: killEngine,
    };
    var rpcId = rpcSocket.addStub(factory);
    PlatformModule.init(shared);
    process.send({ type: 'ready', id: rpcId });

    // wait 10 seconds for a newEngine message
    setTimeout(function() {}, 10000);
}

main();
