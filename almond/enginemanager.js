// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const events = require('events');
const stream = require('stream');
const rpc = require('transparent-rpc');

const user = require('../model/user');
const db = require('../util/db');
const ThingpediaClient = require('../util/thingpedia-client');

class ChildProcessSocket extends stream.Duplex {
    constructor(child) {
        super({ objectMode: true });

        this._child = child;
    }

    _read() {}

    _write(data, encoding, callback) {
        this._child.send({ type: 'rpc', data: data }, null, callback);
    }
}

const ENABLE_SHARED_PROCESS = true;

function safeMkdirSync(dir) {
    try {
        fs.mkdirSync(dir);
    } catch(e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
}

class EngineProcess extends events.EventEmitter {
    constructor(id, cloudId) {
        super();
        this.setMaxListeners(Infinity);

        this._id = id;

        this.useCount = 0;
        this.shared = cloudId === null;

        this._cloudId = cloudId;
        this._cwd = this.shared ? './' : ('./' + cloudId);
        safeMkdirSync(this._cwd);
        this._child = null;
        this._rpcSocket = null;
        this._rpcId = null;
    }

    get id() {
        return this._id;
    }

    runEngine(user, thingpediaClient) {
        this.useCount++;

        return this._rpcSocket.call(this._rpcId, 'runEngine', [thingpediaClient, {
            userId: user.id,
            cloudId: user.cloud_id,
            authToken: user.auth_token,
            developerKey: user.developer_key,
            locale: user.locale,
            timezone: user.timezone,
            storageKey: user.storage_key }]);
    }

    killEngine(userId) {
        if (!this.shared)
            return this.kill();
        this.useCount--;
        return this._rpcSocket.call(this._rpcId, 'killEngine', [userId]).then(function() {
            this.emit('engine-removed', userId);
        }.bind(this));
    }

    kill() {
        if (this._child === null)
            return;

        console.log('Killing process with ID ' + this._id);
        this._child.kill();
    }

    restart(delay) {
        this._child = null;
        this._rpcSocket = null;
        this._rpcId = null;
        return this._starting = Q.delay(delay).then(function() {
            return this.start();
        }.bind(this));
    }

    waitReady() {
        return Q(this._starting).then(function() { return this; }.bind(this));
    }

    send(msg, socket) {
        this._child.send(msg, socket);
    }

    start() {
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
        var enginePath = path.resolve(managerPath, './worker');
        var child;

        console.log('Spawning process with ID ' + this._id);

        if (this.shared) {
            var args = process.execArgv.slice();
            args.push(enginePath);
            args.push('--shared');
            child = child_process.spawn(process.execPath, args,
                                        { stdio: ['ignore', 'ignore', 2, 'ipc'],
                                          detached: true, // ignore ^C
                                          cwd: this._cwd, env: env });
        } else {
            if (process.env.THINGENGINE_DISABLE_SANDBOX === '1') {
                var processPath = process.execPath;
                var args = process.execArgv.slice();
                args.push(enginePath);
                var stdio = ['ignore', 1, 2, 'ipc'];
            } else {
                var processPath = path.resolve(managerPath, '../sandbox/sandbox');
                var args = ['-i', this._cloudId, process.execPath].concat(process.execArgv);
                args.push(enginePath);
                var stdio = ['ignore', 'ignore', 'ignore', 'ipc'];
            }
            child = child_process.spawn(processPath, args,
                                        { stdio: stdio,
                                          detached: true,
                                          cwd: this._cwd, env: env });
        }

        // wrap child into something that looks like a Stream
        // (readable + writable)
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
        socket.on('error', function(error) {
            console.error('Failed to communicate with ID ' + this._id + ': ' + error);
        }.bind(this));

        this._child = child;
        child.on('message', (msg) => {
            switch (msg.type) {
            case 'ready':
                this._rpcId = msg.id;
                this._starting = null;
                rpcDefer.resolve();
                break;
            case 'rpc':
                socket.push(msg.data);
                break;
            }
        });
        this._starting = rpcDefer.promise;
        return this._starting;
    }
}

class EngineManager extends events.EventEmitter {
    constructor() {
        super();
        this._processes = {};
        this._rrproc = [];
        this._nextProcess = null;
        this._engines = {};
    }

    _findProcessForUser(user) {
        if (ENABLE_SHARED_PROCESS && user.developer_key === null && !user.force_separate_process) {
            var process = this._rrproc[this._nextProcess];
            this._nextProcess++;
            this._nextProcess = this._nextProcess % this._rrproc.length;
            return process.waitReady();
        } else {
            var process = new EngineProcess(user.id, user.cloud_id);
            this._processes[user.id] = process;
            process.on('exit', function() {
                if (this._processes[user.id] === process)
                    delete this._processes[user.id];
            }.bind(this));
            return process.start().then(function() { return process; });
        }
    }

    _runUser(user) {
        var engines = this._engines;
        var obj = { cloudId: user.cloud_id, process: null, engine: null };
        engines[user.id] = obj;
        var die = (function(manual) {
            if (engines[user.id] !== obj)
                return;
            obj.process.removeListener('die', die);
            obj.process.removeListener('engine-removed', onRemoved);
            if (obj.thingpediaClient)
                obj.thingpediaClient.$free();
            delete engines[user.id];

            if (!manual && obj.process.shared) {
                // if the process died, some user might have been killed as a side effect
                // set timeout to restart the user 10 s in the future
                setTimeout(function() {
                    this.restartUser(user.id);
                }.bind(this), 10000);
            }
        }).bind(this);
        var onRemoved = function(deadUserId) {
            if (user.id !== deadUserId)
                return;

            die(true);
        }

        return this._findProcessForUser(user).then((process) => {
            console.log('Running engine for user ' + user.id);

            obj.process = process;

            process.on('engine-removed', onRemoved);
            process.on('exit', die);

            obj.thingpediaClient = new ThingpediaClient(user.developer_key, user.locale);
            return process.runEngine(user, obj.thingpediaClient);
        });
    }

    isRunning(userId) {
        return (this._engines[userId] !== undefined && this._engines[userId].process !== null);
    }

    getProcessId(userId) {
        return (this._engines[userId] !== undefined && this._engines[userId].process !== null) ? this._engines[userId].process.id : -1;
    }

    sendSocket(userId, replyId, socket) {
        if (this._engines[userId] === undefined)
            throw new Error('Invalid user ID');
        if (this._engines[userId].process === null)
            throw new Error('Engine dead');

        this._engines[userId].process.send({ type: 'direct', target: userId, replyId: replyId }, socket);
    }

    start() {
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
            this._rrproc[i].on('exit', function() {
                var proc = this;
                proc.restart(5000).done();
            });
            promises[i] = this._rrproc[i].start();
            this._processes['S' + i] = this._rrproc[i];
        }

        return Q.all(promises).then(function() {
            return db.withClient(function(client) {
                return user.getAll(client).then(function(rows) {
                    return Q.all(rows.map(function(r) {
                        return self._runUser(r).catch((e) => {
                            console.error('User ' + r.id + ' failed to start: ' + e.message);
                        });
                    }));
                });
            });
        });
    }

    startUser(userId) {
        console.log('Requested start of user ' + userId);
        return db.withClient((dbClient) => {
            return user.get(dbClient, userId);
        }).then((user) => {
            return this._runUser(user);
        });
    }

    stop() {
        for (var userId in this._processes)
            this._processes[userId].kill();
    }

    killUser(userId) {
        var obj = this._engines[userId];
        if (!obj || obj.process === null)
            return Q();
        return Q(obj.process.killEngine(userId));
    }

    deleteUser(userId) {
        var obj = this._engines[userId];
        if (obj.process !== null)
            obj.process.killEngine(userId);

        return Q.nfcall(child_process.exec, 'rm -fr ./' + obj.cloudId);
    }

    restartUser(userId) {
        return this.killUser(userId).then(() => {
            return this.startUser(userId);
        });
    }
}

module.exports = EngineManager;
