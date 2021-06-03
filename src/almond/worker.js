#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

// load thingpedia to initialize the polyfill
require('thingpedia');

const stream = require('stream');
const rpc = require('transparent-rpc');
const argparse = require('argparse');

const PlatformModule = require('./platform');
const JsonDatagramSocket = require('../util/json_datagram_socket');
const i18n = require('../util/i18n');
const Engine = require('./engine');

class ParentProcessSocket extends stream.Duplex {
    constructor() {
        super({ objectMode: true });
    }

    _read() {}

    _write(data, encoding, callback) {
        process.send({ type: 'rpc', data: data }, null, callback);
    }
}

const _engines = new Map;
var _stopped = false;

function handleSignal() {
    for (let obj of _engines.values()) {
        console.log('Stopping engine of ' + obj.cloudId);
        if (obj.running)
            obj.engine.stop();

        for (let sock of obj.sockets)
            sock.end();
    }

    _stopped = true;
    if (process.connected)
        process.disconnect();

    // give ourselves 10s to die gracefully, then just exit
    setTimeout(() => {
        process.exit();
    }, 10000)
    // the timeout will not keep us alive if we're done with everything
    .unref();
}

function runEngine(thingpediaClient, options) {
    const platform = PlatformModule.newInstance(thingpediaClient, options);
    if (!PlatformModule.shared)
        global.platform = platform;

    const obj = { cloudId: options.cloudId, running: false, sockets: new Set };
    const engine = new Engine(platform, {
        thingpediaUrl: PlatformModule.thingpediaUrl,
        nluModelUrl: PlatformModule.nlServerUrl
        // nlg will be set to the same URL
    });
    obj.engine = engine;

    engine.open().then(() => {
        obj.running = true;

        if (_stopped)
            return Promise.resolve();
        return engine.run();
    }).then(() => {
        return engine.close();
    }).catch((e) => {
        console.error('Engine ' + options.cloudId + ' had a fatal error: ' + e.message);
        console.error(e.stack);
        _engines.delete(options.userId);
        // exit the worker process on fatal error.
        process.exit(1);
    });

    _engines.set(options.userId, obj);
}

function killEngine(userId) {
    let obj = _engines.get(userId);
    if (!obj)
        return;
    _engines.delete(userId);
    obj.engine.stop();
    for (let sock of obj.sockets)
        sock.end();
}

function handleDirectSocket(userId, replyId, socket) {
    console.log('Handling direct connection for ' + userId);

    const rpcSocket = new rpc.Socket(new JsonDatagramSocket(socket, socket, 'utf8'));
    rpcSocket.on('error', (e) => {
        console.log('Error on direct RPC socket: ' + e.message);
    });

    let obj = _engines.get(userId);
    if (!obj) {
        console.log('Could not find an engine with the required user ID');
        rpcSocket.call(replyId, 'error', ['Invalid user ID ' + userId]);
        rpcSocket.end();
        return;
    }

    const platform = obj.engine.platform;
    rpcSocket.call(replyId, 'ready', [
        obj.engine,
        platform.getCapability('websocket-api'),
        platform.getCapability('webhook-api')
    ]);

    obj.sockets.add(rpcSocket);
    rpcSocket.on('close', () => {
        obj.sockets.delete(rpcSocket);
    });
}

function main() {
    const parser = new argparse.ArgumentParser({
        add_help: true,
        description: 'Worker Almond process'
    });
    parser.add_argument('--shared', {
        action: 'store_true',
        help: 'Run as a shared (multi-user) process',
        default: false,
    });
    parser.add_argument('-l', '--locale', {
        action: 'append',
        default: [],
        help: 'Enable this language',
    });
    parser.add_argument('--thingpedia-url', {
        required: true,
        help: 'Thingpedia URL',
    });
    parser.add_argument('--oauth-redirect-origin', {
        required: true,
        help: 'OAuth Redirect Origin',
    });
    parser.add_argument('--nl-server-url', {
        required: true,
        help: 'NLP Server URL',
    });

    const argv = parser.parse_args();
    i18n.init(argv.locale);

    // for compat with platform.getOrigin()
    // (but not platform.getCapability())
    if (argv.shared)
        global.platform = PlatformModule;

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    var rpcWrapped = new ParentProcessSocket();
    var rpcSocket = new rpc.Socket(rpcWrapped);
    process.on('message', (message, socket) => {
        switch (message.type) {
            case 'exit':
                handleSignal();
                break;
        
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
    PlatformModule.init(argv);
    process.send({ type: 'ready', id: rpcId });

    // wait 10 seconds for a runEngine message
    setTimeout(() => {}, 10000);
}

main();
