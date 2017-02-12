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

const db = require('../util/db');
const AccuracyTester = require('./deps/test_nl_accuracy_common');

function main() {
    var language = process.argv[2] || 'en';
    var types = (process.argv[3] || 'test').split(',');

    var queue = AccuracyTester();

    db.connect().then(([dbClient, done]) => {
        console.log('connected');
        var query = dbClient.query("select * from example_utterances where type in (?) and language = ?", [types, language]);
        query.on('result', (ex) => { queue.enqueue(ex); });
        query.on('end', () => { queue.done(); });
        query.on('error', (e) => { console.error(e) });
    }).done();
}

main();
