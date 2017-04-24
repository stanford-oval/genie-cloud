require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

// This file is meant to be used as an entry point to a browserify
// bundle
// we can use commonjs but no nodejs deps

const URL = 'https://sabrina-nl.stanford.edu';

function httpRequest(url) {
    var req = new XMLHttpRequest();
    req.open('GET', url);
    req.responseType = 'json';
    return Q.Promise(function(callback, errback) {
        req.onerror = function() {
            errback(new Error('Failed to contact SEMPRE server'));
        };
        req.onload = function() {
            callback(req.response);
        }
        req.send();
    });
}

module.exports = class SempreClient {
    constructor(baseUrl, locale) {
        this._baseUrl = baseUrl || URL;
        this._locale = locale || 'en_US';
        this._sessionId = undefined;

        console.log('Using SEMPRE at ' + this._baseUrl + ' with locale ' + this._locale);
    }

    onlineLearn(utterance, json) {
        var url = this._baseUrl + '/learn?locale=' + this._locale + '&q=' + encodeURIComponent(utterance)
            + '&sessionId=' + this._sessionId + '&target=' + encodeURIComponent(json);
        return httpRequest(url).then((data) => {
            console.log('Sent "' + utterance + '" to SEMPRE for learning');
            return data;
        }).catch((e) => {
            console.error('Failed to send "' + utterance + '" to SEMPRE for learning: ' + e.message);
        });
    }

    sendUtterance(utterance, expecting, choices) {
        var url = this._baseUrl + '/query?locale=' + this._locale + '&long=1&q=' + encodeURIComponent(utterance);
        if (this._sessionId)
            url += '&sessionId=' + this._sessionId;
        if (expecting)
            url += '&expect=' + encodeURIComponent(expecting);
        if (choices) {
            choices.forEach(function(c, i) {
                if (c)
                    url += '&choice[' + i + ']=' + encodeURIComponent(c);
            });
        }
        return httpRequest(url).then((parsed) => {
            this._sessionId = parsed.sessionId;

            if (parsed.error)
                throw new Error('Error received from SEMPRE server: ' + parsed.error);

            return parsed.candidates;
        });
    }
}

},{"q":3}],2:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const THINGPEDIA_URL = '/thingpedia';

function httpRequest(url) {
    var req = new XMLHttpRequest();
    req.open('GET', url);
    req.responseType = 'json';
    return Q.Promise(function(callback, errback) {
        req.onerror = function() {
            errback(new Error('Failed to contact SEMPRE server'));
        };
        req.onload = function() {
            callback(req.response);
        }
        req.send();
    });
}

module.exports = class ThingpediaClientBrowser {
    constructor(developerKey, locale) {
        this.developerKey = developerKey;
        this.locale = locale || 'en_US';
    }

    _simpleRequest(to, noAppend) {
        if (!noAppend) {
            to += '?locale=' + this.locale;
            if (this.developerKey)
                to += '&developer_key=' + this.developerKey;
        }

        return httpRequest(to);
    }

    getDeviceCode(id) {
        var to = THINGPEDIA_URL + '/api/code/devices/' + id;
        return this._simpleRequest(to);
    }

    getSchemas(kinds) {
        var to = THINGPEDIA_URL + '/api/schema/' + kinds.join(',');
        return this._simpleRequest(to);
    }

    getMetas(kinds) {
        var to = THINGPEDIA_URL + '/api/schema-metadata/' + kinds.join(',');
        return this._simpleRequest(to);
    }

    getDeviceFactories(klass) {
        var to = THINGPEDIA_URL + '/api/devices';
        if (klass) {
            to += '?class=' + klass;
            if (this.developerKey)
                to += '&developer_key=' + this.developerKey;
            return this._simpleRequest(to, true);
        } else {
            return this._simpleRequest(to);
        }
    }

    getDeviceSetup(kinds) {
        var to = THINGPEDIA_URL + '/api/devices/setup/' + kinds.join(',');
        return this._simpleRequest(to);
    }

    getExamplesByKey(key, isBase) {
        var to = THINGPEDIA_URL + '/api/examples?locale=' + this.locale + '&key=' + encodeURIComponent(key)
            + '&base=' + (isBase ? '1' : '0');
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }

    getExamplesByKinds(kinds, isBase) {
        var to = THINGPEDIA_URL + '/api/examples/by-kinds/' + kinds.join(',') + '?locale=' + this.locale
            + '&base=' + (isBase ? '1' : '0');
        if (this.developerKey)
            to += '&developer_key=' + this.developerKey;
        return this._simpleRequest(to, true);
    }
}

},{"q":3}],3:[function(require,module,exports){
(function (process){
// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2012 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    "use strict";

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (typeof exports === "object" && typeof module === "object") {
        module.exports = definition();

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
        define(definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = definition;
        }

    // <script>
    } else if (typeof window !== "undefined" || typeof self !== "undefined") {
        // Prefer window over self for add-on scripts. Use self for
        // non-windowed contexts.
        var global = typeof window !== "undefined" ? window : self;

        // Get the `window` object, save the previous Q global
        // and initialize Q as a global.
        var previousQ = global.Q;
        global.Q = definition();

        // Add a noConflict function so Q can be removed from the
        // global namespace.
        global.Q.noConflict = function () {
            global.Q = previousQ;
            return this;
        };

    } else {
        throw new Error("This environment was not anticipated by Q. Please file a bug.");
    }

})(function () {
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback in "allResolved"
var noop = function () {};

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
    // linked list of tasks (single, with head node)
    var head = {task: void 0, next: null};
    var tail = head;
    var flushing = false;
    var requestTick = void 0;
    var isNodeJS = false;
    // queue for late tasks, used by unhandled rejection tracking
    var laterQueue = [];

    function flush() {
        /* jshint loopfunc: true */
        var task, domain;

        while (head.next) {
            head = head.next;
            task = head.task;
            head.task = void 0;
            domain = head.domain;

            if (domain) {
                head.domain = void 0;
                domain.enter();
            }
            runSingle(task, domain);

        }
        while (laterQueue.length) {
            task = laterQueue.pop();
            runSingle(task);
        }
        flushing = false;
    }
    // runs a single function in the async queue
    function runSingle(task, domain) {
        try {
            task();

        } catch (e) {
            if (isNodeJS) {
                // In node, uncaught exceptions are considered fatal errors.
                // Re-throw them synchronously to interrupt flushing!

                // Ensure continuation if the uncaught exception is suppressed
                // listening "uncaughtException" events (as domains does).
                // Continue in next event to avoid tick recursion.
                if (domain) {
                    domain.exit();
                }
                setTimeout(flush, 0);
                if (domain) {
                    domain.enter();
                }

                throw e;

            } else {
                // In browsers, uncaught exceptions are not fatal.
                // Re-throw them asynchronously to avoid slow-downs.
                setTimeout(function () {
                    throw e;
                }, 0);
            }
        }

        if (domain) {
            domain.exit();
        }
    }

    nextTick = function (task) {
        tail = tail.next = {
            task: task,
            domain: isNodeJS && process.domain,
            next: null
        };

        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };

    if (typeof process === "object" &&
        process.toString() === "[object process]" && process.nextTick) {
        // Ensure Q is in a real Node environment, with a `process.nextTick`.
        // To see through fake Node environments:
        // * Mocha test runner - exposes a `process` global without a `nextTick`
        // * Browserify - exposes a `process.nexTick` function that uses
        //   `setTimeout`. In this case `setImmediate` is preferred because
        //    it is faster. Browserify's `process.toString()` yields
        //   "[object Object]", while in a real Node environment
        //   `process.nextTick()` yields "[object process]".
        isNodeJS = true;

        requestTick = function () {
            process.nextTick(flush);
        };

    } else if (typeof setImmediate === "function") {
        // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
        if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
        } else {
            requestTick = function () {
                setImmediate(flush);
            };
        }

    } else if (typeof MessageChannel !== "undefined") {
        // modern browsers
        // http://www.nonblocking.io/2011/06/windownexttick.html
        var channel = new MessageChannel();
        // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
        // working message ports the first time a page loads.
        channel.port1.onmessage = function () {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
        };
        var requestPortTick = function () {
            // Opera requires us to provide a message payload, regardless of
            // whether we use it.
            channel.port2.postMessage(0);
        };
        requestTick = function () {
            setTimeout(flush, 0);
            requestPortTick();
        };

    } else {
        // old browsers
        requestTick = function () {
            setTimeout(flush, 0);
        };
    }
    // runs a task after all other tasks have been run
    // this is useful for unhandled rejection tracking that needs to happen
    // after all `then`d tasks have been run.
    nextTick.runAfter = function (task) {
        laterQueue.push(task);
        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };
    return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this **might** have the nice side-effect of reducing the size of
// the minified code by reducing x.call() to merely x()
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
    return function () {
        return call.apply(f, arguments);
    };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        if (object_hasOwnProperty(object, key)) {
            keys.push(key);
        }
    }
    return keys;
};

var object_toString = uncurryThis(Object.prototype.toString);

function isObject(value) {
    return value === Object(value);
}

// generator related shims

// FIXME: Remove this function once ES6 generators are in SpiderMonkey.
function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

// FIXME: Remove this helper and Q.return once ES6 generators are in
// SpiderMonkey.
var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p; p = p.source) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" &&
            typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative +
                         " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (value instanceof Promise) {
        return value;
    }

    // assimilate thenables
    if (isPromiseAlike(value)) {
        return coerce(value);
    } else {
        return fulfill(value);
    }
}
Q.resolve = Q;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Controls whether or not long stack traces will be on
 */
Q.longStackSupport = false;

// enable long stacks if Q_DEBUG is set
if (typeof process === "object" && process && process.env && process.env.Q_DEBUG) {
    Q.longStackSupport = true;
}

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    var messages = [], progressListeners = [], resolvedPromise;

    var deferred = object_create(defer.prototype);
    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, operands) {
        var args = array_slice(arguments);
        if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) { // progress operand
                progressListeners.push(operands[1]);
            }
        } else {
            Q.nextTick(function () {
                resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
        }
    };

    // XXX deprecated
    promise.valueOf = function () {
        if (messages) {
            return promise;
        }
        var nearerValue = nearer(resolvedPromise);
        if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue; // shorten chain
        }
        return nearerValue;
    };

    promise.inspect = function () {
        if (!resolvedPromise) {
            return { state: "pending" };
        }
        return resolvedPromise.inspect();
    };

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    // NOTE: we do the checks for `resolvedPromise` in each method, instead of
    // consolidating them into `become`, since otherwise we'd create new
    // promises with the lines `become(whatever(value))`. See e.g. GH-252.

    function become(newPromise) {
        resolvedPromise = newPromise;
        promise.source = newPromise;

        array_reduce(messages, function (undefined, message) {
            Q.nextTick(function () {
                newPromise.promiseDispatch.apply(newPromise, message);
            });
        }, void 0);

        messages = void 0;
        progressListeners = void 0;
    }

    deferred.promise = promise;
    deferred.resolve = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(Q(value));
    };

    deferred.fulfill = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(fulfill(value));
    };
    deferred.reject = function (reason) {
        if (resolvedPromise) {
            return;
        }

        become(reject(reason));
    };
    deferred.notify = function (progress) {
        if (resolvedPromise) {
            return;
        }

        array_reduce(progressListeners, function (undefined, progressListener) {
            Q.nextTick(function () {
                progressListener(progress);
            });
        }, void 0);
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in resolver
 */
Q.Promise = promise; // ES6
Q.promise = promise;
function promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function.");
    }
    var deferred = defer();
    try {
        resolver(deferred.resolve, deferred.reject, deferred.notify);
    } catch (reason) {
        deferred.reject(reason);
    }
    return deferred.promise;
}

promise.race = race; // ES6
promise.all = all; // ES6
promise.reject = reject; // ES6
promise.resolve = Q; // ES6

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
    //freeze(object);
    //passByCopies.set(object, true);
    return object;
};

Promise.prototype.passByCopy = function () {
    //freeze(object);
    //passByCopies.set(object, true);
    return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
    return Q(x).join(y);
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become settled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be settled
 */
Q.race = race;
function race(answerPs) {
    return promise(function (resolve, reject) {
        // Switch to this once we can assume at least ES5
        // answerPs.forEach(function (answerP) {
        //     Q(answerP).then(resolve, reject);
        // });
        // Use this in the meantime
        for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject);
        }
    });
}

Promise.prototype.race = function () {
    return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error(
                "Promise does not support operation: " + op
            ));
        };
    }
    if (inspect === void 0) {
        inspect = function () {
            return {state: "unknown"};
        };
    }

    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, args) {
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.call(promise, op, args);
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolve) {
            resolve(result);
        }
    };

    promise.inspect = inspect;

    // XXX deprecated `valueOf` and `exception` support
    if (inspect) {
        var inspected = inspect();
        if (inspected.state === "rejected") {
            promise.exception = inspected.reason;
        }

        promise.valueOf = function () {
            var inspected = inspect();
            if (inspected.state === "pending" ||
                inspected.state === "rejected") {
                return promise;
            }
            return inspected.value;
        };
    }

    return promise;
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {
    var self = this;
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (typeof rejected === "function") {
            makeStackTraceLong(exception, self);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return typeof progressed === "function" ? progressed(value) : value;
    }

    Q.nextTick(function () {
        self.promiseDispatch(function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, "when", [function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        }]);
    });

    // Progress propagator need to be attached in the current tick.
    self.promiseDispatch(void 0, "when", [void 0, function (value) {
        var newValue;
        var threw = false;
        try {
            newValue = _progressed(value);
        } catch (e) {
            threw = true;
            if (Q.onerror) {
                Q.onerror(e);
            } else {
                throw e;
            }
        }

        if (!threw) {
            deferred.notify(newValue);
        }
    }]);

    return deferred.promise;
};

Q.tap = function (promise, callback) {
    return Q(promise).tap(callback);
};

/**
 * Works almost like "finally", but not called for rejections.
 * Original resolution value is passed through callback unaffected.
 * Callback may return a promise that will be awaited for.
 * @param {Function} callback
 * @returns {Q.Promise}
 * @example
 * doSomething()
 *   .then(...)
 *   .tap(console.log)
 *   .then(...);
 */
Promise.prototype.tap = function (callback) {
    callback = Q(callback);

    return this.then(function (value) {
        return callback.fcall(value).thenResolve(value);
    });
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
    return Q(value).then(fulfilled, rejected, progressed);
}

Promise.prototype.thenResolve = function (value) {
    return this.then(function () { return value; });
};

Q.thenResolve = function (promise, value) {
    return Q(promise).thenResolve(value);
};

Promise.prototype.thenReject = function (reason) {
    return this.then(function () { throw reason; });
};

Q.thenReject = function (promise, reason) {
    return Q(promise).thenReject(reason);
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
    if (isPromise(value)) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
    return object instanceof Promise;
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
    return isPromise(object) && object.inspect().state === "pending";
}

Promise.prototype.isPending = function () {
    return this.inspect().state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(object) || object.inspect().state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
    return this.inspect().state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
    return isPromise(object) && object.inspect().state === "rejected";
}

Promise.prototype.isRejected = function () {
    return this.inspect().state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes exceptions thrown in handlers so they can be
// handled by a subsequent promise.  The exceptions get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var reportedUnhandledRejections = [];
var trackUnhandledRejections = true;

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }
    if (typeof process === "object" && typeof process.emit === "function") {
        Q.nextTick.runAfter(function () {
            if (array_indexOf(unhandledRejections, promise) !== -1) {
                process.emit("unhandledRejection", reason, promise);
                reportedUnhandledRejections.push(promise);
            }
        });
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = array_indexOf(unhandledRejections, promise);
    if (at !== -1) {
        if (typeof process === "object" && typeof process.emit === "function") {
            Q.nextTick.runAfter(function () {
                var atReport = array_indexOf(reportedUnhandledRejections, promise);
                if (atReport !== -1) {
                    process.emit("rejectionHandled", unhandledReasons[at], promise);
                    reportedUnhandledRejections.splice(atReport, 1);
                }
            });
        }
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
Q.reject = reject;
function reject(reason) {
    var rejection = Promise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
        }
    }, function fallback() {
        return this;
    }, function inspect() {
        return { state: "rejected", reason: reason };
    });

    // Note that the reason has not been handled.
    trackRejection(rejection, reason);

    return rejection;
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {
    return Promise({
        "when": function () {
            return value;
        },
        "get": function (name) {
            return value[name];
        },
        "set": function (name, rhs) {
            value[name] = rhs;
        },
        "delete": function (name) {
            delete value[name];
        },
        "post": function (name, args) {
            // Mark Miller proposes that post with no name should apply a
            // promised function.
            if (name === null || name === void 0) {
                return value.apply(void 0, args);
            } else {
                return value[name].apply(value, args);
            }
        },
        "apply": function (thisp, args) {
            return value.apply(thisp, args);
        },
        "keys": function () {
            return object_keys(value);
        }
    }, void 0, function inspect() {
        return { state: "fulfilled", value: value };
    });
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
    var deferred = defer();
    Q.nextTick(function () {
        try {
            promise.then(deferred.resolve, deferred.reject, deferred.notify);
        } catch (exception) {
            deferred.reject(exception);
        }
    });
    return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, args) {
        return dispatch(object, op, args);
    }, function () {
        return Q(object).inspect();
    });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

Promise.prototype.spread = function (fulfilled, rejected) {
    return this.all().then(function (array) {
        return fulfilled.apply(void 0, array);
    }, rejected);
};

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  Although generators are only part
 * of the newest ECMAScript 6 drafts, this code does not cause syntax
 * errors in older engines.  This code should continue to work and will
 * in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * --harmony-generators runtime flag enabled.  SpiderMonkey has had them
 * for longer, but under an older Python-inspired form.  This function
 * works on both kinds of generators.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;

            // Until V8 3.19 / Chromium 29 is released, SpiderMonkey is the only
            // engine that has a deployed base of browsers that support generators.
            // However, SM's generators use the Python-inspired semantics of
            // outdated ES6 drafts.  We would like to support ES6, but we'd also
            // like to make it possible to use generators in deployed browsers, so
            // we also support Python-style generators.  At some point we can remove
            // this block.

            if (typeof StopIteration === "undefined") {
                // ES6 Generators
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    return reject(exception);
                }
                if (result.done) {
                    return Q(result.value);
                } else {
                    return when(result.value, callback, errback);
                }
            } else {
                // SpiderMonkey Generators
                // FIXME: Remove this case when SM does ES6 generators.
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    if (isStopIteration(exception)) {
                        return Q(exception.value);
                    } else {
                        return reject(exception);
                    }
                }
                return when(result, callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = spawn;
function spawn(makeGenerator) {
    Q.done(Q.async(makeGenerator)());
}

// FIXME: Remove this interface once ES6 generators are in SpiderMonkey.
/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 *
 * This interface is a stop-gap measure to support generator return
 * values in older Firefox/SpiderMonkey.  In browsers that support ES6
 * generators like Chromium 29, just use "return" in your generator
 * functions.
 *
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * // ES6 style
 * Q.async(function* () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      return foo + bar;
 * })
 * // Older SpiderMonkey style
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
Q["return"] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
    return function () {
        return spread([this, all(arguments)], function (self, args) {
            return callback.apply(self, args);
        });
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
    return Q(object).dispatch(op, args);
}

Promise.prototype.dispatch = function (op, args) {
    var self = this;
    var deferred = defer();
    Q.nextTick(function () {
        self.promiseDispatch(deferred.resolve, op, args);
    });
    return deferred.promise;
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
    return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
    return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
    return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
    return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
    return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
    return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
    return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
    return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
    return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
    return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
    return Q(object).dispatch("apply", [void 0, args]);
};

Promise.prototype.fapply = function (args) {
    return this.dispatch("apply", [void 0, args]);
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
    return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
};

Promise.prototype.fcall = function (/*...args*/) {
    return this.dispatch("apply", [void 0, array_slice(arguments)]);
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
    var promise = Q(object);
    var args = array_slice(arguments, 1);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};
Promise.prototype.fbind = function (/*...args*/) {
    var promise = this;
    var args = array_slice(arguments);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
    return Q(object).dispatch("keys", []);
};

Promise.prototype.keys = function () {
    return this.dispatch("keys", []);
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var pendingCount = 0;
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            var snapshot;
            if (
                isPromise(promise) &&
                (snapshot = promise.inspect()).state === "fulfilled"
            ) {
                promises[index] = snapshot.value;
            } else {
                ++pendingCount;
                when(
                    promise,
                    function (value) {
                        promises[index] = value;
                        if (--pendingCount === 0) {
                            deferred.resolve(promises);
                        }
                    },
                    deferred.reject,
                    function (progress) {
                        deferred.notify({ index: index, value: progress });
                    }
                );
            }
        }, void 0);
        if (pendingCount === 0) {
            deferred.resolve(promises);
        }
        return deferred.promise;
    });
}

Promise.prototype.all = function () {
    return all(this);
};

/**
 * Returns the first resolved promise of an array. Prior rejected promises are
 * ignored.  Rejects only if all promises are rejected.
 * @param {Array*} an array containing values or promises for values
 * @returns a promise fulfilled with the value of the first resolved promise,
 * or a rejected promise if all promises are rejected.
 */
Q.any = any;

function any(promises) {
    if (promises.length === 0) {
        return Q.resolve();
    }

    var deferred = Q.defer();
    var pendingCount = 0;
    array_reduce(promises, function (prev, current, index) {
        var promise = promises[index];

        pendingCount++;

        when(promise, onFulfilled, onRejected, onProgress);
        function onFulfilled(result) {
            deferred.resolve(result);
        }
        function onRejected() {
            pendingCount--;
            if (pendingCount === 0) {
                deferred.reject(new Error(
                    "Can't get fulfillment value from any promise, all " +
                    "promises were rejected."
                ));
            }
        }
        function onProgress(progress) {
            deferred.notify({
                index: index,
                value: progress
            });
        }
    }, undefined);

    return deferred.promise;
}

Promise.prototype.any = function () {
    return any(this);
};

/**
 * Waits for all promises to be settled, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
function allResolved(promises) {
    return when(promises, function (promises) {
        promises = array_map(promises, Q);
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return promises;
        });
    });
}

Promise.prototype.allResolved = function () {
    return allResolved(this);
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
    return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
    return this.then(function (promises) {
        return all(array_map(promises, function (promise) {
            promise = Q(promise);
            function regardless() {
                return promise.inspect();
            }
            return promise.then(regardless, regardless);
        }));
    });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q.fail = // XXX legacy
Q["catch"] = function (object, rejected) {
    return Q(object).then(void 0, rejected);
};

Promise.prototype.fail = // XXX legacy
Promise.prototype["catch"] = function (rejected) {
    return this.then(void 0, rejected);
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
    return Q(object).then(void 0, void 0, progressed);
}

Promise.prototype.progress = function (progressed) {
    return this.then(void 0, void 0, progressed);
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
Q.fin = // XXX legacy
Q["finally"] = function (object, callback) {
    return Q(object)["finally"](callback);
};

Promise.prototype.fin = // XXX legacy
Promise.prototype["finally"] = function (callback) {
    callback = Q(callback);
    return this.then(function (value) {
        return callback.fcall().then(function () {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.fcall().then(function () {
            throw reason;
        });
    });
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (object, fulfilled, rejected, progress) {
    return Q(object).done(fulfilled, rejected, progress);
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        Q.nextTick(function () {
            makeStackTraceLong(error, promise);
            if (Q.onerror) {
                Q.onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {Any*} custom error message or Error object (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, error) {
    return Q(object).timeout(ms, error);
};

Promise.prototype.timeout = function (ms, error) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        if (!error || "string" === typeof error) {
            error = new Error(error || "Timed out after " + ms + " ms");
            error.code = "ETIMEDOUT";
        }
        deferred.reject(error);
    }, ms);

    this.then(function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    }, deferred.notify);

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

Promise.prototype.delay = function (timeout) {
    return this.then(function (value) {
        var deferred = defer();
        setTimeout(function () {
            deferred.resolve(value);
        }, timeout);
        return deferred.promise;
    });
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
    return Q(callback).nfapply(args);
};

Promise.prototype.nfapply = function (args) {
    var deferred = defer();
    var nodeArgs = array_slice(args);
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
    var args = array_slice(arguments, 1);
    return Q(callback).nfapply(args);
};

Promise.prototype.nfcall = function (/*...args*/) {
    var nodeArgs = array_slice(arguments);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
    var args = array_slice(arguments);
    args.unshift(this);
    return Q.denodeify.apply(void 0, args);
};

Q.nbind = function (callback, thisp /*...args*/) {
    var baseArgs = array_slice(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
    var args = array_slice(arguments, 0);
    args.unshift(this);
    return Q.nbind.apply(void 0, args);
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
    return Q(object).npost(name, args);
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
    var nodeArgs = array_slice(args || []);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(object, nodeback) {
    return Q(object).nodeify(nodeback);
}

Promise.prototype.nodeify = function (nodeback) {
    if (nodeback) {
        this.then(function (value) {
            Q.nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            Q.nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return this;
    }
};

Q.noConflict = function() {
    throw new Error("Q.noConflict only works when Q is used as a global");
};

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

return Q;

});

}).call(this,require('_process'))
},{"_process":26}],4:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Ast = require('./lib/ast');
const Compiler = require('./lib/compiler');
const Grammar = require('./lib/grammar');
const ExecEnvironment = require('./lib/exec_environment');
const Type = require('./lib/type');
const SchemaRetriever = require('./lib/schema');

const codegen = require('./lib/codegen');

module.exports = {
    Ast: Ast,
    Compiler: Compiler,
    Grammar: Grammar,
    ExecEnvironment: ExecEnvironment,
    Type: Type,
    SchemaRetriever: SchemaRetriever,
    codegen: codegen
};

},{"./lib/ast":5,"./lib/codegen":7,"./lib/compiler":8,"./lib/exec_environment":10,"./lib/grammar":12,"./lib/schema":16,"./lib/type":17}],5:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const adt = require('adt');
const Compiler = require('./compiler');
const Type = require('./type');
const Internal = require('./internal');

function adtNullable(o) {
    var only = adt.only(o);
    return function(v) {
        if (v === null)
            return v;
        else
            return only.apply(this, arguments);
    };
}

var Value = adt.data({
    VarRef: {
        // this is not really a value, it's a constant variable
        // it's used by the @(foo=bar) syntax and normalized away by
        // ChannelOpener
        //
        // It's also used internally by the slot filling dialog in
        // RuleDialog in Sabrina
        name: adt.only(String),
    },
    Boolean: {
        value: adt.only(Boolean),
    },
    String: {
        value: adt.only(String)
    },
    Measure: {
        value: adt.only(Number),
        unit: adt.only(String)
    },
    Number: {
        value: adt.only(Number)
    },
    Location: {
        x: adt.only(Number),
        y: adt.only(Number),
    },
    Date: {
        value: adt.only(Date)
    },
    Time: {
        hour: adt.only(Number),
        minute: adt.only(Number)
    },
    Entity: {
        value: adt.only(String),
        type: adt.only(String)
    },
    Enum: {
        value: adt.only(String)
    },
    Object: {
        value: adt.only(Object)
    },
    Array: {
        value: adt.only(Array)
    },
    Feed: {
        value: adt.any
    },
});
module.exports.Value = Value;

module.exports.typeForValue = function typeForValue(v) {
    if (v.isVarRef)
        return Type.Any;
    if (v.isBoolean)
        return Type.Boolean;
    if (v.isString)
        return Type.String;
    if (v.isMeasure)
        return Type.Measure(v.unit);
    if (v.isNumber)
        return Type.Number;
    if (v.isLocation)
        return Type.Location;
    if (v.isDate)
        return Type.Date;
    if (v.isTime)
        return Type.Time;
    if (v.isEntity)
        return Type.Entity(v.type);
    if (v.isObject)
        return Type.Object(null);
    if (v.isArray)
        return Type.Array(v.value.length ? typeForValue(v.value[0]) : null);
    if (v.isFeed)
        return Type.Feed;
    if (v.isEnum)
        return Type.String;
    throw new TypeError();
}

module.exports.valueToJS = function valueToJS(v) {
    if (v.isArray)
        return v.value.map(valueToJS);
    if (v.isVarRef)
        throw new TypeError("Value is not constant");
    if (v.isLocation)
        return { x: v.x, y: v.y, display: v.display };
    if (v.isTime)
        return v.hour + ':' + (v.minute < 10 ? '0' : '') + v.minute;
    return v.value;
}

var Attribute = adt.newtype('Attribute', {
    name: adt.only(String),
    value: adt.only(Value)
});
module.exports.Attribute = Attribute;
var Selector = adt.data({
    GlobalName: {
        name: adt.only(String),
    },
    Attributes: {
        attributes: adt.only(Array),
    },
    Builtin: null,

    // for internal use only
    ComputeModule: {
        module: adt.only(String),
    },
    Id: {
        name: adt.only(String),
    },
    Any: null,
});
module.exports.Selector = Selector;

var Expression = adt.data(function() {
    return ({
        Null: null,
        Constant: {
            value: adt.only(Value)
        },
        VarRef: {
            name: adt.only(String)
        },
        MemberRef: {
            object: adt.only(this),
            name: adt.only(String),
        },
        FunctionCall: {
            name: adt.only(String),
            args: adt.only(Array), // array of Expression
        },
        UnaryOp: {
            arg: adt.only(this),
            opcode: adt.only(String),
        },
        BinaryOp: {
            lhs: adt.only(this),
            rhs: adt.only(this),
            opcode: adt.only(String),
        },
        Tuple: {
            args: adt.only(Array),
        },
        Array: {
            args: adt.only(Array),
        },
    });
});
module.exports.Expression = Expression;
var RulePart = adt.data({
    Invocation: {
        selector: adt.only(Selector),
        name: adtNullable(String),
        params: adt.only(Array) // of Expression
    },
    Binding: {
        name: adt.only(String),
        expr: adt.only(Expression)
    },
    BuiltinPredicate: {
        expr: adt.only(Expression)
    },
    Condition: {
        expr: adt.only(Expression)
    },
});
module.exports.RulePart = RulePart;
var Statement = adt.data({
    ComputeModule: {
        name: adt.only(String),
        statements: adt.only(Array), // array of ComputeStatement
    },
    VarDecl: {
        name: adt.only(String),
        type: adt.only(Type),
    },
    Rule: {
        trigger: adt.only(Array), // array of RulePart
        queries: adt.only(Array), // array of array of RulePart
        actions: adt.only(Array), // array of RulePart
    },
    Command: {
        queries: adt.only(Array), // array of array of RulePart
        actions: adt.only(Array), // array of RulePart
    }
});
module.exports.Statement = Statement;
var ComputeStatement = adt.data({
    EventDecl: {
        name: adt.only(String),
        params: adt.only(Array),
    },
    FunctionDecl: {
        name: adt.only(String),
        params: adt.only(Array),
        code: adt.only(String)
    }
});
module.exports.ComputeStatement = ComputeStatement;
var Program = adt.newtype('Program', {
    name: adt.only(String),
    params: adt.only(Array),
    statements: adt.only(Array) // of Statement
});
module.exports.Program = Program;

},{"./compiler":8,"./internal":14,"./type":17,"adt":21}],6:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');

