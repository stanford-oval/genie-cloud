// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const stream = require('stream');

const ThingTalk = require('thingtalk');

const db = require('./db');

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
    'trigger+action+query': 0
//    'trigger+null+null': 1,
//    'null+query+null': 1,
//    'null+null+action': 1,
};

// Rakesh : removed 'github'
const FIXED_KINDS = ['washington_post', 'sportradar', 'giphy',
    'yahoofinance', 'nasa', 'twitter', 'facebook', 'instagram',
    'linkedin', 'youtube', 'lg_webos_tv', 'light-bulb',
    'thermostat', 'security-camera', 'heatpad', 'phone',
    'omlet', 'slack', 'gmail', 'thecatapi'];

const FIXED_KINDS2 = ['sportradar', 'slack', 'phone'];
//FIXED_KINDS.push('tumblr');
//FIXED_KINDS.push('tumblr-blog');

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
        return uniform(allSchemas).kind;

    if (policy === 'uniform-fixed-kinds')
        return uniform(FIXED_KINDS);
    if (policy === 'test')
        return uniform(FIXED_KINDS2);

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

        return uniform(domains[sample(DOMAIN_WEIGHTS)]).kind;
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
    var kind = chooseSchema(schemas, samplingPolicy);

    return schemaRetriever.getFullMeta(kind).then((fullMeta) => {
        var channels = fullMeta[channelType];
        var choices = Object.keys(channels);
        if (choices.length === 0) // no channels of this type for this schema, try again
            return chooseInvocation(schemaRetriever, schemas, samplingPolicy, channelType);

        var channelName = uniform(choices);
        channels[channelName].kind = kind;
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

const ENTITIES = {
    'sportradar:eu_soccer_team': [["Juventus", "juv"], ["Barcellona", "bar"], ["Bayern Munchen", "fcb"]],
    'sportradar:mlb_team': [["SF Giants", 'sf'], ["Chicago Cubs", 'chc']],
    'sportradar:nba_team': [["Golden State Warriors", 'gsw'], ["LA Lakers", 'lal']],
    'sportradar:ncaafb_team': [["Stanford Cardinals", 'stan'], ["California Bears", 'cal']],
    'sportradar:ncaambb_team': [["Stanford Cardinals", 'stan'], ["California Bears", 'cal']],
    'sportradar:nfl_team': [["Seattle Seahawks", 'sea'], ["SF 49ers", 'sf']],
    'sportradar:us_soccer_team': [["San Jose Earthquakes", 'sje'], ["Toronto FC", 'tor']],
    'tt:stock_id': [["Google", 'goog'], ["Apple", 'aapl'], ['Microsoft', 'msft'], ['Red Hat', 'rht']]
};

function chooseEntity(entityType) {
    if (entityType === 'tt:email_address')
        return ['EmailAddress', { value: uniform(EMAIL_ARGUMENTS) }];
    if (entityType === 'tt:phone_number')
        return ['PhoneNumber', { value: uniform(PHONE_ARGUMENTS) }];
    if (entityType === 'tt:username')
        return ['Username', { value: uniform(USERNAME_ARGUMENTS) }];
    if (entityType === 'tt:hashtag')
        return ['Hashtag', { value: uniform(HASHTAG_ARGUMENTS) }];
    if (entityType === 'tt:url')
        return ['URL', { value: uniform(URL_ARGUMENTS) }];
    if (entityType === 'tt:picture')
        return [null, null];

    var choices = ENTITIES[entityType];
    if (!choices) {
        console.log('Unrecognized entity type ' + entityType);
        return [null, null];
    }

    var choice = uniform(choices);
    var v = { value: choice[1], display: choice[0] };
    return ['Entity(' + entityType + ')', v];
}

function chooseRandomValue(argName, type) {
    if (type.isArray)
        return chooseRandomValue(argName, type.elem);
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
    if (type.isEntity)
        return chooseEntity(type.type);
    if (type.isPicture || type.isTime || type.isAny)
        return [null, null];

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
        if (args[i].startsWith('__'))
            continue;
        if (args[i].endsWith('_id') && args[i] !== 'stock_id')
            continue;
        if (args[i] === 'count')
            continue;

        var tmp = chooseRandomValue(args[i], type);
        var sempreType = tmp[0];
        var value = tmp[1];
        if (!sempreType)
            continue;

        if (argrequired) {
            var fill = type.isEnum || coin(0.4);
            if (fill)
                ret.args.push({ name: { id: 'tt:param.' + args[i] }, operator: 'is', type: sempreType, value: value });
        } else if (isAction) {
            var fill = type.isEnum || coin(0.4);
            if (fill)
                ret.args.push({ name: { id: 'tt:param.' + args[i] }, operator: 'is', type: sempreType, value: value });
        } else {
            var fill = coin(0.2);
            if (!fill)
                continue;
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
        var distribution = {};

        if (toArg.startsWith('__'))
            continue;
        distribution[''] = 0.5;

        for (var fromArg of fromArgs) {
            var fromType = fromArgMap[fromArg];

            if (fromArgRequired[fromArg])
                continue;
            if (fromArg.startsWith('__'))
                continue;
            if (fromArg.endsWith('_id'))
                continue;

            if (toArgRequired[toArg] || isAction) {
                if (String(fromType) === String(toType))
                    distribution[fromArg + '+is'] = 1;
            } else {
                if (toType.isArray && String(fromType) == String(toType.elem)) {
                    distribution[fromArg + '+has'] = 1;
                } else if (String(fromType) === String(toType)) {
                    var opdist = getOpDistribution(fromType);
                    var sum = 0;
                    for (var op in opdist)
                        sum += opdist[key];
                    for (var op in opdist)
                        distribution[fromArg + '+' + op] = opdist[key]/sum;
                }
            }
        }
        if (toType.isString) {
            distribution['$event+is'] = 0.1;
            //distribution['$event.title+is'] = 0.05;
        }
        var chosen = sample(distribution);
        if (!chosen)
            continue;
        chosen = chosen.split('+');
        to.args.push({ name: { id: 'tt:param.' + toArg }, operator: chosen[1], type: 'VarRef', value: { id: 'tt:param.' + chosen[0] } });
        //return;
    }
}

function queryIsUseful(query, queryMeta, action) {
    var argRequired = {};
    queryMeta.args.forEach(function(name, i) {
        argRequired[name] = queryMeta.required[i];
    });

    var anyFilter = false;
    query.args.forEach((arg) => {
        if (arg.operator !== 'is')
            anyFilter = true;
        if (!argRequired[arg.name.id.substr('tt:param.')])
            anyFilter = true;
    });
    if (anyFilter)
        return true;

    var anyComposition = false;
    action.args.forEach((arg) => {
        if (arg.type === 'VarRef')
            anyComposition = true;
    });
    if (anyComposition)
        return true;

    return false;
}

function connected(invocation) {
    if (!invocation)
        return false;
    return invocation.args.some((a) => a.type === 'VarRef');
}

function checkPicture(to, toMeta) {
    var hasPicture = false;

    for (var arg of toMeta.args) {
        if (arg === 'picture_url')
            hasPicture = true;
    }
    if (!hasPicture)
        return true;

    var setPicture = false;
    for (var arg of to.args) {
        if (arg.name.id === 'tt:param.picture_url') {
            setPicture = true;
        }
    }
    if (setPicture)
        return true;

    if (coin(0.1))
        return true;
    return false;
}

function genOneRandomRule(schemaRetriever, schemas, samplingPolicy) {
    var form = sample(COMPOSITION_WEIGHTS).split('+');

    var trigger = form[0] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'triggers');
    var query = form[1] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'queries');
    var action = form[2] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'actions');

    return Q.all([trigger, query, action]).spread((triggerMeta, queryMeta, actionMeta) => {
        trigger = applyFilters(triggerMeta, false);
        query = applyFilters(queryMeta, false);
        action = applyFilters(actionMeta, true);

        if (query && action)
            applyComposition(query, queryMeta, action, actionMeta, true);
        if (trigger && query)
            applyComposition(trigger, triggerMeta, query, queryMeta, false);
        if (trigger && action && !query)
            applyComposition(trigger, triggerMeta, action, actionMeta, true);

        //if (trigger && trigger.args.length === 0)
        //    return genOneRandomRule(schemaRetriever, schemas, samplingPolicy);
        //if (action && action.args.length === 0)
        //    return genOneRandomRule(schemaRetriever, schemas, samplingPolicy);
        //if (query && query.args.length === 0)
        //    return genOneRandomRule(schemaRetriever, schemas, samplingPolicy);

        if (query && action && !queryIsUseful(query, queryMeta, action)) // try again if not useful
            return genOneRandomRule(schemaRetriever, schemas, samplingPolicy);

        if (trigger && action && !checkPicture(action, actionMeta))
            return genOneRandomRule(schemaRetriever, schemas, samplingPolicy);
        if (query && action && !checkPicture(action, actionMeta))
            return genOneRandomRule(schemaRetriever, schemas, samplingPolicy);

        //if (!connected(query) && !connected(action))
        //    return genOneRandomRule(schemaRetriever, schemas, samplingPolicy);

        return { rule: { trigger: trigger, query: query, action: action }};
        //if (trigger)
        //    return { trigger: trigger };
        //if (action)
        //    return { action: action };
        //if (query)
        //    return { query: query };
    });
}

function genRandomRules(dbClient, schemaRetriever, samplingPolicy, language, N) {
    return getAllSchemas(dbClient).then((schemas) => {
        var i = 0;
        return new stream.Readable({
            objectMode: true,

            read: function() {
                if (i === N) {
                    this.push(null);
                    return;
                }
                i++;
                genOneRandomRule(schemaRetriever, schemas, samplingPolicy)
                    .done((rule) => this.push(rule), (e) => this.emit('error', e));
            }
        });
    });
}

module.exports = genRandomRules;
