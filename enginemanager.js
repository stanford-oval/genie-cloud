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
const os = require('os');
const events = require('events');
const rpc = require('transparent-rpc');

const user = require('./model/user');
const db = require('./util/db');

const ThingPediaClient = require('./util/thingpedia-client');
const AssistantDispatcher = require('./assistantdispatcher');
const WebhookDispatcher = require('./webhookdispatcher');

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

const ENABLE_SHARED_PROCESS = false;

const EngineProcess = new lang.Class({
    Name: 'EngineProcess',
    Extends: events.EventEmitter,

    _init: function(id, cloudId) {
        events.EventEmitter.call(this);

        this._id = id;

        this.useCount = 0;
        this.shared = cloudId === null;

        this._cloudId = cloudId;
        this._cwd = this.shared ? './' : ('./' + cloudId);
        this._child = null;
        this._rpcSocket = null;
        this._rpcId = null;
    },

    get id() {
        return this._id;
    },

    runEngine: function(cloudId, authToken, developerKey, thingpediaClient) {
        this.useCount++;
        return this._rpcSocket.call(this._rpcId, 'runEngine', [cloudId, authToken, developerKey, thingpediaClient]);
    },

    killEngine: function(cloudId) {
        if (!this.shared)
            return this.kill();
        this.useCount--;
        return this._rpcSocket.call(this._rpcId, 'killEngine', [cloudId]).then(function() {
            this.emit('engine-removed', cloudId);
        }.bind(this));
    },

    kill: function() {
        console.log('Killing process with ID ' + this._id);
        this._child.kill();
    },

    start: function() {
        const ALLOWED_ENVS = ['LANG', 'LOGNAME', 'USER', 'PATH',
                              'HOME', 'SHELL', 'THINGENGINE_PROXY'];
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
        env.THINGENGINE_USER_ID = this._id;

        var managerPath = path.dirname(module.filename);
        var enginePath = managerPath + '/instance/runengine';
        var child;

        console.log('Spawning process with ID ' + this._id);

        if (this.shared) {
            var args = process.execArgv.slice();
            args.push(enginePath);
            args.push('--shared');
            child = child_process.spawn(process.execPath, args,
                                        { stdio: ['ignore', 1, 2, 'ipc'],
                                          detached: true, // ignore ^C
                                          cwd: this._cwd, env: env });
        } else {
            var sandboxPath = managerPath + '/sandbox/sandbox';
            var args = ['-i', this._cloudId, process.execPath].concat(process.execArgv);
            args.push(enginePath);
            child = child_process.spawn(sandboxPath, args,
                                        { stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
                                          detached: true,
                                          cwd: this._cwd, env: env });
        }

        // wrap child into something that looks like a Stream
        // (readable + writable), at least as far as JsonDatagramSocket
        // is concerned
        var socket = new ChildProcessSocket(child);
        this._rpcSocket = new rpc.Socket(socket);

        var rpcDefer = Q.defer();
        child.on('error', function(error) {
            console.error('Child with ID ' + this._id + ' reported an error: ' + error);
            rpcDefer.reject(new Error('Reported error ' + error));
        }.bind(this));
        child.on('exit', function(code, signal) {
            if (this.shared || code !== 0)
                console.error('Child with ID ' + this._id + ' exited with code ' + code);
            rpcDefer.reject(new Error('Exited with code ' + code));
            this.emit('exit');
        }.bind(this));

        this._child = child;

        child.on('message', function(msg) {
            if (msg.type === 'rpc-ready') {
                this._rpcId = msg.id;
                rpcDefer.resolve();
            }
        }.bind(this));
        return rpcDefer.promise;
    }
});

