// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const events = require('events');
const stream = require('stream');
const rpc = require('transparent-rpc');

const user = require('../model/user');
const db = require('../util/db');
const ThingpediaClient = require('../util/thingpedia-client');
const Config = require('../config');

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

        this._hadExit = false;
    }

    get id() {
        return this._id;
    }

    runEngine(user, thingpediaClient) {
        this.useCount++;

        if (this.shared)
            safeMkdirSync(this._cwd + '/' + user.cloud_id);
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
        return this._rpcSocket.call(this._rpcId, 'killEngine', [userId]).then(() => {
            this.emit('engine-removed', userId);
        }).catch((e) => {
            // assume if the call fails that the engine actually died
            this.emit('engine-removed', userId);
        });
    }

    kill() {
        if (this._child === null)
            return;

        console.log('Killing process with ID ' + this._id);
        this._child.kill();

        // emit exit immediately so we close the channel
        // otherwise we could race and try to talk to the dying process
        this._hadExit = true;
        this.emit('exit');
    }

    restart(delay) {
        this._child = null;
        this._rpcSocket = null;
        this._rpcId = null;
        return this._starting = Q.delay(delay).then(() => this.start());
    }

    waitReady() {
        return Q(this._starting).then(() => this);
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

        const env = {};
        for (var name in process.env) {
            if (envIsAllowed(name))
                env[name] = process.env[name];
        }
        env.THINGENGINE_USER_ID = this._id;

        const managerPath = path.dirname(module.filename);
        const enginePath = path.resolve(managerPath, './worker');
        let child;

        console.log('Spawning process with ID ' + this._id);

        let processPath, args, stdio;
        if (this.shared) {
            args = process.execArgv.slice();
            args.push(enginePath);
            args.push('--shared');
            child = child_process.spawn(process.execPath, args,
                                        { stdio: ['ignore', 'ignore', 2, 'ipc'],
                                          detached: true, // ignore ^C
                                          cwd: this._cwd, env: env });
        } else {
            if (process.env.THINGENGINE_DISABLE_SANDBOX === '1') {
                processPath = process.execPath;
                args = process.execArgv.slice();
                args.push(enginePath);
                stdio = ['ignore', 1, 2, 'ipc'];
            } else {
                processPath = path.resolve(managerPath, '../sandbox/sandbox');
                args = ['-i', this._cloudId, process.execPath].concat(process.execArgv);
                args.push(enginePath);
                stdio = ['ignore', 'ignore', 'ignore', 'ipc'];
            }
            child = child_process.spawn(processPath, args,
                                        { stdio: stdio,
                                          detached: true,
                                          cwd: this._cwd, env: env });
        }

        // wrap child into something that looks like a Stream
        // (readable + writable)
        const socket = new ChildProcessSocket(child);
        this._rpcSocket = new rpc.Socket(socket);

        return this._starting = new Promise((resolve, reject) => {
            child.on('error', (error) => {
                console.error('Child with ID ' + this._id + ' reported an error: ' + error);
                reject(new Error('Reported error ' + error));
            });
            child.on('exit', (code, signal) => {
                if (this.shared || code !== 0)
                    console.error('Child with ID ' + this._id + ' exited with code ' + code);
                reject(new Error('Exited with code ' + code));
                if (!this._hadExit) {
                    this._hadExit = true;
                    this.emit('exit');
                }
            });
            socket.on('error', (error) => {
                console.error('Failed to communicate with ID ' + this._id + ': ' + error);
            });

            this._child = child;
            child.on('message', (msg) => {
                switch (msg.type) {
                case 'ready':
                    this._rpcId = msg.id;
                    this._starting = null;
                    resolve();
                    break;
                case 'rpc':
                    socket.push(msg.data);
                    break;
                }
            });
        });
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

            if (Config.WITH_THINGPEDIA === 'embedded')
                obj.thingpediaClient = new ThingpediaClient(user.developer_key, user.locale);
            else
                obj.thingpediaClient = null;
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
        let ncpus, nprocesses;

        if (ENABLE_SHARED_PROCESS) {
            ncpus = os.cpus().length;
            nprocesses = 2 * ncpus;
        } else {
            ncpus = 0; nprocesses = 0;
        }
        let promises = new Array(nprocesses);
        this._rrproc = new Array(nprocesses);
        this._nextProcess = 0;
        for (var i = 0; i < nprocesses; i++) {
            this._rrproc[i] = new EngineProcess('S' + i, null);
            this._rrproc[i].on('exit', function() {
                let proc = this;
                proc.restart(5000).done();
            });
            promises[i] = this._rrproc[i].start();
            this._processes['S' + i] = this._rrproc[i];
        }

        return Promise.all(promises).then(() => {
            return db.withClient((client) => {
                return user.getAll(client).then((rows) => {
                    return Promise.all(rows.map((r) => {
                        return this._runUser(r).catch((e) => {
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
        for (let userId in this._processes)
            this._processes[userId].kill();
    }

    killUser(userId) {
        let obj = this._engines[userId];
        if (!obj || obj.process === null)
            return Q();
        return Q(obj.process.killEngine(userId));
    }

    deleteUser(userId) {
        let obj = this._engines[userId];
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
EngineManager.prototype.$rpcMethods = ['isRunning', 'getProcessId', 'startUser', 'killUser', 'deleteUser', 'restartUser'];

module.exports = EngineManager;
