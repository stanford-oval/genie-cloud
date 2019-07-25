// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 Ryan Cheng <ryachen@nuevaschool.org>
//
// See COPYING for details
"use strict";

const child_process = require('child_process');
const path = require('path');

const JsonDatagramSocket = require('../util/json_datagram_socket');

module.exports = class FrontendClassifier {
    constructor(languageTag) {
        this.concurrentRequests = new Map();
        this.isLive = true;
        this.counter = 0;

        // spawn python process
        this._pythonProcess = child_process.spawn('python3', [
            path.resolve(path.dirname(module.filename), './python_classifier/classifier.py'),
            `./${languageTag}.classifier`
        ], {
            stdio: ['pipe', 'pipe', 'inherit']
        });
        this._pythonProcess.on('exit', () => {
            for (let { reject } of this.concurrentRequests.values())
                reject(new Error('Classifier worker died'));
            this.concurrentRequests.clear();

            // FIXME autorespawn...
        });

        this._stream = new JsonDatagramSocket(this._pythonProcess.stdout, this._pythonProcess.stdin, 'utf8');
        this._stream.on('data', (msg) => {
            const id = msg.id;

            // matches id of request to handle concurrent requests
            if (msg.error)
                this.concurrentRequests.get(id).reject(new Error(msg.error));
            else
                this.concurrentRequests.get(id).resolve(msg);
            this.concurrentRequests.delete(id);
        });

        // error handling
        this._stream.on('error', (err) => {
            // if we incur any error in communicating with the process, fail all requests

            for (let { reject } of this.concurrentRequests.values())
                reject(err);
            this.concurrentRequests.clear();
        });
        this._stream.on('close', () => {
            this.isLive = false;
        });
    }

    _newPromise(id) {
        var new_promise = {
            promise: null,
            resolve: null,
            reject: null,
            uniqueid: id
        };
        new_promise.promise = new Promise((resolve, reject) => {
            new_promise.resolve = resolve;
            new_promise.reject = reject;
        });
        return new_promise;
    }

    classify(input){
        const new_promise = this._newPromise(this.counter);
        if (!this.isLive) {
            new_promise.reject(new Error('Classifier worker died'));
        } else {
            this._stream.write(
                { id: this.counter, sentence: input }
            );
            this.concurrentRequests.set(this.counter, new_promise);
            this.counter += 1;
        }
        return new_promise.promise;
    }
};