const Type = require('./type');

function arrayEquals(a, b) {
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (!equalityTest(a[i], b[i]))
            return false;
    }

    return true;
}

function equalityTest(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null) // they can't be both null because a !== b
        return false;
    if (a instanceof Date && b instanceof Date)
        return +a === +b;
    if (typeof a !== typeof b)
        return false;
    if (typeof a !== 'object') // primitives compare ===
        return false;
    if (a.feedId !== undefined)
        return a.feedId === b.feedId;
    if (a.hasOwnProperty('x') && a.hasOwnProperty('y'))
        return a.x === b.x && a.y === b.y;
    if (Array.isArray(a) && Array.isArray(b))
        return arrayEquals(a, b);

    return false;
}

module.exports.equality = equalityTest;

function likeTest(a, b) {
    return a.toLowerCase().indexOf(b.toLowerCase()) >= 0;
}

module.exports.BinaryOps = {
    '+': {
        types: [[Type.Measure(''), Type.Measure(''), Type.Measure('')],
                [Type.Number, Type.Number, Type.Number],
                [Type.String, Type.String, Type.String]],
        op: function(a, b) { return a + b; },
        pure: true,
    },
    '-': {
        types: [[Type.Measure(''), Type.Measure(''), Type.Measure('')],
                [Type.Number, Type.Number, Type.Number],
                [Type.Date, Type.Date, Type.Measure('ms')]],
        op: function(a, b) { return (+a) - (+b); },
        pure: true,
    },
    '*': {
        types: [[Type.Measure(''), Type.Number, Type.Measure('')],
                [Type.Number, Type.Measure(''), Type.Measure('')],
                [Type.Number, Type.Number, Type.Number]],
        op: function(a, b) { return a * b; },
        pure: true,
    },
    '/': {
        types: [[Type.Measure(''), Type.Measure(''), Type.Number],
                [Type.Number, Type.Number, Type.Number]],
        op: function(a, b) { return a / b; },
        pure: true,
    },
    '&&': {
        types: [[Type.Boolean, Type.Boolean, Type.Boolean]],
        op: function(a, b) { return a && b; },
        pure: true,
    },
    '||': {
        types: [[Type.Boolean, Type.Boolean, Type.Boolean]],
        op: function(a, b) { return a && b; },
        pure: true,
    },
    '>': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean]],
        op: function(a, b) { return a > b; },
        pure: true,
    },
    '<': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean]],
        op: function(a, b) { return a < b; },
        pure: true,
        reverse: '<',
    },
    '>=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean]],
        op: function(a, b) { return a >= b; },
        pure: true,
        reverse: '<=',
    },
    '<=': {
        types: [[Type.String, Type.String, Type.Boolean],
                [Type.Measure(''), Type.Measure(''), Type.Boolean],
                [Type.Number, Type.Number, Type.Boolean],
                [Type.Date, Type.Date, Type.Boolean]],
        op: function(a, b) { return a <= b; },
        pure: true,
        reverse: '>=',
    },
    '=': {
        types: [[Type.Any, Type.Any, Type.Boolean]],
        op: equalityTest,
        pure: true,
        reverse: '=',
    },
    '!=': {
        types: [[Type.Any, Type.Any, Type.Any]],
        op: function(a, b) { return !(equalityTest(a,b)); },
        pure: true,
        reverse: '=',
    },
    '=~': {
        types: [[Type.String, Type.String, Type.Boolean]],
        op: likeTest,
        pure: true,
        reverse: null,
    }
};

module.exports.UnaryOps = {
    '!': {
        types: [[Type.Boolean, Type.Boolean]],
        op: function(a) { return !a; },
        pure: true,
    },
    '-': {
        types: [[Type.Measure(''), Type.Measure('')],
                [Type.Number, Type.Number]],
        op: function(a) { return -a; },
        pure: true,
    }
};

module.exports.Functions = {
    // constructors for newtypes
    'makeLocation': {
        types: [[Type.Number, Type.Number, Type.String, Type.Location]],
        minArgs: 2,
        op: function(lat, lon, display) {
            return ({ x: lon, y: lat, display: display });
        },
        pure: true,
    },
    'makeDate': {
        types: [[Type.Number, Type.Number, Type.Number, Type.Date], [Type.Number, Type.Date]],
        op: [function(year, month, day) {
            return new Date(year, month-1, day);
        }, function(time) {
            var d = new Date;
            d.setTime(time);
            return d;
        }],
        pure: true,
    },
    'makeTime': {
        types: [[Type.Number, Type.Number, Type.Time]],
        op: function(hour, minute) {
            return hour + ':' + (minute < 10 ? '0' : '') + minute;
        },
        pure: true,
    },

    // other functions
    'append': {
        types: [[Type.Array('a'), 'a', Type.Array('a')]],
        op: function(a, b) {
            var acopy = a.slice();
            acopy.push(b);
            return acopy;
        },
        pure: true,
    },
    'last': {
        types: [[Type.Array('a'), 'a']],
        op: function(a) {
            return a[a.length-1];
        },
        pure: true,
    },
    'first': {
        types: [[Type.Array('a'), 'a']],
        op: function(a) {
            return a[0];
        },
        pure: true,
    },
    'at': {
        types: [[Type.Array('a'), Type.Number, 'a']],
        op: function(a, b) {
            b = Math.floor(b);
            return a[b];
        },
        pure: true,
    },
    'remove': {
        types: [[Type.Array('a'), 'a', Type.Array('a')],
                [Type.Map('k', 'v'), 'k', Type.Map('k', 'v')]],
        op: [function(a, b) {
            return a.filter(function(e) {
                return !equalityTest(e, b);
            });
        }, function(a, b) {
            return a.filter(function(e) {
                var k = e[0];
                var v = e[1];
                return !equalityTest(k, b);
            });
        }],
        pure: true,
    },
    'emptyMap': {
        types: [[Type.Map(Type.Any, Type.Any)]],
        op: function() {
            return [];
        },
        pure: true,
    },
    'lookup': {
        types: [[Type.Map('k', Type.Array('a')), 'k', Type.Array('a')],
                [Type.Map('k', 'v'), 'k', 'v']],
        op: [function(a, b) {
            for (var e of a) {
                var k = e[0];
                var v = e[1];
                if (equalityTest(k, b))
                    return v;
            }
            return [];
        }, function(a, b) {
            for (var e of a) {
                var k = e[0];
                var v = e[1];
                if (equalityTest(k, b))
                    return v;
            }
            return null;
        }],
        pure: true,
    },
    'insert': {
        types: [[Type.Map('k', 'v'), 'k', 'v', Type.Map('k', 'v')]],
        op: function(a, b, c) {
            var acopy = a.slice();
            for (var e of acopy) {
                var k = e[0];
                var v = e[1];
                if (equalityTest(k, b)) {
                    e[1] = c;
                    return acopy;
                }
            }
            acopy.push([b, c]);
            return acopy;
        },
        pure: true,
    },
    'values': {
        types: [[Type.Map('k', 'v'), Array('v')]],
        op: function(a) {
            return a.map(function(e) {
                return e[1];
            });
        },
        pure: true,
    },
    'regex': {
        types: [[Type.String, Type.String, Type.String, Type.Boolean]],
        minArgs: 2,
        op: function(a, b, c) {
            return (new RegExp(b, c)).test(a);
        },
        pure: true,
    },
    'contains': {
        types: [[Type.Array('a'), 'a', Type.Boolean],
                [Type.Map('k', 'v'), 'k', Type.Boolean]],
        op: [function(a, b) {
            return a.some(function(x) { return equalityTest(x, b); });
        }, function(a, b) {
            return a.some(function(x) { return equalityTest(x[0], b); });
        }],
        pure: true,
    },
    'distance': {
        types: [[Type.Location, Type.Location, Type.Measure('m')]],
        op: function(a, b) {
            const R = 6371000; // meters
            var lat1 = a.y;
            var lat2 = b.y;
            var lon1 = a.x;
            var lon2 = a.x;
            function toRadians(deg) { return deg * Math.PI / 180.0; }

            // formula courtesy of http://www.movable-type.co.uk/scripts/latlong.html
            var φ1 = toRadians(lat1);
            var φ2 = toRadians(lat2);
            var Δφ = toRadians(lat2-lat1);
            var Δλ = toRadians(lon2-lon1);

            var a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ/2) * Math.sin(Δλ/2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

            return R * c;
        },
        pure: true,
    },
    'latitude': {
        types: [[Type.Location, Type.Number]],
        op: function(x) { return x.y; },
        pure: true,
    },
    'longitude': {
        types: [[Type.Location, Type.Number]],
        op: function(x) { return x.x; },
        pure: true,
    },
    'toString': {
        types: [[Type.Any, Type.String]],
        op: function(x, env) {
            return env.format.anyToString(x);
        },
        pure: false,
        passEnv: true,
    },
    'eventToString': {
        types: [[Type.String, Type.String]],
        minArgs: 0,
        op: function(hint, env) {
            if (!env) {
                env = hint;
                hint = 'string';
            }
            return env.formatEvent(hint);
        },
        pure: false,
        passEnv: true
    },
    'formatMeasure': {
        types: [[Type.Measure(''), Type.String, Type.Number, Type.String]],
        minArgs: 2,
        op: function(value, unit, precision, env) {
            if (!env) {
                env = precision;
                precision = 1;
            }
            return env.format.measureToString(value, precision, unit);
        },
        pure: false,
        passEnv: true,
    },
    'valueOf': {
        types: [[Type.String, Type.Number]],
        op: parseFloat,
        pure: true,
    },
    'julianday': {
        types: [[Type.Date, Type.Number]],
        op: function(date) {
            return Math.floor((date.getTime() / 86400000) + 2440587.5);
        },
        pure: true,
    },
    'today': {
        types: [[Type.Number]],
        op: function() {
            return Functions.julianday.op(new Date);
        },
        pure: false,
    },
    'now': {
        types: [[Type.Date]],
        op: function() {
            return new Date;
        },
        pure: false,
    },
    'dayOfWeek': {
        types: [[Type.Date, Type.Number]],
        op: function(d) {
            return d.getDay();
        },
        pure: true,
    },
    'dayOfMonth': {
        types: [[Type.Date, Type.Number]],
        op: function(d) {
            return d.getDate();
        },
        pure: true,
    },
    'month': {
        types: [[Type.Date, Type.Number]],
        op: function(d) {
            return d.getMonth() + 1;
        },
        pure: true,
    },
    'year': {
        types: [[Type.Date, Type.Number]],
        op: function(d) {
            return d.getFullYear();
        },
        pure: true,
    },
    'random': {
        types: [[Type.Number]],
        op: function() {
            return Math.random();
        },
        pure: false,
    },
    'choice': {
        types: [[Type.Array('t'), 't']],
        op: function(v) {
            return v[Math.floor(Math.random() * v.length)];
        },
        pure: false,
    },
    'floor': {
        types: [[Type.Number, Type.Number]],
        op: function(v) {
            return Math.floor(v);
        },
        pure: true,
    },
    'ceil': {
        types: [[Type.Number, Type.Number]],
        op: function(v) {
            return Math.ceil(v);
        },
        pure: true,
    },

    'sum': {
        types: [[Type.Array(Type.Number), Type.Number],
                [Type.Array(Type.Measure('')), Type.Measure('')]],
        op: function(values) {
            return values.reduce(function(v1, v2) { return v1 + v2; }, 0);
        },
        pure: true,
    },

    'avg': {
        types: [[Type.Array(Type.Number), Type.Number],
                [Type.Array(Type.Measure('')), Type.Measure('')]],
        op: function(values) {
            var sum = values.reduce(function(v1, v2) { return v1 + v2; }, 0);
            return sum / values.length;
        },
        pure: true,
    },

    'concat': {
        types: [[Type.Array(Type.Any), Type.String, Type.String]],
        minArgs: 1,
        op: function(values, joiner) {
            return values.map(objectToString).join(joiner);
        },
        pure: true,
    },

    'count': {
        types: [[Type.Array(Type.Any), Type.Number],
                [Type.Map(Type.Any, Type.Any), Type.Number]],
        tuplelength: -1,
        argtypes: [Type.Any],
        rettype: Type.Number,
        extratypes: [],
        op: function(values) {
            return values.length;
        },
        pure: true,
    },

    'argMin': {
        types: [[Type.Array(Type.Any), Type.Number],
                [Type.Map('k', Type.Any), 'k']],
        op: function(values) {
            return values.reduce(function(state, value, key) {
                if (state.who === null || value < state.best)
                    return { who: key, best: value };
                else
                    return state;
            }, { best: null, who: null }).who;
        },
        pure: true,
    },

    'argMax': {
        types: [[Type.Array(Type.Any), Type.Number],
                [Type.Map('k', Type.Any), 'k']],
        op: function(values) {
            return values.reduce(function(state, value, key) {
                if (state.who === null || value > state.best)
                    return { who: key, best: value };
                else
                    return state;
            }, { best: null, who: null }).who;
        },
        pure: true,
    },
};

module.exports.Triggers = {};
module.exports.Actions = {
    'return': [],
    'notify': []
};
module.exports.Queries = {};

},{"./type":17,"adt":21}],7:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const adt = require('adt');
const Type = require('./type');
const Ast = require('./ast');

function stringEscape(str) {
    return '"' + str.replace(/([\"\'\\])/g, '\\$1').replace(/\n/g, '\\n') + '"';
    // the following comment fixes broken syntax highlighting in GtkSourceView
    //]/
}

function codegenType(ast) {
    if (ast.isTuple)
        return '(' + ast.schema.map(codegenType).join(', ') + ')';
    else if (ast.isArray)
        return 'Array(' + codegenType(ast.elem) + ')';
    else if (ast.isMap)
        return 'Map(' + codegenType(ast.key) + ', ' + codegenType(ast.value) + ')';
    else
        return ast.toString();
}

function codegenParamList(ast) {
    return ast.map(function(p) {
        return p.name + ': ' + codegenType(p.type);
    }).join(', ');
}

function codegenValue(ast) {
    if (ast.isVarRef)
        return ast.name;
    else if (ast.isBoolean)
        return String(ast.value);
    else if (ast.isString || ast.isEnum)
        return stringEscape(ast.value);
    else if (ast.isMeasure)
        return String(ast.value) + ast.unit;
    else if (ast.isNumber)
        return String(ast.value);
    else if (ast.isLocation && ast.display)
        return '$makeLocation(' + String(ast.y) + ',' + String(ast.x) + ',' + stringEscape(ast.display) + ')';
    else if (ast.isLocation)
        return '$makeLocation(' + String(ast.y) + ',' + String(ast.x) + ')';
    else if (ast.isDate)
        return '$makeDate(' + ast.value.getTime() + ')';
    else if (ast.isTime)
        return '$makeTime(' + ast.hour + ',' + ast.minute + ')';
    else if (ast.isEntity)
        return stringEscape(ast.value) + '^^' + ast.type;
    else
        throw new TypeError(); // the other Value forms don't have literals
}

function codegenExpression(ast) {
    if (ast.isNull)
        return '_';
    else if (ast.isConstant)
        return codegenValue(ast.value);
    else if (ast.isVarRef)
        return ast.name;
    else if (ast.isMemberRef)
        return codegenExpression(ast.object) + '.' + ast.name;
    else if (ast.isFunctionCall)
        return '$' + ast.name + '(' + ast.args.map(codegenExpression).join(', ') + ')';
    else if (ast.isUnaryOp)
        return ast.opcode + codegenExpression(ast.arg);
    else if (ast.isBinaryOp)
        return codegenExpression(ast.lhs) + ' ' + ast.opcode + ' ' +
            codegenExpression(ast.rhs);
    else if (ast.isTuple)
        return '(' + ast.args.map(codegenExpression).join(', ') + ')';
    else if (ast.isArray)
        return '[' + ast.args.map(codegenExpression).join(', ') + ']';
    else
        throw new TypeError();
}

function codegenAttribute(ast) {
    return ast.name + '=' + codegenValue(ast.value);
}

function codegenSelector(ast) {
    if (ast.isGlobalName)
        return '@' + ast.name;
    else if (ast.isAttributes)
        return '@(' + ast.attributes.map(codegenAttribute).join(', ') + ')';
    else if (ast.isBuiltin)
        return '@builtin';
}

function codegenInvocation(ast) {
    if (ast.selector.isBuiltin && ast.name === 'notify' && ast.params.length === 0)
        return 'notify';
    return codegenSelector(ast.selector) +
        (ast.name !== null ? '.' + ast.name : '') + '(' +
        ast.params.map(codegenExpression).join(', ') + ')';
}

function codegenRulePart(ast) {
    if (ast.isInvocation)
        return codegenInvocation(ast);
    else if (ast.isBinding)
        return ast.name + ' = ' + codegenExpression(ast.expr);
    else if (ast.isMemberBinding)
        return ast.name + ' in F';
    else if (ast.isBuiltinPredicate || ast.isCondition)
        return codegenExpression(ast.expr);
    else
        throw new TypeError();
}

function codegenSequence(ast) {
    return ast.map(codegenRulePart).join(', ');
}

function codegenAction(ast) {
    if (ast.length === 1) {
        return codegenRulePart(ast[0]) + ';\n';
    } else {
        return '{\n' + ast.map(codegenRulePart).map((r) => '        ' + r + ';\n').join('') + '}';
    }
}

function codegenRule(ast) {
    if (ast.queries.length > 0) {
        return '    ' + codegenSequence(ast.trigger) + ' => ' + ast.queries.map(codegenSequence).join(' => ') +
            ' => ' + codegenAction(ast.actions);
    } else {
        return '    ' + codegenSequence(ast.trigger) + ' => ' + codegenAction(ast.actions);
    }
}

function codegenCommand(ast) {
    if (ast.queries.length > 0)
        return '    now => ' + ast.queries.map(codegenSequence).join(' => ') + ' => ' + codegenAction(ast.actions);
    else
        return '    now => ' + codegenAction(ast.actions);
}

function codegenVarDecl(ast) {
    return '    var ' +
        ast.name.name + ' : ' + codegenType(ast.type) +
        ';\n';
}

function codegenComputeStmt(ast) {
    if (ast.isEventDecl)
        return '        event ' + ast.name + '(' + codegenParamList(ast.params) + ');\n';
    else if (ast.isFunctionDecl)
        return '        function ' + ast.name + '(' + codegenParamList(ast.params) + ') {'
        + ast.code + '}\n';
    else
        throw TypeError();
}

function codegenComputeModule(ast) {
    return '    module ' + ast.name + ' {\n' +
        ast.statements.map(codegenComputeStmt).join('') + '    }\n';
}

function codegenStmt(ast) {
    if (ast.isComputeModule)
        return codegenComputeModule(ast);
    else if (ast.isVarDecl)
        return codegenVarDecl(ast);
    else if (ast.isRule)
        return codegenRule(ast);
    else if (ast.isCommand)
        return codegenCommand(ast);
    else
        throw new TypeError();
}

function codegen(ast) {
    return ast.name + '(' +
            codegenParamList(ast.params) + ') {\n' +
            ast.statements.map(codegenStmt).join('') + '}';
}

module.exports = codegen;

},{"./ast":5,"./type":17,"adt":21}],8:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const adt = require('adt');
const assert = require('assert');

const Ast = require('./ast');
const Grammar = require('./grammar');
const Type = require('./type');
const Internal = require('./internal');
const Utils = require('./utils');
const TypeCheck = require('./type_check');
const ConstProp = require('./constant_prop');
const InputCompilerVisitor = require('./input_compiler');
const OutputCompilerVisitor = require('./output_compiler');

const typeUnify = Type.typeUnify;

module.exports = class AppCompiler {
    constructor() {
        this._warnings = [];

        this._name = undefined;
        this._params = {};
        this._keywords = {};
        this._outs = {};
        this._modules = {};
        this._rules = [];
        this._commands = [];

        this._scope = {};

        this._schemaRetriever = null;
    }

    setSchemaRetriever(schemaRetriever) {
        this._schemaRetriever = schemaRetriever;
    }

    get warnings() {
        return this._warnings;
    }

    _warn(msg) {
        this._warnings.push(msg);
    }

    get name() {
        return this._name;
    }

    get params() {
        return this._params;
    }

    get rules() {
        return this._rules;
    }

    get commands() {
        return this._commands;
    }

    get modules() {
        return this._modules;
    }

    get keywords() {
        return this._keywords;
    }

    getKeywordDecl(k) {
        if (!(k in this._keywords))
            throw new Error('Invalid keyword name ' + k);
        return this._keywords[k];
    }

    compileInputs(inputs, forTrigger, scope) {
        var visitor = new InputCompilerVisitor(this._params,
                                               scope,
                                               this._currentKeywords,
                                               forTrigger);
        visitor.visitReorderSync(inputs);
        var inputFunctions = visitor.inputFunctions;

        function fullInput(env, cont) {
            function next(i) {
                if (i === inputFunctions.length) {
                    return cont();
                } else {
                    return inputFunctions[i](env, function() {
                        return next(i+1);
                    });
                }
            }

            return next(0);
        }

        return {
            invocation: visitor.invocation,
            caller: fullInput
        };
    }

    compileActions(actions, scope) {
        var visitor = new OutputCompilerVisitor(scope,
                                                this._currentKeywords);
        visitor.visitOrderedSync(actions);
        return visitor.outputs;
    }

    typeCheckInputs(inputs, forTrigger, scope) {
        var visitor = new TypeCheck.Inputs(this._schemaRetriever,
                                           this._scope,
                                           this._modules,
                                           this._keywords,
                                           scope,
                                           forTrigger);
        return visitor.visitReorderAsync(inputs);
    }

    typeCheckActions(actions, scope) {
        var visitor = new TypeCheck.Outputs(this._schemaRetriever,
                                            this._scope,
                                            this._modules,
                                            this._keywords,
                                            scope);
        return visitor.visitOrderedAsync(actions);
    }

    _buildScope() {
        var scope = {};
        for (var name in this._scope)
            scope[name] = this._scope[name];
        return scope;
    }

    _typeCheckAll(trigger, queries, actions) {
        const scope = this._buildScope();

        return Q.try(() => {
            if (trigger !== null)
                return this.typeCheckInputs(trigger, true, scope);
            else
                return null;
        }).then(() => {
            function typeCheckQueryLoop(i) {
                if (i === queries.length)
                    return Q();
                return this.typeCheckInputs(queries[i], false, scope).then(function() {
                    return typeCheckQueryLoop.call(this, i+1);
                }.bind(this));
            }
            return typeCheckQueryLoop.call(this, 0);
        }).then(() => {
            return this.typeCheckActions(actions, scope);
        });
    }

    _runConstantPropagation(trigger, queries, actions) {
        var rebindings = {};

        var visitor = new ConstProp.Inputs(rebindings);
        if (trigger !== null)
            visitor.visitReorderSync(trigger);
        queries.forEach((q) => visitor.visitReorderSync(q));

        visitor = new ConstProp.Outputs(rebindings);
        visitor.visitOrderedSync(actions);
    }

    _compileRuleOrCommand(trigger, queries, actions) {
        this._currentKeywords = new Set;

        this._runConstantPropagation(trigger, queries, actions);

        var scope = this._buildScope();
        var compiledInputs = trigger !== null ? this.compileInputs(trigger, true, scope) : null;
        var compiledQueries = queries.map((q) => this.compileInputs(q, false, scope));
        var compiledOutputs = this.compileActions(actions, scope);

        var retval = { inputs: compiledInputs, queries: compiledQueries, outputs: compiledOutputs };

        // turn keywords from a set into an array
        var keywordArray = Array.from(this._currentKeywords);
        if (compiledInputs !== null)
            compiledInputs.keywords = keywordArray;
        else
            retval.keywords = keywordArray;

        /*console.log('*** dump scope ***');
          for (var name in scope)
              console.log('scope[' + name + ']: ' + scope[name]);
        */

        return retval;
    }

    verifyRule(ast) {
        return this._typeCheckAll(ast.trigger, ast.queries, ast.actions);
    }

    compileRule(ast) {
        return this._compileRuleOrCommand(ast.trigger, ast.queries, ast.actions);
    }

    verifyCommand(ast) {
        return this._typeCheckAll(null, ast.queries, ast.actions);
    }

    compileCommand(ast) {
        return this._compileRuleOrCommand(null, ast.queries, ast.actions);
    }

    verifyModule(ast) {
        var module = { events: {}, functions: {}, functionSchemas: {} };
        var scope = {};

        ast.statements.forEach(function(stmt) {
            if (stmt.name in scope || stmt.name in this._scope)
                throw new TypeError("Declaration " + stmt.name + " shadows existing name");
            if (stmt.isEventDecl) {
                var event = stmt.params.map(function(p) {
                    return p.type;
                });
                module.events[stmt.name] = event;
                scope[stmt.name] = event;
            } else if (stmt.isFunctionDecl) {
                var names = stmt.params.map(function(p) {
                    return p.name;
                });
                var types = stmt.params.map(function(p) {
                    return p.type;
                });

                module.functions[stmt.name] = { params: names, schema: types, code: stmt.code };
                module.functionSchemas[stmt.name] = types;
                scope[stmt.name] = module.functions[stmt.name];
            } else {
                throw new TypeError();
            }
        }, this);

        return module;
    }

    verifyVarDecl(ast) {
        var name = ast.name;
        var decl = {
            type: ast.type
        };
        return decl;
    }

    compileCode(code) {
        return this.compileProgram(Grammar.parse(code));
    }

    verifyProgram(ast) {
        this._name = ast.name.name;
        ast.params.forEach(function(ast) {
            this._params[ast.name] = ast.type;
            this._scope[ast.name] = this._params[ast.name];
        }, this);
        ast.statements.forEach(function(stmt) {
            if (stmt.isComputeModule) {
                if (stmt.name in this._modules)
                    throw new TypeError('Duplicate declaration for module ' + stmt.name);
                if (stmt.name in this._scope)
                    throw new TypeError('Module declaration ' + stmt.name + ' aliases name in scope');
                this._modules[stmt.name] = this.verifyModule(stmt);
                this._scope[stmt.name] = Type.Module;
            } else if (stmt.isVarDecl) {
                if (stmt.name in this._keywords)
                    throw new TypeError('Duplicate declaration for keyword ' + stmt.name);
                if (stmt.name in this._scope)
                    throw new TypeError('Keyword declaration ' + stmt.name + ' aliases name in scope');
                this._keywords[stmt.name] = this.verifyVarDecl(stmt);
                this._scope[stmt.name] = this._keywords[stmt.name].type;
            }
        }, this);

        var rules = [], commands = [];
        ast.statements.forEach(function(stmt) {
            if (stmt.isRule) {
                rules.push(this.verifyRule(stmt));
            } else if (stmt.isCommand) {
                commands.push(this.verifyCommand(stmt));
            }
        }, this);

        return Q.all(rules.concat(commands));
    }

    compileProgram(ast) {
        return this.verifyProgram(ast).then(() => {
            ast.statements.forEach(function(stmt) {
                if (stmt.isRule) {
                    this._rules.push(this.compileRule(stmt));
                } else if (stmt.isCommand) {
                    this._commands.push(this.compileCommand(stmt));
                }
            }, this);
        });
    }
}


},{"./ast":5,"./constant_prop":9,"./grammar":12,"./input_compiler":13,"./internal":14,"./output_compiler":15,"./type":17,"./type_check":18,"./utils":19,"adt":21,"assert":25,"q":22}],9:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const adt = require('adt');
const assert = require('assert');

const Ast = require('./ast');
const Type = require('./type');
const Visitor = require('./visitor');
const Utils = require('./utils');

const normalizeConstant = Utils.normalizeConstant;

function jsToValue(type, value) {
    if (type.isBoolean)
        return Ast.Value.Boolean(value);
    else if (type.isString)
        return Ast.Value.String(value);
    else if (type.isNumber)
        return Ast.Value.Number(value);
    else if (type.isResource)
        return Ast.Value.Resource(value);
    else if (type.isMeasure)
        return Ast.Value.Measure(value, type.unit);
    else if (type.isEnum)
        return Ast.Value.Enum(value);
    else if (type.isPhoneNumber)
        return Ast.Value.PhoneNumber(value);
    else if (type.isEmailAddress)
        return Ast.Value.EmailAddress(value);
    else if (type.isURL)
        return Ast.Value.URL(value);
    else if (type.isHashtag)
        return Ast.Value.Hashtag(value);
    else if (type.isUsername)
        return Ast.Value.Username(value);
    else if (type.isTime) {
        var split = value.split(':');
        return Ast.Value.Time(parseInt(split[0], 10), parseInt(split[1], 10));
    } else if (type.isArray)
        return Ast.Value.Array(value.map((v) => jsToValue(type.elem, v)));
    else if (type.isMap)
        return null; // cannot handle constant map
    else if (type.isDate)
        return Ast.Value.Date(value);
    else if (type.isLocation) {
        var v = Ast.Value.Location(value.x, value.y);
        if (value.display)
            v.display = value.display;
        return v;
    } else if (type.isTuple)
        return null; // cannot handle constant tuple
    else if (type.isUser)
        return null; // cannot handle constant user
    else if (type.isObject)
        return null; // cannot handle constant object
    else if (type.isModule)
        return null; // cannot handle constant module
    else
        return null;
}

function jsToConstant(type, value) {
    var astvalue = jsToValue(type, value);
    if (astvalue !== null) {
        var expr = Ast.Expression.Constant(astvalue);
        expr.type = type;
        return expr;
    } else {
        return null;
    }
}