const EngineManager = new lang.Class({
    Name: 'EngineManager',

    _init: function(frontend) {
        this._processes = {};
        this._rrproc = [];
        this._nextProcess = null;
        this._engines = {};
        this._frontend = frontend;

        _instance = this;
    },

    _findProcessForUser: function(userId, cloudId, developerKey, forceSeparateProcess) {
        if (ENABLE_SHARED_PROCESS && developerKey === null && !forceSeparateProcess) {
            var process = this._rrproc[this._nextProcess];
            this._nextProcess++;
            this._nextProcess = this._nextProcess % this._rrproc.length;
            return Q(process);
        } else {
            var process = new EngineProcess(userId, cloudId);
            this._processes[userId] = process;
            process.on('exit', function() {
                if (this._processes[userId] === process)
                    delete this._processes[userId];
            }.bind(this));
            return process.start().then(function() { return process; });
        }
    },

    _runUser: function(userId, cloudId, authToken, omletId, developerKey, forceSeparateProcess) {
        var engines = this._engines;
        var obj = { omletId: omletId, cloudId: cloudId, process: null, engine: null };
        engines[userId] = obj;
        var die = (function() {
            if (engines[userId] !== obj)
                return;
            if (obj.omletId !== null)
                AssistantDispatcher.get().removeEngine(obj.omletId);
            WebhookDispatcher.get().removeClient(cloudId);
            this._frontend.unregisterWebSocketEndpoint('/ws/' + cloudId);
            delete engines[userId];
        }).bind(this);

        return this._findProcessForUser(userId, cloudId, developerKey, forceSeparateProcess).then(function(process) {
            console.log('Running engine for user ' + userId);

            obj.process = process;
            process.on('engine-removed', function(deadCloudId) {
                if (cloudId !== deadCloudId)
                    return;

                die();
            });
            process.on('exit', die);

            return process.runEngine(cloudId, authToken, developerKey, new ThingPediaClient(developerKey));
        }.bind(this)).spread(function(engine, webhookApi) {
                console.log('Received engine from child ' + userId);

                WebhookDispatcher.get().addClient(cloudId, webhookApi);
                this._frontend.registerWebSocketEndpoint('/ws/' + cloudId, function(req, socket, head) {
                    var saneReq = {
                        httpVersion: req.httpVersion,
                        url: req.url,
                        headers: req.headers,
                        rawHeaders: req.rawHeaders,
                        method: req.method,
                    };
                    child.send({type:'websocket', cloudId: cloudId, req: saneReq,
                                upgradeHead: head.toString('base64')}, socket);
                });

                // precache .apps, .devices, instead of querying the
                // engine all the time, to reduce IPC latency
                return Q.all([engine.apps,
                              engine.devices,
                              engine.ui,
                              engine.assistant,
                              engine.messaging]);
        }.bind(this)).spread(function(apps, devices, ui, assistant, messaging) {
            var engine = { apps: apps,
                           devices: devices,
                           ui: ui,
                           assistant: assistant,
                           messaging: messaging };
            obj.engine = engine;
            return engine;
        }.bind(this)).then(function(engine) {
            if (omletId !== null)
                AssistantDispatcher.get().addEngine(omletId, engine);
        }.bind(this));
    },

    isRunning: function(userId) {
        return (this._engines[userId] !== undefined && this._engines[userId].process !== null);
    },

    getProcessId: function(userId) {
        return this._engines[userId].process.id;
    },

    getEngine: function(userId) {
        var obj = this._engines[userId];
        if (obj === undefined || obj.engine === null)
            return Q.reject(new Error(userId + ' is not running'));

        return Q(obj.engine);
    },

    start: function() {
        var self = this;
        var ncpus, nprocesses;

        if (ENABLE_SHARED_PROCESS) {
            ncpus = os.cpus().length;
            nprocesses = 2 * ncpus;
        } else {
            ncpus = 0; nprocesses = 0;
        }
        var promises = new Array(nprocesses);
        this._rrproc = new Array(nprocesses);
        this._nextProcess = 0;
        for (var i = 0; i < nprocesses; i++) {
            this._rrproc[i] = new EngineProcess('S' + i, null);
            promises[i] = this._rrproc[i].start();
            this._processes['S' + i] = this._rrproc[i];
        }

        return Q.all(promises).then(function() {
            return db.withClient(function(client) {
                return user.getAll(client).then(function(rows) {
                    return Q.all(rows.map(function(r) {
                        return self._runUser(r.id, r.cloud_id, r.auth_token,
                                             r.omlet_id, r.developer_key, r.force_separate_process);
                    }));
                });
            });
        });
    },

    startUser: function(user) {
        console.log('Requested start of user ' + user.id);
        return this._runUser(user.id, user.cloud_id, user.auth_token,
                             user.omlet_id, user.developer_key, user.force_separate_process);
    },

    addOmletToUser: function(userId, omletId) {
        var obj = this._engines[userId];
        if (obj === undefined || obj.engine === null)
            throw new Error(userId + ' is not running');

        obj.omletId = omletId;
        AssistantDispatcher.get().addEngine(omletId, obj.engine);
    },

    stop: function() {
        var am = AssistantDispatcher.get();
        var wd = WebhookDispatcher.get();
        am.removeAllEngines();
        wd.removeAllClients();
        for (var userId in this._processes)
            this._processes[userId].kill();
    },

    killUser: function(userId) {
        var obj = this._engines[userId];
        if (!obj || obj.process === null)
            return Q();
        return Q(obj.process.killEngine(obj.cloudId));
    },

    deleteUser: function(userId) {
        var obj = this._engines[userId];
        if (obj.omletId)
            AssistantDispatcher.get().deleteUser(obj.omletId);
        if (obj.process !== null)
            obj.process.killEngine(obj.cloudId);

        return Q.nfcall(child_process.exec, 'rm -fr ./' + obj.cloudId);
    },

    restartUser: function(userId) {
        this.killUser(userId).then(function() {
            db.withClient(function(dbClient) {
                return user.get(dbClient, userId);
            }).then(function(user) {
                return this.startUser(user);
            }.bind(this));
        }.bind(this)).catch(function(e) {
            console.error('Failed to restart user ' + userId + ': ' + e.message);
            console.error(e.stack);
        }).done();
    }
});

EngineManager.get = function() {
    return _instance;
};

module.exports = EngineManager;
