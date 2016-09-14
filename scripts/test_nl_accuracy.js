// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');
const byline = require('byline');
const events = require('events');
const deepEqual = require('deep-equal');

const ThingTalk = require('thingtalk');

const SempreClient = require('./deps/sempreclient');

function deq(a, b) {
    return deepEqual(a, b, { strict: true });
}

class LinkedQueue {
    constructor() {
        this._head = null;
        this._tail = null;
    }

    get isEmpty() {
        return this._head === null;
    }

    offer(data) {
        if (this._tail === null) {
            this._tail = this._head = {
                next: null,
                data: data
            }
        } else {
            var tail = this._tail;
            this._tail = {
                next: null,
                data: data
            }
            tail.next = this._tail;
        }
    }

    poll() {
        if (this._head === null)
            return null;

        var head = this._head;
        this._head = head.next;
        if (this._head === null)
            this._tail = null;
        return head.data;
    }
}

class PromiseQueue extends events.EventEmitter {
    constructor(fn) {
        super();
        this._queue = new LinkedQueue();
        this._fn = fn;

        this._running = false;
        this._done = false;
    }

    done() {
        this._done = true;
    }

    enqueue(task) {
        this._queue.offer(task);
        if (!this._running)
            this._nextTask().done();
    }

    _nextTask() {
        this._running = true;
        return this._fn(this._queue.poll()).finally(() => {
            if (this._queue.isEmpty) {
                if (this._done)
                    this.emit('done');
                this._running = false;
            } else {
                return this._nextTask();
            }
        });
    }
}

function main() {
    var testFile = byline(fs.createReadStream(process.argv[2]));
    testFile.setEncoding('utf8');
    var sempre = new SempreClient();
    var state = {
        yes_literal: 0,
        yes_equal: 0,
        failed: 0,
        wrong_answer: 0
    };

    var queue = new PromiseQueue(function(data) {
        var line = data.split(/\t/);
        var utterance = line[0];
        var target_json = line[1];

        return sempre.sendUtterance(utterance).then(function(candidates) {
            if (candidates.length === 0 || candidates[0].answer === '{"special":{"id":"tt:root.special.failed"}}') {
                console.log(utterance + ' failed to parse, no candidates (wants ' + target_json + ' )');
                state.no++;
                return;
            }
            // ignore the first result if it does not come from ML
            if (candidates[0].score === 'Infinity')
                candidates.shift();

            if (candidates[0].answer === target_json) {
                state.yes_literal++;
                return;
            }
            if (deq(JSON.parse(candidates[0].answer), JSON.parse(target_json))) {
                state.yes_equal++;
                return;
            }

            console.log(utterance + ' failed to parse, is ' + candidates[0].answer + ', wants ' + target_json);
            state.wrong_answer++;
        });
    });
    testFile.on('data', (line) => { queue.enqueue(line); });
    testFile.on('end', () => { queue.done(); });
    queue.on('done', () => {
        console.log('Final state', state);
        process.exit();
    });
}

main();