class ExpressionConstProp extends Visitor.Expression {
    constructor(rebindings) {
        super();

        this._rebindings = {};
    }

    visitConstant(ast) {
        var value = ast.value;
        var normalized = normalizeConstant(value);
        return Ast.Expression.Constant(normalized);
    }

    visitVarRef(ast) {
        var name = ast.name;
        if (name in this._rebindings)
            return this._rebindings[name];
        else
            return ast;
    }

    visitMemberRef(ast) {
        var objectast = ast.object;
        var name = ast.name;
        var optimized = ast.object = this.visitExpression(objectast);
        if (!optimized.isConstant)
            return ast;

        var value = optimized.value.value;
        return jsToConstant(ast.type, value) || ast;
    }

    visitFunctionCall(ast) {
        var argsast = ast.args;
        var argsopt = ast.args = argsast.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        for (var argopt of argsopt) {
            if (!argopt.isConstant)
                return ast;
        }
        if (!ast.pure)
            return ast;
        var retval = ast.op.apply(null, argsopt.map((c) => Ast.valueToJS(c.value)));
        return jsToConstant(ast.type, retval) || ast;
    }

    visitUnaryOp(ast) {
        var argast = ast.arg;
        var argopt = ast.arg = this.visitExpression(argast);
        if (!argopt.isConstant || !ast.pure)
            return ast;
        var retval = ast.op(Ast.valueToJS(argopt.value))
        return jsToConstant(ast.type, retval) || ast;
    }

    visitBinaryOp(ast) {
        var lhsast = ast.lhs;
        var rhsast = ast.rhs;
        var lhsopt = ast.lhs = this.visitExpression(lhsast);
        var rhsopt = ast.rhs = this.visitExpression(rhsast);
        if (!lhsopt.isConstant || !rhsopt.isConstant || !ast.pure)
            return ast;

        var retval = ast.op(Ast.valueToJS(lhsopt.value),
                            Ast.valueToJS(rhsopt.value));
        return jsToConstant(ast.type, retval) || ast;
    }

    visitTuple(ast) {
        var args = ast.args;
        var argsopt = ast.args = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);

        // tuples cannot be constant (jsToConstant just fails)
        // so just return ast
        // we constant folded inside it anyway
        return ast;
    }

    visitArray(ast) {
        var args = ast.args;
        var argsopt = ast.args = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        for (var arg of argsopt) {
            if (!arg.isConstant)
                return ast;
        }
        var value = argsopt.map((c) => Ast.valueToJS(c.value));
        return jsToConstant(ast.type, value) || ast;
    }
}

class InputConstProp extends Visitor.RulePart {
    constructor(rebindings) {
        super();

        this._rebindings = rebindings;
    }

    constPropExpression(expression) {
        if (expression.isNull)
            return expression;

        var visitor = new ExpressionConstProp(this._rebindings);
        return visitor.visitExpression(expression);
    }

    visitInvocation(ast) {
        ast.params = ast.params.map((p) => this.constPropExpression(p));
    }

    visitMemberBinding(ast) {
        // nothing to do here
    }

    visitRegex(ast) {
        // we don't constant fold the whole regular expression, on the
        // assumption that it won't be particularly useful in practice
        // if we were to do that, we would need to flag this ast node
        // as introducing constant binders without doing anything, which
        // would confuse the compiler later on

        var argsast = ast.expr.args;
        if (argsast.length <= 3)
            return this.visitCondition(ast);
        ast.expr.args = argsast.map(function(arg) {
            return this.constPropExpression(arg);
        }, this);
    }

    visitContains(ast) {
        // see above for why don't do something smarter
        var argsast = ast.expr.args;
        ast.expr.args = argsast.map(function(arg) {
            return this.constPropExpression(arg);
        }, this);
    }

    visitBuiltinPredicate(ast) {
        if (ast.expr.name === 'regex')
            return this.visitRegex(ast);
        else if (ast.expr.name === 'contains')
            return this.visitContains(ast);
        else
            return this.visitCondition(ast);
    }

    visitBinding(ast) {
        var opt = this.constPropExpression(ast.expr);
        if (opt.isConstant)
            this._rebindings[ast.name] = opt;
        ast.expr = opt;
    }

    visitCondition(ast) {
        ast.expr = this.constPropExpression(ast.expr);
    }
}

class OutputConstProp extends Visitor.RulePart {
    constructor(rebindings) {
        super();

        this._rebindings = rebindings;
    }

    constPropExpression(expression) {
        if (expression.isNull)
            return expression;

        var visitor = new ExpressionConstProp(this._rebindings);
        return visitor.visitExpression(expression);
    }

    visitInvocation(ast) {
        ast.params = ast.params.map((p) => this.constPropExpression(p));
    }

    visitBinding(ast) {
        ast.expr = this.constPropExpression(ast.expr);
    }
}

module.exports = {
    Inputs: InputConstProp,
    Outputs: OutputConstProp,
}

},{"./ast":5,"./type":17,"./utils":19,"./visitor":20,"adt":21,"assert":25,"q":22}],10:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Internal = require('./internal');

class FormatUtils {
    constructor(locale, timezone) {
        this._locale = locale;
        this._timezone = timezone;
    }

    measureToString(value, precision, unit) {
        var baseUnit = Internal.UnitsToBaseUnit[unit];
        if (!baseUnit)
            throw new Error('Invalid unit ' + unit);

        var coeff = Internal.UnitsTransformToBaseUnit[unit];
        if (typeof coeff === 'function')
            return Internal.UnitsInverseTransformFromBaseUnit[unit](value).toFixed(precision);
        else
            return ((1/coeff)*value).toFixed(precision);
    }

    dateToString(date, options) {
        if (!options) {
            options = {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            };
        }
        options.timeZone = this._timezone;
        return date.toLocaleDateString(this._locale, options);
    }

    timeToString(date, options) {
        if (!options) {
            options = {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            };
        }
        options.timeZone = this._timezone;
        return date.toLocaleTimeString(this._locale, options);
    }

    dateAndTimeToString(date, options) {
        if (!options) {
            options = {};
        }
        options.timeZone = this._timezone;
        return date.toLocaleString(this._locale, options);
    }

    locationToString(o) {
        if (o.display)
            return o.display;
        return '[Latitude: ' + Number(o.y).toFixed(3) + ' deg, Longitude: ' + Number(o.x).toFixed(3) + ' deg]';
    }

    anyToString(o) {
        if (Array.isArray(o))
            return (o.map(this.anyToString, this).join(', '));
        else if (typeof o === 'object' && o !== null &&
             o.hasOwnProperty('x') && o.hasOwnProperty('y'))
            return this.locationToString(o);
        else if (typeof o === 'number')
            return (Math.floor(o) === o ? o.toFixed(0) : o.toFixed(3));
        else if (o instanceof Date)
            return this.dateAndTimeToString(o);
        else
            return String(o);
    }
}

module.exports = class ExecEnvironment {
    constructor(appstate, locale, timezone) {
        this._state = appstate;
        this._keywords = {};

        this.format = new FormatUtils(locale, timezone);

        this.reset();
    }

    formatEvent(hint) {
        var currentChannel = this.currentChannel;
        if (currentChannel === null)
            return '';

        if (this.queryInput !== null)
            var formatted = currentChannel.formatEvent(this.queryValue, this.queryInput, hint, this.format);
        else
            var formatted = currentChannel.formatEvent(this.triggerValue, hint, this.format);

        if (typeof formatted === 'string')
            return formatted;
        if (formatted === null)
            return '';
        if (typeof formatted === 'object' &&
            formatted.type === 'text')
            return formatted.text;
        if (!Array.isArray(formatted))
            formatted = [formatted];

        // for compatibility with code that predates the hint
        if (hint.startsWith('string')) {
            formatted = formatted.map((x) => {
                if (typeof x === 'string')
                    return x;
                if (x === null)
                    return 'null';
                if (typeof x !== 'object')
                    return this.format.anyToString(x);
                if (x.type === 'text')
                    return x.text;
                if (x.type === 'picture')
                    return 'Picture: ' + x.url;
                if (x.type === 'rdl')
                    return 'Link: ' + x.displayTitle + ' <' + x.webCallback + '>';
                return this.format.anyToString(x);
            });
            if (hint === 'string-title')
                return formatted[0];
            else if (hint === 'string-body')
                return formatted.slice(1).join('\n');
            else
                return formatted.join('\n');
        } else {
            return formatted;
        }
    }

    addKeyword(name, keyword) {
        this._keywords[name] = keyword;
    }

    reset() {
        this.currentChannel = null;
        this.triggerValue = null;
        this.queryValue = null;
        this.queryInput = null;
        this.changedKeyword = null;
        this._scope = {};
    }

    clone() {
        var clone = new ExecEnvironment(this._state);
        clone.format = this.format;

        for (var kw in this._keywords)
            clone._keywords[kw] = this._keywords[kw];
        clone.currentChannel = this.currentChannel;
        clone.triggerValue = this.triggerValue;
        clone.queryValue = this.queryValue;
        clone.queryInput = this.queryInput;
        clone.changedKeyword = this.changedKeyword;

        for (var name in this._scope)
            clone._scope[name] = this._scope[name];

        return clone;
    }

    setVar(name, value) {
        this._scope[name] = value;
    }

    readKeyword(name) {
        return this._keywords[name].value;
    }

    readVar(name) {
        if (this._scope[name] !== undefined)
            return this._scope[name];
        if (this._state[name] !== undefined)
            return this._state[name];
        throw new TypeError("Unknown variable " + name);
    }

    readObjectProp(object, name) {
        var v = object[name];
        if (v === undefined)
            throw new TypeError('Object ' + object + ' has no property ' + name);
        return v;
    }
}

},{"./internal":14}],11:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const adt = require('adt');
const assert = require('assert');

const Ast = require('./ast');
const Grammar = require('./grammar');
const Type = require('./type');
const Internal = require('./internal');
const Builtin = require('./builtin');
const Utils = require('./utils');
const Visitor = require('./visitor');

const normalizeConstant = Utils.normalizeConstant;

