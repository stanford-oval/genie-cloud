// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 Ryan Cheng <ryachen@nuevaschool.org>
//
// See COPYING for details
"use strict";

const child_process = require('child_process');

const JsonDatagramSocket = require('../util/json_datagram_socket');

class NLPClassifier {
    constructor() {
        // spawn python process
        this.pythonProcess = child_process.spawn('python3', ['-u',
            __dirname + "/python_classifier/classifier.py"]);

        this.concurrentRequests = new Map();
        this.isLive = true;
        this.counter = 0;

        this._stream = new JsonDatagramSocket(this.pythonProcess.stdout, this.pythonProcess.stdin, 'utf8');
        this._stream.on('data', (msg) => {
            const id = msg.id;

            // matches id of request to handle concurrent requests
            if (msg.error) {
                this.concurrentRequests.get(id).reject(msg);
                this.concurrentRequests.delete(id);
            } else {
                this.concurrentRequests.get(id).resolve(msg);
                this.concurrentRequests.delete(id);
            }
        });

        // error handling
        this._stream.on('error', (msg) => {
            console.log("error occured");
        });
        this._stream.on('end', (error) => {
            console.log("Ending Python Process");
        });
        this._stream.on('close', (hadError) => {
            console.log("Closing Python Process");
            this.isLive = false;
            for (let { reject } of this.concurrentRequests.values())
                reject(new Error("Python Process Closed"));
        });
    }

    _newPromise(id){
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
            new_promise.reject(Error("Python Process Dead"));
        } else {
            this._stream.write(
                { id: this.counter, sentence: input }
            );
            this.concurrentRequests.set(this.counter, new_promise);
            this.counter += 1;
        }
        return new_promise.promise;
    }
}

module.exports = new NLPClassifier();
