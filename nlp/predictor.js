// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const events = require('events');
const child_process = require('child_process');
const os = require('os');

const JsonDatagramSocket = require('../util/json_datagram_socket');

class Worker extends events.EventEmitter {
    constructor(id, modeldir) {
        super();

        this.id = id;
        this._child = null;
        this._hadError = false;
        this._stream = null;
        this._nextId = 0;
        this._requests = new Map;

        this._modeldir = modeldir;
    }

    get ok() {
        return this._child !== null && !this._hadError;
    }

    get busy() {
        return this._requests.size > 0;
    }

    stop() {
        if (this._child)
            this._child.kill();
        this._child = null;
    }

    start() {
        const args = [
            'server',
            '--stdin',
            '--path', this._modeldir
        ];
        if (process.env.DECANLP_EMBEDDINGS)
            args.push('--embeddings', process.env.DECANLP_EMBEDDINGS);

        this._child = child_process.spawn('decanlp', args, {
            stdio: ['pipe', 'pipe', 'inherit']
        });
        this._child.on('error', (e) => {
            this._failAll(e);
            this._hadError = true;
            this.emit('error', e);
        });
        this._child.on('exit', () => {
            this._failAll(new Error(`Worker died`));
            this._child = null;
            this.emit('exit');
        });

        this._stream = new JsonDatagramSocket(this._child.stdout, this._child.stdin, 'utf8');

        this._stream.on('error', (e) => {
            this._failAll(e);
            this._hadError = true;
            this.emit('error', e);
        });
        this._stream.on('data', (msg) => {
            if (msg.error) {
                this._requests.get(msg.id).reject(new Error(msg.error));
            } else if (msg.candidates) {
                this._requests.get(msg.id).resolve(msg.candidates.map((c) => {
                    return {
                        code: c.answer.split(' '),
                        score: c.score
                    };
                }));
            } else {
                // no beam search, hence only one candidate, and fixed score
                this._requests.get(msg.id).resolve([{
                    code: msg.answer.split(' '),
                    score: 1
                }]);
            }
            this._requests.delete(msg.id);
        });
    }

    _failAll(error) {
        for (let { reject } of this._requests.values())
            reject(error);
        this._requests.clear();
    }

    request(tokens) {
        const id = this._nextId ++;

        let resolve, reject;
        const promise = new Promise((_resolve, _reject) => {
            resolve = _resolve;
            reject = _reject;
        });
        this._requests.set(id, { resolve, reject });

        this._stream.write({
            id,
            context: tokens.join(' '),
            question: 'Translate from English to ThingTalk',
            task: 'almond'
        });

        return promise;
    }
}

module.exports = class Predictor {
    constructor(id, modeldir, { isDefault = false }) {
        this._nWorkers = isDefault ? os.cpus().length : 1;

        this.id = id;
        this._modeldir = modeldir;
        this._nextId = 0;
        this._workers = new Set;

        this._stopped = false;
    }

    start() {
        console.log(`Spawning ${this._nWorkers} workers for predictor ${this.id}`);
        for (let i = 0; i < this._nWorkers; i++)
            this._startWorker();
    }

    stop() {
        this._stopped = true;
        this._killall();
    }

    _killall() {
        for (let worker of this._workers)
            worker.stop();
    }

    reload() {
        // stop all workers and clear them up
        this._killall();
        this._workers.clear();

        // start again
        this.start();
    }

    _startWorker() {
        const worker = new Worker(`${this.id}/${this._nextId++}`, this._modeldir);
        worker.on('error', (err) => {
            console.error(`Worker ${worker.id} had an error: ${err.message}`);
            worker.stop();
        });
        worker.on('exit', (err) => {
            console.error(`Worker ${worker.id} exited`);
            this._workers.delete(worker);

            if (!this._stopped) {
                // wait 30 seconds, then autorespawn the worker
                // this ensures that we don't stay with fewer workers than
                // we should for too long, as that can overload the few workers
                // who are alive, and cause latency issues
                setTimeout(() => {
                    if (this._workers.size < this._nWorkers)
                        this._startWorker();
                }, 30000);
            }
        });

        worker.start();
        this._workers.add(worker);
        return worker;
    }

    predict(tokens) {
        // first pick a worker that is free
        for (let worker of this._workers) {
            if (worker.ok && !worker.busy)
                return worker.request(tokens);
        }

        // failing that, pick any worker that is alive
        for (let worker of this._workers) {
            if (worker.ok)
                return worker.request(tokens);
        }

        // failing that, spawn a new worker
        return this._startWorker().request(tokens);
    }
};