module.exports = class ExpressionCompilerVisitor extends Visitor.Expression {
    constructor(currentKeywords, scope) {
        super();

        this._currentKeywords = currentKeywords;
        this.scope = scope;
    }

    visitConstant(ast) {
        var value = ast.value;
        var normalized = normalizeConstant(value);
        var jsform = Ast.valueToJS(normalized);

        return function() { return jsform; }
    }

    visitVarRef(ast) {
        var name = ast.name;
        if (!(name in this.scope)) {
            // this is caught by InputCompiler to figure out
            // what can be passed as input to the trigger/query
            // and what needs to be evaluated afterwards
            throw new TypeError(name + ' is not in scope');
        }

        if (ast.isKeywordAccess) {
            this._currentKeywords.add(name);
            return function(env) {
                return env.readKeyword(name);
            }
        } else {
            return function(env) {
                return env.readVar(name);
            }
        }
    }

    visitMemberRef(ast) {
        var objectast = ast.object;
        var name = ast.name;
        var objectop = this.visitExpression(objectast);
        return function(env) {
            var object = objectop(env);
            return env.readObjectProp(object, name);
        };
    }

    visitFunctionCall(ast) {
        var argsast = ast.args;
        var argsop = argsast.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        var funcop = ast.op;

        return function(env) {
            var args = argsop.map(function(op) {
                return op(env);
            });
            if (ast.passEnv)
                args.push(env);
            return funcop.apply(null, args);
        }
    }

    visitUnaryOp(ast) {
        var argast = ast.arg;
        var argop = this.visitExpression(argast);
        var unop = ast.op;
        return function(env) { return unop(argop(env)); };
    }

    visitBinaryOp(ast) {
        var lhsast = ast.lhs;
        var rhsast = ast.rhs;
        var lhsop = this.visitExpression(lhsast);
        var rhsop = this.visitExpression(rhsast);
        var binop = ast.op;
        return function(env) { return binop(lhsop(env), rhsop(env)); };
    }

    visitTuple(ast) {
        var args = ast.args;
        var ops = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        return function(env) {
            return ops.map(function(op) { return op(env); });
        };
    }

    visitArray(ast) {
        var args = ast.args;
        var ops = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        return function(env) {
            return ops.map(function(op) { return op(env); });
        };
    }
}

},{"./ast":5,"./builtin":6,"./grammar":12,"./internal":14,"./type":17,"./utils":19,"./visitor":20,"adt":21,"assert":25,"q":22}],12:[function(require,module,exports){
module.exports = (function() {
  "use strict";

  /*
   * Generated by PEG.js 0.9.0.
   *
   * http://pegjs.org/
   */

  function peg$subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }

  function peg$SyntaxError(message, expected, found, location) {
    this.message  = message;
    this.expected = expected;
    this.found    = found;
    this.location = location;
    this.name     = "SyntaxError";

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, peg$SyntaxError);
    }
  }

  peg$subclass(peg$SyntaxError, Error);

  function peg$parse(input) {
    var options = arguments.length > 1 ? arguments[1] : {},
        parser  = this,

        peg$FAILED = {},

        peg$startRuleFunctions = { program: peg$parseprogram, type_ref: peg$parsetype_ref },
        peg$startRuleFunction  = peg$parseprogram,

        peg$c0 = "{",
        peg$c1 = { type: "literal", value: "{", description: "\"{\"" },
        peg$c2 = "}",
        peg$c3 = { type: "literal", value: "}", description: "\"}\"" },
        peg$c4 = function(name, params, statements) {
            return Program(name, params, take(statements, 0));
        },
        peg$c5 = "(",
        peg$c6 = { type: "literal", value: "(", description: "\"(\"" },
        peg$c7 = ")",
        peg$c8 = { type: "literal", value: ")", description: "\")\"" },
        peg$c9 = function() { return []; },
        peg$c10 = ",",
        peg$c11 = { type: "literal", value: ",", description: "\",\"" },
        peg$c12 = function(first, rest) {
                return [first].concat(take(rest, 2));
            },
        peg$c13 = ":",
        peg$c14 = { type: "literal", value: ":", description: "\":\"" },
        peg$c15 = function(name, type) {
            return { name: name, type: type };
        },
        peg$c16 = "module",
        peg$c17 = { type: "literal", value: "module", description: "\"module\"" },
        peg$c18 = function(name, statements) {
            return Statement.ComputeModule(name, take(statements, 0));
        },
        peg$c19 = "event",
        peg$c20 = { type: "literal", value: "event", description: "\"event\"" },
        peg$c21 = ";",
        peg$c22 = { type: "literal", value: ";", description: "\";\"" },
        peg$c23 = function(name, params) {
            return ComputeStatement.EventDecl(name, params);
        },
        peg$c24 = "function",
        peg$c25 = { type: "literal", value: "function", description: "\"function\"" },
        peg$c26 = function(name, params, code) {
            return ComputeStatement.FunctionDecl(name, params, code);
        },
        peg$c27 = "[",
        peg$c28 = { type: "literal", value: "[", description: "\"[\"" },
        peg$c29 = "]",
        peg$c30 = { type: "literal", value: "]", description: "\"]\"" },
        peg$c31 = /^[^{}()[\]"']/,
        peg$c32 = { type: "class", value: "[^{}\\(\\)\\[\\]\\\"\\']", description: "[^{}\\(\\)\\[\\]\\\"\\']" },
        peg$c33 = "var",
        peg$c34 = { type: "literal", value: "var", description: "\"var\"" },
        peg$c35 = function(name, type) {
            return Statement.VarDecl(name, type);
        },
        peg$c36 = "=>",
        peg$c37 = { type: "literal", value: "=>", description: "\"=>\"" },
        peg$c38 = function(trigger, queries, action) {
            return Statement.Rule(trigger, take(queries, 2), action);
        },
        peg$c39 = function(first, rest) {
            return [first].concat(take(rest, 2));
        },
        peg$c40 = "notify",
        peg$c41 = { type: "literal", value: "notify", description: "\"notify\"" },
        peg$c42 = "@$notify",
        peg$c43 = { type: "literal", value: "@$notify", description: "\"@$notify\"" },
        peg$c44 = function() {
            return [RulePart.Invocation(Selector.Builtin, 'notify', [])];
        },
        peg$c45 = function(single) { return [single]; },
        peg$c46 = function(list) {
            return take(list, 1);
        },
        peg$c47 = function(input) {
            return input;
        },
        peg$c48 = "now",
        peg$c49 = { type: "literal", value: "now", description: "\"now\"" },
        peg$c50 = function(queries, action) {
            return Statement.Command(take(queries, 2), action);
        },
        peg$c51 = ".",
        peg$c52 = { type: "literal", value: ".", description: "\".\"" },
        peg$c53 = function(selector, name, params) {
            return RulePart.Invocation(selector, name, params);
        },
        peg$c54 = ":=",
        peg$c55 = { type: "literal", value: ":=", description: "\":=\"" },
        peg$c56 = function(name, expr) {
            return RulePart.Binding(name, expr);
        },
        peg$c57 = function(expr) {
            return RulePart.BuiltinPredicate(expr);
        },
        peg$c58 = function(expr) {
            return RulePart.Condition(expr);
        },
        peg$c59 = "@",
        peg$c60 = { type: "literal", value: "@", description: "\"@\"" },
        peg$c61 = function(name) { return Selector.GlobalName(name); },
        peg$c62 = "@(",
        peg$c63 = { type: "literal", value: "@(", description: "\"@(\"" },
        peg$c64 = function(values) { return Selector.Attributes(values); },
        peg$c65 = "=",
        peg$c66 = { type: "literal", value: "=", description: "\"=\"" },
        peg$c67 = function(name, value) {
            return Attribute(name, value);
        },
        peg$c68 = function(name) {
            return Value.VarRef(name);
        },
        peg$c69 = "_",
        peg$c70 = { type: "literal", value: "_", description: "\"_\"" },
        peg$c71 = function() { return Expression.Null; },
        peg$c72 = "||",
        peg$c73 = { type: "literal", value: "||", description: "\"||\"" },
        peg$c74 = function(lhs, rhs) { return rhs.reduce(function(lhs, rhs) { return Expression.BinaryOp(lhs, rhs[2], rhs[0]); }, lhs); },
        peg$c75 = "&&",
        peg$c76 = { type: "literal", value: "&&", description: "\"&&\"" },
        peg$c77 = "+",
        peg$c78 = { type: "literal", value: "+", description: "\"+\"" },
        peg$c79 = "-",
        peg$c80 = { type: "literal", value: "-", description: "\"-\"" },
        peg$c81 = "*",
        peg$c82 = { type: "literal", value: "*", description: "\"*\"" },
        peg$c83 = "/",
        peg$c84 = { type: "literal", value: "/", description: "\"/\"" },
        peg$c85 = "!",
        peg$c86 = { type: "literal", value: "!", description: "\"!\"" },
        peg$c87 = function(op, arg) { return Expression.UnaryOp(arg, op); },
        peg$c88 = function(lhs, member) { return member !== null ? Expression.MemberRef(lhs, member[3]) : lhs; },
        peg$c89 = function(name) { return Expression.VarRef(name); },
        peg$c90 = function(first, rest) { return Expression.Tuple([first].concat(take(rest, 2))); },
        peg$c91 = function(subexp, comma) { return comma !== null ? Expression.Tuple([subexp]) : subexp; },
        peg$c92 = "$",
        peg$c93 = { type: "literal", value: "$", description: "\"$\"" },
        peg$c94 = function(name, args) {
            return Expression.FunctionCall(name, args === null ? [] : args);
        },
        peg$c95 = function(first, rest) {
            return [first].concat(take(rest, 2))
        },
        peg$c96 = function() { return Expression.Array([]); },
        peg$c97 = function(first, rest) { return Expression.Array([first].concat(take(rest, 2))); },
        peg$c98 = function(val) {
            return Expression.Constant(val);
        },
        peg$c99 = { type: "other", description: "literal" },
        peg$c100 = function(val) { return Value.Boolean(val); },
        peg$c101 = "^^",
        peg$c102 = { type: "literal", value: "^^", description: "\"^^\"" },
        peg$c103 = function(val, type) {
                if (type != null)
                    return Value.Entity(val, (type[1] !== null ? type[1] : 'tt:') + type[2]);
                else
                    return Value.String(val);
            },
        peg$c104 = "%",
        peg$c105 = { type: "literal", value: "%", description: "\"%\"" },
        peg$c106 = function(val) { return Value.Number(val / 100); },
        peg$c107 = function(val, unit) { return Value.Measure(val, unit); },
        peg$c108 = function(val) { return Value.Number(val); },
        peg$c109 = "Measure",
        peg$c110 = { type: "literal", value: "Measure", description: "\"Measure\"" },
        peg$c111 = function(unit) { return Type.Measure(unit); },
        peg$c112 = "Array",
        peg$c113 = { type: "literal", value: "Array", description: "\"Array\"" },
        peg$c114 = function(type) { return Type.Array(type); },
        peg$c115 = "Map",
        peg$c116 = { type: "literal", value: "Map", description: "\"Map\"" },
        peg$c117 = function(key, value) { return Type.Map(key, value); },
        peg$c118 = "Enum",
        peg$c119 = { type: "literal", value: "Enum", description: "\"Enum\"" },
        peg$c120 = function(first, rest) { return Type.Enum([first].concat(take(rest, 2))); },
        peg$c121 = "Entity",
        peg$c122 = { type: "literal", value: "Entity", description: "\"Entity\"" },
        peg$c123 = function(prefix, type) { return Type.Entity((prefix !== null ? prefix : 'tt:') + type); },
        peg$c124 = "Any",
        peg$c125 = { type: "literal", value: "Any", description: "\"Any\"" },
        peg$c126 = function() { return Type.Any; },
        peg$c127 = "Boolean",
        peg$c128 = { type: "literal", value: "Boolean", description: "\"Boolean\"" },
        peg$c129 = function() { return Type.Boolean; },
        peg$c130 = "String",
        peg$c131 = { type: "literal", value: "String", description: "\"String\"" },
        peg$c132 = "Password",
        peg$c133 = { type: "literal", value: "Password", description: "\"Password\"" },
        peg$c134 = function() { return Type.String; },
        peg$c135 = "Number",
        peg$c136 = { type: "literal", value: "Number", description: "\"Number\"" },
        peg$c137 = function() { return Type.Number; },
        peg$c138 = "Location",
        peg$c139 = { type: "literal", value: "Location", description: "\"Location\"" },
        peg$c140 = function() { return Type.Location; },
        peg$c141 = "Date",
        peg$c142 = { type: "literal", value: "Date", description: "\"Date\"" },
        peg$c143 = function() { return Type.Date; },
        peg$c144 = "Time",
        peg$c145 = { type: "literal", value: "Time", description: "\"Time\"" },
        peg$c146 = function() { return Type.Time; },
        peg$c147 = function(first, rest) { return Type.Tuple([first].concat(take(rest, 2))); },
        peg$c148 = "EmailAddress",
        peg$c149 = { type: "literal", value: "EmailAddress", description: "\"EmailAddress\"" },
        peg$c150 = function() { return Type.Entity('tt:email_address'); },
        peg$c151 = "PhoneNumber",
        peg$c152 = { type: "literal", value: "PhoneNumber", description: "\"PhoneNumber\"" },
        peg$c153 = function() { return Type.Entity('tt:phone_number'); },
        peg$c154 = "Picture",
        peg$c155 = { type: "literal", value: "Picture", description: "\"Picture\"" },
        peg$c156 = function() { return Type.Entity('tt:picture'); },
        peg$c157 = "Resource",
        peg$c158 = { type: "literal", value: "Resource", description: "\"Resource\"" },
        peg$c159 = function() { return Type.Entity('tt:rdf_resource'); },
        peg$c160 = "URL",
        peg$c161 = { type: "literal", value: "URL", description: "\"URL\"" },
        peg$c162 = function() { return Type.Entity('tt:url'); },
        peg$c163 = "Username",
        peg$c164 = { type: "literal", value: "Username", description: "\"Username\"" },
        peg$c165 = function() { return Type.Entity('tt:username'); },
        peg$c166 = "Hashtag",
        peg$c167 = { type: "literal", value: "Hashtag", description: "\"Hashtag\"" },
        peg$c168 = function() { return Type.Entity('tt:hashtag'); },
        peg$c169 = function(invalid) { throw new TypeError("Invalid type " + invalid); },
        peg$c170 = { type: "other", description: "comparator" },
        peg$c171 = ">=",
        peg$c172 = { type: "literal", value: ">=", description: "\">=\"" },
        peg$c173 = "<=",
        peg$c174 = { type: "literal", value: "<=", description: "\"<=\"" },
        peg$c175 = ">",
        peg$c176 = { type: "literal", value: ">", description: "\">\"" },
        peg$c177 = "<",
        peg$c178 = { type: "literal", value: "<", description: "\"<\"" },
        peg$c179 = "=~",
        peg$c180 = { type: "literal", value: "=~", description: "\"=~\"" },
        peg$c181 = function() { return '='; },
        peg$c182 = "!=",
        peg$c183 = { type: "literal", value: "!=", description: "\"!=\"" },
        peg$c184 = function() { return true; },
        peg$c185 = function() { return false; },
        peg$c186 = "on",
        peg$c187 = { type: "literal", value: "on", description: "\"on\"" },
        peg$c188 = "true",
        peg$c189 = { type: "literal", value: "true", description: "\"true\"" },
        peg$c190 = "off",
        peg$c191 = { type: "literal", value: "off", description: "\"off\"" },
        peg$c192 = "false",
        peg$c193 = { type: "literal", value: "false", description: "\"false\"" },
        peg$c194 = /^[^\\"]/,
        peg$c195 = { type: "class", value: "[^\\\\\\\"]", description: "[^\\\\\\\"]" },
        peg$c196 = "\\\"",
        peg$c197 = { type: "literal", value: "\\\"", description: "\"\\\\\\\"\"" },
        peg$c198 = function() { return '"'; },
        peg$c199 = "\\n",
        peg$c200 = { type: "literal", value: "\\n", description: "\"\\\\n\"" },
        peg$c201 = function() { return '\n'; },
        peg$c202 = "\\'",
        peg$c203 = { type: "literal", value: "\\'", description: "\"\\\\'\"" },
        peg$c204 = function() { return '\''; },
        peg$c205 = "\\\\",
        peg$c206 = { type: "literal", value: "\\\\", description: "\"\\\\\\\\\"" },
        peg$c207 = function() { return '\\'; },
        peg$c208 = /^[^\\']/,
        peg$c209 = { type: "class", value: "[^\\\\\\']", description: "[^\\\\\\']" },
        peg$c210 = { type: "other", description: "string" },
        peg$c211 = "\"",
        peg$c212 = { type: "literal", value: "\"", description: "\"\\\"\"" },
        peg$c213 = function(chars) { return chars.join(''); },
        peg$c214 = "'",
        peg$c215 = { type: "literal", value: "'", description: "\"'\"" },
        peg$c216 = { type: "other", description: "digit" },
        peg$c217 = /^[0-9]/,
        peg$c218 = { type: "class", value: "[0-9]", description: "[0-9]" },
        peg$c219 = { type: "other", description: "number" },
        peg$c220 = "e",
        peg$c221 = { type: "literal", value: "e", description: "\"e\"" },
        peg$c222 = function(num) { return parseFloat(num); },
        peg$c223 = /^[A-Za-z_]/,
        peg$c224 = { type: "class", value: "[A-Za-z_]", description: "[A-Za-z_]" },
        peg$c225 = /^[A-Za-z0-9_]/,
        peg$c226 = { type: "class", value: "[A-Za-z0-9_]", description: "[A-Za-z0-9_]" },
        peg$c227 = { type: "other", description: "ident" },
        peg$c228 = { type: "other", description: "whitespace" },
        peg$c229 = /^[ \r\n\t\x0B]/,
        peg$c230 = { type: "class", value: "[ \\r\\n\\t\\v]", description: "[ \\r\\n\\t\\v]" },
        peg$c231 = { type: "other", description: "comment" },
        peg$c232 = "/*",
        peg$c233 = { type: "literal", value: "/*", description: "\"/*\"" },
        peg$c234 = /^[^*]/,
        peg$c235 = { type: "class", value: "[^*]", description: "[^*]" },
        peg$c236 = /^[^\/]/,
        peg$c237 = { type: "class", value: "[^/]", description: "[^/]" },
        peg$c238 = "*/",
        peg$c239 = { type: "literal", value: "*/", description: "\"*/\"" },
        peg$c240 = "//",
        peg$c241 = { type: "literal", value: "//", description: "\"//\"" },
        peg$c242 = /^[^\n]/,
        peg$c243 = { type: "class", value: "[^\\n]", description: "[^\\n]" },
        peg$c244 = "\n",
        peg$c245 = { type: "literal", value: "\n", description: "\"\\n\"" },

        peg$currPos          = 0,
        peg$savedPos         = 0,
        peg$posDetailsCache  = [{ line: 1, column: 1, seenCR: false }],
        peg$maxFailPos       = 0,
        peg$maxFailExpected  = [],
        peg$silentFails      = 0,

        peg$result;

    if ("startRule" in options) {
      if (!(options.startRule in peg$startRuleFunctions)) {
        throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
      }

      peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
    }

    function text() {
      return input.substring(peg$savedPos, peg$currPos);
    }

    function location() {
      return peg$computeLocation(peg$savedPos, peg$currPos);
    }

    function expected(description) {
      throw peg$buildException(
        null,
        [{ type: "other", description: description }],
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function error(message) {
      throw peg$buildException(
        message,
        null,
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function peg$computePosDetails(pos) {
      var details = peg$posDetailsCache[pos],
          p, ch;

      if (details) {
        return details;
      } else {
        p = pos - 1;
        while (!peg$posDetailsCache[p]) {
          p--;
        }

        details = peg$posDetailsCache[p];
        details = {
          line:   details.line,
          column: details.column,
          seenCR: details.seenCR
        };

        while (p < pos) {
          ch = input.charAt(p);
          if (ch === "\n") {
            if (!details.seenCR) { details.line++; }
            details.column = 1;
            details.seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            details.line++;
            details.column = 1;
            details.seenCR = true;
          } else {
            details.column++;
            details.seenCR = false;
          }

          p++;
        }

        peg$posDetailsCache[pos] = details;
        return details;
      }
    }

    function peg$computeLocation(startPos, endPos) {
      var startPosDetails = peg$computePosDetails(startPos),
          endPosDetails   = peg$computePosDetails(endPos);

      return {
        start: {
          offset: startPos,
          line:   startPosDetails.line,
          column: startPosDetails.column
        },
        end: {
          offset: endPos,
          line:   endPosDetails.line,
          column: endPosDetails.column
        }
      };
    }

    function peg$fail(expected) {
      if (peg$currPos < peg$maxFailPos) { return; }

      if (peg$currPos > peg$maxFailPos) {
        peg$maxFailPos = peg$currPos;
        peg$maxFailExpected = [];
      }

      peg$maxFailExpected.push(expected);
    }

    function peg$buildException(message, expected, found, location) {
      function cleanupExpected(expected) {
        var i = 1;

        expected.sort(function(a, b) {
          if (a.description < b.description) {
            return -1;
          } else if (a.description > b.description) {
            return 1;
          } else {
            return 0;
          }
        });

        while (i < expected.length) {
          if (expected[i - 1] === expected[i]) {
            expected.splice(i, 1);
          } else {
            i++;
          }
        }
      }

      function buildMessage(expected, found) {
        function stringEscape(s) {
          function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

          return s
            .replace(/\\/g,   '\\\\')
            .replace(/"/g,    '\\"')
            .replace(/\x08/g, '\\b')
            .replace(/\t/g,   '\\t')
            .replace(/\n/g,   '\\n')
            .replace(/\f/g,   '\\f')
            .replace(/\r/g,   '\\r')
            .replace(/[\x00-\x07\x0B\x0E\x0F]/g, function(ch) { return '\\x0' + hex(ch); })
            .replace(/[\x10-\x1F\x80-\xFF]/g,    function(ch) { return '\\x'  + hex(ch); })
            .replace(/[\u0100-\u0FFF]/g,         function(ch) { return '\\u0' + hex(ch); })
            .replace(/[\u1000-\uFFFF]/g,         function(ch) { return '\\u'  + hex(ch); });
        }

        var expectedDescs = new Array(expected.length),
            expectedDesc, foundDesc, i;

        for (i = 0; i < expected.length; i++) {
          expectedDescs[i] = expected[i].description;
        }

        expectedDesc = expected.length > 1
          ? expectedDescs.slice(0, -1).join(", ")
              + " or "
              + expectedDescs[expected.length - 1]
          : expectedDescs[0];

        foundDesc = found ? "\"" + stringEscape(found) + "\"" : "end of input";

        return "Expected " + expectedDesc + " but " + foundDesc + " found.";
      }

      if (expected !== null) {
        cleanupExpected(expected);
      }

      return new peg$SyntaxError(
        message !== null ? message : buildMessage(expected, found),
        expected,
        found,
        location
      );
    }

    function peg$parseprogram() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11;

      s0 = peg$currPos;
      s1 = peg$parse_();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseident();
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsedecl_param_list();
            if (s4 !== peg$FAILED) {
              s5 = peg$parse_();
              if (s5 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 123) {
                  s6 = peg$c0;
                  peg$currPos++;
                } else {
                  s6 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c1); }
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parse_();
                  if (s7 !== peg$FAILED) {
                    s8 = [];
                    s9 = peg$currPos;
                    s10 = peg$parsestatement();
                    if (s10 !== peg$FAILED) {
                      s11 = peg$parse_();
                      if (s11 !== peg$FAILED) {
                        s10 = [s10, s11];
                        s9 = s10;
                      } else {
                        peg$currPos = s9;
                        s9 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }
                    if (s9 !== peg$FAILED) {
                      while (s9 !== peg$FAILED) {
                        s8.push(s9);
                        s9 = peg$currPos;
                        s10 = peg$parsestatement();
                        if (s10 !== peg$FAILED) {
                          s11 = peg$parse_();
                          if (s11 !== peg$FAILED) {
                            s10 = [s10, s11];
                            s9 = s10;
                          } else {
                            peg$currPos = s9;
                            s9 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s9;
                          s9 = peg$FAILED;
                        }
                      }
                    } else {
                      s8 = peg$FAILED;
                    }
                    if (s8 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 125) {
                        s9 = peg$c2;
                        peg$currPos++;
                      } else {
                        s9 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c3); }
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parse_();
                        if (s10 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c4(s2, s4, s8);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsedecl_param_list() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 40) {
        s1 = peg$c5;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c6); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 41) {
            s3 = peg$c7;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c8); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c9();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 40) {
          s1 = peg$c5;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c6); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parsedecl_param();
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = [];
                s6 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c10;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parsedecl_param();
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parse_();
                      if (s10 !== peg$FAILED) {
                        s7 = [s7, s8, s9, s10];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
                while (s6 !== peg$FAILED) {
                  s5.push(s6);
                  s6 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 44) {
                    s7 = peg$c10;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parse_();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parsedecl_param();
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parse_();
                        if (s10 !== peg$FAILED) {
                          s7 = [s7, s8, s9, s10];
                          s6 = s7;
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                }
                if (s5 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 41) {
                    s6 = peg$c7;
                    peg$currPos++;
                  } else {
                    s6 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c8); }
                  }
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c12(s3, s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }

      return s0;
    }

    function peg$parsedecl_param() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parseident();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 58) {
            s3 = peg$c13;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c14); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsetype_ref();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c15(s1, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsestatement() {
      var s0;

      s0 = peg$parsevar_decl();
      if (s0 === peg$FAILED) {
        s0 = peg$parsecompute_module();
        if (s0 === peg$FAILED) {
          s0 = peg$parsecommand();
          if (s0 === peg$FAILED) {
            s0 = peg$parserule();
          }
        }
      }

      return s0;
    }

    function peg$parsecompute_module() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 6) === peg$c16) {
        s1 = peg$c16;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c17); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseident();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 123) {
                s5 = peg$c0;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c1); }
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = [];
                  s8 = peg$currPos;
                  s9 = peg$parsecompute_stmt();
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parse_();
                    if (s10 !== peg$FAILED) {
                      s9 = [s9, s10];
                      s8 = s9;
                    } else {
                      peg$currPos = s8;
                      s8 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s8;
                    s8 = peg$FAILED;
                  }
                  if (s8 !== peg$FAILED) {
                    while (s8 !== peg$FAILED) {
                      s7.push(s8);
                      s8 = peg$currPos;
                      s9 = peg$parsecompute_stmt();
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parse_();
                        if (s10 !== peg$FAILED) {
                          s9 = [s9, s10];
                          s8 = s9;
                        } else {
                          peg$currPos = s8;
                          s8 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s8;
                        s8 = peg$FAILED;
                      }
                    }
                  } else {
                    s7 = peg$FAILED;
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parse_();
                    if (s8 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 125) {
                        s9 = peg$c2;
                        peg$currPos++;
                      } else {
                        s9 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c3); }
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parse_();
                        if (s10 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c18(s3, s7);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsecompute_stmt() {
      var s0;

      s0 = peg$parseevent_decl();
      if (s0 === peg$FAILED) {
        s0 = peg$parsefunction_decl();
      }

      return s0;
    }

    function peg$parseevent_decl() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5) === peg$c19) {
        s1 = peg$c19;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c20); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseident();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsedecl_param_list();
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 59) {
                    s7 = peg$c21;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                  }
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c23(s3, s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsefunction_decl() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 8) === peg$c24) {
        s1 = peg$c24;
        peg$currPos += 8;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c25); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseident();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsedecl_param_list();
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 123) {
                    s7 = peg$c0;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c1); }
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = peg$currPos;
                    s9 = [];
                    s10 = peg$parsejs_code();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parsejs_code();
                    }
                    if (s9 !== peg$FAILED) {
                      s8 = input.substring(s8, peg$currPos);
                    } else {
                      s8 = s9;
                    }
                    if (s8 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 125) {
                        s9 = peg$c2;
                        peg$currPos++;
                      } else {
                        s9 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c3); }
                      }
                      if (s9 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c26(s3, s5, s8);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsejs_code() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 123) {
        s1 = peg$c0;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c1); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parsejs_code();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parsejs_code();
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c2;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c3); }
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 40) {
          s1 = peg$c5;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c6); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parsejs_code();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parsejs_code();
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 41) {
              s3 = peg$c7;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c8); }
            }
            if (s3 !== peg$FAILED) {
              s1 = [s1, s2, s3];
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 91) {
            s1 = peg$c27;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c28); }
          }
          if (s1 !== peg$FAILED) {
            s2 = [];
            s3 = peg$parsejs_code();
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$parsejs_code();
            }
            if (s2 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 93) {
                s3 = peg$c29;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c30); }
              }
              if (s3 !== peg$FAILED) {
                s1 = [s1, s2, s3];
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parseliteral_string();
            if (s0 === peg$FAILED) {
              if (peg$c31.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c32); }
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parsevar_decl() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c33) {
        s1 = peg$c33;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c34); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse__();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseident();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 58) {
                s5 = peg$c13;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c14); }
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parsetype_ref();
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parse_();
                    if (s8 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 59) {
                        s9 = peg$c21;
                        peg$currPos++;
                      } else {
                        s9 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                      }
                      if (s9 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c35(s3, s7);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parserule() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseinput_list();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c36) {
            s5 = peg$c36;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c37); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parsequery();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c36) {
              s5 = peg$c36;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c37); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parsequery();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.substr(peg$currPos, 2) === peg$c36) {
                s5 = peg$c36;
                peg$currPos += 2;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c37); }
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseaction();
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c38(s1, s3, s7);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseinput_list() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseinvocation();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c10;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c11); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parserule_part();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 44) {
              s5 = peg$c10;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c11); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parserule_part();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c39(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parserule_part() {
      var s0;

      s0 = peg$parsebinding();
      if (s0 === peg$FAILED) {
        s0 = peg$parsebuiltin_predicate();
        if (s0 === peg$FAILED) {
          s0 = peg$parsecondition();
        }
      }

      return s0;
    }

    function peg$parseaction() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 6) === peg$c40) {
        s1 = peg$c40;
        peg$currPos += 6;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c41); }
      }
      if (s1 === peg$FAILED) {
        s1 = peg$currPos;
        if (input.substr(peg$currPos, 8) === peg$c42) {
          s2 = peg$c42;
          peg$currPos += 8;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c43); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 40) {
              s4 = peg$c5;
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c6); }
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parse_();
              if (s5 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s6 = peg$c7;
                  peg$currPos++;
                } else {
                  s6 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c8); }
                }
                if (s6 !== peg$FAILED) {
                  s2 = [s2, s3, s4, s5, s6];
                  s1 = s2;
                } else {
                  peg$currPos = s1;
                  s1 = peg$FAILED;
                }
              } else {
                peg$currPos = s1;
                s1 = peg$FAILED;
              }
            } else {
              peg$currPos = s1;
              s1 = peg$FAILED;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 59) {
            s3 = peg$c21;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c22); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c44();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseinvocation();
        if (s1 === peg$FAILED) {
          s1 = peg$parsebinding();
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 59) {
              s3 = peg$c21;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c22); }
            }
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c45(s1);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 123) {
            s1 = peg$c0;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c1); }
          }
          if (s1 !== peg$FAILED) {
            s2 = [];
            s3 = peg$currPos;
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseinvocation();
              if (s5 === peg$FAILED) {
                s5 = peg$parsebinding();
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 59) {
                    s7 = peg$c21;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                  }
                  if (s7 !== peg$FAILED) {
                    s4 = [s4, s5, s6, s7];
                    s3 = s4;
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
            if (s3 !== peg$FAILED) {
              while (s3 !== peg$FAILED) {
                s2.push(s3);
                s3 = peg$currPos;
                s4 = peg$parse_();
                if (s4 !== peg$FAILED) {
                  s5 = peg$parseinvocation();
                  if (s5 === peg$FAILED) {
                    s5 = peg$parsebinding();
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parse_();
                    if (s6 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 59) {
                        s7 = peg$c21;
                        peg$currPos++;
                      } else {
                        s7 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                      }
                      if (s7 !== peg$FAILED) {
                        s4 = [s4, s5, s6, s7];
                        s3 = s4;
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              }
            } else {
              s2 = peg$FAILED;
            }
            if (s2 !== peg$FAILED) {
              s3 = peg$parse_();
              if (s3 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 125) {
                  s4 = peg$c2;
                  peg$currPos++;
                } else {
                  s4 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c3); }
                }
                if (s4 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c46(s2);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
      }

      return s0;
    }

    function peg$parsequery() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parseinput_list();
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = peg$currPos;
        s4 = peg$parse_();
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c36) {
            s5 = peg$c36;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c37); }
          }
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        peg$silentFails--;
        if (s3 !== peg$FAILED) {
          peg$currPos = s2;
          s2 = void 0;
        } else {
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c47(s1);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsecommand() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c48) {
        s1 = peg$c48;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c49); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c36) {
            s5 = peg$c36;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c37); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parsequery();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c36) {
              s5 = peg$c36;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c37); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parsequery();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.substr(peg$currPos, 2) === peg$c36) {
                s5 = peg$c36;
                peg$currPos += 2;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c37); }
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseaction();
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c50(s3, s7);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseinvocation() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      s1 = peg$parsedevice_selector();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s3 = peg$c51;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c52); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseident();
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parsechannel_param_list();
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c53(s1, s5, s7);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsebinding() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parseident();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c54) {
            s3 = peg$c54;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c55); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseexpression();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c56(s1, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsebuiltin_predicate() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parsefunction_call();
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = peg$currPos;
        s4 = peg$parse_();
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c10;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c11); }
          }
          if (s5 === peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c36) {
              s5 = peg$c36;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c37); }
            }
          }
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        peg$silentFails--;
        if (s3 !== peg$FAILED) {
          peg$currPos = s2;
          s2 = void 0;
        } else {
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c57(s1);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsecondition() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parseexpression();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c58(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsechannel_param_list() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 40) {
        s1 = peg$c5;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c6); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 41) {
            s3 = peg$c7;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c8); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c9();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 40) {
          s1 = peg$c5;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c6); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parsenull_expression();
            if (s3 === peg$FAILED) {
              s3 = peg$parseexpression();
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = [];
                s6 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c10;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parsenull_expression();
                    if (s9 === peg$FAILED) {
                      s9 = peg$parseexpression();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parse_();
                      if (s10 !== peg$FAILED) {
                        s7 = [s7, s8, s9, s10];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
                while (s6 !== peg$FAILED) {
                  s5.push(s6);
                  s6 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 44) {
                    s7 = peg$c10;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parse_();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parsenull_expression();
                      if (s9 === peg$FAILED) {
                        s9 = peg$parseexpression();
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parse_();
                        if (s10 !== peg$FAILED) {
                          s7 = [s7, s8, s9, s10];
                          s6 = s7;
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                }
                if (s5 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 41) {
                    s6 = peg$c7;
                    peg$currPos++;
                  } else {
                    s6 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c8); }
                  }
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c12(s3, s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }

      return s0;
    }

    function peg$parsedevice_selector() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 64) {
        s1 = peg$c59;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c60); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseident();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c61(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c62) {
          s1 = peg$c62;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c63); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseattribute_list();
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s5 = peg$c7;
                  peg$currPos++;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c8); }
                }
                if (s5 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c64(s3);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }

      return s0;
    }

    function peg$parseattribute_list() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseattribute();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c10;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c11); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseattribute();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 44) {
              s5 = peg$c10;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c11); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseattribute();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c39(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseattribute() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parseident();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 61) {
            s3 = peg$c65;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c66); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseliteral();
              if (s5 === peg$FAILED) {
                s5 = peg$parsevar_value();
              }
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c67(s1, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsevar_value() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parseident();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c68(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsenull_expression() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 95) {
        s1 = peg$c69;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c70); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = peg$parseidentchar();
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = void 0;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c71();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseexpression() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseand_expression();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c72) {
            s5 = peg$c72;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c73); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseand_expression();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c72) {
              s5 = peg$c72;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c73); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseand_expression();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c74(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseand_expression() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parsecomp_expression();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c75) {
            s5 = peg$c75;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c76); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parsecomp_expression();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c75) {
              s5 = peg$c75;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c76); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parsecomp_expression();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c74(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsecomp_expression() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseadd_expression();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          s5 = peg$parsecomparator();
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseadd_expression();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            s5 = peg$parsecomparator();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseadd_expression();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c74(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseadd_expression() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parsemult_expression();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 43) {
            s5 = peg$c77;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c78); }
          }
          if (s5 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 45) {
              s5 = peg$c79;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c80); }
            }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parsemult_expression();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 43) {
              s5 = peg$c77;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c78); }
            }
            if (s5 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 45) {
                s5 = peg$c79;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c80); }
              }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parsemult_expression();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c74(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsemult_expression() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseunary_expression();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 42) {
            s5 = peg$c81;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c82); }
          }
          if (s5 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 47) {
              s5 = peg$c83;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c84); }
            }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseunary_expression();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 42) {
              s5 = peg$c81;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c82); }
            }
            if (s5 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 47) {
                s5 = peg$c83;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c84); }
              }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseunary_expression();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c74(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseunary_expression() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 33) {
        s1 = peg$c85;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c86); }
      }
      if (s1 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 45) {
          s1 = peg$c79;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c80); }
        }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseunary_expression();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c87(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$parsemember_expression();
      }

      return s0;
    }

    function peg$parsemember_expression() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parseprimary_expression();
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s4 = peg$c51;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c52); }
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              s6 = peg$parseident();
              if (s6 !== peg$FAILED) {
                s3 = [s3, s4, s5, s6];
                s2 = s3;
              } else {
                peg$currPos = s2;
                s2 = peg$FAILED;
              }
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c88(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseprimary_expression() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

      s0 = peg$parseliteral_expression();
      if (s0 === peg$FAILED) {
        s0 = peg$parsefunction_call();
        if (s0 === peg$FAILED) {
          s0 = peg$parsearray_literal();
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseident();
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c89(s1);
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 40) {
                s1 = peg$c5;
                peg$currPos++;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c6); }
              }
              if (s1 !== peg$FAILED) {
                s2 = peg$parse_();
                if (s2 !== peg$FAILED) {
                  s3 = peg$parseexpression();
                  if (s3 !== peg$FAILED) {
                    s4 = peg$parse_();
                    if (s4 !== peg$FAILED) {
                      s5 = [];
                      s6 = peg$currPos;
                      if (input.charCodeAt(peg$currPos) === 44) {
                        s7 = peg$c10;
                        peg$currPos++;
                      } else {
                        s7 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                      }
                      if (s7 !== peg$FAILED) {
                        s8 = peg$parse_();
                        if (s8 !== peg$FAILED) {
                          s9 = peg$parseexpression();
                          if (s9 !== peg$FAILED) {
                            s10 = peg$parse_();
                            if (s10 !== peg$FAILED) {
                              s7 = [s7, s8, s9, s10];
                              s6 = s7;
                            } else {
                              peg$currPos = s6;
                              s6 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s6;
                            s6 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                      if (s6 !== peg$FAILED) {
                        while (s6 !== peg$FAILED) {
                          s5.push(s6);
                          s6 = peg$currPos;
                          if (input.charCodeAt(peg$currPos) === 44) {
                            s7 = peg$c10;
                            peg$currPos++;
                          } else {
                            s7 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                          }
                          if (s7 !== peg$FAILED) {
                            s8 = peg$parse_();
                            if (s8 !== peg$FAILED) {
                              s9 = peg$parseexpression();
                              if (s9 !== peg$FAILED) {
                                s10 = peg$parse_();
                                if (s10 !== peg$FAILED) {
                                  s7 = [s7, s8, s9, s10];
                                  s6 = s7;
                                } else {
                                  peg$currPos = s6;
                                  s6 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s6;
                                s6 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s6;
                              s6 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s6;
                            s6 = peg$FAILED;
                          }
                        }
                      } else {
                        s5 = peg$FAILED;
                      }
                      if (s5 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 41) {
                          s6 = peg$c7;
                          peg$currPos++;
                        } else {
                          s6 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c8); }
                        }
                        if (s6 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c90(s3, s5);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 40) {
                  s1 = peg$c5;
                  peg$currPos++;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c6); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = peg$parse_();
                  if (s2 !== peg$FAILED) {
                    s3 = peg$parseexpression();
                    if (s3 !== peg$FAILED) {
                      s4 = peg$parse_();
                      if (s4 !== peg$FAILED) {
                        s5 = peg$currPos;
                        if (input.charCodeAt(peg$currPos) === 44) {
                          s6 = peg$c10;
                          peg$currPos++;
                        } else {
                          s6 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                        }
                        if (s6 !== peg$FAILED) {
                          s7 = peg$parse_();
                          if (s7 !== peg$FAILED) {
                            s6 = [s6, s7];
                            s5 = s6;
                          } else {
                            peg$currPos = s5;
                            s5 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s5;
                          s5 = peg$FAILED;
                        }
                        if (s5 === peg$FAILED) {
                          s5 = null;
                        }
                        if (s5 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 41) {
                            s6 = peg$c7;
                            peg$currPos++;
                          } else {
                            s6 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c8); }
                          }
                          if (s6 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c91(s3, s5);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parsefunction_call() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 36) {
        s1 = peg$c92;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c93); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseident();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s3 = peg$c5;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c6); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseexpr_param_list();
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 41) {
                    s7 = peg$c7;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c8); }
                  }
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c94(s2, s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseexpr_param_list() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseexpression();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c10;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c11); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseexpression();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 44) {
              s5 = peg$c10;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c11); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseexpression();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c95(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsearray_literal() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 91) {
        s1 = peg$c27;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c28); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 93) {
            s3 = peg$c29;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c30); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c96();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 91) {
          s1 = peg$c27;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c28); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseexpression();
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = [];
                s6 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c10;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseexpression();
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parse_();
                      if (s10 !== peg$FAILED) {
                        s7 = [s7, s8, s9, s10];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
                while (s6 !== peg$FAILED) {
                  s5.push(s6);
                  s6 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 44) {
                    s7 = peg$c10;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parse_();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parseexpression();
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parse_();
                        if (s10 !== peg$FAILED) {
                          s7 = [s7, s8, s9, s10];
                          s6 = s7;
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                }
                if (s5 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 93) {
                    s6 = peg$c29;
                    peg$currPos++;
                  } else {
                    s6 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c30); }
                  }
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c97(s3, s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }

      return s0;
    }

    function peg$parseliteral_expression() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parseliteral();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c98(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseliteral() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parseliteral_bool();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c100(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseliteral_string();
        if (s1 !== peg$FAILED) {
          s2 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c101) {
            s3 = peg$c101;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c102); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$currPos;
            s5 = peg$currPos;
            s6 = peg$parseident();
            if (s6 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 58) {
                s7 = peg$c13;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c14); }
              }
              if (s7 !== peg$FAILED) {
                s6 = [s6, s7];
                s5 = s6;
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
            if (s5 !== peg$FAILED) {
              s4 = input.substring(s4, peg$currPos);
            } else {
              s4 = s5;
            }
            if (s4 === peg$FAILED) {
              s4 = null;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseident();
              if (s5 !== peg$FAILED) {
                s3 = [s3, s4, s5];
                s2 = s3;
              } else {
                peg$currPos = s2;
                s2 = peg$FAILED;
              }
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c103(s1, s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseliteral_number();
          if (s1 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 37) {
              s2 = peg$c104;
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c105); }
            }
            if (s2 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c106(s1);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseliteral_number();
            if (s1 !== peg$FAILED) {
              s2 = peg$parseident();
              if (s2 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c107(s1, s2);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$parseliteral_number();
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c108(s1);
              }
              s0 = s1;
            }
          }
        }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c99); }
      }

      return s0;
    }

    function peg$parsetype_ref() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 7) === peg$c109) {
        s1 = peg$c109;
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c110); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s3 = peg$c5;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c6); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseident();
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 41) {
                    s7 = peg$c7;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c8); }
                  }
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c111(s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 5) === peg$c112) {
          s1 = peg$c112;
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c113); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 40) {
              s3 = peg$c5;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c6); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = peg$parsetype_ref();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parse_();
                  if (s6 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 41) {
                      s7 = peg$c7;
                      peg$currPos++;
                    } else {
                      s7 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c8); }
                    }
                    if (s7 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c114(s5);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 3) === peg$c115) {
            s1 = peg$c115;
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c116); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse_();
            if (s2 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 40) {
                s3 = peg$c5;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c6); }
              }
              if (s3 !== peg$FAILED) {
                s4 = peg$parse_();
                if (s4 !== peg$FAILED) {
                  s5 = peg$parsetype_ref();
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parse_();
                    if (s6 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 44) {
                        s7 = peg$c10;
                        peg$currPos++;
                      } else {
                        s7 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                      }
                      if (s7 !== peg$FAILED) {
                        s8 = peg$parse_();
                        if (s8 !== peg$FAILED) {
                          s9 = peg$parsetype_ref();
                          if (s9 !== peg$FAILED) {
                            s10 = peg$parse_();
                            if (s10 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 41) {
                                s11 = peg$c7;
                                peg$currPos++;
                              } else {
                                s11 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c8); }
                              }
                              if (s11 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c117(s5, s9);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 4) === peg$c118) {
              s1 = peg$c118;
              peg$currPos += 4;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c119); }
            }
            if (s1 !== peg$FAILED) {
              s2 = peg$parse_();
              if (s2 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 40) {
                  s3 = peg$c5;
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c6); }
                }
                if (s3 !== peg$FAILED) {
                  s4 = peg$parse_();
                  if (s4 !== peg$FAILED) {
                    s5 = peg$parseident();
                    if (s5 !== peg$FAILED) {
                      s6 = peg$parse_();
                      if (s6 !== peg$FAILED) {
                        s7 = [];
                        s8 = peg$currPos;
                        if (input.charCodeAt(peg$currPos) === 44) {
                          s9 = peg$c10;
                          peg$currPos++;
                        } else {
                          s9 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                        }
                        if (s9 !== peg$FAILED) {
                          s10 = peg$parse_();
                          if (s10 !== peg$FAILED) {
                            s11 = peg$parseident();
                            if (s11 !== peg$FAILED) {
                              s12 = peg$parse_();
                              if (s12 !== peg$FAILED) {
                                s9 = [s9, s10, s11, s12];
                                s8 = s9;
                              } else {
                                peg$currPos = s8;
                                s8 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s8;
                              s8 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s8;
                            s8 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s8;
                          s8 = peg$FAILED;
                        }
                        while (s8 !== peg$FAILED) {
                          s7.push(s8);
                          s8 = peg$currPos;
                          if (input.charCodeAt(peg$currPos) === 44) {
                            s9 = peg$c10;
                            peg$currPos++;
                          } else {
                            s9 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                          }
                          if (s9 !== peg$FAILED) {
                            s10 = peg$parse_();
                            if (s10 !== peg$FAILED) {
                              s11 = peg$parseident();
                              if (s11 !== peg$FAILED) {
                                s12 = peg$parse_();
                                if (s12 !== peg$FAILED) {
                                  s9 = [s9, s10, s11, s12];
                                  s8 = s9;
                                } else {
                                  peg$currPos = s8;
                                  s8 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s8;
                                s8 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s8;
                              s8 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s8;
                            s8 = peg$FAILED;
                          }
                        }
                        if (s7 !== peg$FAILED) {
                          s8 = peg$parse_();
                          if (s8 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s9 = peg$c7;
                              peg$currPos++;
                            } else {
                              s9 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c8); }
                            }
                            if (s9 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c120(s5, s7);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 6) === peg$c121) {
                s1 = peg$c121;
                peg$currPos += 6;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c122); }
              }
              if (s1 !== peg$FAILED) {
                s2 = peg$parse_();
                if (s2 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 40) {
                    s3 = peg$c5;
                    peg$currPos++;
                  } else {
                    s3 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c6); }
                  }
                  if (s3 !== peg$FAILED) {
                    s4 = peg$parse_();
                    if (s4 !== peg$FAILED) {
                      s5 = peg$currPos;
                      s6 = peg$currPos;
                      s7 = peg$parseident();
                      if (s7 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 58) {
                          s8 = peg$c13;
                          peg$currPos++;
                        } else {
                          s8 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c14); }
                        }
                        if (s8 !== peg$FAILED) {
                          s7 = [s7, s8];
                          s6 = s7;
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                      if (s6 !== peg$FAILED) {
                        s5 = input.substring(s5, peg$currPos);
                      } else {
                        s5 = s6;
                      }
                      if (s5 === peg$FAILED) {
                        s5 = null;
                      }
                      if (s5 !== peg$FAILED) {
                        s6 = peg$parseident();
                        if (s6 !== peg$FAILED) {
                          s7 = peg$parse_();
                          if (s7 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s8 = peg$c7;
                              peg$currPos++;
                            } else {
                              s8 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c8); }
                            }
                            if (s8 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c123(s5, s6);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.substr(peg$currPos, 3) === peg$c124) {
                  s1 = peg$c124;
                  peg$currPos += 3;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c125); }
                }
                if (s1 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c126();
                }
                s0 = s1;
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.substr(peg$currPos, 7) === peg$c127) {
                    s1 = peg$c127;
                    peg$currPos += 7;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c128); }
                  }
                  if (s1 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c129();
                  }
                  s0 = s1;
                  if (s0 === peg$FAILED) {
                    s0 = peg$currPos;
                    if (input.substr(peg$currPos, 6) === peg$c130) {
                      s1 = peg$c130;
                      peg$currPos += 6;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c131); }
                    }
                    if (s1 === peg$FAILED) {
                      if (input.substr(peg$currPos, 8) === peg$c132) {
                        s1 = peg$c132;
                        peg$currPos += 8;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c133); }
                      }
                    }
                    if (s1 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c134();
                    }
                    s0 = s1;
                    if (s0 === peg$FAILED) {
                      s0 = peg$currPos;
                      if (input.substr(peg$currPos, 6) === peg$c135) {
                        s1 = peg$c135;
                        peg$currPos += 6;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c136); }
                      }
                      if (s1 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c137();
                      }
                      s0 = s1;
                      if (s0 === peg$FAILED) {
                        s0 = peg$currPos;
                        if (input.substr(peg$currPos, 8) === peg$c138) {
                          s1 = peg$c138;
                          peg$currPos += 8;
                        } else {
                          s1 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c139); }
                        }
                        if (s1 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c140();
                        }
                        s0 = s1;
                        if (s0 === peg$FAILED) {
                          s0 = peg$currPos;
                          if (input.substr(peg$currPos, 4) === peg$c141) {
                            s1 = peg$c141;
                            peg$currPos += 4;
                          } else {
                            s1 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c142); }
                          }
                          if (s1 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c143();
                          }
                          s0 = s1;
                          if (s0 === peg$FAILED) {
                            s0 = peg$currPos;
                            if (input.substr(peg$currPos, 4) === peg$c144) {
                              s1 = peg$c144;
                              peg$currPos += 4;
                            } else {
                              s1 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c145); }
                            }
                            if (s1 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c146();
                            }
                            s0 = s1;
                            if (s0 === peg$FAILED) {
                              s0 = peg$currPos;
                              if (input.charCodeAt(peg$currPos) === 40) {
                                s1 = peg$c5;
                                peg$currPos++;
                              } else {
                                s1 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c6); }
                              }
                              if (s1 !== peg$FAILED) {
                                s2 = peg$parsetype_ref();
                                if (s2 !== peg$FAILED) {
                                  s3 = peg$parse_();
                                  if (s3 !== peg$FAILED) {
                                    s4 = [];
                                    s5 = peg$currPos;
                                    if (input.charCodeAt(peg$currPos) === 44) {
                                      s6 = peg$c10;
                                      peg$currPos++;
                                    } else {
                                      s6 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                    }
                                    if (s6 !== peg$FAILED) {
                                      s7 = peg$parse_();
                                      if (s7 !== peg$FAILED) {
                                        s8 = peg$parsetype_ref();
                                        if (s8 !== peg$FAILED) {
                                          s9 = peg$parse_();
                                          if (s9 !== peg$FAILED) {
                                            s6 = [s6, s7, s8, s9];
                                            s5 = s6;
                                          } else {
                                            peg$currPos = s5;
                                            s5 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s5;
                                          s5 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s5;
                                        s5 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s5;
                                      s5 = peg$FAILED;
                                    }
                                    while (s5 !== peg$FAILED) {
                                      s4.push(s5);
                                      s5 = peg$currPos;
                                      if (input.charCodeAt(peg$currPos) === 44) {
                                        s6 = peg$c10;
                                        peg$currPos++;
                                      } else {
                                        s6 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                      }
                                      if (s6 !== peg$FAILED) {
                                        s7 = peg$parse_();
                                        if (s7 !== peg$FAILED) {
                                          s8 = peg$parsetype_ref();
                                          if (s8 !== peg$FAILED) {
                                            s9 = peg$parse_();
                                            if (s9 !== peg$FAILED) {
                                              s6 = [s6, s7, s8, s9];
                                              s5 = s6;
                                            } else {
                                              peg$currPos = s5;
                                              s5 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s5;
                                            s5 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s5;
                                          s5 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s5;
                                        s5 = peg$FAILED;
                                      }
                                    }
                                    if (s4 !== peg$FAILED) {
                                      if (input.charCodeAt(peg$currPos) === 41) {
                                        s5 = peg$c7;
                                        peg$currPos++;
                                      } else {
                                        s5 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c8); }
                                      }
                                      if (s5 !== peg$FAILED) {
                                        peg$savedPos = s0;
                                        s1 = peg$c147(s2, s4);
                                        s0 = s1;
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                              if (s0 === peg$FAILED) {
                                s0 = peg$currPos;
                                if (input.substr(peg$currPos, 12) === peg$c148) {
                                  s1 = peg$c148;
                                  peg$currPos += 12;
                                } else {
                                  s1 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c149); }
                                }
                                if (s1 !== peg$FAILED) {
                                  peg$savedPos = s0;
                                  s1 = peg$c150();
                                }
                                s0 = s1;
                                if (s0 === peg$FAILED) {
                                  s0 = peg$currPos;
                                  if (input.substr(peg$currPos, 11) === peg$c151) {
                                    s1 = peg$c151;
                                    peg$currPos += 11;
                                  } else {
                                    s1 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c152); }
                                  }
                                  if (s1 !== peg$FAILED) {
                                    peg$savedPos = s0;
                                    s1 = peg$c153();
                                  }
                                  s0 = s1;
                                  if (s0 === peg$FAILED) {
                                    s0 = peg$currPos;
                                    if (input.substr(peg$currPos, 7) === peg$c154) {
                                      s1 = peg$c154;
                                      peg$currPos += 7;
                                    } else {
                                      s1 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c155); }
                                    }
                                    if (s1 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c156();
                                    }
                                    s0 = s1;
                                    if (s0 === peg$FAILED) {
                                      s0 = peg$currPos;
                                      if (input.substr(peg$currPos, 8) === peg$c157) {
                                        s1 = peg$c157;
                                        peg$currPos += 8;
                                      } else {
                                        s1 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c158); }
                                      }
                                      if (s1 !== peg$FAILED) {
                                        peg$savedPos = s0;
                                        s1 = peg$c159();
                                      }
                                      s0 = s1;
                                      if (s0 === peg$FAILED) {
                                        s0 = peg$currPos;
                                        if (input.substr(peg$currPos, 3) === peg$c160) {
                                          s1 = peg$c160;
                                          peg$currPos += 3;
                                        } else {
                                          s1 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c161); }
                                        }
                                        if (s1 !== peg$FAILED) {
                                          peg$savedPos = s0;
                                          s1 = peg$c162();
                                        }
                                        s0 = s1;
                                        if (s0 === peg$FAILED) {
                                          s0 = peg$currPos;
                                          if (input.substr(peg$currPos, 8) === peg$c163) {
                                            s1 = peg$c163;
                                            peg$currPos += 8;
                                          } else {
                                            s1 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c164); }
                                          }
                                          if (s1 !== peg$FAILED) {
                                            peg$savedPos = s0;
                                            s1 = peg$c165();
                                          }
                                          s0 = s1;
                                          if (s0 === peg$FAILED) {
                                            s0 = peg$currPos;
                                            if (input.substr(peg$currPos, 7) === peg$c166) {
                                              s1 = peg$c166;
                                              peg$currPos += 7;
                                            } else {
                                              s1 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c167); }
                                            }
                                            if (s1 !== peg$FAILED) {
                                              peg$savedPos = s0;
                                              s1 = peg$c168();
                                            }
                                            s0 = s1;
                                            if (s0 === peg$FAILED) {
                                              s0 = peg$currPos;
                                              s1 = peg$parseident();
                                              if (s1 !== peg$FAILED) {
                                                peg$savedPos = s0;
                                                s1 = peg$c169(s1);
                                              }
                                              s0 = s1;
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parsecomparator() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      if (input.substr(peg$currPos, 2) === peg$c171) {
        s0 = peg$c171;
        peg$currPos += 2;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c172); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c173) {
          s0 = peg$c173;
          peg$currPos += 2;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c174); }
        }
        if (s0 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 62) {
            s0 = peg$c175;
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c176); }
          }
          if (s0 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 60) {
              s0 = peg$c177;
              peg$currPos++;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c178); }
            }
            if (s0 === peg$FAILED) {
              if (input.substr(peg$currPos, 2) === peg$c179) {
                s0 = peg$c179;
                peg$currPos += 2;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c180); }
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 61) {
                  s1 = peg$c65;
                  peg$currPos++;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c66); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = peg$currPos;
                  peg$silentFails++;
                  if (input.charCodeAt(peg$currPos) === 62) {
                    s3 = peg$c175;
                    peg$currPos++;
                  } else {
                    s3 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c176); }
                  }
                  peg$silentFails--;
                  if (s3 === peg$FAILED) {
                    s2 = void 0;
                  } else {
                    peg$currPos = s2;
                    s2 = peg$FAILED;
                  }
                  if (s2 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c181();
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
                if (s0 === peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c182) {
                    s0 = peg$c182;
                    peg$currPos += 2;
                  } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c183); }
                  }
                }
              }
            }
          }
        }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c170); }
      }

      return s0;
    }

    function peg$parseliteral_bool() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parsetrue_bool();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c184();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parsefalse_bool();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c185();
        }
        s0 = s1;
      }

      return s0;
    }

    function peg$parsetrue_bool() {
      var s0;

      if (input.substr(peg$currPos, 2) === peg$c186) {
        s0 = peg$c186;
        peg$currPos += 2;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c187); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 4) === peg$c188) {
          s0 = peg$c188;
          peg$currPos += 4;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c189); }
        }
      }

      return s0;
    }

    function peg$parsefalse_bool() {
      var s0;

      if (input.substr(peg$currPos, 3) === peg$c190) {
        s0 = peg$c190;
        peg$currPos += 3;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c191); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 5) === peg$c192) {
          s0 = peg$c192;
          peg$currPos += 5;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c193); }
        }
      }

      return s0;
    }

    function peg$parsedqstrchar() {
      var s0, s1;

      if (peg$c194.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c195); }
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c196) {
          s1 = peg$c196;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c197); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c198();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c199) {
            s1 = peg$c199;
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c200); }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c201();
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c202) {
              s1 = peg$c202;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c203); }
            }
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c204();
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 2) === peg$c205) {
                s1 = peg$c205;
                peg$currPos += 2;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c206); }
              }
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c207();
              }
              s0 = s1;
            }
          }
        }
      }

      return s0;
    }

    function peg$parsesqstrchar() {
      var s0, s1;

      if (peg$c208.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c209); }
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c196) {
          s1 = peg$c196;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c197); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c198();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c199) {
            s1 = peg$c199;
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c200); }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c201();
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c202) {
              s1 = peg$c202;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c203); }
            }
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c204();
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 2) === peg$c205) {
                s1 = peg$c205;
                peg$currPos += 2;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c206); }
              }
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c207();
              }
              s0 = s1;
            }
          }
        }
      }

      return s0;
    }

    function peg$parseliteral_string() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 34) {
        s1 = peg$c211;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c212); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parsedqstrchar();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parsedqstrchar();
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 34) {
            s3 = peg$c211;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c212); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c213(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 39) {
          s1 = peg$c214;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c215); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parsesqstrchar();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parsesqstrchar();
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 39) {
              s3 = peg$c214;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c215); }
            }
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c213(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c210); }
      }

      return s0;
    }

    function peg$parsedigit() {
      var s0, s1;

      peg$silentFails++;
      if (peg$c217.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c218); }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c216); }
      }

      return s0;
    }

    function peg$parseliteral_number() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parsedigit();
      if (s4 !== peg$FAILED) {
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parsedigit();
        }
      } else {
        s3 = peg$FAILED;
      }
      if (s3 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s4 = peg$c51;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c52); }
        }
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parsedigit();
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$parsedigit();
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 101) {
              s7 = peg$c220;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c221); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parsedigit();
              if (s9 !== peg$FAILED) {
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parsedigit();
                }
              } else {
                s8 = peg$FAILED;
              }
              if (s8 !== peg$FAILED) {
                s7 = [s7, s8];
                s6 = s7;
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s3 = [s3, s4, s5, s6];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        s1 = input.substring(s1, peg$currPos);
      } else {
        s1 = s2;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c222(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 46) {
          s3 = peg$c51;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c52); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parsedigit();
          if (s5 !== peg$FAILED) {
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parsedigit();
            }
          } else {
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 101) {
              s6 = peg$c220;
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c221); }
            }
            if (s6 !== peg$FAILED) {
              s7 = [];
              s8 = peg$parsedigit();
              if (s8 !== peg$FAILED) {
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parsedigit();
                }
              } else {
                s7 = peg$FAILED;
              }
              if (s7 !== peg$FAILED) {
                s6 = [s6, s7];
                s5 = s6;
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            if (s5 !== peg$FAILED) {
              s3 = [s3, s4, s5];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s1 = input.substring(s1, peg$currPos);
        } else {
          s1 = s2;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c222(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$currPos;
          s2 = peg$currPos;
          s3 = [];
          s4 = peg$parsedigit();
          if (s4 !== peg$FAILED) {
            while (s4 !== peg$FAILED) {
              s3.push(s4);
              s4 = peg$parsedigit();
            }
          } else {
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 101) {
              s5 = peg$c220;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c221); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parsedigit();
              if (s7 !== peg$FAILED) {
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parsedigit();
                }
              } else {
                s6 = peg$FAILED;
              }
              if (s6 !== peg$FAILED) {
                s5 = [s5, s6];
                s4 = s5;
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 === peg$FAILED) {
              s4 = null;
            }
            if (s4 !== peg$FAILED) {
              s3 = [s3, s4];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
          if (s2 !== peg$FAILED) {
            s1 = input.substring(s1, peg$currPos);
          } else {
            s1 = s2;
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c222(s1);
          }
          s0 = s1;
        }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c219); }
      }

      return s0;
    }

    function peg$parseidentstart() {
      var s0;

      if (peg$c223.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c224); }
      }

      return s0;
    }

    function peg$parseidentchar() {
      var s0;

      if (peg$c225.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c226); }
      }

      return s0;
    }

    function peg$parseident() {
      var s0, s1, s2, s3, s4;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$parseidentstart();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseidentchar();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseidentchar();
        }
        if (s3 !== peg$FAILED) {
          s2 = [s2, s3];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        s0 = input.substring(s0, peg$currPos);
      } else {
        s0 = s1;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c227); }
      }

      return s0;
    }

    function peg$parse_() {
      var s0, s1;

      s0 = [];
      s1 = peg$parsewhitespace();
      if (s1 === peg$FAILED) {
        s1 = peg$parsecomment();
      }
      while (s1 !== peg$FAILED) {
        s0.push(s1);
        s1 = peg$parsewhitespace();
        if (s1 === peg$FAILED) {
          s1 = peg$parsecomment();
        }
      }

      return s0;
    }

    function peg$parse__() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = peg$parsewhitespace();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsewhitespace() {
      var s0, s1;

      peg$silentFails++;
      if (peg$c229.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c230); }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c228); }
      }

      return s0;
    }

    function peg$parsecomment() {
      var s0, s1, s2, s3, s4, s5;

      peg$silentFails++;
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c232) {
        s1 = peg$c232;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c233); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c234.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c235); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 42) {
            s4 = peg$c81;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c82); }
          }
          if (s4 !== peg$FAILED) {
            if (peg$c236.test(input.charAt(peg$currPos))) {
              s5 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c237); }
            }
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c234.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c235); }
          }
          if (s3 === peg$FAILED) {
            s3 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 42) {
              s4 = peg$c81;
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c82); }
            }
            if (s4 !== peg$FAILED) {
              if (peg$c236.test(input.charAt(peg$currPos))) {
                s5 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c237); }
              }
              if (s5 !== peg$FAILED) {
                s4 = [s4, s5];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
        }
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c238) {
            s3 = peg$c238;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c239); }
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c240) {
          s1 = peg$c240;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c241); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          if (peg$c242.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c243); }
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            if (peg$c242.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c243); }
            }
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 10) {
              s3 = peg$c244;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c245); }
            }
            if (s3 !== peg$FAILED) {
              s1 = [s1, s2, s3];
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c231); }
      }

      return s0;
    }


        var Ast = require('./ast');
        var Type = require('./type');

        var Program = Ast.Program;
        var Statement = Ast.Statement;
        var ComputeStatement = Ast.ComputeStatement;
        var Selector = Ast.Selector;
        var Value = Ast.Value;
        var Attribute = Ast.Attribute;
        var Expression = Ast.Expression;
        var RulePart = Ast.RulePart;

        function take(array, idx) {
            return array.map(function(v) { return v[idx]; });
        }


    peg$result = peg$startRuleFunction();

    if (peg$result !== peg$FAILED && peg$currPos === input.length) {
      return peg$result;
    } else {
      if (peg$result !== peg$FAILED && peg$currPos < input.length) {
        peg$fail({ type: "end", description: "end of input" });
      }

      throw peg$buildException(
        null,
        peg$maxFailExpected,
        peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
        peg$maxFailPos < input.length
          ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
          : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
      );
    }
  }

  return {
    SyntaxError: peg$SyntaxError,
    parse:       peg$parse
  };
})();

},{"./ast":5,"./type":17}],13:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const adt = require('adt');
const assert = require('assert');

