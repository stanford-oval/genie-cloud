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
const csv = require('csv');
const crypto = require('crypto');
const ThingTalk = require('thingtalk');

const db = require('../util/db');
const genRandomRules = require('../util/gen_random_rule');
const reconstruct = require('./deps/reconstruct');
const SchemaRetriever = require('./deps/schema_retriever');
const SempreSyntax = require('../util/sempre_syntax');
const model = require('../model/schema');

const dlg = { _(x) { return x; } };

function sample(distribution) {
    var keys = Object.keys(distribution);
    var sums = new Array(keys.length);
    var rolling = 0;
    for (var i = 0; i < keys.length; i++) {
        sums[i] = rolling + distribution[keys[i]];
        rolling = sums[i];
    }

    var total = sums[keys.length-1];
    var choice = Math.random() * total;

    for (var i = 0; i < keys.length; i++) {
        if (choice <= sums[i])
            return keys[i];
    }
    return keys[keys.length-1];
}

function uniform(array) {
    return array[Math.floor(Math.random()*array.length)];
}

function coin(bias) {
    return Math.random() < bias;
}

const FIXED_KINDS = ['washington_post', 'sportradar', 'giphy',
    'yahoofinance', 'nasa', 'twitter', 'facebook', 'instagram',
    'linkedin', 'youtube', 'lg_webos_tv', 'light-bulb',
    'thermostat', 'security-camera', 'heatpad', 'phone',
    'omlet', 'slack', 'gmail', 'thecatapi'];

function makeId() {
    return crypto.randomBytes(8).toString('hex');
}

const STRING_ARGUMENTS = ['work', "i'm happy", "bob", "danger",
    "you would never believe what happened", "merry christmas", "love you"];
const USERNAME_ARGUMENTS = ['justinbieber', 'testeralice'];
const HASHTAG_ARGUMENTS = ['funny', 'cat', 'lol'];
const URL_ARGUMENTS = ['http://www.google.com', 'http://example.com/file.jpg'];
const NUMBER_ARGUMENTS = [42, 7, 14, 11];
const MEASURE_ARGUMENTS = {
    C: [{ value: 73, unit: 'F' }, { value: 22, unit: 'C' }],
    m: [{ value: 1000, unit: 'm' }, { value: 42, unit: 'cm' }],
    kg: [{ value: 82, unit: 'kg' }, { value: 155, unit: 'lb' }],
    kcal: [{ value: 500, unit: 'kcal' }],
    mps: [{ value: 5, unit: 'kmph' }, { value: 25, unit: 'mph' }],
    ms: [{ value: 1, unit: 'h' }, { value: 14, unit: 'day' }],
    byte: [{ value: 5, unit: 'KB' }, { value: 20, unit: 'MB' }]
};
const BOOLEAN_ARGUMENTS = [true, false];
const LOCATION_ARGUMENTS = [{ relativeTag: 'rel_current_location', latitude: -1, longitude: -1 },
                            { relativeTag: 'rel_home', latitude: -1, longitude: -1 },
                            { relativeTag: 'rel_work', latitude: -1, longitude: -1 }];
                            //{ relativeTag: 'absolute', latitude: 37.442156, longitude: -122.1634471 },
                            //{ relativeTag: 'absolute', latitude:    34.0543942, longitude: -118.2439408 }];
const DATE_ARGUMENTS = [{ year: 1992, month: 8, day: 24, hour: -1, minute: -1, second: -1 },
    { year: 2016, month: 5, day: 4, hour: -1, minute: -1, second: -1 }];
const EMAIL_ARGUMENTS = ['bob@stanford.edu'];
const PHONE_ARGUMENTS = ['+16501234567'];

function chooseRandomValue(type) {
    if (type.isArray)
        return chooseRandomValue(type.elem);
    if (type.isMeasure)
        return ['Measure', uniform(MEASURE_ARGUMENTS[type.unit])];
    if (type.isNumber)
        return ['Number', { value: uniform(NUMBER_ARGUMENTS) }];
    if (type.isString)
        return ['String', { value: uniform(STRING_ARGUMENTS) }];
    if (type.isDate)
        return ['Date', uniform(DATE_ARGUMENTS)];
    if (type.isBoolean)
        return ['Bool', { value: uniform(BOOLEAN_ARGUMENTS) }];
    if (type.isLocation)
        return ['Location', uniform(LOCATION_ARGUMENTS)];
    if (type.isEmailAddress)
        return ['EmailAddress', { value: uniform(EMAIL_ARGUMENTS) }];
    if (type.isPhoneNumber)
        return ['PhoneNumber', { value: uniform(PHONE_ARGUMENTS) }];
    if (type.isUsername)
        return ['Username', { value: uniform(USERNAME_ARGUMENTS) }];
    if (type.isHashtag)
        return ['Hashtag', { value: uniform(HASHTAG_ARGUMENTS) }];
    if (type.isURL)
        return ['URL', { value: uniform(URL_ARGUMENTS) }];
    if (type.isEnum)
        return ['Enum', { value: uniform(type.entries) }];

    //console.log('Invalid type ' + type);
    return [null, null];
}

function postprocess(str) {
    str = str.replace(/your/g, 'my').replace(/ you /g, ' I ');

    //if (coin(0.1))
    //    str = str.replace(/ instagram /i, ' ig ');
    //if (coin(0.1))
    //    str = str.replace(/ facebook /i, ' fb ');

    return str;
}

var n = 0;

function processOneInvocation(output, schemaRetriever, channelType, kind, channelName, meta) {
    console.log(n++ + ' ' + kind +'.' + channelName);
    var invocation = {
        name: { id: 'tt:' + kind + '.' + channelName },
        args: []
    };
    var program = {};
    program[channelType] = invocation;

    meta.schema.forEach((typestr, i) => {
        var type = ThingTalk.Type.fromString(typestr);
        var argname = meta.args[i];
        var argcanonical = meta.argcanonicals[i];
        var argrequired = channelType === 'action' || meta.required[i];

        if (!argrequired)
            return;
        if (!type.isEnum && !coin(0.2))
            return;

        var [sempreType, value] = chooseRandomValue(type);
        invocation.args.push({ name: { id: 'tt:param.' + argname },
            operator: 'is', type: sempreType, value: value });
    });

    return reconstruct(dlg, schemaRetriever, program).then((reconstructed) => {
        output.write([makeId(), SempreSyntax.toThingTalk(program), postprocess(reconstructed)]);
    });
}

function main() {
    var output = csv.stringify();
    var file = fs.createWriteStream(process.argv[2]);
    output.pipe(file);
    var language = process.argv[3] || 'en';

    var promises = [];
    db.withClient((dbClient) => {
        var schemaRetriever = new SchemaRetriever(dbClient, language);
        return model.getMetasByKinds(dbClient, FIXED_KINDS, null, language).then(function(schemas) {
            for (var s of schemas) {
                for (var t in s.triggers)
                    promises.push(processOneInvocation(output, schemaRetriever, 'trigger', s.kind, t, s.triggers[t]));
                for (var q in s.queries)
                    promises.push(processOneInvocation(output, schemaRetriever, 'query', s.kind, q, s.queries[q]));
                for (var a in s.actions)
                    promises.push(processOneInvocation(output, schemaRetriever, 'action',  s.kind, a, s.actions[a]));
            }
        }).then(() => Q.all(promises));
    })
    .then(() => output.end()).done();

    file.on('finish', () => process.exit());
}

main();
