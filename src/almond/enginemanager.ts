// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as events from 'events';
import * as stream from 'stream';
import * as rpc from 'transparent-rpc';
import * as util from 'util';
import * as net from 'net';

import * as user from '../model/user';
import * as db from '../util/db';
import ThingpediaClient from '../util/thingpedia-client';
import Lock from '../util/lock';
import * as Config from '../config';
import { InternalError } from '../util/errors';

import type { EngineFactory } from './worker';
import type Engine from './engine';

import * as proto from './protocol';

class ChildProcessSocket extends stream.Duplex {
    private _child : child_process.ChildProcess;

    constructor(child : child_process.ChildProcess) {
        super({ objectMode: true });

        this._child = child;

        this._child.on('error', (err) => {
            console.error(`Failed to send message to child: ${err.message}`);
        });
    }

    _read() {}

    _write(data : unknown, encoding : BufferEncoding, callback : (err ?: Error|null) => void) : void {
        try {
            this._child.send({ type: 'rpc', data: data }, undefined, callback);
        } catch(e) {
            callback(e);
        }
    }
}

const ENABLE_SHARED_PROCESS = true;

function safeMkdirSync(dir : string) {
    try {
        fs.mkdirSync(dir);
    } catch(e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
}

function delay(ms : number) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
}

function getUserDeveloperKey(user : user.RowWithOrg) {
    if (user.developer_key)
        return user.developer_key;

    if (Config.ENABLE_DEVELOPER_PROGRAM || Config.WITH_THINGPEDIA === 'embedded')
        return null;

    return Config.THINGPEDIA_DEVELOPER_KEY;
}

class EngineProcess extends events.EventEmitter {
    private _id : string|number;
    useCount : number;
    shared : boolean;

    private _cwd : string;
    private _child : child_process.ChildProcess|null;
    private _rpcSocket : rpc.Socket|null;
    private _rpcId : rpc.RpcId|null;

    private _sandboxed : boolean;
    private _sandboxedPid : number|null;
    private _hadExit : boolean;

    private _starting : Promise<void>|null;
    private _deadPromise : Promise<number|null>|null;
    private _deadCallback : ((code : number|null) => void)|null;
    private _dyingTimeout : NodeJS.Timeout|null;

    constructor(id : string|number, cloudId : string|null) {
        super();
        this.setMaxListeners(Infinity);

        this._id = id;

        this.useCount = 0;
        this.shared = cloudId === null;

        this._cwd = this.shared ? './' : ('./' + cloudId);
        safeMkdirSync(this._cwd);
        this._child = null;
        this._rpcSocket = null;
        this._rpcId = null;

        this._sandboxed = !this.shared && process.env.THINGENGINE_DISABLE_SANDBOX !== '1';
        this._sandboxedPid = null;
        this._hadExit = false;
        this._starting = null;
        this._deadPromise = null;
        this._deadCallback = null;
        this._dyingTimeout = null;
    }

    get id() {
        return this._id;
    }

    runEngine(user : user.RowWithOrg, thingpediaClient : ThingpediaClient|null) {
        this.useCount++;

        if (this.shared)
            safeMkdirSync(this._cwd + '/' + user.cloud_id);

        const args : rpc.RpcMarshalArgs<Parameters<EngineFactory['runEngine']>> = [thingpediaClient, {
            userId: user.id,
            cloudId: user.cloud_id,
            authToken: user.auth_token,
            developerKey: getUserDeveloperKey(user),
            locale: user.locale,
            timezone: user.timezone,
            storageKey: user.storage_key,
            modelTag: user.model_tag,
            dbProxyUrl: Config.DATABASE_PROXY_URL,
        }];
        return this._rpcSocket!.call(this._rpcId!, 'runEngine', args);
    }