const Ast = require('./ast');
const Grammar = require('./grammar');
const Type = require('./type');
const Internal = require('./internal');
const Builtin = require('./builtin');
const Utils = require('./utils');
const ExpressionCompilerVisitor = require('./expr_compiler');
const Visitor = require('./visitor');

const typeUnify = Type.typeUnify;
const resolveTypeScope = Type.resolveTypeScope;
const normalizeConstant = Utils.normalizeConstant;
const getSchemaForSelector = Utils.getSchemaForSelector;

function makeInvocationParamAccess(i, forTrigger) {
    if (forTrigger) {
        return function(env) {
            return env.triggerValue[i];
        }
    } else {
        return function(env) {
            return env.queryValue[i];
        }
    }
}

module.exports = class InputCompilerVisitor extends Visitor.RulePart {
    constructor(appParamScope, scope, currentKeywords, forTrigger) {
        super();

        this._appParamScope = appParamScope;
        this._currentKeywords = currentKeywords;
        this._scope = scope;
        this._forTrigger = forTrigger;

        this.invocation = null;
        this.inputFunctions = [];
    }

    compileExpression(expression, scope) {
        var visitor = new ExpressionCompilerVisitor(this._currentKeywords,
                                                    scope);
        return visitor.visitExpression(expression);
    }

    visitInvocation(ast) {
        var selector = ast.selector;
        var name = ast.name;
        var schema = ast.schema;
        var params = ast.params;
        var triggerParams = [];
        var queryInputs = [];
        var paramfns = [];

        // record the scope before invoking the trigger/query
        // this is the set of variables we can pass as
        // channelParams
        // in case of queries, the initial scope includes all
        // variables currently in scope, that is, local variables,
        // keywords, app params
        // (technically compute modules too, but those should not
        // type check)
        // in case of triggers, the initial scope includes only
        // app params, because that's what TriggerRunner is able
        // to deal with
        var initialScope = {};
        if (this._forTrigger)
            Object.assign(initialScope, this._appParamScope);
        else
            Object.assign(initialScope, this._scope);

        params.forEach((param, i) => {
            var paramop = makeInvocationParamAccess(i, this._forTrigger);
            if (param.isNull) {
                triggerParams.push(undefined);
                queryInputs.push(() => undefined);
            } else if (param.isVarRef && param.isUndefined) {
                this._scope[param.name] = schema[i];
                triggerParams.push(undefined);
                queryInputs.push(() => undefined);

                paramfns.push(function(env) {
                    env.setVar(param.name, paramop(env));
                    return true;
                });
            } else {
                // try compiling using the initial scope
                // if that succeeds, we know we can pass this value as input
                // to the query (or the trigger)
                // otherwise, this expression is using some variable defined
                // by the query itself, and so needs to be checked after the
                // query is done
                var op = null;
                if (param.isConstant || param.isVarRef || !this._forTrigger) {
                    try {
                        var op = this.compileExpression(param, initialScope);
                        triggerParams.push(param);
                        queryInputs.push(op);
                    } catch(e) {
                        console.log('Compiling in initial scope failed: ' + e.message);
                        var op = this.compileExpression(param, this._scope);
                        triggerParams.push(undefined);
                        queryInputs.push(() => undefined);
                    }
                } else {
                    throw new TypeError('Invalid argument to input invocation (must be variable or constant)');
                }
                paramfns.push(function(env) {
                    return Builtin.equality(paramop(env), op(env));
                });
            }
        });

        var fullValueCheck;
        if (this._forTrigger)
            fullValueCheck = function(env) { return env.triggerValue !== null; }
        else
            fullValueCheck = function(env) { return env.queryInput !== null && env.queryValue !== null; }

        function invocationIsTrue(env) {
            if (!fullValueCheck(env))
                return false;

            for (var fn of paramfns) {
                if (!fn(env))
                    return false;
            }
            return true;
        }

        this.invocation = {
            selector: selector,
            name: name
        };
        if (this._forTrigger)
            this.invocation.params = triggerParams;
        else
            this.invocation.params = queryInputs;
        this.inputFunctions.push(function(env, cont) {
            if (invocationIsTrue(env))
                return cont();
        });
    }

    visitRegex(ast) {
        var argsast = ast.expr.args;
        if (argsast.length <= 3)
            return this.visitCondition(ast);

        var argsexp = argsast.slice(0, 3).map(function(arg) {
            return this.compileExpression(arg, this._scope);
        }, this);
        var strOp = argsexp[0];
        var regexStrOp = argsexp[1];
        var flagOp = argsexp[2];

        var regexpOp;
        if (argsast[1].isConstant && argsast[2].isConstant) {
            var regexp = new RegExp(regexStrOp(), flagOp());
            regexpOp = function() {
                return regexp;
            }
        } else {
            regexpOp = function(env) {
                return new RegExp(regexStrOp(env), flagOp(env));
            }
        }

        var bindersast = argsast.slice(3);
        var binderops = new Array(bindersast.length);

        bindersast.forEach((binder, i) => {
            if (binder.isVarRef && binder.isUndefined) {
                this._scope[binder.name] = Type.String;
                binderops[i] = function(env, group) {
                    env.setVar(binder.name, group);
                    return true;
                }
            } else {
                var binderop = this.compileExpression(binder, this._scope);
                binderops[i] = function(env, group) {
                    return group === binderop(env);
                }
            }
        });

        this.inputFunctions.push(function(env, cont) {
            var regex = regexpOp(env);
            var str = strOp(env);
            var exec = regex.exec(str);
            if (exec === null)
                return;
            for (var i = 0; i < binderops.length; i++) {
                var group = exec[i+1] || '';
                if (!binderops[i](env, group))
                    return;
            }
            return cont();
        });
    }

    visitContains(ast) {
        var argsast = ast.expr.args;
        if (argsast.length !== 2) {
            throw new TypeError("Function contains does not accept " +
                                argsast.length + " arguments");
        }
        if (!argsast[1].isVarRef || argsast[1].name in this._scope)
            return this.visitCondition(ast);

        var arrayop = this.compileExpression(argsast[0], this._scope);
        var name = argsast[1].name;
        var type = argsast[0].type;
        if (type.isArray) {
            this._scope[name] = type.elem;
            this.inputFunctions.push(function(env, cont) {
                var array = arrayop(env);
                array.forEach(function(elem) {
                    env.setVar(name, elem);
                    cont();
                });
            });
        } else if (type.isMap) {
            this._scope[name] = type.key;
            this.inputFunctions.push(function(env, cont) {
                var map = arrayop(env);
                return map.forEach(function(e) {
                    var k = e[0];
                    var v = e[1];
                    env.setVar(name, k);
                    cont();
                });
            });
        } else {
            throw new TypeError();
        }
    }

    visitBuiltinPredicate(ast) {
        if (ast.expr.name === 'regex')
            return this.visitRegex(ast);
        else if (ast.expr.name === 'contains')
            return this.visitContains(ast);
        else
            return this.visitCondition(ast);
    }

    visitBinding(ast) {
        var name = ast.name;
        var expr = this.compileExpression(ast.expr, this._scope);
        this._scope[name] = ast.type;
        this.inputFunctions.push(function(env, cont) {
            env.setVar(name, expr(env));
            return cont();
        });
    }

    visitCondition(ast) {
        var op = this.compileExpression(ast.expr, this._scope);
        this.inputFunctions.push(function(env, cont) {
            if (op(env))
                return cont();
        });
    }
}

},{"./ast":5,"./builtin":6,"./expr_compiler":11,"./grammar":12,"./internal":14,"./type":17,"./utils":19,"./visitor":20,"adt":21,"assert":25,"q":22}],14:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

exports.UnitsToBaseUnit = {
    // time
    'ms': 'ms', // base unit for time is milliseconds, because +new Date gives milliseconds
    's': 'ms',
    'min': 'ms',
    'h': 'ms',
    'day': 'ms',
    'week': 'ms',
    'mon': 'ms', // business month, aka exactly 30 days
    'year': 'ms', // business year (365 days exactly, no leap years)
    // length
    'm': 'm',
    'km': 'm',
    'mm': 'm',
    'cm': 'm',
    'mi': 'm',
    'in': 'm',
    // speed
    'mps': 'mps', // meters per second, usually written as m/s but m/s is not an identifier
    'kmph': 'mps',
    'mph': 'mps',
    // weight
    'kg': 'kg',
    'g': 'kg',
    'lb': 'kg',
    'oz': 'kg',
    // pressure (for weather or blood)
    'Pa': 'Pa',
    'bar': 'Pa',
    'psi': 'Pa',
    'mmHg': 'Pa',
    'inHg': 'Pa',
    'atm': 'Pa',
    // temperature
    'C': 'C',
    'F': 'C',
    'K': 'C',
    // energy
    'kcal': 'kcal',
    'kJ': 'kcal',
    // file and memory sizes
    'byte': 'byte',
    'KB': 'byte',
    'KiB': 'byte',
    'MB': 'byte',
    'MiB': 'byte',
    'GB': 'byte',
    'GiB': 'byte',
    'TB': 'byte',
    'TiB': 'byte'
};

exports.UnitsTransformToBaseUnit = {
    'ms': 1,
    's': 1000,
    'min': 60 * 1000,
    'h': 3600 * 1000,
    'day': 86400 * 1000,
    'week': 86400 * 7 * 1000,
    'mon': 86400 * 30 * 1000,
    'year': 86400 * 365 * 1000,
    'm': 1,
    'km': 1000,
    'mm': 1/1000,
    'cm': 1/100,
    'mi': 1609.344,
    'in': 0.0254,
    'mps': 1,
    'kmph': 0.27777778,
    'mph': 0.44704,
    'kg': 1,
    'g': 1/1000,
    'lb': 0.45359237,
    'oz': 0.028349523,
    'Pa': 1,
    'bar': 100000,
    'psi': 6894.7573,
    'mmHg': 133.32239,
    'inHg': 3386.3886,
    'atm': 101325,
    'C': 1,
    'F': function(x) { return (x - 32)/1.8; },
    'K': function(x) { return x - 273.15; },
    'kcal': 1,
    'kJ': 0.239006,
    'byte': 1,
    'KB': 1000,
    'KiB': 1024,
    'MB': 1000*1000,
    'MiB': 1024*1024,
    'GB': 1000*1000*1000,
    'GiB': 1024*1024*1024,
    'TB': 1000*1000*1000*1000,
    'TiB': 1024*1024*1024*1024
};

exports.UnitsInverseTransformFromBaseUnit = {
    'F': function(x) { return x*1.8 + 32; },
    'K': function(x) { return x + 273.15; }
}

},{}],15:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const adt = require('adt');
const assert = require('assert');

const Ast = require('./ast');
const Grammar = require('./grammar');
const Type = require('./type');
const Internal = require('./internal');
const Builtin = require('./builtin');
const Utils = require('./utils');
const ExpressionCompilerVisitor = require('./expr_compiler');
const Visitor = require('./visitor');

const typeUnify = Type.typeUnify;
const resolveTypeScope = Type.resolveTypeScope;
const normalizeConstant = Utils.normalizeConstant;

module.exports = class OutputCompilerVisitor extends Visitor.RulePart {
    constructor(scope, currentKeywords) {
        super();

        this._currentKeywords = currentKeywords;
        this._scope = scope;

        this.outputs = [];
    }

    compileExpression(expression) {
        var visitor = new ExpressionCompilerVisitor(this._currentKeywords,
                                                    this._scope);
        return visitor.visitExpression(expression);
    }

    visitInvocation(invocation) {
        var params = invocation.params.map(function(param) {
            return this.compileExpression(param);
        }, this);

        var produce = function(env) {
            return params.map(function(p) {
                return p(env);
            });
        };

        this.outputs.push({
            action: {
                selector: invocation.selector,
                name: invocation.name
            },
            keyword: null,
            produce: produce
        });
    }

    visitBinding(output) {
        var expr = this.compileExpression(output.expr);
        this.outputs.push({
            action: null,
            keyword: output.name,
            produce: expr
        });
    }
}

},{"./ast":5,"./builtin":6,"./expr_compiler":11,"./grammar":12,"./internal":14,"./type":17,"./utils":19,"./visitor":20,"adt":21,"assert":25,"q":22}],16:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const Type = require('./type');

module.exports = class SchemaRetriever {
    constructor(client, silent) {
        this._schemaRequest = null;
        this._pendingSchemaRequests = [];
        this._metaRequest = null;
        this._pendingMetaRequests = [];
        this._cache = {};
        this._metaCache = {};

        this._client = client;
        this._silent = !!silent;
    }

    _ensureSchemaRequest() {
        if (this._schemaRequest !== null)
            return;

        this._schemaRequest = Q.delay(0).then(function() {
            var pending = this._pendingSchemaRequests;
            this._pendingSchemaRequests = [];
            this._schemaRequest = null;
            if (!this._silent)
                console.log('Batched schema request for ' + pending);
            return this._client.getSchemas(pending);
        }.bind(this)).then((resolved) => {
            for (var kind in resolved) {
                this._parseSchemaTypes(resolved[kind].triggers);
                this._parseSchemaTypes(resolved[kind].actions);
                this._parseSchemaTypes(resolved[kind].queries);
                this._cache[kind] = resolved[kind];
            }
            return resolved;
        });
    }

    _parseSchemaTypes(channels) {
        for (var name in channels)
            channels[name] = channels[name].map(Type.fromString);
    }

    _parseMetaTypes(channels) {
        for (var name in channels)
            channels[name].schema = channels[name].schema.map(Type.fromString);
    }

    _getFullSchema(kind) {
        if (kind in this._cache)
            return Q(this._cache[kind]);

        if (this._pendingSchemaRequests.indexOf(kind) < 0)
            this._pendingSchemaRequests.push(kind);
        this._ensureSchemaRequest();
        return this._schemaRequest.then(function(everything) {
            if (kind in everything)
                return everything[kind];
            else
                throw new Error('Invalid kind ' + kind);
        })
    }

    _ensureMetaRequest() {
        if (this._metaRequest !== null)
            return;

        this._metaRequest = Q.delay(0).then(function() {
            var pending = this._pendingMetaRequests;
            this._pendingMetaRequests = [];
            this._metaRequest = null;
            if (!this._silent)
                console.log('Batched schema-meta request for ' + pending);
            return this._client.getMetas(pending);
        }.bind(this)).then((resolved) => {
            for (var kind in resolved) {
                this._parseMetaTypes(resolved[kind].triggers);
                this._parseMetaTypes(resolved[kind].actions);
                this._parseMetaTypes(resolved[kind].queries);
                this._metaCache[kind] = resolved[kind];
            }
            return resolved;
        });
    }

    getFullMeta(kind) {
        if (kind in this._metaCache)
            return Q(this._metaCache[kind]);

        if (this._pendingMetaRequests.indexOf(kind) < 0)
            this._pendingMetaRequests.push(kind);
        this._ensureMetaRequest();
        return this._metaRequest.then(function(everything) {
            if (kind in everything)
                return everything[kind];
            else
                throw new Error('Invalid kind ' + kind);
        });
    }

    getSchema(kind, where, name) {
        return this._getFullSchema(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }

    getMeta(kind, where, name) {
        return this.getFullMeta(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }
}

},{"./type":17,"q":22}],17:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const adt = require('adt');

