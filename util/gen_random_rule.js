// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const ThingTalk = require('thingtalk');

const db = require('../util/db');
const schema = require('../model/schema');
const exampleModel = require('../model/example');

// A copy of ThingTalk SchemaRetriever
// that uses schema.getDeveloperMetas instead of ThingPediaClient
// (and also ignore builtins)
class SchemaRetriever {
    constructor(dbClient, language) {
        this._metaRequest = null;
        this._pendingMetaRequests = [];
        this._metaCache = {};

        this._dbClient = dbClient;
        this._language = language;
    }

    _ensureMetaRequest() {
        if (this._metaRequest !== null)
            return;

        this._metaRequest = Q.delay(0).then(() => {
            var pending = this._pendingMetaRequests;
            this._pendingMetaRequests = [];
            this._metaRequest = null;
            console.log('Batched schema-meta request for ' + pending);
            return schema.getDeveloperMetas(this._dbClient, pending, this._language);
        }).then((rows) => {
            rows.forEach((row) => {
                this._metaCache[row.kind] = {
                    triggers: row.triggers,
                    actions: row.actions,
                    queries: row.queries
                };
            });
            return this._metaCache;
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

    getMeta(kind, where, name) {
        return this.getFullMeta(kind).then((fullSchema) => {
            if (!(name in fullSchema[where]))
                throw new Error("Schema " + kind + " has no " + where + " " + name);
            return fullSchema[where][name];
        });
    }
}

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

const COMPOSITION_WEIGHTS = {
    'trigger+null+action': 1.5,
    'null+query+action': 1,
    'trigger+null+query': 0.5,
    'trigger+action+query': 0.1
};

const DOMAIN_WEIGHTS = {
    media: 100,
    home: 54,
    'social-network': 70,
    communication: 57,
    'data-management': 38,
    health: 26,
    service: 59
};

const DOMAINS = {
    home: ['heatpad', 'car', 'security-camera', 'speaker', 'light-bulb', 'smoke-alarm', 'thermostat'],
    'social-network': ['tumblr-blog'],
    health: ['scale', 'activity-tracker', 'fitness-tracker', 'heartrate-monitor', 'sleep-tracker'],
    communication: [],
    'data-management': [],
    media: [],
    service: []
};

const INVERTED_DOMAINS = {};

for (let domain in DOMAINS) {
    for (let kind of DOMAINS[domain])
        INVERTED_DOMAINS[kind] = domain;
}

function getSchemaDomain(schema) {
    if (schema.domain)
        return schema.domain;

    if (INVERTED_DOMAINS[schema.kind])
        return INVERTED_DOMAINS[schema.kind];

    return 'service';
}

function chooseSchema(allSchemas, policy) {
    if (policy === 'uniform')
        return uniform(allSchemas);

    if (policy === 'weighted-domain') {
        var domains = {
            home: [],
            'social-network': [],
            health: [],
            'communication': [],
            'data-management': [],
            media: [],
            service: []
        };

        for (var schema of allSchemas)
            domains[getSchemaDomain(schema)].push(schema);

        return uniform(domains[sample(DOMAIN_WEIGHTS)]);
    }

    throw new Error('Unknown sampling policy ' + policy);
}

function getAllSchemas(dbClient) {
    return db.selectAll(dbClient,
          " (select ds.*, dck.kind as domain from device_schema ds, device_class dc, device_class_kind dck"
        + "  where ds.kind = dc.global_name and dc.id = dck.device_id and ds.approved_version is not null and dck.kind"
        + "  in ('media', 'home', 'social-network', 'communication', 'data-management', 'health', 'service'))"
        + " union"
        + " (select ds.*, null from device_schema ds where ds.kind_type = 'other' and ds.approved_version is not null)");
}

function chooseInvocation(schemaRetriever, schemas, samplingPolicy, channelType) {
    var schema = chooseSchema(schemas, samplingPolicy);

    return schemaRetriever.getFullMeta(schema.kind).then((fullMeta) => {
        var channels = fullMeta[channelType];
        var choices = Object.keys(channels);
        if (choices.length === 0) // no channels of this type for this schema, try again
            return chooseInvocation(schemaRetriever, schemas, samplingPolicy, channelType);

        var channelName = uniform(choices);
        channels[channelName].kind = schema.kind;
        channels[channelName].name = channelName;
        return channels[channelName];
    });
}

const NUMBER_OP_WEIGHTS = {
    'is': 0.5,
    '>': 1,
    '<': 1,
    '': 2,
};

const ARRAY_OP_WEIGHTS = {
    'has': 1,
    '': 2,
};

const STRING_OP_WEIGHTS = {
    'is': 1,
    'contains': 1,
    '': 2,
};

const OTHER_OP_WEIGHTS = {
    'is': 1,
    '': 2,
}

const STRING_ARGUMENTS = ['abc def', 'ghi jkl', 'mno pqr', 'stu vwz', 'foo', 'bar'];
const NUMBER_ARGUMENTS = [42, 7, 14];
const MEASURE_ARGUMENTS = {
    C: [{ value: 73, unit: 'F' }, { value: 22, unit: 'C' }],
    m: [{ value: 1000, unit: 'm' }, { value: 42, unit: 'cm' }],
    kg: [{ value: 82, unit: 'kg' }, { value: 155, unit: 'lb' }],
    kcal: [{ value: 500, unit: 'kcal' }],
    mps: [{ value: 5, unit: 'kmph' }, { value: 25, unit: 'mph' }],
    ms: [{ value: 1, unit: 'h' }, { value: 14, unit: 'day' }],
    byte: [{ value: 5, unit: 'kB' }, { value: 20, unit: 'MB' }]
};
const BOOLEAN_ARGUMENTS = [true, false];
const LOCATION_ARGUMENTS = [{ relativeTag: 'rel_current_location', latitude: -1, longitude: -1 },
                            { relativeTag: 'rel_home', latitude: -1, longitude: -1 },
                            { relativeTag: 'rel_work', latitude: -1, longitude: -1 },
                            { relativeTag: 'absolute', latitude: 37.442156, longitude: -122.1634471 },
                            { relativeTag: 'absolute', latitude:    34.0543942, longitude: -118.2439408 }];
const DATE_ARGUMENTS = [{ year: 1992, month: 8, day: 24 }, { year: 2016, month: 5, day: 4 }];
const EMAIL_ARGUMENTS = ['nobody@stanford.edu'];
const PHONE_ARGUMENTS = ['+15555555555'];

function chooseRandomValue(type) {
    if (type.isArray && type.elem.isString)
        return ['String', { value: uniform(STRING_ARGUMENTS) }];
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
    if (type.isEnum)
        return ['Enum', { value: uniform(type.entries) }];

    console.log('Invalid type ' + type);
    return [null, null];
}

function getOpDistribution(type) {
    if (type.isNumber || type.isMeasure)
        return NUMBER_OP_WEIGHTS;
    if (type.isArray)
        return ARRAY_OP_WEIGHTS;
    if (type.isString)
        return STRING_OP_WEIGHTS;
    return OTHER_OP_WEIGHTS;
}

function applyFilters(invocation, isAction) {
    if (invocation === undefined)
        return undefined;

    var args = invocation.args;
    var ret = {
        name: { id: 'tt:' + invocation.kind + '.' + invocation.name },
        args: []
    };

    for (var i = 0; i < args.length; i++) {
        var type = ThingTalk.Type.fromString(invocation.schema[i]);
        var argrequired = invocation.required[i];

        if (type.isPicture)
            continue;

        var [sempreType, value] = chooseRandomValue(type);
        if (!sempreType)
            continue;

        if (argrequired) {
            var fill = coin(0.6);
            if (fill)
                ret.args.push({ name: { id: 'tt:param.' + args[i] }, operator: 'is', type: sempreType, value: value });
        } else if (isAction) {
            var fill = coin(0.3);
            if (fill)
                ret.args.push({ name: { id: 'tt:param.' + args[i] }, operator: 'is', type: sempreType, value: value });
        } else {
            var operator = sample(getOpDistribution(type));
            if (operator)
                ret.args.push({ name: { id: 'tt:param.' + args[i] }, operator: operator, type: sempreType, value: value });
        }
    }

    return ret;
}

function applyComposition(from, fromMeta, to, toMeta, isAction) {
    var usedFromArgs = new Set();
    for (var arg of from.args) {
        if (arg.operator === 'is')
            usedFromArgs.add(arg.name.id);
    }
    var usedToArgs = new Set();
    for (var arg of to.args) {
        usedToArgs.add(arg.name.id);
    }

    var fromArgs = fromMeta.args.filter((arg, i) => {
        if (fromMeta.required[i])
            return false;

        if (usedFromArgs.has('tt:param.' + arg))
            return false;

        return true;
    });

    var fromArgMap = {};
    var fromArgRequired = {};
    fromMeta.args.forEach(function(name, i) {
        fromArgMap[name] = ThingTalk.Type.fromString(fromMeta.schema[i]);
        fromArgRequired[name] = fromMeta.required[i];
    });
    var toArgMap = {};
    var toArgRequired = {};
    toMeta.args.forEach(function(name, i) {
        toArgMap[name] = ThingTalk.Type.fromString(toMeta.schema[i]);
        toArgRequired[name] = toMeta.required[i];
    });

    var toArgs = toMeta.args.filter((arg, i) => !usedToArgs.has('tt:param.' + arg));

    for (var toArg of toArgs) {
        var toType = toArgMap[toArg];
        var pairs = [];

        if (coin(0.3))
            continue;

        for (var fromArg of fromArgs) {
            var fromType = fromArgMap[fromArg];

            if (fromArgRequired[fromArg])
                continue;

            if (toArgRequired[toArg] || isAction) {
                if (String(fromType) === String(toType))
                    pairs.push([fromArg, 'is']);
            } else {
                if (toType.isArray && String(fromType) == String(toType.elem)) {
                    pairs.push([fromArg, 'has']);
                } else if (String(fromType) === String(toType)) {
                    var operator = sample(getOpDistribution(fromType));
                    pairs.push([fromArg, operator]);
                }
            }
        }
        if (pairs.length === 0)
            continue;
        var chosen = uniform(pairs);
        to.args.push({ name: { id: 'tt:param.' + toArg }, operator: chosen, type: 'VarRef', value: { id: 'tt:param.' + fromArg } });
    }
}

function genOneRandomRule(schemaRetriever, schemas, samplingPolicy) {
    var form = sample(COMPOSITION_WEIGHTS).split('+');

    var trigger = form[0] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'triggers');
    var query = form[1] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'queries');
    var action = form[2] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'actions');

    return Q.all([trigger, query, action]).then(([triggerMeta, queryMeta, actionMeta]) => {
        trigger = applyFilters(triggerMeta, false);
        query = applyFilters(queryMeta, false);
        action = applyFilters(actionMeta, true);

        if (query && action)
            applyComposition(query, queryMeta, action, actionMeta, true);
        if (trigger && query)
            applyComposition(trigger, triggerMeta, query, queryMeta, false);
        if (trigger && action && !query)
            applyComposition(trigger, triggerMeta, action, actionMeta, true);

        return { rule: { trigger: trigger, query: query, action: action }};
    });
}

function genRandomRules(samplingPolicy, language, N) {
    return db.withClient((dbClient) => {
        var schemaRetriever = new SchemaRetriever(dbClient, language);

        return getAllSchemas(dbClient).then((schemas) => {
            var promises = [];
            for (var i = 0; i < N; i++)
                promises.push(genOneRandomRule(schemaRetriever, schemas, samplingPolicy));

            return Q.all(promises);
        });
    });
}

module.exports = genRandomRules;
