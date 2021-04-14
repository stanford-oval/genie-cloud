#!/usr/bin/env node
// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

/// <reference types="./transparent-rpc" />
/// <reference types="./sockaddr" />

// load thingpedia to initialize the polyfill
import 'thingpedia';
import * as Tp from 'thingpedia';

import * as stream from 'stream';
import * as rpc from 'transparent-rpc';
import * as argparse from 'argparse';

import PlatformModule, { PlatformOptions } from './platform';
import JsonDatagramSocket from '../util/json_datagram_socket';
import * as i18n from '../util/i18n';
import Engine from './engine';
import * as proto from './protocol';

class ParentProcessSocket extends stream.Duplex {
    constructor() {
        super({ objectMode: true });
    }

    _read() {}

    _write(data : unknown, encoding : BufferEncoding, callback : (err ?: Error|null) => void) {
        process.send!({ type: 'rpc', data: data }, null, { swallowErrors : false }, callback);
    }
}

interface EngineState {
    cloudId : string;
    running : boolean;
    sockets : Set<rpc.Socket>;
    stopped : boolean;
    engine ?: Engine;
}

const _engines = new Map<number, EngineState>();
let _stopped = false;

function handleSignal() {
    for (const obj of _engines.values()) {
        console.log('Stopping engine of ' + obj.cloudId);
        obj.stopped = true;
        if (obj.running)
            obj.engine!.stop();

        for (const sock of obj.sockets)
            sock.end();
    }

    _stopped = true;
    if (process.connected)
        process.disconnect();

    // give ourselves 10s to die gracefully, then just exit
    setTimeout(() => {
        process.exit();
    });
}

function runEngine(thingpediaClient : rpc.Proxy<Tp.BaseClient>|null, options : PlatformOptions) {
    const platform = PlatformModule.newInstance(thingpediaClient, options);

    const obj : EngineState = {
        cloudId: options.cloudId,
        running: false,
        sockets: new Set,
        stopped: false
    };

    platform.init().then(() => {
        obj.engine = new Engine(platform, {
            thingpediaUrl: PlatformModule.thingpediaUrl,
            nluModelUrl: PlatformModule.nlServerUrl,
            notifications: PlatformModule.notificationConfig,
            // nlg will be set to the same URL
        });
        if (_stopped || obj.stopped)
            return Promise.resolve();
        return obj.engine.open();
    }).then(() => {
        if (_stopped || obj.stopped)
            return Promise.resolve();

        obj.running = true;
        return obj.engine!.run();
    }).then(() => {
        return obj.engine!.close();
    }).catch((e) => {
        console.error('Engine ' + options.cloudId + ' had a fatal error: ' + e.message);
        console.error(e.stack);
        _engines.delete(options.userId);
        // exit the worker process on fatal error.
        process.exit(1);
    });

    _engines.set(options.userId, obj);
}

function killEngine(userId : number) {
    const obj = _engines.get(userId);
    if (!obj)
        return;
    _engines.delete(userId);
    obj.stopped = true;
    if (!obj.engine)
        return;
    obj.engine.stop();
    for (const sock of obj.sockets)
        sock.end();
}

function handleDirectSocket(userId : number, replyId : number, socket : stream.Duplex) {
    console.log('Handling direct connection for ' + userId);

    const rpcSocket = new rpc.Socket(new JsonDatagramSocket(socket, socket, 'utf8'));
    rpcSocket.on('error', (e) => {
        console.log('Error on direct RPC socket: ' + e.message);
    });

    const obj = _engines.get(userId);
    if (!obj || !obj.engine) {
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

export interface EngineFactory extends rpc.Stubbable {
    $rpcMethods : ReadonlyArray<'runEngine' | 'killEngine'>;

    runEngine(thingpediaClient : rpc.Proxy<Tp.BaseClient>|null, options : PlatformOptions) : void;
    killEngine(userId : number) : void;
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
    parser.add_argument('--notification-config', {
        required: true,
        help: 'Notification Configuration',
    });
    parser.add_argument('--faq-models', {
        required: true,
        help: 'FAQ model configuration',
    });

    const argv = parser.parse_args();
    i18n.init(argv.locale);

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    const rpcWrapped = new ParentProcessSocket();
    const rpcSocket = new rpc.Socket(rpcWrapped);
    process.on('message', (message : proto.MasterToWorker, socket) => {
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

    const factory : EngineFactory = {
        $rpcMethods: ['runEngine', 'killEngine'] as const,

        runEngine: runEngine,
        killEngine: killEngine,
    };
    const rpcId = rpcSocket.addStub(factory);
    PlatformModule.init(argv);
    process.send!({ type: 'ready', id: rpcId });

    // wait 10 seconds for a runEngine message
    setTimeout(() => {}, 10000);
}

main();