const Grammar = require('./grammar');
const Internal = require('./internal');

function normalizeUnit(unit) {
    if (unit === '')
        return '';
    var baseunit = Internal.UnitsToBaseUnit[unit];
    if (baseunit === undefined)
        throw new TypeError('Invalid unit ' + unit);
    return baseunit;
}

function adtOnlyOrString(what) {
    return function(v) {
        if (typeof v === 'string')
            return v;
        if (v instanceof what)
            return v;
        throw new TypeError('Invalid ADT parameter');
    }
}

function adtNullable(o) {
    var only = adt.only(o);
    return function(v) {
        if (v === null)
            return v;
        else
            return only.apply(this, arguments);
    };
}

// strictly speaking, Measure and Arrays are not types, they are type constructors
// (kind * -> *)
// typeUnify() has the magic to check types
const Type = adt.data(function() {
    return {
        Any: null, // polymorphic hole
        Boolean: null,
        String: null,
        Number: null,
        Entity: { // a typed string (username, hashtag, url, picture...)
            type: adt.only(String), // the entity type, as RDF-style prefix:name
        },
        Measure: {
            // '' means any unit, creating a polymorphic type
            // any other value is a base unit (m for length, C for temperature)
            unit: normalizeUnit,
        },
        Enum: {
            entries: adt.only(Array) // of string
        },
        Array: {
            elem: adtOnlyOrString(this),
        },
        Map: {
            key: adtOnlyOrString(this),
            value: adtOnlyOrString(this),
        },
        Time: null,
        Date: null,
        Location: null,
        Tuple: {
            schema: adtNullable(Array),
        },

        // internal types
        Object: {
            schema: adt.any,
        },
        Module: null,
    };
});

module.exports = Type;

module.exports.fromString = function(str) {
    if (str instanceof Type)
        return str;

    return Grammar.parse(str, { startRule: 'type_ref' });
};

function arrayEquals(a, b) {
    if (a.length !== b.length)
        return false;

    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }

    return true;
}

module.exports.typeUnify = function typeUnify(t1, t2, typeScope) {
    if (!typeScope)
        typeScope = {};

    if (typeof t1 === 'string' && typeof t2 === 'string') {
        if (t1 in typeScope && t2 in typeScope)
            return typeUnify(typeScope[t1], typeScope[t2], typeScope);
        if (t1 in typeScope)
            return typeScope[t2] = typeScope[t1];
        else if (t2 in typeScope)
            return typeScope[t1] = typeScope[t2];
        else
            return typeScope[t1] = typeScope[t2] = Type.Any;
    }
    if (typeof t1 === 'string') {
        if (t1 in typeScope)
            t1 = typeScope[t1];
        else
            return t1 = typeScope[t1] = t2;
    }
    if (typeof t2 === 'string') {
        if (t2 in typeScope)
            t2 = typeScope[t2];
        else
            return t2 = typeScope[t2] = t1;
    }
    // this will also check that the units match for two measures
    if (t1.equals(t2))
        return t1;
    if (t1.isAny)
        return t2;
    else if (t2.isAny)
        return t1;
    else if (t1.isMeasure && t1.unit == '' && t2.isMeasure)
        return t2;
    else if (t2.isMeasure && t2.unit == '' && t1.isMeasure)
        return t1;
    else if (t1.isObject && t2.isObject && t1.schema === null)
        return t2;
    else if (t1.isObject && t2.isObject && t2.schema === null)
        return t2;
    else if (t1.isTuple && t2.isTuple && t1.schema === null)
        return t2;
    else if (t1.isTuple && t2.isTuple && t2.schema === null)
        return t1;
    else if (t1.isTuple && t2.isTuple && t1.schema.length === t2.schema.length) {
        var mapped = new Array(t1.schema.length);
        for (var i = 0; i < t1.schema.length; i++)
            mapped[i] = typeUnify(t1.schema[i], t2.schema[i], typeScope);
        return Type.Tuple(mapped);
    }
    else if (t1.isArray && t2.isArray)
        return Type.Array(typeUnify(t1.elem, t2.elem, typeScope));
    else if (t1.isMap && t2.isMap)
        return Type.Map(typeUnify(t1.key, t2.key, typeScope),
                        typeUnify(t1.value, t2.value, typeScope));
    else if (t1.isEnum && t2.isEnum && arrayEquals(t1.entries, t2.entries))
        return t1;
    else if (t1.isEnum && t2.isString) // strings and enums are interchangeable
        return t1;
    else if (t2.isEnum && t1.isString)
        return t2;
    else if ((t1.isEntity && t2.isString) || (t2.isEntity && t1.isString)) {
        // for compat reason, some types unify with String
        var subtype = t2.isEntity ? t2 : t1;
        console.log('Using type String for ' + subtype + ' is deprecated');
        return subtype;
    } else
        throw new TypeError('Cannot unify ' + t1 + ' and ' + t2);
}

module.exports.resolveTypeScope = function resolveTypeScope(type, typeScope) {
    if (typeof type === 'string') {
        if (type in typeScope)
            return resolveTypeScope(typeScope[type], typeScope);
        else
            return Type.Any;
    }

    if (type.isArray)
        return Type.Array(resolveTypeScope(type.elem, typeScope));
    else if (type.isMap)
        return Type.Map(resolveTypeScope(type.key, typeScope),
                        resolveTypeScope(type.value, typeScope));
    else if (type.isTuple && type.schema !== null)
        return Type.Tuple(type.schema.map(function(t) { return resolveTypeScope(t, typeScope); }));
    else
        return type;
}

},{"./grammar":12,"./internal":14,"adt":21}],18:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const adt = require('adt');
const assert = require('assert');

const Ast = require('./ast');
const Grammar = require('./grammar');
const Type = require('./type');
const Internal = require('./internal');
const Builtin = require('./builtin');
const Utils = require('./utils');
const Visitor = require('./visitor');

const typeUnify = Type.typeUnify;
const resolveTypeScope = Type.resolveTypeScope;
const getSchemaForSelector = Utils.getSchemaForSelector;

class TypeCheckExpressionVisitor extends Visitor.Expression {
    constructor(keywords, scope) {
        super();

        this._keywords = keywords;

        this.scope = scope;
    }

    visitConstant(ast) {
        return ast.type = Ast.typeForValue(ast.value);
    }

    visitVarRef(ast) {
        var name = ast.name;
        if (name in this._keywords) {
            var decl = this._keywords[name];

            ast.isKeywordAccess = true;
            return ast.type = decl.type;
        } else {
            if (!(name in this.scope))
                throw new TypeError('Variable ' + name + ' is undefined');

            return ast.type = this.scope[name];
        }
    }

    visitMemberRef(ast) {
        var objectast = ast.object;
        var name = ast.name;
        var objecttype = typeUnify(this.visitExpression(objectast), Type.Object(null));

        var type;
        var schema = null;
        if (objecttype.isObject)
            schema = objecttype.schema;
        else
            throw new TypeError(); // should not unify with Type.Object

        if (schema !== null) {
            if (!(name in schema))
                throw new TypeError('Object has no field ' + name);
            type = schema[name];
        } else {
            type = Type.Any;
        }
        return ast.type = type;
    }

    visitFunctionCall(ast) {
        var name = ast.name;
        var argsast = ast.args;
        if (!(name in Builtin.Functions))
            throw new TypeError('Unknown function $' + name);

        var func = Builtin.Functions[name];
        var argstype = argsast.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        ast.pure = func.pure;
        ast.passEnv = func.passEnv;

        for (var i = 0; i < func.types.length; i++) {
            var overload = func.types[i];
            var maxArgs = overload.length - 1;
            if ('minArgs' in func)
                var minArgs = func.minArgs;
            else
                var minArgs = maxArgs;
            if (argsast.length < minArgs || argsast.length > maxArgs)
                continue;
            try {
                var typeScope = {};
                argstype.forEach(function(type, idx) {
                    typeUnify(type, overload[idx], typeScope);
                });
                var funcop;
                if (Array.isArray(func.op))
                    funcop = func.op[i];
                else
                    funcop = func.op;
                var rettype = resolveTypeScope(overload[overload.length-1], typeScope);
                ast.type = rettype;
                ast.op = funcop;

                return ast.type;
            } catch(e) {
            }
        }

        throw new TypeError('Could not find a valid overload of $' + name + ' with ' + argsast.length + ' arguments');
    }

    visitUnaryOp(ast) {
        var argast = ast.arg;
        var opcode = ast.opcode;
        var argtype = this.visitExpression(argast);
        var unop = Builtin.UnaryOps[opcode];
        ast.pure = unop.pure;
        var rettype, op;
        for (var i = 0; i < unop.types.length; i++) {
            try {
                var typeScope = {};
                argtype = typeUnify(argtype, unop.types[i][0], typeScope);
                rettype = unop.types[i][1];
                if (argtype.isMeasure && rettype.isMeasure)
                    rettype = typeUnify(argtype, rettype, typeScope);
                op = unop.op;
                break;
            } catch(e) {
            }
        }
        if (op === undefined)
            throw new TypeError('Could not find a valid overload for unary op ' + opcode);

        ast.type = rettype;
        ast.op = op;
        return ast.type;
    }

    visitBinaryOp(ast) {
        var lhsast = ast.lhs;
        var rhsast = ast.rhs;
        var opcode = ast.opcode;
        var lhstype = this.visitExpression(lhsast);
        var rhstype = this.visitExpression(rhsast);

        var binop = Builtin.BinaryOps[opcode];
        ast.pure = binop.pure;
        var rettype, op;
        for (var i = 0; i < binop.types.length; i++) {
            try {
                var typeScope = {};
                lhstype = typeUnify(lhstype, binop.types[i][0], typeScope);
                rhstype = typeUnify(rhstype, binop.types[i][1], typeScope);
                rettype = binop.types[i][2];
                if (lhstype.isMeasure && rhstype.isMeasure)
                    lhstype = typeUnify(lhstype, rhstype, typeScope);
                if (lhstype.isMeasure && rettype.isMeasure)
                    rettype = typeUnify(lhstype, rettype, typeScope);
                op = binop.op;
                break;
            } catch(e) {
            }
        }
        if (op === undefined)
            throw new TypeError('Could not find a valid overload for binary op ' + opcode);

        ast.type = rettype;
        ast.op = op;
        return ast.type;
    }

    visitTuple(ast) {
        var args = ast.args;
        var types = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);

        return ast.type = Type.Tuple(types);
    }

    visitArray(ast) {
        var args = ast.args;
        var argtypes = args.map(function(arg) {
            return this.visitExpression(arg);
        }, this);
        var type = Type.Any;
        argtypes.forEach(function(t) {
            type = typeUnify(type, t);
        });
        return ast.type = Type.Array(type);
    }
}

class TypeCheckInputVisitor extends Visitor.RulePart {
    constructor(schemas, globalScope, modules, keywordDecls, scope, forTrigger) {
        super();

        this._schemas = schemas;
        this._globalScope = globalScope;
        this._modules = modules;
        this._keywordDecls = keywordDecls;

        this._scope = scope;
        this._forTrigger = forTrigger;
    }

    typeCheckExpression(expression) {
        var visitor = new TypeCheckExpressionVisitor(this._keywordDecls,
                                                     this._scope);
        return visitor.visitExpression(expression);
    }

    visitInvocation(ast) {
        var selector = ast.selector;
        var name = ast.name;
        var schema;
        if (this._forTrigger)
            schema = getSchemaForSelector(this._schemas, selector, name, this._scope, this._modules, 'events', 'triggers');
        else
            schema = getSchemaForSelector(this._schemas, selector, name, this._scope, this._modules, '', 'queries');

        return schema.then((schema) => {
            var params = ast.params;
            var triggerParams = [];
            var queryInputs = [];
            var paramfns = [];

            if (schema !== null) {
                if (params.length > schema.length)
                    throw new TypeError('Invalid number of parameters for trigger');
            } else {
                schema = params.map(() => Type.Any);
            }
            while (params.length < schema.length)
                params.push(Ast.Expression.Null);
            ast.schema = schema;

            params.forEach((param, i) => {
                if (param.isNull)
                    return;

                if (param.isVarRef && !(param.name in this._scope)) {
                    this._scope[param.name] = schema[i];
                    param.isUndefined = true;
                } else {
                    var argtype = this.typeCheckExpression(param);
                    schema[i] = typeUnify(schema[i], argtype);
                }
            });
        });
    }


    visitRegex(ast) {
        var argsast = ast.expr.args;
        if (argsast.length <= 3)
            return this.visitCondition(ast);

        var argstypes = argsast.slice(0, 3).map(function(arg) {
            return this.typeCheckExpression(arg);
        }, this);
        typeUnify(argstypes[0], Type.String);
        typeUnify(argstypes[1], Type.String);
        typeUnify(argstypes[2], Type.String);

        var bindersast = argsast.slice(3);

        bindersast.forEach((binder, i) => {
            if (binder.isVarRef && !(binder.name in this._scope)) {
                this._scope[binder.name] = Type.String;
                binder.isUndefined = true;
            } else {
                var bindertype = this.typeCheckExpression(binder);
                typeUnify(bindertype, Type.String);
            }
        });
    }

    visitContains(ast) {
        var argsast = ast.expr.args;
        if (argsast.length !== 2) {
            throw new TypeError("Function contains does not accept " +
                                argsast.length + " arguments");
        }
        if (!argsast[1].isVarRef || argsast[1].name in this._scope)
            return this.visitCondition(ast);

        var arraytype = this.typeCheckExpression(argsast[0]);
        var type = null;
        try {
            type = typeUnify(arraytype, Type.Array(Type.Any));
        } catch(e) { }
        if (type === null) {
            try {
                type = typeUnify(arraytype, Type.Map(Type.Any, Type.Any));
            } catch(e) { }
        }
        if (type === null)
            throw new TypeError("Invalid first argument to $contains");
        argsast[0].type = type;

        var name = argsast[1].name;
        if (type.isArray) {
            this._scope[name] = type.elem;
            argsast[1].type = type.elem;
        } else {
            this._scope[name] = type.key;
            argsast[1].type = type.key;
        }
    }

    visitBuiltinPredicate(ast) {
        if (ast.expr.name === 'regex')
            return this.visitRegex(ast);
        else if (ast.expr.name === 'contains')
            return this.visitContains(ast);
        else
            return this.visitCondition(ast);
    }

    visitBinding(ast) {
        var name = ast.name;
        if (name in this._scope)
            throw new TypeError('Name ' + name + ' is already in scope');

        var type = this.typeCheckExpression(ast.expr);
        this._scope[name] = type;
    }

    visitCondition(ast) {
        var type = this.typeCheckExpression(ast.expr);
        typeUnify(type, Type.Boolean);
    }
}

class TypeCheckOutputVisitor extends Visitor.RulePart {
    constructor(schemas, globalScope, modules, keywordDecls, scope) {
        super();

        this._schemaRetriever = schemas;
        this._keywordDecls = keywordDecls;
        this._globalScope = globalScope;
        this._modules = modules;

        this._scope = scope;

        this.outputs = [];
    }

    typeCheckExpression(expression) {
        var visitor = new TypeCheckExpressionVisitor(this._keywordDecls,
                                                     this._scope);
        return visitor.visitExpression(expression);
    }

    visitCondition() {
        throw new Error('Invalid rule action, must be invocation or variable set');
    }
    visitBuiltinPredicate() {
        throw new Error('Invalid rule action, must be invocation or variable set');
    }
    visitBinding(output) {
        var name = output.name;

        if (!(name in this._keywordDecls))
            throw new TypeError('Undeclared variable ' + name);

        var decl = this._keywordDecls[name];

        var type = this.typeCheckExpression(output.expr);
        decl.type = typeUnify(type, decl.type);
    }

    visitInvocation(invocation) {
        return Utils.getSchemaForSelector(this._schemaRetriever,
                                          invocation.selector,
                                          invocation.name,
                                          this._globalScope,
                                          this._modules,
                                          'functionSchemas',
                                          'actions')
            .then((schema) => {
                var type = Type.Tuple(schema);

                if (schema !== null) {
                    if (invocation.params.length < schema.length)
                        throw new TypeError('Invalid number of parameters for action');
                    if (invocation.params.length > schema.length)
                        invocation.params = invocation.params.slice(0, schema.length);
                } else {
                    schema = invocation.params.map(() => Type.Any);
                }

                var paramtypes = invocation.params.map(function(param) {
                    return this.typeCheckExpression(param);
                }, this);

                paramtypes.forEach(function(t, i) {
                    schema[i] = typeUnify(t, schema[i]);
                });
            });
    }
}

module.exports = {
    Inputs: TypeCheckInputVisitor,
    Outputs: TypeCheckOutputVisitor
}

},{"./ast":5,"./builtin":6,"./grammar":12,"./internal":14,"./type":17,"./utils":19,"./visitor":20,"adt":21,"assert":25,"q":22}],19:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const Internal = require('./internal');
const Ast = require('./ast');
const Type = require('./type');
const Builtin = require('./builtin');

const builtins = {
    triggers: Builtin.Triggers,
    actions: Builtin.Actions,
    queries: Builtin.Queries
};

module.exports = {
    normalizeConstant(value) {
        if (value.isMeasure) {
            var baseunit = Internal.UnitsToBaseUnit[value.unit];
            if (baseunit === undefined)
                throw new TypeError("Invalid unit " + value.unit);
            var transform = Internal.UnitsTransformToBaseUnit[value.unit];
            var type = Type.Measure(baseunit);
            var transformed;
            if (typeof transform == 'function')
                transformed = transform(value.value);
            else
                transformed = value.value * transform;
            return Ast.Value.Measure(transformed, baseunit);
        } else {
            return value;
        }
    },

    getSchemaForSelector(schemas, selector, name, globalScope, modules, inModule, schema) {
        if (selector.isBuiltin) {
            return Q(builtins[schema][name]);
        } else if (selector.isGlobalName) {
            var moduleName = selector.name;
            if (moduleName in globalScope) {
                if (!inModule)
                    throw new TypeError("Compute modules cannot be used in queries (yet)");
                if (!globalScope[moduleName].isModule)
                    throw new TypeError(moduleName + ' does not name a compute module');
                var module = modules[moduleName];
                if (!(name in module[inModule]))
                    throw new TypeError(moduleName + '.' + name + ' does not name a compute invocation');

                selector = Ast.Selector.ComputeModule(moduleName);
                return Q(module[inModule][name]);
            } else {
                return schemas.getSchema(selector.name, schema, name);
            }
        } else {
            var type = null;

            selector.attributes.forEach((attr) => {
                if (attr.name === 'type') {
                    if (!attr.value.isString)
                        throw new Error("Invalid type for device attribute \"type\"");
                    if (type !== null)
                        throw new Error("Duplicate device attribute type");
                    type = attr.value.value;
                }
                if (attr.value.isVarRef && !(attr.value.name in globalScope))
                    throw new Error("Undeclared variable " + attr.value.name);
            });
            if (type === null)
                throw new Error("Device type missing in selector, cannot infer schema");

            return schemas.getSchema(type, schema, name);
        }
    }
};

},{"./ast":5,"./builtin":6,"./internal":14,"./type":17,"q":22}],20:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

class ExpressionVisitor {
    visitExpression(ast) {
        if (ast.isConstant)
            return this.visitConstant(ast);
        else if (ast.isVarRef)
            return this.visitVarRef(ast);
        else if (ast.isMemberRef)
            return this.visitMemberRef(ast);
        else if (ast.isFunctionCall)
            return this.visitFunctionCall(ast);
        else if (ast.isUnaryOp)
            return this.visitUnaryOp(ast);
        else if (ast.isBinaryOp)
            return this.visitBinaryOp(ast);
        else if (ast.isTuple)
            return this.visitTuple(ast);
        else if (ast.isArray)
            return this.visitArray(ast);
        else if (ast.isNull)
            throw new TypeError("Null expression is not allowed at this point");
        else
            throw new TypeError(String(ast));
    }
}

class RulePartVisitor {
    visitOrderedSync(inputs) {
        for (var input of inputs) {
            if (input.isInvocation)
                return this.visitInvocation(input);
            else if (input.isBuiltinPredicate)
                return this.visitBuiltinPredicate(input);
            else if (input.isBinding)
                return this.visitBinding(input);
            else if (input.isCondition)
                return this.visitCondition(input);
            else
                throw new TypeError(String(input));
        }
    }

    visitReorderSync(inputs) {
        // order invocation -> builtin predicates -> binding -> condition

        var invocations = [];
        var builtinPredicates = [];
        var bindings = [];
        var conditions = [];
        for (var input of inputs) {
            if (input.isInvocation)
                invocations.push(input);
            else if (input.isBuiltinPredicate)
                builtinPredicates.push(input);
            else if (input.isCondition)
                conditions.push(input);
            else if (input.isBinding)
                bindings.push(input);
            else
                throw new TypeError(String(input));
        }

        for (var input of invocations)
            this.visitInvocation(input);
        for (var input of builtinPredicates)
            this.visitBuiltinPredicate(input);
        for (var input of bindings)
            this.visitBinding(input);
        for (var input of conditions)
            this.visitCondition(input);
    }

    visitOrderedAsync(inputs) {
        return Q.all(inputs.map((input) => {
            if (input.isInvocation)
                return this.visitInvocation(input);
            else if (input.isBuiltinPredicate)
                return this.visitBuiltinPredicate(input);
            else if (input.isBinding)
                return this.visitBinding(input);
            else if (input.isCondition)
                return this.visitCondition(input);
            else
                throw new TypeError(String(input));
        }));
    }

    visitReorderAsync(inputs) {
        // order invocation -> builtin predicates -> binding -> condition

        // there can only be one invocation (enforced by the syntax)
        var invocation = null;
        var builtinPredicates = [];
        var bindings = [];
        var conditions = [];
        for (var input of inputs) {
            if (input.isInvocation)
                invocation = input;
            else if (input.isBuiltinPredicate)
                builtinPredicates.push(input);
            else if (input.isBinding)
                bindings.push(input);
            else if (input.isCondition)
                conditions.push(input);
            else
                throw new TypeError(String(input));
        }

        return this.visitInvocation(invocation).then(() => {
            for (var input of builtinPredicates)
                this.visitBuiltinPredicate(input);
            for (var input of bindings)
                this.visitBinding(input);
            for (var input of conditions)
                this.visitCondition(input);
        });
    }
}