    killEngine(userId : number) {
        if (!this.shared)
            return this.kill();
        this.useCount--;
        return this._rpcSocket!.call(this._rpcId!, 'killEngine', [userId]).then(() => {
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

            this._dyingTimeout = setTimeout(() => {
                if (this._sandboxedPid !== null) {
                    process.kill(this._sandboxedPid, 'SIGKILL');
                    this._sandboxedPid = null;
                } else if (this._child !== null) {
                    this._child.kill('SIGKILL');
                }

                reject(new InternalError('ETIMEDOUT', `Timeout waiting for child ${this._id} to die`));
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

    restart(ms : number) {
        this._child = null;
        this._rpcSocket = null;
        this._rpcId = null;
        return this._starting = delay(ms).then(() => this.start());
    }

    waitReady() {
        return Promise.resolve(this._starting).then(() => this);
    }
    waitDead() {
        return Promise.resolve(this._deadPromise);
    }

    send(msg : proto.MasterToWorker, socket ?: net.Socket) {
        this._child!.send(msg, socket);
    }

    private _handleInfoFD(pipe : stream.Readable) {
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

    private _addConfigArgs(args : string[]) {
        args.push(
            '--thingpedia-url', Config.THINGPEDIA_URL,
            '--nl-server-url', Config.NL_SERVER_URL,
            '--oauth-redirect-origin', Config.OAUTH_REDIRECT_ORIGIN,
            '--faq-models', JSON.stringify(Config.FAQ_MODELS),
        );
        for (const lang of Config.SUPPORTED_LANGUAGES)
            args.push('--locale', lang);
    }

    start() {
        const ALLOWED_ENVS = ['LANG', 'LOGNAME', 'USER', 'PATH',
                              'HOME', 'SHELL', 'THINGENGINE_PROXY',
                              'CI', 'THINGENGINE_DISABLE_SYSTEMD'];
        function envIsAllowed(name : string) {
            if (name.startsWith('LC_'))
                return true;
            if (ALLOWED_ENVS.indexOf(name) >= 0)
                return true;
            return false;
        }

        const env : Record<string, string> = {};
        for (const name in process.env) {
            if (envIsAllowed(name))
                env[name] = process.env[name]!;
        }
        env.THINGENGINE_USER_ID = String(this._id);

        const managerPath = path.dirname(module.filename);
        const enginePath = path.resolve(managerPath, './worker');
        let child : child_process.ChildProcess;

        console.log('Spawning process with ID ' + this._id);

        let processPath, args, stdio;
        if (this.shared) {
            args = process.execArgv.slice();
            args.push(enginePath);
            args.push('--shared');
            this._addConfigArgs(args);
            child = child_process.spawn(process.execPath, args,
                                        { stdio: ['ignore', 'ignore', 2, 'ignore', 'ipc'],
                                          detached: true, // ignore ^C
                                          cwd: this._cwd, env: env });
        } else {
            if (process.env.THINGENGINE_DISABLE_SANDBOX === '1') {
                processPath = process.execPath;
                args = process.execArgv.slice();
                args.push(enginePath);
                this._addConfigArgs(args);
                stdio = ['ignore', 1, 2, 'ignore', 'ipc'] as Array<'ignore'|'ipc'|number>;
            } else {
                processPath = path.resolve(managerPath, '../../sandbox/sandbox');
                args = [process.execPath].concat(process.execArgv);
                args.push(enginePath);
                this._addConfigArgs(args);
                stdio = ['ignore', 1, 2, 'pipe', 'ipc'] as Array<'ignore'|'ipc'|number>;

                const jsPrefix = path.resolve(path.dirname(managerPath), '..');
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
            this._handleInfoFD(child.stdio[3] as stream.Readable);

        // wrap child into something that looks like a Stream
        // (readable + writable)
        const socket = new ChildProcessSocket(child);
        this._rpcSocket = new rpc.Socket(socket);

        return this._starting = new Promise((resolve, reject) => {
            child.on('error', (error) => {
                console.error('Child with ID ' + this._id + ' reported an error: ' + error);
                reject(new InternalError('E_WORKER_ERROR', 'Reported error ' + error));
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
                if (this._dyingTimeout !== null) {
                    clearTimeout(this._dyingTimeout);
                    this._dyingTimeout = null;
                }

                if (this.shared || code !== 0)
                    console.error('Child with ID ' + this._id + ' exited with code ' + code);
                reject(new InternalError('E_WORKER_ERROR', 'Exited with code ' + code));

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
            child.on('message', (msg : proto.WorkerToMaster) => {
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

interface EngineProxy {
    cloudId : string;
    process : EngineProcess|null;
    engine : rpc.Proxy<Engine>|null;
    thingpediaClient : ThingpediaClient|null;
}

export default class EngineManager extends events.EventEmitter implements rpc.Stubbable {
    $rpcMethods = ['isRunning', 'getProcessId', 'startUser', 'killUser', 'killAllUsers',  'restartUser', 'deleteUser', 'clearCache', 'restartUserWithoutCache'] as const;
    $free ?: () => void;

    private _shardId : number;
    private _processes : Record<string, EngineProcess>;
    private _rrproc : EngineProcess[];
    private _nextProcess : number;
    private _engines : Record<number, EngineProxy>;
    private _locks : Record<number, Lock>;
    private _stopped : boolean;

    constructor(shardId : number) {
        super();
        this._shardId = shardId;
        this._processes = {};
        this._rrproc = [];
        this._nextProcess = 0;
        this._engines = {};
        this._locks = {};
        this._stopped = false;
    }

    private _findProcessForUser(user : user.RowWithOrg) {
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

    private async _lockUser(userId : number) {
        if (!this._locks[userId])
            this._locks[userId] = new Lock();

        return this._locks[userId].acquire();
    }

    private async _runUser(user : user.RowWithOrg) {
        const engines = this._engines;
        const obj : EngineProxy = {
            cloudId: user.cloud_id,
            process: null,
            engine: null,
            thingpediaClient : null
        };
        engines[user.id] = obj;
        const die = (manual : boolean) => {
            obj.process!.removeListener('exit', die);
            obj.process!.removeListener('engine-removed', onRemoved);
            if (obj.thingpediaClient)
                (obj.thingpediaClient as any /* FIXME */).$free();
            if (engines[user.id] !== obj)
                return;
            delete engines[user.id];

            // if the EngineManager is being stopped, the user will die
            // the "hard" way (by killing the worker process)
            // we don't want to restart it either way
            if (this._stopped)
                manual = true;
            if (!manual && obj.process!.shared) {
                // if the process died, some user might have been killed as a side effect
                // set timeout to restart the user 10 s in the future
                setTimeout(() => {
                    this.restartUser(user.id);
                }, 10000);
            }
        };
        const onRemoved = (deadUserId : number) => {
            if (user.id !== deadUserId)
                return;

            die(true);
        };

        const child = await this._findProcessForUser(user);
        console.log('Running engine for user ' + user.id + ' in shard ' + this._shardId);

        obj.process = child;

        child.on('engine-removed', onRemoved);
        child.on('exit', die);

        if (Config.WITH_THINGPEDIA === 'embedded')
            obj.thingpediaClient = new ThingpediaClient(user.developer_key, user.locale);
        else
            obj.thingpediaClient = null;

        return child.runEngine(user, obj.thingpediaClient);
    }

    isRunning(userId : number) {
        return (this._engines[userId] !== undefined && this._engines[userId].process !== null);
    }

    getProcessId(userId : number) {
        return (this._engines[userId] !== undefined && this._engines[userId].process !== null) ? this._engines[userId].process!.id : -1;
    }

    async sendSocket(userId : number, replyId : number, socket : net.Socket) {
        if (this._engines[userId] === undefined)
            throw new InternalError('E_INVALID_USER', 'Invalid user ID');
        if (this._engines[userId].process === null)
            throw new InternalError('E_ENGINE_DEAD', 'Engine dead');

        const releaseLock = await this._lockUser(userId);
        try {
            this._engines[userId].process!.send({ type: 'direct', target: userId, replyId: replyId }, socket);
        } finally {
            releaseLock();
        }
    }

    private _startSharedProcesses(nprocesses : number) {
        const promises = new Array(nprocesses);
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

    private _getNProcesses() {
        let nprocesses;

        if (ENABLE_SHARED_PROCESS) {
            const ncpus = os.cpus().length;
            nprocesses = 2 * ncpus;
        } else {
            nprocesses = 0;
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

    async startUser(userId : number) {
        console.log('Requested start of user ' + userId);
        const releaseLock = await this._lockUser(userId);
        try {
            await this._startUserLocked(userId);
        } finally {
            releaseLock();
        }
    }

    private async _startUserLocked(userId : number) {
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
        for (const userId in this._processes) {
            const proc = this._processes[userId];
            proc.kill();
            promises.push(proc.waitDead());
        }
        return Promise.all(promises).then(() => true);
    }

    private async _killUserLocked(userId : number) {
        const obj = this._engines[userId];
        if (!obj || obj.process === null)
            return;
        await obj.process.killEngine(userId);
    }

    async killUser(userId : number) {
        console.log('Requested killing user ' + userId);
        const releaseLock = await this._lockUser(userId);
        try {
            await this._killUserLocked(userId);
        } finally {
            releaseLock();
        }
    }

    private _getUserCloudIdForPath(userId : number) {
        const obj = this._engines[userId];
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

    async restartUser(userId : number) {
        console.log('Requested restart of user ' + userId);
        const releaseLock = await this._lockUser(userId);
        try {
            await this._killUserLocked(userId);
            await this._startUserLocked(userId);
        } finally {
            releaseLock();
        }
    }

    async deleteUser(userId : number) {
        console.log(`Deleting all data for ${userId}`);
        const releaseLock = await this._lockUser(userId);
        try {
            await this._killUserLocked(userId);

            const dir = path.resolve('.', await this._getUserCloudIdForPath(userId));
            await util.promisify(child_process.execFile)('/bin/rm', ['-rf', dir]); //'
        } finally {
            releaseLock();
            delete this._locks[userId];
        }
    }

    private async _clearCacheLocked(userId : number) {
        const dir = path.resolve('.', await this._getUserCloudIdForPath(userId), 'cache');
        await util.promisify(child_process.execFile)('/bin/rm',
            ['-rf', dir]);
    }

    async clearCache(userId : number) {
        console.log(`Clearing cache for ${userId}`);
        const releaseLock = await this._lockUser(userId);
        try {
            await this._clearCacheLocked(userId);
        } finally {
            releaseLock();
        }
    }

    // restart a user with a clean cache folder
    // this is useful if the user just lost their developer key,
    // as after restart they will be placed in a shared process,
    // and we don't want them having access to unapproved (and dangerous)
    // devices through the cache
    async restartUserWithoutCache(userId : number) {
        console.log(`Requested cache clear & restart of user ${userId}`);
        const releaseLock = await this._lockUser(userId);
        try {
            await this._killUserLocked(userId);
            await this._clearCacheLocked(userId);
            await this._startUserLocked(userId);
        } finally {
            releaseLock();
        }
    }
}
