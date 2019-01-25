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
const util = require('util');

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
        try {
            this._child.send({ type: 'rpc', data: data }, null, callback);
        } catch(e) {
            callback(e);
        }
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

        this._sandboxed = !this.shared && process.env.THINGENGINE_DISABLE_SANDBOX !== '1';
        this._sandboxedPid = null;
        this._hadExit = false;
        this._deadPromise = null;
        this._deadCallback = null;
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
            storageKey: user.storage_key,
            modelTag: user.model_tag || 'default' }]);
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

        this._deadPromise = new Promise((resolve, reject) => {
            this._deadCallback = resolve;

            setTimeout(() => {
                if (this._sandboxedPid !== null) {
                    process.kill(this._sandboxedPid, 'SIGKILL');
                    this._sandboxedPid = null;
                } else if (this._child !== null) {
                    this._child.kill('SIGKILL');
                }

                reject(new Error(`Timeout waiting for child ${this._id} to die`));
            }, 30000);
        });

        console.log('Killing process with ID ' + this._id);
        // in the sandbox, we cannot kill the process directly, due to signal
        // restrictions in PID namespaces (the sandbox process is treated like PID 1
        // and unkillable other than with SIGKILL)
        // to try and terminate the process gracefully, send a message using the channel
        //
        // NOTE: if the child is not connected and we are sandboxed, we will send it
        // SIGTERM, which does nothing
        // later, we'll timeout and send it SIGKILL instead
        // (same thing if sending fails)
        if (this._sandboxed && this._child.connected)
            this._child.send({ type: 'exit' });
        else
            this._child.kill();

        // emit exit immediately so we close the channel
        // otherwise we could race and try to talk to the dying process
        this._hadExit = true;
        // mark that this was a manual kill (hence we don't want to
        // autorestart any user until the admin does so manually)
        this.emit('exit', true);
    }

    restart(delay) {
        this._child = null;
        this._rpcSocket = null;
        this._rpcId = null;
        return this._starting = Q.delay(delay).then(() => this.start());
    }

    waitReady() {
        return Promise.resolve(this._starting).then(() => this);
    }
    waitDead() {
        return Promise.resolve(this._deadPromise);
    }

    send(msg, socket) {
        this._child.send(msg, socket);
    }

    _handleInfoFD(pipe) {
        let buf = '';
        pipe.setEncoding('utf8');
        pipe.on('data', (data) => {
            buf += data;
        });
        pipe.on('end', () => {
            const parsed = JSON.parse(buf);
            this._sandboxedPid = parsed['child-pid'];
        });
        pipe.on('error', (err) => {
            console.error(`Failed to read from info-fd in process ${this._id}: ${err}`);
        });
    }

    start() {
        const ALLOWED_ENVS = ['LANG', 'LOGNAME', 'USER', 'PATH',
                              'HOME', 'SHELL', 'THINGENGINE_PROXY',
                              'CI'];
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
                                        { stdio: ['ignore', 'ignore', 2, 'ignore', 'ipc'],
                                          detached: true, // ignore ^C
                                          cwd: this._cwd, env: env });
        } else {
            if (process.env.THINGENGINE_DISABLE_SANDBOX === '1') {
                processPath = process.execPath;
                args = process.execArgv.slice();
                args.push(enginePath);
                stdio = ['ignore', 1, 2, 'ignore', 'ipc'];
            } else {
                processPath = path.resolve(managerPath, '../sandbox/sandbox');
                args = [process.execPath].concat(process.execArgv);
                args.push(enginePath);
                stdio = ['ignore', 1, 2, 'pipe', 'ipc'];

                const jsPrefix = path.resolve(path.dirname(managerPath));
                const nodepath = path.resolve(process.execPath);
                if (!nodepath.startsWith('/usr/'))
                    env.THINGENGINE_PREFIX = jsPrefix + ':' + nodepath;
                else
                    env.THINGENGINE_PREFIX = jsPrefix;
            }
            child = child_process.spawn(processPath, args,
                                        { stdio: stdio,
                                          detached: true,
                                          cwd: this._cwd, env: env });
        }
        if (this._sandboxed)
            this._handleInfoFD(child.stdio[3]);

        // wrap child into something that looks like a Stream
        // (readable + writable)
        const socket = new ChildProcessSocket(child);
        this._rpcSocket = new rpc.Socket(socket);

        return this._starting = new Promise((resolve, reject) => {
            child.on('error', (error) => {
                console.error('Child with ID ' + this._id + ' reported an error: ' + error);
                reject(new Error('Reported error ' + error));
            });
            child.on('disconnect', () => {
                if (!this._hadExit) {
                    this._hadExit = true;
                    this.emit('exit');
                }
            });
            child.on('exit', (code, signal) => {
                this._sandboxedPid = null;
                this._child = null;
            
                if (this.shared || code !== 0)
                    console.error('Child with ID ' + this._id + ' exited with code ' + code);
                reject(new Error('Exited with code ' + code));

                if (this._deadCallback)
                    this._deadCallback(code);
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
    constructor(shardId) {
        super();
        this._shardId = shardId;
        this._processes = {};
        this._rrproc = [];
        this._nextProcess = null;
        this._engines = {};
        this._stopped = false;
    }

    _findProcessForUser(user) {
        if (ENABLE_SHARED_PROCESS && user.developer_key === null && !user.force_separate_process) {
            const child = this._rrproc[this._nextProcess];
            this._nextProcess++;
            this._nextProcess = this._nextProcess % this._rrproc.length;
            return child.waitReady();
        } else {
            const child = new EngineProcess(user.id, user.cloud_id);
            this._processes[user.id] = child;
            child.on('exit', () => {
                if (this._processes[user.id] === child)
                    delete this._processes[user.id];
            });
            return child.start().then(() => child);
        }
    }

    _runUser(user) {
        var engines = this._engines;
        var obj = { cloudId: user.cloud_id, process: null, engine: null };
        engines[user.id] = obj;
        var die = (manual) => {
            obj.process.removeListener('exit', die);
            obj.process.removeListener('engine-removed', onRemoved);
            if (obj.thingpediaClient)
                obj.thingpediaClient.$free();
            if (engines[user.id] !== obj)
                return;
            delete engines[user.id];

            // if the EngineManager is being stopped, the user will die
            // the "hard" way (by killing the worker process)
            // we don't want to restart it either way
            if (this._stopped)
                manual = true;
            if (!manual && obj.process.shared) {
                // if the process died, some user might have been killed as a side effect
                // set timeout to restart the user 10 s in the future
                setTimeout(() => {
                    this.restartUser(user.id);
                }, 10000);
            }
        };
        var onRemoved = (deadUserId) => {
            if (user.id !== deadUserId)
                return;

            die(true);
        };

        return this._findProcessForUser(user).then((child) => {
            console.log('Running engine for user ' + user.id + ' in shard ' + this._shardId);

            obj.process = child;

            child.on('engine-removed', onRemoved);
            child.on('exit', die);

            if (Config.WITH_THINGPEDIA === 'embedded')
                obj.thingpediaClient = new ThingpediaClient(user.developer_key, user.locale);
            else
                obj.thingpediaClient = null;
            return child.runEngine(user, obj.thingpediaClient);
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

    _startSharedProcesses(nprocesses) {
        let promises = new Array(nprocesses);
        this._rrproc = new Array(nprocesses);
        this._nextProcess = 0;
        for (let i = 0; i < nprocesses; i++) {
            const procId = `${this._shardId}/S${i}`;
            const proc = new EngineProcess(procId, null);
            proc.on('exit', () => {
                if (this._stopped)
                    return;
                proc.restart(5000);
            });

            this._rrproc[i] = proc;
            promises[i] = proc.start();
            this._processes[procId] = proc;
        }

        return Promise.all(promises);
    }

    _getNProcesses() {
        let ncpus, nprocesses;

        if (ENABLE_SHARED_PROCESS) {
            ncpus = os.cpus().length;
            nprocesses = 2 * ncpus;
        } else {
            ncpus = 0; nprocesses = 0;
        }

        return nprocesses;
    }

    async start() {
        await this._startSharedProcesses(this._getNProcesses());

        await db.withClient(async (client) => {
            const rows = await user.getAllForShardId(client, this._shardId);
            return Promise.all(rows.map((r) => {
                return this._runUser(r).catch((e) => {
                    console.error('User ' + r.id + ' failed to start: ' + e.message);
                });
            }));
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

    async stop() {
        this._stopped = true;
        await this.killAllUsers();
        console.log(`EngineManager stopped`);
    }

    killAllUsers() {
        const promises = [];
        for (let userId in this._processes) {
            const proc = this._processes[userId];
            proc.kill();
            promises.push(proc.waitDead());
        }
        return Promise.all(promises).then(() => true);
    }

    killUser(userId) {
        let obj = this._engines[userId];
        if (!obj || obj.process === null)
            return Promise.resolve();
        return Promise.resolve(obj.process.killEngine(userId));
    }

    _getUserCloudIdForPath(userId) {
        let obj = this._engines[userId];
        if (obj) {
            if (obj.process !== null)
                obj.process.killEngine(userId);
            return Promise.resolve(obj.cloudId);
        } else {
            return db.withClient((dbClient) => {
                return user.get(dbClient, userId);
            }).then((user) => {
                return user.cloud_id;
            });
        }
    }

    restartUser(userId) {
        return this.killUser(userId).then(() => {
            return this.startUser(userId);
        });
    }

    async deleteUser(userId) {
        await this.killUser(userId);

        console.log(`Deleting all data for ${userId}`);
        const dir = path.resolve('.', await this._getUserCloudIdForPath(userId));
        return util.promisify(child_process.execFile)('/bin/rm',
            ['-rf', dir]);
    }

    async clearCache(userId) {
        console.log(`Clearing cache for ${userId}`);
        const dir = path.resolve('.', await this._getUserCloudIdForPath(userId), 'cache');
        return util.promisify(child_process.execFile)('/bin/rm',
            ['-rf', dir]);
    }

    // restart a user with a clean cache folder
    // this is useful if the user just lost their developer key,
    // as after restart they will be placed in a shared process,
    // and we don't want them having access to unapproved (and dangerous)
    // devices through the cache
    //
    // FIXME: there is a race condition here if you restart the user at just
    // the right time before the cache is cleared, because this whole method
    // is run after the database has been updated
    async restartUserWithoutCache(userId) {
        await this.killUser(userId);
        await this.clearCache(userId);
        await this.startUser(userId);
    }
}
EngineManager.prototype.$rpcMethods = ['isRunning', 'getProcessId', 'startUser', 'killUser', 'killAllUsers',  'restartUser', 'deleteUser', 'clearCache', 'restartUserWithoutCache'];

module.exports = EngineManager;
