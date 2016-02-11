// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const lang = require('lang');
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const events = require('events');
const rpc = require('transparent-rpc');

const user = require('./model/user');
const db = require('./util/db');

const ThingPediaClient = require('./util/thingpedia-client');
const AssistantDispatcher = require('./assistantdispatcher');

var _logJournal;
try {
    const journald = require('journald').Log;
    _logJournal = function(obj) {
        journald.log(obj);
    };
} catch(e) {
    console.error('Failed to setup journald');
    _logJournal = function(obj) {
        if (obj.PRIORITY <= 4)
            console.error(obj.MESSAGE);
        else
            console.log(obj.MESSAGE);
    }
}
const LOG_INFO = 6;
const LOG_ERR = 3;

var _instance = null;

const ChildProcessSocket = new lang.Class({
    Name: 'ChildProcessSocket',
    Extends: events.EventEmitter,

    _init: function(child) {
        events.EventEmitter.call(this);

        this._child = child;

        child.on('message', function(message) {
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
        this._child.send({type: 'rpc', data: data }, null, callback);
    }
});

const EngineManager = new lang.Class({
    Name: 'EngineManager',

    _init: function(frontend) {
        this._runningProcesses = {};
        this._frontend = frontend;

        _instance = this;
    },

    _runUser: function(userId, cloudId, authToken, assistantFeedId, developerKey) {
        var runningProcesses = this._runningProcesses;
        var frontend = this._frontend;

        return Q.nfcall(fs.mkdir, './' + cloudId)
            .catch(function(e) {
                if (e.code !== 'EEXIST')
                    throw e;
            })
            .then(function() {
                const ALLOWED_ENVS = ['LANG', 'LOGNAME', 'USER', 'PATH',
                                      'HOME', 'SHELL'];
                function envIsAllowed(name) {
                    if (name.startsWith('LC_'))
                        return true;
                    if (ALLOWED_ENVS.indexOf(name) >= 0)
                        return true;
                    return false;
                }

                var env = {};
                for (var name in process.env) {
                    if (envIsAllowed(name))
                        env[name] = process.env[name];
                }
                env.CLOUD_ID = cloudId;
                env.AUTH_TOKEN = authToken;
                if (developerKey !== null)
                    env.DEVELOPER_KEY = developerKey;
                console.log('Spawning child for user ' + userId);

                var managerPath = path.dirname(module.filename);
                var enginePath = managerPath + '/instance/runengine';
                var sandboxPath = managerPath + '/sandbox/sandbox';
                var args = ['-i', cloudId, process.execPath].concat(process.execArgv);
                args.push(enginePath);
                var child = child_process.spawn(sandboxPath, args,
                                                { stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
                                                  cwd: './' + cloudId,
                                                  env: env });
                function output(priority) {
                    return (function(data) {
                        var str = data.toString('utf8');
                        str.split('\n').forEach(function(line) {
                            var trimmed = line.trim();
                            if (trimmed.length > 0) {
                                _logJournal({ PRIORITY: priority,
                                              MESSAGE: trimmed,
                                              SYSLOG_IDENTIFIER: 'thingengine-child-' + userId,
                                              THINGENGINE_PID: child.pid,
                                              THINGENGINE_USER_ID: userId });
                            }
                        });
                    });
                }
                child.stdout.on('data', output(LOG_INFO));
                child.stderr.on('data', output(LOG_ERR));

                var engineProxy = Q.defer();
                var obj = { child: child,
                            cwd: './' + cloudId,
                            engine: engineProxy.promise }
                runningProcesses[userId] = obj;

                child.on('error', function(error) {
                    console.error('Child with ID ' + userId + ' reported an error: ' + error);
                });
                child.on('exit', function(code, signal) {
                    if (code !== 0)
                        console.error('Child with ID ' + userId + ' exited with code ' + code);

                    if (runningProcesses[userId] !== obj)
                        return;
                    AssistantDispatcher.get().removeEngine(userId);
                    frontend.unregisterWebSocketEndpoint('/ws/' + cloudId);
                    delete runningProcesses[userId];
                });

                // wrap child into something that looks like a Stream
                // (readable + writable), at least as far as JsonDatagramSocket
                // is concerned
                var socket = new ChildProcessSocket(child);
                var rpcSocket = new rpc.Socket(socket);
                var thingpediaClient = new ThingPediaClient(developerKey);
                var rpcStub = {
                    $rpcMethods: ['setEngine', 'getThingPediaClient'],

                    getThingPediaClient: function() {
                        return thingpediaClient;
                    },

                    setEngine: function(engine) {
                        console.log('Received engine from child ' + userId);

                        // precache .apps, .devices, .channels instead of querying the
                        // engine all the time, to reduce IPC latency
                        Q.all([engine.apps,
                               engine.devices,
                               engine.channels,
                               engine.ui,
                               engine.assistant,
                               engine.messaging
                              ]).spread(function(apps, devices, channels, ui, assistant, messaging) {
                                  var engine = { apps: apps,
                                                  devices: devices,
                                                  channels: channels,
                                                  ui: ui,
                                                  assistant: assistant,
                                                  messaging: messaging
                                               };
                                  engineProxy.resolve(engine);

                                  if (assistantFeedId !== null)
                                      AssistantDispatcher.get().addEngine(userId, engine, assistantFeedId);
                        }, function(err) {
                            engineProxy.reject(err);
                        });
                    }
                };
                var rpcId = rpcSocket.addStub(rpcStub);
                child.send({ type:'rpc-ready', id: rpcId });

                frontend.registerWebSocketEndpoint('/ws/' + cloudId, function(req, socket, head) {
                    var saneReq = {
                        httpVersion: req.httpVersion,
                        url: req.url,
                        headers: req.headers,
                        rawHeaders: req.rawHeaders,
                        method: req.method,
                    };
                    var encodedReq = new Buffer(JSON.stringify(saneReq)).toString('base64');
                    child.send({type:'websocket', request: encodedReq,
                                upgradeHead: head.toString('base64')}, socket);
                });
            });
    },

    isRunning: function(userId) {
        return this._runningProcesses[userId] !== undefined;
    },

    getEngine: function(userId) {
        var process = this._runningProcesses[userId];
        if (process === undefined)
            return Q.reject(new Error(userId + ' is not running'));

        return process.engine;
    },

    start: function() {
        var self = this;
        return db.withClient(function(client) {
            return user.getAll(client).then(function(rows) {
                return Q.all(rows.map(function(r) {
                    return self._runUser(r.id, r.cloud_id, r.auth_token,
                                         r.assistant_feed_id, r.developer_key);
                }));
            });
        });
    },

    startUser: function(user) {
        console.log('Requested start of user ' + user.id);
        return this._runUser(user.id, user.cloud_id, user.auth_token,
                             user.assistant_feed_id, user.developer_key);
    },

    stop: function() {
        var am = AssistantDispatcher.get();
        for (var userId in this._runningProcesses) {
            var child = this._runningProcesses[userId].child;
            child.kill();
            am.removeEngine(userId);
        }
    },

    killUser: function(userId) {
        var process = this._runningProcesses[userId];
        if (!process)
            return;
        process.child.kill();
    },

    deleteUser: function(userId) {
        var process = this._runningProcesses[userId];
        var child = process.child;
        child.kill();
        AssistantDispatcher.get().removeEngine(userId);

        return Q.nfcall(child_process.exec, 'rm -fr ' + process.cwd);
    },
});

EngineManager.get = function() {
    return _instance;
};

module.exports = EngineManager;
