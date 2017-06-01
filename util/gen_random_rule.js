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
const Ast = ThingTalk.Ast;
const Type = ThingTalk.Type;
// FIXME
const ThingTalkUtils = require('thingtalk/lib/utils');

const db = require('./db');
const genValueList = require('./gen_random_value');

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
    if (policy.startsWith('only-'))
        return policy.substr('only-'.length);

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

function chooseChannel(schemaRetriever, kind, form) {
    return schemaRetriever.getFullMeta(kind).then((fullMeta) => {
        var options = [];
        if (form[0] !== 'null' && Object.keys(fullMeta['triggers']).length !== 0) options.push('trigger');
        if (form[1] !== 'null' && Object.keys(fullMeta['queries']).length !== 0) options.push('query');
        if (form[2] !== 'null' && Object.keys(fullMeta['actions']).length !== 0) options.push('action');
        if (options.length === 0)
            return 'null';
        else
            return uniform(options);
    });
}

function chooseInvocation(schemaRetriever, schemas, samplingPolicy, channelType) {
    var kind = chooseSchema(schemas, samplingPolicy);
    return schemaRetriever.getFullMeta(kind).then((fullMeta) => {
        var channels = fullMeta[channelType];
        var choices = Object.keys(channels);
        if (choices.length === 0) // no channels of this type for this schema, try again
            return chooseInvocation(schemaRetriever, schemas, samplingPolicy, channelType);

        var channelName = uniform(choices);
        channels[channelName].schema = channels[channelName].schema.map((t) => Type.fromString(t));
        var result = ThingTalkUtils.splitArgsForSchema(channels[channelName], channelType, true);
        result.kind = kind;
        result.name = channelName;
        return result;
    });
}

function chooseRule(schemaRetriever, schemas, samplingPolicy) {
    var form = sample(COMPOSITION_WEIGHTS).split('+');
    var trigger, query, action;
    if (!samplingPolicy.startsWith('only-')) {
        trigger = form[0] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'triggers');
        query = form[1] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'queries');
        action = form[2] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'actions');
        return Q.all([trigger, query, action]);
    } else {
        var kind = samplingPolicy.substr('only-'.length);
        trigger = form[0] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, 'uniform', 'triggers');
        query = form[1] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, 'uniform', 'queries');
        action = form[2] === 'null' ? undefined : chooseInvocation(schemaRetriever, schemas, 'uniform', 'actions');
        return chooseChannel(schemaRetriever, kind, form).then((channel) => {
            if (channel === 'trigger')
                trigger = chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'triggers');
            else if (channel === 'query')
                query = chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'queries');
            else if (channel === 'action')
                action = chooseInvocation(schemaRetriever, schemas, samplingPolicy, 'actions');
            else {
                return chooseRule(schemaRetriever, schemas, samplingPolicy);
            }
            return Q.all([trigger, query, action]);
        });
    }
}

const NUMBER_OP_WEIGHTS = {
    '=': 0.5,
    '>': 1,
    '<': 1,
    '': 2
};

const ARRAY_OP_WEIGHTS = {
    'contains': 1,
    '': 2
};

const STRING_OP_WEIGHTS = {
    '=': 1,
    '=~': 1,
    '': 2
};

const OTHER_OP_WEIGHTS = {
    '=': 1,
    '': 2
};

// params should never be assigned unless it's required
const PARAMS_BLACK_LIST = new Set([
    'company_name', 'weather', 'currency_code', 'orbiting_body',
    'home_name', 'away_name', 'home_alias', 'away_alias',
    'watched_is_home', 'scheduled_time', 'game_status',
    'home_points', 'away_points', // should be replaced by watched_points, other_points eventually
    'day',
    'bearing', 'updateTime', //gps
    'deep', 'light', 'rem', 'awakeTime', 'asleepTime', // sleep tracker
    'yield', 'div', 'pay_date', 'ex_div_date', // yahoo finance
    'cloudiness', 'fog',
    'formatted_name', 'headline', // linkedin
    'video_id',
    'image_id',
    '__reserved', // twitter
    'uber_type',
    'count',
    'timestamp', //slack
    'last_modified', 'full_path', 'total', // dropbox
    'estimated_diameter_min', 'estimated_diameter_max',
    'translated_text',
    'sunset', 'sunrise',
    'name' //nasa, meme
]);

// params should use operator is
const PARAMS_OP_IS = new Set([
    'filter', 'source_language', 'target_language', 'detected_language',
    'from_name', 'uber_type',
]);

// params should use operator contain
const PARAMS_OP_CONTAIN = new Set([
    'snippet'
]);

// params should use operator greater
const PARAMS_OP_GREATER = new Set([
    'file_size'
]);

// rhs params should not be assigned by a value from lhs
const PARAMS_BLACKLIST_RHS = new Set([
    'file_name', 'new_name', 'old_name', 'folder_name', 'repo_name',
    'home_name', 'away_name', 'purpose'
]);