module.exports = {
    Expression: ExpressionVisitor,
    RulePart: RulePartVisitor
}

},{"q":22}],21:[function(require,module,exports){
// adt.js 
// ------
// Algebraic data types and immutable structures in Javascript
//
// version : 0.7.2
// author  : Nathan Faubion <nathan@n-son.com>
// license : MIT

;(function (adt) {
  'use strict';

  // Base class from which all adt.js classes inherit.
  adt.__Base__ = function () {};

  // ADT Class Generation
  // --------------------

  adt.data = function () {
    var targ0 = typeof arguments[0];

    // adt.data(...names: String)
    if (targ0 === 'string') {
      var names = arguments;
      return adt.data(function (type) {
        var i = 0, len = names.length;
        for (; i < len; i++) type(names[i]);
      });
    }

    // adt.data(types: Object)
    if (targ0 === 'object') {
      var types = arguments[0];
      return adt.data(function (type) {
        for (var name in types) {
          if (types.hasOwnProperty(name)) type(name, types[name]);
        }
      });
    }

    // adt.data(configure: Function)
    var callback = arguments[0] || noop;
    var names = [];

    // Create a new parent class.
    // This class should never be created using `new`. You obviously can,
    // but it won't be of much use. You can however override the apply method
    // to create default instances.
    var D = inherit(adt.__Base__, function () {
      if (!(this instanceof D) && D.apply !== Function.prototype.apply) {
        return D.apply(this, arguments);
      }
      throw new Error('Bad invocation');
    });

    // Adds a new type to the ADT.
    D.type = function (name, tmpl) {
      if (typeof name !== 'string') {
        tmpl = name;
        name = uniqueId('Anonymous');
      }
      
      // Create a new template if not provided with one
      var isSingle = checkTypes([String, Boolean, Number, Date, null, void 0], tmpl);
      if (isSingle) tmpl = adt.single(tmpl);
      else if (typeof tmpl !== 'function') {
        tmpl = checkType(Array, tmpl)
          ? adt.record.apply(null, tmpl)
          : adt.record(tmpl);
      }

      // Add typechecking attributes for this type. Everything starts out as
      // false by default. Each individual class should overrides its own.
      D.prototype['is' + name] = false;

      // Call the template to build our type.
      var d = tmpl(D, name);

      // Bind the constructor context to avoid conflicts with calling as a method.
      d = (typeof d === 'function') ? extend(d.bind(), d) : d;

      // Export it on the parent type.
      D[name] = d;
      names.push(name);

      return d;
    };

    // Call the callback with the constructor as the context.
    var types = callback.call(D, D.type, D);

    // If an object was returned in the callback, assume it's a mapping of
    // more types to add.
    if (typeof types === 'object' && !(types instanceof adt.__Base__)) {
      for (var name in types) {
        if (types.hasOwnProperty(name)) D.type(name, types[name]);
      }
    }

    // Keep the type function around because it allows for nice type
    // declarations, but give the option to seal it. This will call `seal`
    // on any sub types to.
    D.seal = function () { 
      var i = 0, n, name;
      for (; n = names[i]; i++) if (this[n].seal) this[n].seal();
      delete D.type;
      delete D.seal;
      return D;
    };

    // Export names as a meta object
    D.__names__ = names;
    D.prototype.__adtClass__ = D;
    return D;
  };

  // Singleton Class Generation
  // --------------------------

  // Create a single empty class instance. You can pass in a value that the
  // class will use during JSON serialization.
  adt.single = function (val) {
    var ctr = function () {};
    ctr.__value__ = val === void 0 ? null : val;

    return function (parent, name) {
      inherit(parent, ctr);
      extend(ctr.prototype, adt.single.__methods__);

      ctr.className = name;
      ctr.prototype['is' + name] = true;

      return new ctr();
    };
  }

  // Singleton Methods
  // -----------------

  adt.single.__methods__ = {
    toString: function () {
      return this.constructor.className;
    },

    toJSON: function () {
      return this.constructor.__value__;
    },

    clone: function () {
      return this;
    },

    equals: function (that) {
      return this === that;
    },

    hasInstance: function(that) {
      return this === that;
    }
  };

  // Record Class Generation
  // -----------------------

  adt.record = function () {
    var targ0 = typeof arguments[0];

    // adt.record(...names: String)
    if (targ0 === 'string') {
      var names = arguments;
      return adt.record(function (field) {
        var i = 0, len = names.length;
        for (; i < len; i++) field(names[i], adt.any);
      });
    }

    // adt.record(fields: Object)
    else if (targ0 === 'object') {
      var fields = arguments[0];
      return adt.record(function (field) {
        for (var name in fields) {
          if (fields.hasOwnProperty(name)) field(name, fields[name]);
        }
      });
    }

    // adt.record(template: Function)
    var callback = arguments[0] || noop;
    var names = [];
    var constraints = {};

    // A record's constructor can be called without `new` and will also throw
    // an error if called with the wrong number of arguments. Its arguments can
    // be curried as long as it isn't called with the `new` keyword.
    var ctr = function () {
      var args = arguments;
      var len = names.length;
      if (this instanceof ctr) {
        if (args.length !== len) {
          throw new Error(
            'Unexpected number of arguments for ' + ctr.className + ': ' +
            'got ' + args.length + ', but need ' + len + '.'
          );
        }
        var i = 0, n;
        for (; n = names[i]; i++) {
          this[n] = constraints[n](args[i], n, ctr);
        }
      } else {
        return args.length < len
          ? partial(ctr, toArray(args))
          : ctrApply(ctr, args);
      }
    };

    return function (parent, name) {
      inherit(parent, ctr);
      extend(ctr, adt.record.__classMethods__);
      extend(ctr.prototype, adt.record.__methods__);

      ctr.className = name;
      ctr.prototype['is' + name] = true;

      // Declares a field as part of the type.
      ctr.field = function (name, constraint) {
        if (!constraint) constraint = adt.any;
        if (typeof constraint !== 'function') {
          throw new TypeError('Constraints must be functions')
        }
        names.push(name);
        constraints[name] = constraint;
        return ctr;
      };

      // Call the callback with the contructor as the context.
      var fields = callback.call(ctr, ctr.field, ctr);

      // If an object was returned in the callback, assume it's a mapping of
      // more fields to add.
      if (typeof fields === 'object' && fields !== ctr) {
        for (var name in fields) {
          if (fields.hasOwnProperty(name)) ctr.field(name, fields[name]);
        }
      }

      // Export names and constraints as meta attributes.
      ctr.__names__ = names;
      ctr.__constraints__ = constraints;
      return ctr;
    };
  };

  // Record Methods
  // --------------
  
  adt.record.__methods__ = {
    toString: function () {
      var ctr = this.constructor;
      var vals = ctr.unapply(this);
      return ctr.className + (vals.length ? '(' + vals.join(', ') + ')' : '');
    },

    toJSON: function () {
      return this.constructor.unapplyObject(this, toJSONValue);
    },

    // Clones any value that is an adt.js type, delegating other JS values
    // to `adt.nativeClone`.
    clone: function () {
      var ctr = this.constructor;
      var names = ctr.__names__;
      var args = [], i = 0, n, val;
      for (; n = names[i]; i++) {
        val = this[n];
        args[i] = val instanceof adt.__Base__ 
          ? val.clone()
          : adt.nativeClone(val);
      }
      return ctr.apply(null, args);
    },

    // Recursively compares all adt.js types, delegating other JS values
    // to `adt.nativeEquals`.
    equals: function (that) {
      var ctr = this.constructor;
      if (this === that) return true;
      if (!(that instanceof ctr)) return false;
      var names = ctr.__names__;
      var i = 0, len = names.length;
      var vala, valb, n;
      for (; i < len; i++) {
        n = names[i], vala = this[n], valb = that[n];
        if (vala instanceof adt.__Base__) {
          if (!vala.equals(valb)) return false;
        } else if (!adt.nativeEquals(vala, valb)) return false;
      }
      return true;
    },

    // Overloaded to take either strings or numbers. Throws an error if the
    // key can't be found.
    get: function (field) {
      var ctr = this.constructor;
      var names = ctr.__names__;
      var constraints = ctr.__constraints__;
      if (typeof field === 'number') {
        if (field < 0 || field > names.length - 1) {
          throw new Error('Field index out of range: ' + field);
        }
        field = names[field];
      } else {
        if (!constraints.hasOwnProperty(field)) {
          throw new Error('Field name does not exist: ' + field);
        }
      }
      return this[field];
    },

    set: function (vals) {
      var ctr = this.constructor;
      var names = ctr.__names__;
      var args = [], i = 0, n;
      for (; n = names[i]; i++) args[i] = n in vals ? vals[n] : this[n];
      return ctr.apply(null, args);
    }
  };

  adt.record.__classMethods__ = {
    create: function (vals) {
      var args = [];
      var names = this.__names__;
      var i = 0, len = names.length, n;
      for (; n = names[i]; i++) {
        if (!(n in vals)) {
          throw new Error('Missing `' + n + '` in arguments to ' + this.className);
        }
        args[i] = vals[n];
      }
      return this.apply(null, args);
    },

    hasInstance: function (inst) {
      return inst instanceof this;
    },

    unapply: function (inst, fn) {
      if (this.hasInstance(inst)) {
        var names = this.__names__;
        var vals = [], i = 0, n;
        for (; n = names[i]; i++) vals[i] = fn ? fn(inst[n], n) : inst[n];
        return vals;
      }
    },

    unapplyObject: function (inst, fn) {
      if (this.hasInstance(inst)) {
        var names = this.__names__;
        var vals = {}, i = 0, n;
        for (; n = names[i]; i++) vals[n] = fn ? fn(inst[n], n) : inst[n];
        return vals;
      }
    },

    seal: function () {
      delete this.field;
      delete this.seal;
      return this;
    }
  };

  // Enum Class Generation
  // ---------------------

  adt.enumeration = function () {
    var E = adt.data.apply(null, arguments);
    var order = 0;

    // Helper to add the order meta attribute to a type.
    function addOrder (that) {
      if (that.constructor) that = that.constructor;
      that.__order__ = order++;
      return that;
    }

    // Iterate through the created types, applying the order meta attribute.
    for (var i = 0, n; n = E.__names__[i]; i++) addOrder(E[n]);

    // Patch the type function to add an order to any types created later.
    var __type = E.type;
    E.type = function () {
      return addOrder(__type.apply(E, arguments));
    };

    extend(E.prototype, adt.enumeration.__methods__);
    return E;
  };

  adt['enum'] = adt.enumeration;

  // Enum Methods
  // ------------

  function assertADT (a, b) {
    if (b instanceof a.__adtClass__) return true;
    throw new TypeError('Unexpected type');
  }

  function orderOf (that) {
    return that.constructor.__order__;
  }

  adt.enumeration.__methods__ = {
    lt: function (that) {
      return assertADT(this, that) && orderOf(this) < orderOf(that);
    },

    lte: function (that) {
      return assertADT(this, that) && orderOf(this) <= orderOf(that);
    },

    gt: function (that) {
      return assertADT(this, that) && orderOf(this) > orderOf(that);
    },

    gte: function (that) {
      return assertADT(this, that) && orderOf(this) >= orderOf(that);
    },

    eq: function (that) {
      return assertADT(this, that) && orderOf(this) === orderOf(that);
    },

    neq: function (that) {
      return assertADT(this, that) && orderOf(this) !== orderOf(that);
    },
  };

  // Public Helpers
  // --------------

  // Cloning for native JS types just returns a reference.
  adt.nativeClone = function (x) { return x; };

  // Equality for native JS types is just strict comparison.
  adt.nativeEquals = function (a, b) { return a === b; };

  // Shortcut for creating an ADT with only one type.
  adt.newtype = function () {
    var args = toArray(arguments);
    var data = adt.data();
    return data.type.apply(data, args);
  };

  // A contraint function that will accept any value.
  adt.any = function (x) { return x; };

  // A constraint generator that will perform instanceof checks on the value
  // to make sure it is of the correct type.
  adt.only = function () {
    var args = arguments;
    return function (x, field, ctr) {
      if (checkTypes(args, x)) return x;
      var err = 'Unexpected type';
      if (field && ctr) err += ' for `' + field + '` of ' + ctr.className;
      throw new TypeError(err);
    };
  };

  // Utility Functions
  // -----------------

  function toArray (a, start) {
    var dest = [], i = start || 0, len = a.length;
    for (; i < len; i++) dest.push(a[i]);
    return dest;
  }

  function ctrApply (ctr, args) {
    var C = function () {};
    C.prototype = ctr.prototype;
    var inst = new C();
    var ret = ctr.apply(inst, args);
    return inst;
  }

  function inherit (sup, sub) {
    var C = function () {};
    C.prototype = sup.prototype;
    sub.prototype = new C();
    sub.prototype.constructor = sub;
    return sub;
  }

  function partial (func, args) {
    return function () {
      return func.apply(this, args.concat(toArray(arguments)));
    };
  }

  function extend (dest /*, ...sources*/) {
    var args = toArray(arguments, 1);
    var i = 0, len = args.length, k;
    for (; i < len; i++) {
      for (k in args[i]) {
        if (args[i].hasOwnProperty(k)) dest[k] = args[i][k];
      }
    }
    return dest;
  };

  function checkType (type, x) {
    if (type instanceof Function) {
      if (x instanceof type
      || type === Number  && typeof x === 'number'
      || type === String  && typeof x === 'string'
      || type === Boolean && typeof x === 'boolean') return true;
    } else {
      if (type instanceof adt.__Base__ && type.equals(x)
      || type === x) return true;
    }
    return false;
  }

  function checkTypes(types, x) {
    var i = 0, len = types.length;
    for (; i < len; i++) if (checkType(types[i], x)) return true;
    return false;
  }

  function toJSONValue (x) {
    return x && typeof x === 'object' && x.toJSON ? x.toJSON() : x;
  }

  var id = 0;
  function uniqueId (pre) {
    return (pre || '') + id++;
  }

  function noop () {}

})(typeof exports !== 'undefined' ? exports : (this.adt = {}));

},{}],22:[function(require,module,exports){
arguments[4][3][0].apply(exports,arguments)
},{"_process":26,"dup":3}],23:[function(require,module,exports){
/*
 * Generated by PEG.js 0.10.0.
 *
 * http://pegjs.org/
 */

"use strict";

function peg$subclass(child, parent) {
  function ctor() { this.constructor = child; }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
}

function peg$SyntaxError(message, expected, found, location) {
  this.message  = message;
  this.expected = expected;
  this.found    = found;
  this.location = location;
  this.name     = "SyntaxError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, peg$SyntaxError);
  }
}

peg$subclass(peg$SyntaxError, Error);

peg$SyntaxError.buildMessage = function(expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return "\"" + literalEscape(expectation.text) + "\"";
        },

        "class": function(expectation) {
          var escapedParts = "",
              i;

          for (i = 0; i < expectation.parts.length; i++) {
            escapedParts += expectation.parts[i] instanceof Array
              ? classEscape(expectation.parts[i][0]) + "-" + classEscape(expectation.parts[i][1])
              : classEscape(expectation.parts[i]);
          }

          return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
        },

        any: function(expectation) {
          return "any character";
        },

        end: function(expectation) {
          return "end of input";
        },

        other: function(expectation) {
          return expectation.description;
        }
      };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function classEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\]/g, '\\]')
      .replace(/\^/g, '\\^')
      .replace(/-/g,  '\\-')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = new Array(expected.length),
        i, j;

    for (i = 0; i < expected.length; i++) {
      descriptions[i] = describeExpectation(expected[i]);
    }

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }
      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ")
          + ", or "
          + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== void 0 ? options : {};

  var peg$FAILED = {},

      peg$startRuleFunctions = { program: peg$parseprogram },
      peg$startRuleFunction  = peg$parseprogram,

      peg$c0 = function(prog) {
          return postprocess(prog);
      },
      peg$c1 = "=>",
      peg$c2 = peg$literalExpectation("=>", false),
      peg$c3 = function(first, second, third) {
          var obj = { trigger: first };
          if (third !== null) {
              obj.query = second;
              obj.action = third[2];
          } else {
              obj.query = undefined;
              obj.action = second;
          }
          return obj;
      },
      peg$c4 = "notify",
      peg$c5 = peg$literalExpectation("notify", false),
      peg$c6 = "@$notify",
      peg$c7 = peg$literalExpectation("@$notify", false),
      peg$c8 = "(",
      peg$c9 = peg$literalExpectation("(", false),
      peg$c10 = ")",
      peg$c11 = peg$literalExpectation(")", false),
      peg$c12 = function() {
          // return undefined to remove the action from the json
          return undefined;
      },
      peg$c13 = ",",
      peg$c14 = peg$literalExpectation(",", false),
      peg$c15 = function(invocation, conditions) {
          return { name: invocation, args: take(conditions, 2) };
      },
      peg$c16 = "now",
      peg$c17 = peg$literalExpectation("now", false),
      peg$c18 = "$now",
      peg$c19 = peg$literalExpectation("$now", false),
      peg$c20 = function(second, third) {
          if (third !== null)
              return { trigger: undefined, query: second, action: third[2] };
          else
              return { trigger: undefined, query: undefined, action: second };
      },
      peg$c21 = "@",
      peg$c22 = peg$literalExpectation("@", false),
      peg$c23 = ".",
      peg$c24 = peg$literalExpectation(".", false),
      peg$c25 = function(kind, name) {
          return { id: 'tt:' + kind + '.' + name };
      },
      peg$c26 = function(varName, op, value) {
          return { type: value.type, operator: op, value: value.value, name: { id: 'tt:param.' + varName } };
      },
      peg$c27 = function(func, varName, value) {
          return { type: value.type, operator: func, value: value.value, name: { id: 'tt:param.' + varName } };
      },
      peg$c28 = "$contains",
      peg$c29 = peg$literalExpectation("$contains", false),
      peg$c30 = function() { return 'has'; },
      peg$c31 = peg$otherExpectation("comparator"),
      peg$c32 = ">=",
      peg$c33 = peg$literalExpectation(">=", false),
      peg$c34 = "<=",
      peg$c35 = peg$literalExpectation("<=", false),
      peg$c36 = ">",
      peg$c37 = peg$literalExpectation(">", false),
      peg$c38 = "<",
      peg$c39 = peg$literalExpectation("<", false),
      peg$c40 = "=~",
      peg$c41 = peg$literalExpectation("=~", false),
      peg$c42 = function() { return 'contains'; },
      peg$c43 = "=",
      peg$c44 = peg$literalExpectation("=", false),
      peg$c45 = function() { return 'is'; },
      peg$c46 = "!=",
      peg$c47 = peg$literalExpectation("!=", false),
      peg$c48 = function(name) { return { type: 'VarRef', value: { id: 'tt:param.' + name } }; },
      peg$c49 = function(num, unit) { return { type: 'Measure', value: { value: num, unit: unit } }; },
      peg$c50 = function(v) { return { type: 'Number', value: { value: v } }; },
      peg$c51 = "$makeDate",
      peg$c52 = peg$literalExpectation("$makeDate", false),
      peg$c53 = function(year, month, day) {
          return { type: 'Date', value: { year: year, month: month, day: day, hour: 0, minute: 0, second: 0 } };
      },
      peg$c54 = "$makeTime",
      peg$c55 = peg$literalExpectation("$makeTime", false),
      peg$c56 = function(hour, minute) {
          return { type: 'Time', value: { year: -1, month: -1, day: -1, hour: hour, minute: minute, second: 0 } };
      },
      peg$c57 = function(v) { return { type: 'Bool', value: { value: v } }; },
      peg$c58 = "$makeLocation",
      peg$c59 = peg$literalExpectation("$makeLocation", false),
      peg$c60 = function(lat, lon) {
          return { type: 'Location', value: { relativeTag: 'absolute', latitude: lat, longitude: lon } };
      },
      peg$c61 = "$home",
      peg$c62 = peg$literalExpectation("$home", false),
      peg$c63 = function() {
          return { type: 'Location', value: { relativeTag: 'rel_home', latitude: -1, longitude: -1 } };
      },
      peg$c64 = "$work",
      peg$c65 = peg$literalExpectation("$work", false),
      peg$c66 = function() {
          return { type: 'Location', value: { relativeTag: 'rel_work', latitude: -1, longitude: -1 } };
      },
      peg$c67 = "$here",
      peg$c68 = peg$literalExpectation("$here", false),
      peg$c69 = function() {
          return { type: 'Location', value: { relativeTag: 'rel_current_location', latitude: -1, longitude: -1 } };
      },
      peg$c70 = "$makeEmailAddress",
      peg$c71 = peg$literalExpectation("$makeEmailAddress", false),
      peg$c72 = function(v) {
          return { type: 'EmailAddress', value: { value: v } };
      },
      peg$c73 = "^^",
      peg$c74 = peg$literalExpectation("^^", false),
      peg$c75 = "tt:",
      peg$c76 = peg$literalExpectation("tt:", false),
      peg$c77 = "email_address",
      peg$c78 = peg$literalExpectation("email_address", false),
      peg$c79 = "$makePhoneNumber",
      peg$c80 = peg$literalExpectation("$makePhoneNumber", false),
      peg$c81 = function(v) {
          return { type: 'PhoneNumber', value: { value: v } };
      },
      peg$c82 = "phone_number",
      peg$c83 = peg$literalExpectation("phone_number", false),
      peg$c84 = "$makeURL",
      peg$c85 = peg$literalExpectation("$makeURL", false),
      peg$c86 = function(v) {
          return { type: 'URL', value: { value: v } };
      },
      peg$c87 = "url",
      peg$c88 = peg$literalExpectation("url", false),
      peg$c89 = "$makeUsername",
      peg$c90 = peg$literalExpectation("$makeUsername", false),
      peg$c91 = function(v) {
          return { type: 'Username', value: { value: v } };
      },
      peg$c92 = "username",
      peg$c93 = peg$literalExpectation("username", false),
      peg$c94 = "$makeHashtag",
      peg$c95 = peg$literalExpectation("$makeHashtag", false),
      peg$c96 = function(v) {
          return { type: 'Hashtag', value: { value: v } };
      },
      peg$c97 = "hashtag",
      peg$c98 = peg$literalExpectation("hashtag", false),
      peg$c99 = "$enum",
      peg$c100 = peg$literalExpectation("$enum", false),
      peg$c101 = function(v) {
          return { type: 'Enum', value: { value: v } };
      },
      peg$c102 = function(v) {
          return { type: 'String', value: { value: v } };
      },
      peg$c103 = "$event",
      peg$c104 = peg$literalExpectation("$event", false),
      peg$c105 = "title",
      peg$c106 = peg$literalExpectation("title", false),
      peg$c107 = "body",
      peg$c108 = peg$literalExpectation("body", false),
      peg$c109 = function(v) {
          return { type: 'VarRef', value: { id: 'tt:param.' + v } };
      },
      peg$c110 = "$entity(",
      peg$c111 = peg$literalExpectation("$entity(", false),
      peg$c112 = ":",
      peg$c113 = peg$literalExpectation(":", false),
      peg$c114 = function(v, prefix, entity) {
          return { type: 'Entity(' + prefix + ':' + entity + ')', value: { value: v } };
      },
      peg$c115 = function(v, prefix, entity) {
          return { type: 'Entity(' + (prefix || 'tt:') + entity + ')', value: { value: v } };
      },
      peg$c116 = function() { return true; },
      peg$c117 = function() { return false; },
      peg$c118 = "on",
      peg$c119 = peg$literalExpectation("on", false),
      peg$c120 = "true",
      peg$c121 = peg$literalExpectation("true", false),
      peg$c122 = "off",
      peg$c123 = peg$literalExpectation("off", false),
      peg$c124 = "false",
      peg$c125 = peg$literalExpectation("false", false),
      peg$c126 = /^[^\\"]/,
      peg$c127 = peg$classExpectation(["\\", "\""], true, false),
      peg$c128 = "\\\"",
      peg$c129 = peg$literalExpectation("\\\"", false),
      peg$c130 = function() { return '"'; },
      peg$c131 = "\\n",
      peg$c132 = peg$literalExpectation("\\n", false),
      peg$c133 = function() { return '\n'; },
      peg$c134 = "\\'",
      peg$c135 = peg$literalExpectation("\\'", false),
      peg$c136 = function() { return '\''; },
      peg$c137 = "\\\\",
      peg$c138 = peg$literalExpectation("\\\\", false),
      peg$c139 = function() { return '\\'; },
      peg$c140 = /^[^\\']/,
      peg$c141 = peg$classExpectation(["\\", "'"], true, false),
      peg$c142 = peg$otherExpectation("string"),
      peg$c143 = "\"",
      peg$c144 = peg$literalExpectation("\"", false),
      peg$c145 = function(chars) { return chars.join(''); },
      peg$c146 = "'",
      peg$c147 = peg$literalExpectation("'", false),
      peg$c148 = peg$otherExpectation("digit"),
      peg$c149 = /^[0-9]/,
      peg$c150 = peg$classExpectation([["0", "9"]], false, false),
      peg$c151 = peg$otherExpectation("number"),
      peg$c152 = "-",
      peg$c153 = peg$literalExpectation("-", false),
      peg$c154 = "e",
      peg$c155 = peg$literalExpectation("e", false),
      peg$c156 = function(num) { return parseFloat(num); },
      peg$c157 = /^[A-Za-z_]/,
      peg$c158 = peg$classExpectation([["A", "Z"], ["a", "z"], "_"], false, false),
      peg$c159 = /^[A-Za-z0-9_]/,
      peg$c160 = peg$classExpectation([["A", "Z"], ["a", "z"], ["0", "9"], "_"], false, false),
      peg$c161 = /^[A-Z\-a-z0-9_\-]/,
      peg$c162 = peg$classExpectation([["A", "Z"], "-", ["a", "z"], ["0", "9"], "_", "-"], false, false),
      peg$c163 = peg$otherExpectation("ident"),
      peg$c164 = peg$otherExpectation("genident"),
      peg$c165 = peg$otherExpectation("whitespace"),
      peg$c166 = /^[ \r\n\t\x0B]/,
      peg$c167 = peg$classExpectation([" ", "\r", "\n", "\t", "\x0B"], false, false),
      peg$c168 = peg$otherExpectation("comment"),
      peg$c169 = "/*",
      peg$c170 = peg$literalExpectation("/*", false),
      peg$c171 = /^[^*]/,
      peg$c172 = peg$classExpectation(["*"], true, false),
      peg$c173 = "*",
      peg$c174 = peg$literalExpectation("*", false),
      peg$c175 = /^[^\/]/,
      peg$c176 = peg$classExpectation(["/"], true, false),
      peg$c177 = "*/",
      peg$c178 = peg$literalExpectation("*/", false),
      peg$c179 = "//",
      peg$c180 = peg$literalExpectation("//", false),
      peg$c181 = /^[^\n]/,
      peg$c182 = peg$classExpectation(["\n"], true, false),
      peg$c183 = "\n",
      peg$c184 = peg$literalExpectation("\n", false),

      peg$currPos          = 0,
      peg$savedPos         = 0,
      peg$posDetailsCache  = [{ line: 1, column: 1 }],
      peg$maxFailPos       = 0,
      peg$maxFailExpected  = [],
      peg$silentFails      = 0,

      peg$resultsCache = {},

      peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text: text, ignoreCase: ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description: description };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos], p;

    if (details) {
      return details;
    } else {
      p = pos - 1;
      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line:   details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;
      return details;
    }
  }

  function peg$computeLocation(startPos, endPos) {
    var startPosDetails = peg$computePosDetails(startPos),
        endPosDetails   = peg$computePosDetails(endPos);

    return {
      start: {
        offset: startPos,
        line:   startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line:   endPosDetails.line,
        column: endPosDetails.column
      }
    };
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parseprogram() {
    var s0, s1;

    var key    = peg$currPos * 48 + 0,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsecommand();
    if (s1 === peg$FAILED) {
      s1 = peg$parserule();
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c0(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parserule() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    var key    = peg$currPos * 48 + 1,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parserule_part_list();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c1) {
          s3 = peg$c1;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c2); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parserule_part_list();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$currPos;
                if (input.substr(peg$currPos, 2) === peg$c1) {
                  s8 = peg$c1;
                  peg$currPos += 2;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c2); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$parse_();
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parserule_part_list();
                    if (s10 !== peg$FAILED) {
                      s8 = [s8, s9, s10];
                      s7 = s8;
                    } else {
                      peg$currPos = s7;
                      s7 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s7;
                    s7 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s7;
                  s7 = peg$FAILED;
                }
                if (s7 === peg$FAILED) {
                  s7 = null;
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c3(s1, s5, s7);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parserule_part_list() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    var key    = peg$currPos * 48 + 2,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c4) {
      s1 = peg$c4;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c5); }
    }
    if (s1 === peg$FAILED) {
      s1 = peg$currPos;
      if (input.substr(peg$currPos, 8) === peg$c6) {
        s2 = peg$c6;
        peg$currPos += 8;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c7); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s4 = peg$c8;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c9); }
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s6 = peg$c10;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c11); }
              }
              if (s6 !== peg$FAILED) {
                s2 = [s2, s3, s4, s5, s6];
                s1 = s2;
              } else {
                peg$currPos = s1;
                s1 = peg$FAILED;
              }
            } else {
              peg$currPos = s1;
              s1 = peg$FAILED;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c12();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsechannel_spec();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s3 = peg$c8;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c9); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s5 = peg$c10;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c11); }
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = [];
                  s8 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 44) {
                    s9 = peg$c13;
                    peg$currPos++;
                  } else {
                    s9 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c14); }
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parse_();
                    if (s10 !== peg$FAILED) {
                      s11 = peg$parsecondition();
                      if (s11 !== peg$FAILED) {
                        s12 = peg$parse_();
                        if (s12 !== peg$FAILED) {
                          s9 = [s9, s10, s11, s12];
                          s8 = s9;
                        } else {
                          peg$currPos = s8;
                          s8 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s8;
                        s8 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s8;
                      s8 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s8;
                    s8 = peg$FAILED;
                  }
                  while (s8 !== peg$FAILED) {
                    s7.push(s8);
                    s8 = peg$currPos;
                    if (input.charCodeAt(peg$currPos) === 44) {
                      s9 = peg$c13;
                      peg$currPos++;
                    } else {
                      s9 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c14); }
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parse_();
                      if (s10 !== peg$FAILED) {
                        s11 = peg$parsecondition();
                        if (s11 !== peg$FAILED) {
                          s12 = peg$parse_();
                          if (s12 !== peg$FAILED) {
                            s9 = [s9, s10, s11, s12];
                            s8 = s9;
                          } else {
                            peg$currPos = s8;
                            s8 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s8;
                          s8 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s8;
                        s8 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s8;
                      s8 = peg$FAILED;
                    }
                  }
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c15(s1, s7);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecommand() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    var key    = peg$currPos * 48 + 3,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c16) {
      s1 = peg$c16;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c17); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4) === peg$c18) {
        s1 = peg$c18;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c19); }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c1) {
          s3 = peg$c1;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c2); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parserule_part_list();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$currPos;
                if (input.substr(peg$currPos, 2) === peg$c1) {
                  s8 = peg$c1;
                  peg$currPos += 2;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c2); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$parse_();
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parserule_part_list();
                    if (s10 !== peg$FAILED) {
                      s8 = [s8, s9, s10];
                      s7 = s8;
                    } else {
                      peg$currPos = s7;
                      s7 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s7;
                    s7 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s7;
                  s7 = peg$FAILED;
                }
                if (s7 === peg$FAILED) {
                  s7 = null;
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c20(s5, s7);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsechannel_spec() {
    var s0, s1, s2, s3, s4, s5, s6;

    var key    = peg$currPos * 48 + 4,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 64) {
      s1 = peg$c21;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c22); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsegenident();
      if (s2 !== peg$FAILED) {
        s3 = peg$parse_();
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s4 = peg$c23;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c24); }
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              s6 = peg$parseident();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c25(s2, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecondition() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11;

    var key    = peg$currPos * 48 + 5,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseident();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsecomparator();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsevalue();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c26(s1, s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsebool_function();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s3 = peg$c8;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c9); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseident();
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 44) {
                    s7 = peg$c13;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c14); }
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parse_();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parsevalue();
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parse_();
                        if (s10 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 41) {
                            s11 = peg$c10;
                            peg$currPos++;
                          } else {
                            s11 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                          }
                          if (s11 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c27(s1, s5, s9);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsebool_function() {
    var s0, s1;

    var key    = peg$currPos * 48 + 6,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 9) === peg$c28) {
      s1 = peg$c28;
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c29); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c30();
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecomparator() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 48 + 7,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    peg$silentFails++;
    if (input.substr(peg$currPos, 2) === peg$c32) {
      s0 = peg$c32;
      peg$currPos += 2;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c33); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 2) === peg$c34) {
        s0 = peg$c34;
        peg$currPos += 2;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c35); }
      }
      if (s0 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 62) {
          s0 = peg$c36;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c37); }
        }
        if (s0 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 60) {
            s0 = peg$c38;
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c39); }
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c40) {
              s1 = peg$c40;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c41); }
            }
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c42();
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 61) {
                s2 = peg$c43;
                peg$currPos++;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c44); }
              }
              if (s2 !== peg$FAILED) {
                s3 = peg$currPos;
                peg$silentFails++;
                if (input.charCodeAt(peg$currPos) === 62) {
                  s4 = peg$c36;
                  peg$currPos++;
                } else {
                  s4 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c37); }
                }
                peg$silentFails--;
                if (s4 === peg$FAILED) {
                  s3 = void 0;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
                if (s3 !== peg$FAILED) {
                  s2 = [s2, s3];
                  s1 = s2;
                } else {
                  peg$currPos = s1;
                  s1 = peg$FAILED;
                }
              } else {
                peg$currPos = s1;
                s1 = peg$FAILED;
              }
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c45();
              }
              s0 = s1;
              if (s0 === peg$FAILED) {
                if (input.substr(peg$currPos, 2) === peg$c46) {
                  s0 = peg$c46;
                  peg$currPos += 2;
                } else {
                  s0 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c47); }
                }
              }
            }
          }
        }
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c31); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsevalue() {
    var s0;

    var key    = peg$currPos * 48 + 8,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$parsebool_value();
    if (s0 === peg$FAILED) {
      s0 = peg$parsevar_ref_value();
      if (s0 === peg$FAILED) {
        s0 = peg$parseevent_value();
        if (s0 === peg$FAILED) {
          s0 = peg$parsemeasure_value();
          if (s0 === peg$FAILED) {
            s0 = peg$parsenumber_value();
            if (s0 === peg$FAILED) {
              s0 = peg$parsedate_value();
              if (s0 === peg$FAILED) {
                s0 = peg$parsetime_value();
                if (s0 === peg$FAILED) {
                  s0 = peg$parselocation_value();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parseenum_value();
                    if (s0 === peg$FAILED) {
                      s0 = peg$parseemail_value();
                      if (s0 === peg$FAILED) {
                        s0 = peg$parseemail_value_new();
                        if (s0 === peg$FAILED) {
                          s0 = peg$parsephone_value();
                          if (s0 === peg$FAILED) {
                            s0 = peg$parsephone_value_new();
                            if (s0 === peg$FAILED) {
                              s0 = peg$parseusername_value();
                              if (s0 === peg$FAILED) {
                                s0 = peg$parseusername_value_new();
                                if (s0 === peg$FAILED) {
                                  s0 = peg$parsehashtag_value();
                                  if (s0 === peg$FAILED) {
                                    s0 = peg$parsehashtag_value_new();
                                    if (s0 === peg$FAILED) {
                                      s0 = peg$parseurl_value();
                                      if (s0 === peg$FAILED) {
                                        s0 = peg$parseurl_value_new();
                                        if (s0 === peg$FAILED) {
                                          s0 = peg$parseentity_value();
                                          if (s0 === peg$FAILED) {
                                            s0 = peg$parseentity_value();
                                            if (s0 === peg$FAILED) {
                                              s0 = peg$parsestring_value();
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsevar_ref_value() {
    var s0, s1;

    var key    = peg$currPos * 48 + 9,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseident();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c48(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsemeasure_value() {
    var s0, s1, s2;

    var key    = peg$currPos * 48 + 10,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_number();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseident();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c49(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsenumber_value() {
    var s0, s1;

    var key    = peg$currPos * 48 + 11,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_number();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c50(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsedate_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14;

    var key    = peg$currPos * 48 + 12,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 9) === peg$c51) {
      s1 = peg$c51;
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c52); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c9); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseliteral_number();
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 44) {
                s6 = peg$c13;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c14); }
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parse_();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseliteral_number();
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parse_();
                    if (s9 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 44) {
                        s10 = peg$c13;
                        peg$currPos++;
                      } else {
                        s10 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c14); }
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = peg$parse_();
                        if (s11 !== peg$FAILED) {
                          s12 = peg$parseliteral_number();
                          if (s12 !== peg$FAILED) {
                            s13 = peg$parse_();
                            if (s13 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 41) {
                                s14 = peg$c10;
                                peg$currPos++;
                              } else {
                                s14 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                              }
                              if (s14 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c53(s4, s8, s12);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsetime_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    var key    = peg$currPos * 48 + 13,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 9) === peg$c54) {
      s1 = peg$c54;
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c55); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c9); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseliteral_number();
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 44) {
                s6 = peg$c13;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c14); }
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parse_();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseliteral_number();
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parse_();
                    if (s9 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 41) {
                        s10 = peg$c10;
                        peg$currPos++;
                      } else {
                        s10 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                      }
                      if (s10 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c56(s4, s8);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsebool_value() {
    var s0, s1;

    var key    = peg$currPos * 48 + 14,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_bool();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c57(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parselocation_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11;

    var key    = peg$currPos * 48 + 15,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 13) === peg$c58) {
      s1 = peg$c58;
      peg$currPos += 13;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c59); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c9); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseliteral_number();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c13;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c14); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseliteral_number();
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parse_();
                      if (s10 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 41) {
                          s11 = peg$c10;
                          peg$currPos++;
                        } else {
                          s11 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                        }
                        if (s11 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c60(s5, s9);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5) === peg$c61) {
        s1 = peg$c61;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c62); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c63();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 5) === peg$c64) {
          s1 = peg$c64;
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c65); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c66();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 5) === peg$c67) {
            s1 = peg$c67;
            peg$currPos += 5;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c68); }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c69();
          }
          s0 = s1;
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseemail_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    var key    = peg$currPos * 48 + 16,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 17) === peg$c70) {
      s1 = peg$c70;
      peg$currPos += 17;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c71); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c9); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseliteral_string();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s7 = peg$c10;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c72(s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseemail_value_new() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 48 + 17,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_string();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c73) {
          s3 = peg$c73;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c74); }
        }
        if (s3 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c75) {
            s4 = peg$c75;
            peg$currPos += 3;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c76); }
          }
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 13) === peg$c77) {
              s5 = peg$c77;
              peg$currPos += 13;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c78); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c72(s1);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsephone_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    var key    = peg$currPos * 48 + 18,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 16) === peg$c79) {
      s1 = peg$c79;
      peg$currPos += 16;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c80); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c9); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseliteral_string();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s7 = peg$c10;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c81(s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsephone_value_new() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 48 + 19,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_string();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c73) {
          s3 = peg$c73;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c74); }
        }
        if (s3 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c75) {
            s4 = peg$c75;
            peg$currPos += 3;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c76); }
          }
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 12) === peg$c82) {
              s5 = peg$c82;
              peg$currPos += 12;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c83); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c81(s1);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseurl_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    var key    = peg$currPos * 48 + 20,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 8) === peg$c84) {
      s1 = peg$c84;
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c85); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c9); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseliteral_string();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s7 = peg$c10;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c86(s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseurl_value_new() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 48 + 21,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_string();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c73) {
          s3 = peg$c73;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c74); }
        }
        if (s3 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c75) {
            s4 = peg$c75;
            peg$currPos += 3;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c76); }
          }
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 3) === peg$c87) {
              s5 = peg$c87;
              peg$currPos += 3;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c88); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c86(s1);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseusername_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    var key    = peg$currPos * 48 + 22,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 13) === peg$c89) {
      s1 = peg$c89;
      peg$currPos += 13;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c90); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c9); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseliteral_string();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s7 = peg$c10;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c91(s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseusername_value_new() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 48 + 23,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_string();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c73) {
          s3 = peg$c73;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c74); }
        }
        if (s3 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c75) {
            s4 = peg$c75;
            peg$currPos += 3;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c76); }
          }
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 8) === peg$c92) {
              s5 = peg$c92;
              peg$currPos += 8;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c93); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c91(s1);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsehashtag_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    var key    = peg$currPos * 48 + 24,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 12) === peg$c94) {
      s1 = peg$c94;
      peg$currPos += 12;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c95); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c9); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseliteral_string();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s7 = peg$c10;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c96(s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsehashtag_value_new() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 48 + 25,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_string();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c73) {
          s3 = peg$c73;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c74); }
        }
        if (s3 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c75) {
            s4 = peg$c75;
            peg$currPos += 3;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c76); }
          }
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 7) === peg$c97) {
              s5 = peg$c97;
              peg$currPos += 7;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c98); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c96(s1);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseenum_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    var key    = peg$currPos * 48 + 26,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5) === peg$c99) {
      s1 = peg$c99;
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c100); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c9); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseident();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s7 = peg$c10;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c101(s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsestring_value() {
    var s0, s1;

    var key    = peg$currPos * 48 + 27,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_string();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c102(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseevent_value() {
    var s0, s1, s2, s3, s4, s5, s6;

    var key    = peg$currPos * 48 + 28,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c103) {
      s3 = peg$c103;
      peg$currPos += 6;
    } else {
      s3 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c104); }
    }
    if (s3 !== peg$FAILED) {
      s4 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 46) {
        s5 = peg$c23;
        peg$currPos++;
      } else {
        s5 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c24); }
      }
      if (s5 !== peg$FAILED) {
        if (input.substr(peg$currPos, 5) === peg$c105) {
          s6 = peg$c105;
          peg$currPos += 5;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c106); }
        }
        if (s6 === peg$FAILED) {
          if (input.substr(peg$currPos, 4) === peg$c107) {
            s6 = peg$c107;
            peg$currPos += 4;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c108); }
          }
        }
        if (s6 !== peg$FAILED) {
          s5 = [s5, s6];
          s4 = s5;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
      } else {
        peg$currPos = s4;
        s4 = peg$FAILED;
      }
      if (s4 === peg$FAILED) {
        s4 = null;
      }
      if (s4 !== peg$FAILED) {
        s3 = [s3, s4];
        s2 = s3;
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
    } else {
      peg$currPos = s2;
      s2 = peg$FAILED;
    }
    if (s2 !== peg$FAILED) {
      s1 = input.substring(s1, peg$currPos);
    } else {
      s1 = s2;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c109(s1);
    }
    s0 = s1;

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseentity_value() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11;

    var key    = peg$currPos * 48 + 29,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 8) === peg$c110) {
      s1 = peg$c110;
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c111); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseliteral_string();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 44) {
              s5 = peg$c13;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c14); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseident();
                if (s7 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 58) {
                    s8 = peg$c112;
                    peg$currPos++;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c113); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseident();
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parse_();
                      if (s10 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 41) {
                          s11 = peg$c10;
                          peg$currPos++;
                        } else {
                          s11 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                        }
                        if (s11 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c114(s3, s7, s9);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseentity_value_new() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    var key    = peg$currPos * 48 + 30,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parseliteral_string();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c73) {
          s3 = peg$c73;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c74); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$currPos;
            s6 = peg$currPos;
            s7 = peg$parseident();
            if (s7 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 58) {
                s8 = peg$c112;
                peg$currPos++;
              } else {
                s8 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c113); }
              }
              if (s8 !== peg$FAILED) {
                s7 = [s7, s8];
                s6 = s7;
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s5 = input.substring(s5, peg$currPos);
            } else {
              s5 = s6;
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseident();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c115(s1, s5, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseliteral_bool() {
    var s0, s1;

    var key    = peg$currPos * 48 + 31,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsetrue_bool();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c116();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsefalse_bool();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c117();
      }
      s0 = s1;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsetrue_bool() {
    var s0;

    var key    = peg$currPos * 48 + 32,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 2) === peg$c118) {
      s0 = peg$c118;
      peg$currPos += 2;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c119); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 4) === peg$c120) {
        s0 = peg$c120;
        peg$currPos += 4;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c121); }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsefalse_bool() {
    var s0;

    var key    = peg$currPos * 48 + 33,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (input.substr(peg$currPos, 3) === peg$c122) {
      s0 = peg$c122;
      peg$currPos += 3;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c123); }
    }
    if (s0 === peg$FAILED) {
      if (input.substr(peg$currPos, 5) === peg$c124) {
        s0 = peg$c124;
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c125); }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsedqstrchar() {
    var s0, s1;

    var key    = peg$currPos * 48 + 34,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (peg$c126.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c127); }
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c128) {
        s1 = peg$c128;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c129); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c130();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c131) {
          s1 = peg$c131;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c132); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c133();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c134) {
            s1 = peg$c134;
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c135); }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c136();
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c137) {
              s1 = peg$c137;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c138); }
            }
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c139();
            }
            s0 = s1;
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsesqstrchar() {
    var s0, s1;

    var key    = peg$currPos * 48 + 35,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (peg$c140.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c141); }
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c128) {
        s1 = peg$c128;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c129); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c130();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c131) {
          s1 = peg$c131;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c132); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c133();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c134) {
            s1 = peg$c134;
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c135); }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c136();
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c137) {
              s1 = peg$c137;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c138); }
            }
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c139();
            }
            s0 = s1;
          }
        }
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseliteral_string() {
    var s0, s1, s2, s3;

    var key    = peg$currPos * 48 + 36,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 34) {
      s1 = peg$c143;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c144); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsedqstrchar();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parsedqstrchar();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 34) {
          s3 = peg$c143;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c144); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c145(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 39) {
        s1 = peg$c146;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c147); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parsesqstrchar();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parsesqstrchar();
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 39) {
            s3 = peg$c146;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c147); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c145(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c142); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsedigit() {
    var s0, s1;

    var key    = peg$currPos * 48 + 37,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    peg$silentFails++;
    if (peg$c149.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c150); }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c148); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseliteral_number() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    var key    = peg$currPos * 48 + 38,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    peg$silentFails++;
    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 45) {
      s3 = peg$c152;
      peg$currPos++;
    } else {
      s3 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c153); }
    }
    if (s3 === peg$FAILED) {
      s3 = null;
    }
    if (s3 !== peg$FAILED) {
      s4 = [];
      s5 = peg$parsedigit();
      if (s5 !== peg$FAILED) {
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parsedigit();
        }
      } else {
        s4 = peg$FAILED;
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s5 = peg$c23;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c24); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parsedigit();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parsedigit();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 101) {
              s8 = peg$c154;
              peg$currPos++;
            } else {
              s8 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c155); }
            }
            if (s8 !== peg$FAILED) {
              s9 = [];
              s10 = peg$parsedigit();
              if (s10 !== peg$FAILED) {
                while (s10 !== peg$FAILED) {
                  s9.push(s10);
                  s10 = peg$parsedigit();
                }
              } else {
                s9 = peg$FAILED;
              }
              if (s9 !== peg$FAILED) {
                s8 = [s8, s9];
                s7 = s8;
              } else {
                peg$currPos = s7;
                s7 = peg$FAILED;
              }
            } else {
              peg$currPos = s7;
              s7 = peg$FAILED;
            }
            if (s7 === peg$FAILED) {
              s7 = null;
            }
            if (s7 !== peg$FAILED) {
              s3 = [s3, s4, s5, s6, s7];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
    } else {
      peg$currPos = s2;
      s2 = peg$FAILED;
    }
    if (s2 !== peg$FAILED) {
      s1 = input.substring(s1, peg$currPos);
    } else {
      s1 = s2;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c156(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 45) {
        s3 = peg$c152;
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c153); }
      }
      if (s3 === peg$FAILED) {
        s3 = null;
      }
      if (s3 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s4 = peg$c23;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c24); }
        }
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parsedigit();
          if (s6 !== peg$FAILED) {
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parsedigit();
            }
          } else {
            s5 = peg$FAILED;
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 101) {
              s7 = peg$c154;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c155); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parsedigit();
              if (s9 !== peg$FAILED) {
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parsedigit();
                }
              } else {
                s8 = peg$FAILED;
              }
              if (s8 !== peg$FAILED) {
                s7 = [s7, s8];
                s6 = s7;
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s3 = [s3, s4, s5, s6];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        s1 = input.substring(s1, peg$currPos);
      } else {
        s1 = s2;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c156(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 45) {
          s3 = peg$c152;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c153); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parsedigit();
          if (s5 !== peg$FAILED) {
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parsedigit();
            }
          } else {
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 101) {
              s6 = peg$c154;
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c155); }
            }
            if (s6 !== peg$FAILED) {
              s7 = [];
              s8 = peg$parsedigit();
              if (s8 !== peg$FAILED) {
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parsedigit();
                }
              } else {
                s7 = peg$FAILED;
              }
              if (s7 !== peg$FAILED) {
                s6 = [s6, s7];
                s5 = s6;
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            if (s5 !== peg$FAILED) {
              s3 = [s3, s4, s5];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s1 = input.substring(s1, peg$currPos);
        } else {
          s1 = s2;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c156(s1);
        }
        s0 = s1;
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c151); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseidentstart() {
    var s0;

    var key    = peg$currPos * 48 + 39,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (peg$c157.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c158); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseidentchar() {
    var s0;

    var key    = peg$currPos * 48 + 40,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (peg$c159.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c160); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsegenidentchar() {
    var s0;

    var key    = peg$currPos * 48 + 41,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    if (peg$c161.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c162); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parseident() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 48 + 42,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    peg$silentFails++;
    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$parseidentstart();
    if (s2 !== peg$FAILED) {
      s3 = [];
      s4 = peg$parseidentchar();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseidentchar();
      }
      if (s3 !== peg$FAILED) {
        s2 = [s2, s3];
        s1 = s2;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      s0 = input.substring(s0, peg$currPos);
    } else {
      s0 = s1;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c163); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsegenident() {
    var s0, s1, s2, s3, s4;

    var key    = peg$currPos * 48 + 43,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    peg$silentFails++;
    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$parseidentstart();
    if (s2 !== peg$FAILED) {
      s3 = [];
      s4 = peg$parsegenidentchar();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parsegenidentchar();
      }
      if (s3 !== peg$FAILED) {
        s2 = [s2, s3];
        s1 = s2;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      s0 = input.substring(s0, peg$currPos);
    } else {
      s0 = s1;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c164); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parse_() {
    var s0, s1;

    var key    = peg$currPos * 48 + 44,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = [];
    s1 = peg$parsewhitespace();
    if (s1 === peg$FAILED) {
      s1 = peg$parsecomment();
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      s1 = peg$parsewhitespace();
      if (s1 === peg$FAILED) {
        s1 = peg$parsecomment();
      }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parse__() {
    var s0, s1, s2;

    var key    = peg$currPos * 48 + 45,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    s0 = peg$currPos;
    s1 = peg$parsewhitespace();
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s1 = [s1, s2];
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsewhitespace() {
    var s0, s1;

    var key    = peg$currPos * 48 + 46,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    peg$silentFails++;
    if (peg$c166.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c167); }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c165); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }

  function peg$parsecomment() {
    var s0, s1, s2, s3, s4, s5;

    var key    = peg$currPos * 48 + 47,
        cached = peg$resultsCache[key];

    if (cached) {
      peg$currPos = cached.nextPos;

      return cached.result;
    }

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c169) {
      s1 = peg$c169;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c170); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c171.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c172); }
      }
      if (s3 === peg$FAILED) {
        s3 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 42) {
          s4 = peg$c173;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c174); }
        }
        if (s4 !== peg$FAILED) {
          if (peg$c175.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c176); }
          }
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c171.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c172); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 42) {
            s4 = peg$c173;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c174); }
          }
          if (s4 !== peg$FAILED) {
            if (peg$c175.test(input.charAt(peg$currPos))) {
              s5 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c176); }
            }
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c177) {
          s3 = peg$c177;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c178); }
        }
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c179) {
        s1 = peg$c179;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c180); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c181.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c182); }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c181.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c182); }
          }
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 10) {
            s3 = peg$c183;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c184); }
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c168); }
    }

    peg$resultsCache[key] = { nextPos: peg$currPos, result: s0 };

    return s0;
  }


      function take(array, idx) {
          return array.map(function(v) { return v[idx]; });
      }

      function postprocess(prog) {
          var parts = 0;
          if (prog.trigger)
              parts++;
          if (prog.query)
              parts++;
          if (prog.action)
              parts++;
          if (parts > 1)
              return { rule: prog };
          else if (prog.trigger)
              return { trigger: prog.trigger };
          else if (prog.query)
              return { query: prog.query };
          else if (prog.action)
              return { action: prog.action };
          else
              throw new TypeError();
      }


  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
}

