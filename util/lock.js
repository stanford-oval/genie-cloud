// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

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
module.exports = class Lock {
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
};