// lhs params should not be assigned to a parameter in the rhs
const PARAMS_BLACKLIST_LHS = new Set([
    'orbiting_body', 'camera_used'
]);

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
        return null;

    var args = invocation.args;
    var inParams = [];
    var filters = [];
    var outParams = [];

    for (var i = 0; i < args.length; i++) {
        var argname = args[i];
        var type = invocation.inReq[argname] || invocation.inOpt[argname] || invocation.out[argname];
        if (!type)
            continue;
        var argrequired = !!invocation.inReq[argname];

        if (type.isEntity) {
            if (type.type === 'tt:picture')
                continue;
            if (type.type === 'tt:url' && !argrequired)
                continue;
        }
        if (argname.endsWith('_id') && argname !== 'stock_id')
            continue;
        if (!argrequired && PARAMS_BLACK_LIST.has(argname))
            continue;
        if (argname.startsWith('tournament'))
            continue;

        var valueList = genValueList(argname, type);
        if (valueList.length === 0)
            continue;

        var isInput = !!(invocation.inReq[argname] || invocation.inOpt[argname]);

        if (isInput) {
            if (type.isEnum) {
                inParams.push(Ast.InputParam(argname, uniform(valueList)));
            } else if (isAction) {
                if (coin(0.6)) inParams.push(Ast.InputParam(argname, uniform(valueList)));
                else inParams.push(Ast.InputParam(argname, Ast.Value.Undefined(true)));
            } else if (argrequired) {
                if (coin(0.9)) inParams.push(Ast.InputParam(argname, uniform(valueList)));
                else inParams.push(Ast.InputParam(argname, Ast.Value.Undefined(true)));
            } else {
                if (coin(0.6)) inParams.push(Ast.InputParam(argname, uniform(valueList)));
            }
        } else {
            let operator;
            if (PARAMS_OP_IS.has(argname))
                operator = '=';
            else if (PARAMS_OP_CONTAIN.has(argname))
                operator = '=~';
            else if (PARAMS_OP_GREATER.has(argname))
                operator = '>';
            else
                operator = sample(getOpDistribution(type));
            if (operator)
                filters.push(Ast.Filter(argname, operator, uniform(valueList)));
        }
    }

    for (var name in invocation.out)
        outParams.push(Ast.OutputParam('v_' + name, name));

    var ret= Ast.RulePart(Ast.Selector.Device(invocation.kind, null, null), invocation.name, inParams, filters, outParams);
    ret.schema = invocation;
    return ret;
}

function applyComposition(from, to, isAction) {
    var usedFromArgs = new Set();
    for (var arg of from.filters) {
        if (arg.operator === '=')
            usedFromArgs.add(arg.name);
    }
    for (var arg of from.in_params)
        usedFromArgs.add(arg.name);
    var usedToArgs = new Set();
    for (var arg of to.in_params) {
        usedToArgs.add(arg.name);
    }

    var fromArgs = from.schema.args.filter((arg) => from.schema.out[arg] && !usedFromArgs.has(arg));
    var toArgs = to.schema.args.filter((arg) => ((to.schema.inReq[arg] || to.schema.inOpt[arg]) && !usedToArgs.has(arg)));

    for (var toArg of toArgs) {
        var toType = to.schema.inReq[toArg] || to.schema.inOpt[toArg];
        var distribution = {};

        // don't pass numbers
        if (toType.isNumber)
            continue;
        if (PARAMS_BLACKLIST_RHS.has(toArg))
            continue;

        distribution[''] = 0.5;

        for (var fromArg of fromArgs) {
            var fromType = from.schema.out[fromArg];

            if (fromArg.endsWith('_id'))
                continue;
            if (PARAMS_BLACKLIST_LHS.has(fromArg))
                continue;

            if (to.schema.inReq[toArg] || isAction) {
                if (Type.isAssignable(toType, fromType))
                    distribution[fromArg] = 1;
            } else {
                if (Type.isAssignable(toType, fromType))
                    distribution[fromArg] = 0.5;
            }
        }
        // only pass $event when for 'message' and 'status'
        if (toType.isString && (toArg === 'message' || toArg === 'status')) {
            distribution['$event'] = 0.1;
        }
        var chosen = sample(distribution);
        if (!chosen)
            continue;
        if (chosen === '$event')
            to.in_params.push(Ast.InputParam(toArg, Ast.Value.Event(null)));
        else
            to.in_params.push(Ast.InputParam(toArg, Ast.Value.VarRef(chosen)));
    }
}

function genOneRandomRule(schemaRetriever, schemas, samplingPolicy) {
    return chooseRule(schemaRetriever, schemas, samplingPolicy).then(([triggerMeta, queryMeta, actionMeta]) => {
        var trigger = applyFilters(triggerMeta, false);
        var query = applyFilters(queryMeta, false);
        var action = applyFilters(actionMeta, true);

        if (query && action)
            applyComposition(query, action, true);
        if (trigger && query)
            applyComposition(trigger, query, false);
        if (trigger && action && !query)
            applyComposition(trigger, action, true);

        return Ast.Program('AlmondGenerated', [], [Ast.Rule(trigger, query ? [query] : [], [action || Ast.RulePart(Ast.Selector.Builtin, 'notify', [],[], [])], false)]);
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
