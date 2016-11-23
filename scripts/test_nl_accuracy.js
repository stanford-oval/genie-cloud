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
const SempreSyntax = require('../util/sempre_syntax');

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
        return this._fn(this._queue.poll()).catch((e) => this.emit('error', e)).finally(() => {
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

function logFail(ex, parsedAnswer, parsedTarget) {
    console.log("Utterance: " + ex.utterance);
    console.log("Expected: " + SempreSyntax.toThingTalk(parsedTarget));
    console.log("Parsed: " + SempreSyntax.toThingTalk(parsedAnswer));
    console.log();
}

function normalizeInvocation(invocation) {
    if (!invocation)
        return;
    invocation.args.sort((a, b) => {
        var aname = a.name.id;
        var bname = b.name.id;
        if (aname < bname)
            return -1;
        if (aname > bname)
            return 1;
        return 0;
    });
}

function normalize(v) {
    if (v.action)
        normalizeInvocation(v.action);
    if (v.query)
        normalizeInvocation(v.query);
    if (v.trigger)
        normalizeInvocation(v.trigger);
    else if (v.rule) {
        normalizeInvocation(v.rule.action);
        normalizeInvocation(v.rule.query);
        normalizeInvocation(v.rule.trigger);
    }
}

function increase(v) {
    if (v === undefined)
        return 1;
    else
        return v+1;
}

function compare(candidates, ex, state) {
    var utterance = ex.utterance;
    var target_json = ex.target_json;

    if (candidates.length === 0 || candidates[0].answer === '{"special":{"id":"tt:root.special.failed"}}') {
        console.log(ex.id + ' failed to parse, no candidates (wants ' + target_json + ' )');
        state.failed++;
        return;
    }
    // ignore the first result if it does not come from ML
    if (candidates[0].score === 'Infinity') {
        if (candidates[0].answer !== target_json)
            console.log('Dataset problem at ' + ex.id + ', multiple conflicting answers');
        candidates.shift();
    }

    var parsedAnswer = JSON.parse(candidates[0].answer);
    var parsedTarget = JSON.parse(target_json);

    normalize(parsedAnswer);
    normalize(parsedTarget);

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
        substate.oracle[0] = increase(substate.oracle[0]);
        return;
    }


    if (deq(parsedAnswer, parsedTarget)) {
        console.log(ex.id + ' ok');
        state.yes_equal++;
        substate.yes++;
        substate.oracle[0] = increase(substate.oracle[0]);
        return;
    }

    substate.no++;

    for (var i = 1; i < Math.min(10, candidates.length); i++) {
        if (candidates[i].answer === target_json) {
            substate.oracle[i] = increase(substate.oracle[i]);
            break;
        }
        var parsedCandidate = JSON.parse(candidates[i].answer);
        normalize(parsedCandidate);
        if (deq(parsedTarget, parsedCandidate)) {
            substate.oracle[i] = increase(substate.oracle[i]);
            break;
        }
    }

    // failed, but how much

    var answerKeys = Object.keys(parsedAnswer);
    if (answerKeys[0] === 'trigger' || answerKeys[0] === 'action' || answerKeys[0] === 'query')
        answerKeys[0] = 'simple';
    var targetKeys = Object.keys(parsedTarget);
    if (targetKeys[0] === 'trigger' || targetKeys[0] === 'action' || targetKeys[0] === 'query')
        targetKeys[0] = 'simple';

    if (!arrayEqual(answerKeys, targetKeys)) {
        console.log(ex.id + ' wrong everything');
        logFail(ex, parsedAnswer, parsedTarget);
        substate.wrong_everything++;
        return;
    }

    // good command type, let's see if we can refine

    if (['simple','rule'].indexOf(answerKeys[0]) < 0) {
        console.log(ex.id + ' wrong everything');
        logFail(ex, parsedAnswer, parsedTarget);
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
        logFail(ex, parsedAnswer, parsedTarget);
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
        logFail(ex, parsedAnswer, parsedTarget);
        substate.wrong_but_ok_kind++;
        return;
    }

    // good kind and channel, that's the most we can do
    console.log(ex.id + ' wrong but ok channel');
    logFail(ex, parsedAnswer, parsedTarget);
    substate.wrong_but_ok_channel++;
}

function main() {
    var language = process.argv[2] || 'en';
    var types = (process.argv[3] || 'test').split(',');

    var sempre = new SempreClient();
    var state = {
        total: 0,
        yes_literal: 0,
        yes_equal: 0,
        failed: 0,

        special: {
            total: 0,
            oracle: [],
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        },
        answer: {
            total: 0,
            oracle: [],
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        },
        meta: {
            total: 0,
            oracle: [],
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        },
        simple: {
            total: 0,
            oracle: [],
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        },
        rule: {
            total: 0,
            oracle: [],
            yes: 0,
            no: 0,
            wrong_everything: 0,
            wrong_but_ok_type: 0,
            wrong_but_ok_kind: 0,
            wrong_but_ok_channel: 0,
        }
    };

    var queue = new PromiseQueue(function(ex) {
        state.total++;

        return sempre.sendUtterance(ex.utterance).then(function(candidates) {
            try {
                compare(candidates, ex, state);
            } catch(e) {
                console.error('Failed to compare: ' + e.message);
            }
        });
    });

    db.connect().then(([dbClient, done]) => {
        console.log('connected');
        var query = dbClient.query("select * from example_utterances where type in (?) and language = ?", [types, language]);
        query.on('result', (ex) => { queue.enqueue(ex); });
        query.on('end', () => { queue.done(); });
        query.on('error', (e) => { console.error(e) });
    }).done();
    queue.on('done', () => {
        console.log('Final state: ' + util.inspect(state, { depth: null }));

        var overall = state.simple.total + state.rule.total;
        var overallYes = state.simple.yes + state.rule.yes;
        var overallCorrectFunction = overallYes + state.simple.wrong_but_ok_channel + state.rule.wrong_but_ok_channel;
        var overallCorrectDevice = overallCorrectFunction + state.simple.wrong_but_ok_kind + state.rule.wrong_but_ok_kind;

        console.log('Overall full accuracy: ' + (overallYes/overall));
        console.log('Overall correct function: ' + (overallCorrectFunction/overall));
        console.log('Overall correct device: ' + (overallCorrectDevice/overall));

        if (state.simple.total > 0) {
            console.log('Primitive full accuracy: ' + (state.simple.yes/state.simple.total));
            console.log('Primitive correct function: ' + ((state.simple.yes + state.simple.wrong_but_ok_channel)/state.simple.total));
            console.log('Primitive correct device: ' + ((state.simple.yes + state.simple.wrong_but_ok_channel + state.simple.wrong_but_ok_kind)/state.simple.total));
        }
        if (state.rule.total > 0) {
            console.log('Compound full accuracy: ' + (state.rule.yes/state.rule.total));
            console.log('Compound correct function: ' + ((state.rule.yes + state.rule.wrong_but_ok_channel)/state.rule.total));
            console.log('Compound correct device: ' + ((state.rule.yes + state.rule.wrong_but_ok_channel + state.rule.wrong_but_ok_kind)/state.rule.total));
        }
        process.exit();
    });
}

main();
