// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const Lock = require('../../util/lock');

function delay(timeout) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, timeout);
    });
}

async function withTimeout(promise, timeout = 30000) {
    await Promise.race([
        promise,
        new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error(`timed out after ${timeout} ms`)), timeout);
        })
    ]);
}

async function testBasic() {
    const lock = new Lock();

    const release1 = await lock.acquire();
    assert.strictEqual(typeof release1, 'function');
    // critical section
    release1();

    const release2 = await lock.acquire();
    assert(release1 !== release2);
    assert.strictEqual(typeof release2, 'function');
    // critical section
    release2();
}

async function testInterleave() {
    const lock = new Lock();
    const output = [];

    async function thread1() {
        const release1 = await lock.acquire();
        output.push(1);
        await delay(1000);
        output.push(2);
        release1();
        await delay(1000);
        const release2 = await lock.acquire();
        output.push(5);
        release2();
    }

    async function thread2() {
        await delay(500);
        const release1 = await lock.acquire();
        output.push(3);
        await delay(500);
        output.push(4);
        release1();
    }

    await Promise.all([
        thread1(),
        thread2()
    ]);
    assert.deepStrictEqual(output, [1, 2, 3, 4, 5]);
}

async function testQueue() {
    const lock = new Lock();
    const output = [];

    async function thread1() {
        const release1 = await lock.acquire();
        output.push(1);
        await delay(5000);
        output.push(2);
        release1();
    }

    async function thread2() {
        await delay(500);
        const release1 = await lock.acquire();
        output.push(3);
        await delay(500);
        output.push(4);
        release1();
    }

    async function thread3() {
        await delay(1500);
        const release1 = await lock.acquire();
        output.push(5);
        output.push(6);
        release1();
    }

    await Promise.all([
        thread1(),
        thread2(),
        thread3()
    ]);
    assert.deepStrictEqual(output, [1, 2, 3, 4, 5, 6]);
}

async function main() {
    await withTimeout(testBasic());
    await withTimeout(testInterleave());
    await withTimeout(testQueue());
}
module.exports = main;
if (!module.parent)
    main();
