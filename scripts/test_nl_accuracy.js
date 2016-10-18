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
const util = require('util');
const deepEqual = require('deep-equal');

const ThingTalk = require('thingtalk');

const db = require('../util/db');
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

function arrayEqual(a, b) {
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }

    return true;
}

function invocationToKind(invocation) {
    var match = /^tt:([^\.]+)\.(.+)$/.exec(invocation.name.id);
    if (match === null)
        throw new TypeError('Channel name not in proper format');
    var kind = match[1];
    var channelName = match[2];
    return kind;
}

function invocationToChannel(invocation) {
    return invocation.name.id;
}

function main() {
    var language = process.argv[2] || 'en';

    var sempre = new SempreClient();
    var state = {
        total: 0,
        yes_literal: 0,
        yes_equal: 0,
        failed: 0,

        special: {
            total: 0,
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        },
        answer: {
            total: 0,
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        },
        meta: {
            total: 0,
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        },
        simple: {
            total: 0,
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        },
        rule: {
            total: 0,
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        }
    };

    var queue = new PromiseQueue(function(ex) {
        var utterance = ex.utterance;
        var target_json = ex.target_json;
        state.total++;

        return sempre.sendUtterance(utterance).then(function(candidates) {
            if (candidates.length === 0 || candidates[0].answer === '{"special":{"id":"tt:root.special.failed"}}') {
                console.log(ex.id + ' failed to parse, no candidates (wants ' + target_json + ' )');
                state.failed++;
                return;
            }
            // ignore the first result if it does not come from ML
            if (candidates[0].score === 'Infinity')
                candidates.shift();

            var parsedAnswer = JSON.parse(candidates[0].answer);
            var parsedTarget = JSON.parse(target_json);

            var substate;
            if (parsedTarget.answer)
                substate = state.answer;
            else if (parsedTarget.special)
                substate = state.special;
            else if (parsedTarget.command)
                substate = state.meta;
            else if (parsedTarget.rule)
                substate = state.rule;
            else
                substate = state.simple;

            substate.total++;

            if (candidates[0].answer === target_json) {
                console.log(ex.id + ' ok');
                state.yes_literal++;
                substate.yes++;
                return;
            }


            if (deq(parsedAnswer, parsedTarget)) {
                console.log(ex.id + ' ok');
                state.yes_equal++;
                substate.yes++;
                return;
            }

            substate.no++;

            // failed, but how much

            var answerKeys = Object.keys(parsedAnswer);
            if (answerKeys[0] === 'trigger' || answerKeys[0] === 'action' || answerKeys[0] === 'query')
                answerKeys[0] = 'simple';
            var targetKeys = Object.keys(parsedTarget);
            if (targetKeys[0] === 'trigger' || targetKeys[0] === 'action' || targetKeys[0] === 'query')
                targetKeys[0] = 'simple';

            if (!arrayEqual(answerKeys, targetKeys)) {
                if (substate === state.answer)
                    console.log(ex.id + ' wrong everything (wants ' + target_json + ' has ' + candidates[0].answer + ')');
                else
                    console.log(ex.id + ' wrong everything');
                substate.wrong_everything++;
                return;
            }

            // good command type, let's see if we can refine

            if (['simple','rule'].indexOf(answerKeys[0]) < 0) {
                if (substate === state.answer)
                    console.log(ex.id + ' wrong but ok type (wants ' + target_json + ' has ' + candidates[0].answer + ')');
                else
                    console.log(ex.id + ' wrong everything');
                substate.wrong_but_ok_type++;
                return;
            }

            var answerKinds = [];
            if (parsedAnswer.trigger) {
                answerKinds.push(invocationToKind(parsedAnswer.trigger));
            } else if (parsedAnswer.action) {
                answerKinds.push(invocationToKind(parsedAnswer.action));
            } else if (parsedAnswer.query) {
                answerKinds.push(invocationToKind(parsedAnswer.query));
            } else {
                if (parsedAnswer.rule.trigger)
                    answerKinds.push(invocationToKind(parsedAnswer.rule.trigger));
                if (parsedAnswer.rule.action)
                    answerKinds.push(invocationToKind(parsedAnswer.rule.action));
                if (parsedAnswer.rule.query)
                    answerKinds.push(invocationToKind(parsedAnswer.rule.query));
            }
            answerKinds.sort();

            var targetKinds = [];
            if (parsedTarget.trigger) {
                targetKinds.push(invocationToKind(parsedTarget.trigger));
            } else if (parsedTarget.action) {
                targetKinds.push(invocationToKind(parsedTarget.action));
            } else if (parsedTarget.query) {
                targetKinds.push(invocationToKind(parsedTarget.query));
            } else {
                if (parsedTarget.rule.trigger)
                    targetKinds.push(invocationToKind(parsedTarget.rule.trigger));
                if (parsedTarget.rule.action)
                    targetKinds.push(invocationToKind(parsedTarget.rule.action));
                if (parsedTarget.rule.query)
                    targetKinds.push(invocationToKind(parsedTarget.rule.query));
            }
            targetKinds.sort();

            if (!arrayEqual(answerKinds, targetKinds)) {
                console.log(ex.id + ' wrong but ok type');
                substate.wrong_but_ok_type++;
                return;
            }

            // good kind, let's see if we can refine

            var answerChannels = [];
            if (parsedAnswer.trigger) {
                answerChannels.push(invocationToChannel(parsedAnswer.trigger));
            } else if (parsedAnswer.action) {
                answerChannels.push(invocationToChannel(parsedAnswer.action));
            } else if (parsedAnswer.query) {
                answerChannels.push(invocationToChannel(parsedAnswer.query));
            } else {
                if (parsedAnswer.rule.trigger)
                    answerChannels.push(invocationToChannel(parsedAnswer.rule.trigger));
                if (parsedAnswer.rule.action)
                    answerChannels.push(invocationToChannel(parsedAnswer.rule.action));
                if (parsedAnswer.rule.query)
                    answerChannels.push(invocationToChannel(parsedAnswer.rule.query));
            }
            answerChannels.sort();

            var targetChannels = [];
            if (parsedTarget.trigger) {
                targetChannels.push(invocationToChannel(parsedTarget.trigger));
            } else if (parsedTarget.action) {
                targetChannels.push(invocationToChannel(parsedTarget.action));
            } else if (parsedTarget.query) {
                targetChannels.push(invocationToChannel(parsedTarget.query));
            } else {
                if (parsedTarget.rule.trigger)
                    targetChannels.push(invocationToChannel(parsedTarget.rule.trigger));
                if (parsedTarget.rule.action)
                    targetChannels.push(invocationToChannel(parsedTarget.rule.action));
                if (parsedTarget.rule.query)
                    targetChannels.push(invocationToChannel(parsedTarget.rule.query));
            }
            targetChannels.sort();

            if (!arrayEqual(answerChannels, targetChannels)) {
                console.log(ex.id + ' wrong but ok kind');
                substate.wrong_but_ok_kind++;
                return;
            }

            // good kind and channel, that's the most we can do
            console.log(ex.id + ' wrong but ok channel');
            substate.wrong_but_ok_channel++;
        });
    });

    db.connect().then(([dbClient, done]) => {
        var query = dbClient.query("select * from example_utterances where type = 'test' and language = ?", [language]);
        query.on('result', (ex) => { queue.enqueue(ex); });
        query.on('end', () => { queue.done(); });
    });
    queue.on('done', () => {
        console.log('Final state: ' + util.inspect(state, { depth: null }));
        process.exit();
    });
}

main();
