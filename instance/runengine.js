// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const lang = require('lang');
const events = require('events');
const rpc = require('transparent-rpc');

const Engine = require('thingengine-core');

const ParentProcessSocket = new lang.Class({
    Name: 'ParentProcessSocket',
    Extends: events.EventEmitter,

    _init: function() {
        events.EventEmitter.call(this);

        process.on('message', function(message) {
            if (message.type !== 'rpc')
                return;

            this.emit('data', message.data);
        }.bind(this));
    },

    setEncoding: function() {},

    end: function() {
        this.emit('end');
    },

    close: function() {
        this.emit('close', false);
    },

    write: function(data, encoding, callback) {
        process.send({type: 'rpc', data: data }, null, callback);
    }
});

function runEngine() {
    global.platform = require('./platform');

    var engine;
    var rpcSocket;
    var earlyStop = false;
    var engineRunning = false;
    var rpcReady = Q.defer();

    function handleSignal() {
        if (engineRunning)
            engine.stop();
        else
            earlyStop = true;
    }
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    var socket = new ParentProcessSocket();
    rpcSocket = new rpc.Socket(socket);
    process.on('message', function(message, socket) {
        switch(message.type) {
        case 'rpc-ready':
            rpcReady.resolve(message.id);
            break;

        case 'websocket':
            platform._getPrivateFeature('websocket-handler')
                .handle(message, socket);
            break;

        default:
            break;
        }
    });

    platform.init().then(function() {
        return rpcReady.promise.then(function(rpcId) {
            console.log('RPC channel ready');
            return rpcSocket.call(rpcId, 'getThingPediaClient', []).then(function(client) {
                console.log('Obtained ThingPedia client');
                platform._setPrivateFeature('thingpedia-client', client);
                rpcSocket.call(rpcId, 'setWebhookClient', [platform.getCapability('webhook-api')]);

                engine = new Engine();

                return engine.open().then(function() {
                    engineRunning = true;
                    rpcSocket.call(rpcId, 'setEngine', [engine]).done();

                    if (earlyStop)
                        return;
                    return engine.run().finally(function() {
                        return engine.close();
                    });
                });
            });
        });
    }).then(function () {
        console.log('Cleaning up');
        platform.exit();
    }).done();
}

runEngine();
