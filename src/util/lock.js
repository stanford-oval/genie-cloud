// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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


// Promise-based lock
//
// this._queue is a promise that is fulfilled when the lock is unlocked
//
// ourTurn is a promise that will be pending while we hold the lock
// calling `unlockCallback` fulfills the promise, releasing the lock
//
// we put ourTurn at the back of the queue with
// this._queue = this._queue.then(ourTurn);
// this means, whoever wants the lock after us, will wait for the current
// holder of the lock, and for us too
// then we `await oldQueue`, which means we wait for the queue before
// us to drain, and for the lock to be unlocked
// finally, we return the unlockCallback to the caller
//
// when acquire() returns, the lock is owned by the calling promise
// chain (async-await pseudo-thread); concurrent calls to acquire()
// will block in `await oldQueue` until `unlockCallback` is called
export default class Lock {
    constructor() {
        this._queue = Promise.resolve();
    }

    async acquire() {
        let unlockCallback;
        const ourTurn = new Promise((resolve) => {
            unlockCallback = resolve;
        });
        const oldQueue = this._queue;
        this._queue = this._queue.then(() => ourTurn);
        await oldQueue;
        return unlockCallback;
    }
}