module.exports = {
  SyntaxError: peg$SyntaxError,
  parse:       peg$parse
};

},{}],24:[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

var Q = require('q');
var TTGrammar = require('./reduced_grammar');

function stringEscape(str) {
    return '"' + str.replace(/([\"\\])/g, '\\$1').replace(/\n/g, '\\n') + '"';
}
// the following is to fix bugginess in GtkSourceView's syntax highlighting
//[]/

function codegenLocation(value) {
    switch (value.relativeTag) {
    case 'absolute':
        return '$makeLocation(' + value.latitude + ', ' + value.longitude + ')';
    case 'rel_home':
        return '$home';
    case 'rel_work':
        return '$work';
    case 'rel_current_location':
        return '$here';
    default:
        throw new TypeError('Invalid relativeTag on location');
    }
}

function codegenValue(type, value) {
    if (type.startsWith('Entity('))
        return stringEscape(value.value) + '^^' + type.substring('Entity('.length, type.length-1);

    switch (type) {
    case 'Number':
        return String(value.value);
    case 'Measure':
        return String(value.value) + value.unit;
    case 'String':
        return stringEscape(value.value);
    case 'Date':
        return '$makeDate(' + value.year + ', ' + value.month + ', ' + value.day + ')';
    case 'Time':
        return '$makeTime(' + value.hour + ', ' + value.minute + ')';
    case 'Bool':
        return String(value.value);
    case 'EmailAddress':
        return stringEscape(value.value) + '^^tt:email_address';
    case 'PhoneNumber':
        return stringEscape(value.value) + '^^tt:phone_number';
    case 'Username':
        return stringEscape(value.value) + '^^tt:username';
    case 'URL':
        return stringEscape(value.value) + '^^tt:url';
    case 'Hashtag':
        return stringEscape(value.value) + '^^tt:hashtag';
    case 'Location':
        return codegenLocation(value);
    case 'Enum':
        return '$enum(' + value.value + ')';
    case 'VarRef':
        return value.id.substr('tt:param.'.length);
    default:
        throw new TypeError('Invalid value type ' + type);
    }
}

function codegenArg(arg) {
    if (arg.operator === 'has')
        return '$contains(' + arg.name.id.substr('tt:param.'.length) + ', ' + codegenValue(arg.type, arg.value) + ')';
    var op;
    if (!arg.operator)
        throw new Error('Invalid empty operator');
    if (arg.operator === 'is')
        op = '=';
    else if (arg.operator === 'contains')
        op = '=~';
    else
        op = arg.operator;

    return arg.name.id.substr('tt:param.'.length) + ' ' + op + ' ' + codegenValue(arg.type, arg.value);
}

function codegenInvocation(invocation) {
    var name = invocation.name.id;

    return '@' + name.substr('tt:'.length) + '()'
        + (invocation.args.map(function(a) { return ', ' + codegenArg(a); })).join('');
}

function codegenRule(rule) {
    var buf = '';
    if (!rule.trigger)
        buf = 'now => ';
    else
        buf = codegenInvocation(rule.trigger) + ' => ';
    if (rule.query)
        buf += codegenInvocation(rule.query) + ' => ';
    if (rule.action)
        buf += codegenInvocation(rule.action);
    else
        buf += 'notify';
    return buf;
}

function toThingTalk(sempre) {
    if (sempre.rule)
        return codegenRule(sempre.rule);
    if (sempre.trigger)
        return codegenInvocation(sempre.trigger) + ' => notify';
    if (sempre.query)
        return 'now => ' + codegenInvocation(sempre.query) + ' => notify';
    if (sempre.action)
        return 'now => ' + codegenInvocation(sempre.action);
    throw new TypeError('Not rule, trigger, query or action');
}

function verifyOne(schemas, invocation, invocationType, scope) {
    var match = /^tt:([a-z0-9A-Z_\-]+)\.([a-z0-9A-Z_]+)$/.exec(invocation.name.id);

    return schemas.getMeta(match[1], invocationType, match[2]).then(function(schema) {
        var argnames = {};
        schema.args.forEach(function(name, i) {
            argnames[name] = schema.schema[i];
        });

        invocation.args.forEach(function(arg) {
            var argname = arg.name.id.substr('tt:param.'.length);
            if (!(argname in argnames))
                throw new TypeError('Invalid argument name ' + argname);
            var type = argnames[argname];
            var valuetype = type;

            if (invocationType === 'actions' && arg.operator !== 'is')
                throw new TypeError('Invalid operator ' + arg.operator + ' in argument to action');

            switch (arg.operator) {
            case 'is':
                break;
            case 'contains':
                if (!type.isString)
                    throw new TypeError('Left hand side of =~ must be string');
                break;
            case 'has':
                if (!type.isArray)
                    throw new TypeError('First argument of $contains must be array');
                valuetype = type.elem;
                break;
            case '>':
            case '<':
                if (!type.isNumber && !type.isMeasure)
                    throw new TypeError('Left hand side of ' + arg.operator + ' must be numeric');
                break;
            default:
                throw new TypeError('Unknown operator ' + arg.operator);
            }
            if (arg.type === 'VarRef') {
                var ref = arg.value.id.substr('tt:param.'.length);
                if ((ref === '$event' || ref === '$event.title' || ref === '$event.body') &&
                    valuetype.isString)
                    return;
                if (!(ref in scope))
                    throw new TypeError(ref + ' is not in scope');
                // accept entities in place of strings
                if (valuetype.isString && scope[ref].isEntity)
                    return;
                if (!valuetype.equals(scope[ref]))
                    throw new TypeError(ref + ' and ' + argname + ' are not type-compatible');
            } else {
                var valuehave = arg.type;
                if (valuehave === valuetype.toString())
                    return;
                if (valuehave === 'Bool' && valuetype.isBoolean)
                    return;
                if (valuehave === 'Measure' && valuetype.isMeasure)
                    return;
                if (valuehave === 'Enum' && valuetype.isEnum)
                    return;
                if (valuehave === 'Hashtag' && valuetype.isEntity && valuetype.type === 'tt:hashtag')
                    return;
                if (valuehave === 'Username' && valuetype.isEntity && valuetype.type === 'tt:username')
                    return;
                if (valuehave === 'PhoneNumber' && valuetype.isEntity && valuetype.type === 'tt:phone_number')
                    return;
                if (valuehave === 'EmailAddress' && valuetype.isEntity && valuetype.type === 'tt:email_address')
                    return;
                if (valuehave === 'Picture' && valuetype.isEntity && valuetype.type === 'tt:picture')
                    return;
                if (valuehave === 'URL' && valuetype.isEntity && valuetype.type === 'tt:url')
                    return;
                if (valuehave === 'String' && valuetype.isEntity)
                    return;
                throw new TypeError('Invalid value type ' + valuehave + ', expected ' + valuetype);
            }
        });

        // copy new variables in scope scope
        for (var name in argnames)
            scope[name] = argnames[name];

        return scope;
    });
}

function verify(schemas, prog) {
    if (prog.rule) {
        return Q.try(function() {
            if (prog.rule.trigger)
                return verifyOne(schemas, prog.rule.trigger, 'triggers', {});
            else
                return {};
        }).then(function(scope) {
            if (prog.rule.query)
                return verifyOne(schemas, prog.rule.query, 'queries', scope);
            else
                return scope;
        }).then(function(scope) {
            if (prog.rule.action)
                return verifyOne(schemas, prog.rule.action, 'actions', scope);
            else
                return scope;
        });
    } else if (prog.trigger) {
        return verifyOne(schemas, prog.trigger, 'triggers', {});
    } else if (prog.query) {
        return verifyOne(schemas, prog.query, 'queries', {});
    } else if (prog.action) {
        return verifyOne(schemas, prog.action, 'actions', {});
    } else {
        return Q({});
    }
}

module.exports = {
    toSEMPRE: TTGrammar.parse,
    toThingTalk: toThingTalk,
    verify: verify
}

},{"./reduced_grammar":23,"q":3}],25:[function(require,module,exports){
(function (global){
'use strict';

// compare and isBuffer taken from https://github.com/feross/buffer/blob/680e9e5e488f22aac27599a57dc844a6315928dd/index.js
// original notice:

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
function compare(a, b) {
  if (a === b) {
    return 0;
  }

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break;
    }
  }

  if (x < y) {
    return -1;
  }
  if (y < x) {
    return 1;
  }
  return 0;
}
function isBuffer(b) {
  if (global.Buffer && typeof global.Buffer.isBuffer === 'function') {
    return global.Buffer.isBuffer(b);
  }
  return !!(b != null && b._isBuffer);
}

// based on node assert, original notice:

// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util/');
var hasOwn = Object.prototype.hasOwnProperty;
var pSlice = Array.prototype.slice;
var functionsHaveNames = (function () {
  return function foo() {}.name === 'foo';
}());
function pToString (obj) {
  return Object.prototype.toString.call(obj);
}
function isView(arrbuf) {
  if (isBuffer(arrbuf)) {
    return false;
  }
  if (typeof global.ArrayBuffer !== 'function') {
    return false;
  }
  if (typeof ArrayBuffer.isView === 'function') {
    return ArrayBuffer.isView(arrbuf);
  }
  if (!arrbuf) {
    return false;
  }
  if (arrbuf instanceof DataView) {
    return true;
  }
  if (arrbuf.buffer && arrbuf.buffer instanceof ArrayBuffer) {
    return true;
  }
  return false;
}
// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

var regex = /\s*function\s+([^\(\s]*)\s*/;
// based on https://github.com/ljharb/function.prototype.name/blob/adeeeec8bfcc6068b187d7d9fb3d5bb1d3a30899/implementation.js
function getName(func) {
  if (!util.isFunction(func)) {
    return;
  }
  if (functionsHaveNames) {
    return func.name;
  }
  var str = func.toString();
  var match = str.match(regex);
  return match && match[1];
}
assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  } else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = getName(stackStartFunction);
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function truncate(s, n) {
  if (typeof s === 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}
function inspect(something) {
  if (functionsHaveNames || !util.isFunction(something)) {
    return util.inspect(something);
  }
  var rawname = getName(something);
  var name = rawname ? ': ' + rawname : '';
  return '[Function' +  name + ']';
}
function getMessage(self) {
  return truncate(inspect(self.actual), 128) + ' ' +
         self.operator + ' ' +
         truncate(inspect(self.expected), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

assert.deepStrictEqual = function deepStrictEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'deepStrictEqual', assert.deepStrictEqual);
  }
};

function _deepEqual(actual, expected, strict, memos) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;
  } else if (isBuffer(actual) && isBuffer(expected)) {
    return compare(actual, expected) === 0;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if ((actual === null || typeof actual !== 'object') &&
             (expected === null || typeof expected !== 'object')) {
    return strict ? actual === expected : actual == expected;

  // If both values are instances of typed arrays, wrap their underlying
  // ArrayBuffers in a Buffer each to increase performance
  // This optimization requires the arrays to have the same type as checked by
  // Object.prototype.toString (aka pToString). Never perform binary
  // comparisons for Float*Arrays, though, since e.g. +0 === -0 but their
  // bit patterns are not identical.
  } else if (isView(actual) && isView(expected) &&
             pToString(actual) === pToString(expected) &&
             !(actual instanceof Float32Array ||
               actual instanceof Float64Array)) {
    return compare(new Uint8Array(actual.buffer),
                   new Uint8Array(expected.buffer)) === 0;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else if (isBuffer(actual) !== isBuffer(expected)) {
    return false;
  } else {
    memos = memos || {actual: [], expected: []};

    var actualIndex = memos.actual.indexOf(actual);
    if (actualIndex !== -1) {
      if (actualIndex === memos.expected.indexOf(expected)) {
        return true;
      }
    }

    memos.actual.push(actual);
    memos.expected.push(expected);

    return objEquiv(actual, expected, strict, memos);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b, strict, actualVisitedObjects) {
  if (a === null || a === undefined || b === null || b === undefined)
    return false;
  // if one is a primitive, the other must be same
  if (util.isPrimitive(a) || util.isPrimitive(b))
    return a === b;
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
    return false;
  var aIsArgs = isArguments(a);
  var bIsArgs = isArguments(b);
  if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
    return false;
  if (aIsArgs) {
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b, strict);
  }
  var ka = objectKeys(a);
  var kb = objectKeys(b);
  var key, i;
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length !== kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] !== kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key], strict, actualVisitedObjects))
      return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

assert.notDeepStrictEqual = notDeepStrictEqual;
function notDeepStrictEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'notDeepStrictEqual', notDeepStrictEqual);
  }
}


// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  }

  try {
    if (actual instanceof expected) {
      return true;
    }
  } catch (e) {
    // Ignore.  The instanceof check doesn't work for arrow functions.
  }

  if (Error.isPrototypeOf(expected)) {
    return false;
  }

  return expected.call({}, actual) === true;
}

function _tryBlock(block) {
  var error;
  try {
    block();
  } catch (e) {
    error = e;
  }
  return error;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof block !== 'function') {
    throw new TypeError('"block" argument must be a function');
  }

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  actual = _tryBlock(block);

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  var userProvidedMessage = typeof message === 'string';
  var isUnwantedException = !shouldThrow && util.isError(actual);
  var isUnexpectedException = !shouldThrow && actual && !expected;

  if ((isUnwantedException &&
      userProvidedMessage &&
      expectedException(actual, expected)) ||
      isUnexpectedException) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws(true, block, error, message);
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws(false, block, error, message);
};

assert.ifError = function(err) { if (err) throw err; };

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"util/":29}],26:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],27:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],28:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],29:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":28,"_process":26,"inherits":27}],"thingtalk-trainer":[function(require,module,exports){
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// This file is meant to be used as an entry point to a browserify
// bundle
// we can use commonjs but no nodejs deps

const Q = require('q');

const SempreSyntax = require('../util/sempre_syntax');
const SchemaRetriever = require('thingtalk').SchemaRetriever;

const SempreClient = require('./sempreclient');
const ThingpediaClient = require('./thingpediaclient');

module.exports = class ThingTalkTrainer {
    constructor(sempreUrl) {
        this.sempre = new SempreClient(sempreUrl, 'en-US');
        this.thingpedia = new ThingpediaClient();
        this._schemaRetriever = new SchemaRetriever(this.thingpedia);

        this._raw = null;
    }

    toThingTalk(json) {
        return SempreSyntax.toThingTalk(json);
    }

    learnJSON(json) {
        var raw = this._raw;
        return this.sempre.onlineLearn(raw, json);
    }

    learnThingTalk(text) {
        var sempre = SempreSyntax.toSEMPRE(text);
        var raw = this._raw;
        return SempreSyntax.verify(this._schemaRetriever, sempre).then(() => {
            var json = JSON.stringify(sempre);
            return this.sempre.onlineLearn(raw, json);
        });
    }

    handle(text) {
        return this.sempre.sendUtterance(text, null, []).then((parsed) => {
            this._raw = text;
            return parsed;
        });
    }
}

},{"../util/sempre_syntax":24,"./sempreclient":1,"./thingpediaclient":2,"q":3,"thingtalk":4}]},{},[]);
