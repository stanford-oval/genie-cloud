// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');

const ThingTalk = require('thingtalk');
const Type = ThingTalk.Type;
const Ast = ThingTalk.Ast;

// devices that shouldn't appear in sentences
const BlackList = [
    'holidays',
    'icalendar',
    'imgflip',
    'builtin',
    'sportradar',
    'thecatapi',
    'weatherapi',
    'ytranslate',
];

const Intent = require('almond').Intent;

function clean(name) {
    return name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
}

function coin(bias) {
    return Math.random() < bias;
}

function describeArg(dlg, arg, type, deviceLhs) {
    if (arg.display)
        return arg.display;
    if (arg.isVarRef) {
        if (arg.name.startsWith('$contact('))
            return arg.name.substring('$contact('.length, arg.name.length-1);
        switch (arg.name) {
        case '$context.location.current_location':
            return dlg._("here");
        case '$context.location.home':
            return dlg._("at home");
        case '$context.location.work':
            return dlg._("at work");
        case '$event':
            if (coin(0.5))
                return dlg._("the result");
            else
                return dlg._("it");
        case '$event.title':
            if (coin(0.5))
                return dlg._("the notification");
            else
                return dlg._("the result title");
        default:
            if (coin(0.1))
                return "its " + clean(arg.name) + " value";
            else if (coin(0.3))
                return "the " + clean(arg.name) + ((deviceLhs !== undefined || BlackList.indexOf(deviceLhs) === -1) ? (" from " + clean(deviceLhs)) : "");
            else if (coin(0.5))
                return "the " + clean(arg.name);
            else
                return "its " + clean(arg.name);
        //return (type.isURL || type.isPicture ? "it" : "the " + arg.name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase());
        }
    }

    if (arg.isString)
        return '"' + arg.value + '"';
    if (arg.isEntity) {
        if (arg.type === 'tt:username')
            return '@' + arg.value;
        if (arg.type === 'tt:hashtag')
            return '#' + arg.value;
        if (arg.type === 'tt:contact' && arg.value === dlg.manager.messaging.type + '-account:' + dlg.manager.messaging.account)
            return dlg._("me");
        return arg.value;
    }
    if (arg.isEnum)
        return clean(arg.value);
    if (arg.isNumber)
        return arg.value;
    if (arg.isMeasure)
        return arg.value + ' ' + arg.unit;
    if (arg.isBoolean) {
        if (coin(0.5))
            return arg.value ? dlg._("yes") : dlg._("no");
        else
            return arg.value ? dlg._("true") : dlg._("false");
    }
    if (arg.isDate)
        return arg.value.toDateString();
    if (arg.isTime)
        return arg.hour + ':' + (arg.minute < 10 ? '0' : '') + arg.minute;

    console.log('Unhandled display arg ' + arg);
    return String(arg);
}

function placeholder(type) {
    if (type.isNumber || type.isMeasure || type.isBoolean)
        return "some value";
    if (type.isUsername || type.isPhoneNumber || type.isEmailAddress)
        return "someone";
    if (type.isEnum)
        return "some way";
    if (type.isLocation)
        return "some place";
    if (type.isDate)
        return "some point in time";
    if (type.isTime)
        return "some time of day";
    return "something";
}

function simplifyType(type) {
    var str = type.toString();
    if (str.indexOf('(') >= 0)
        return str.substr(0, str.indexOf('('));
    else
        return str;
}

function describe(dlg, kind, channel, schema, args, comparisons, channelType, deviceLhs, argMapLhs) {
    var isQuery = channelType === 'query';
    var isAction = channelType === 'action';
    var confirm = schema.confirmation || (dlg._("%s on %s").format(channel, kind));

    var substitutedArgs = new Set;
    if (confirm.indexOf('$') >= 0) {
        schema.schema.forEach(function(type, i) {
            type = ThingTalk.Type.fromString(type);
            if (confirm.indexOf('$' + schema.args[i]) >= 0)
                substitutedArgs.add(schema.args[i]);
            if (args[i] !== undefined) {
                confirm = confirm.replace('$' + schema.args[i], describeArg(dlg, args[i], type, deviceLhs));
        }
            else
                confirm = confirm.replace('$' + schema.args[i], placeholder(type));
        });
    }

    var any = false;
    schema.schema.forEach(function(type, i) {
        if (substitutedArgs.has(schema.args[i]))
            return;
        if (args[i] !== undefined) {
            if (args[i].isVarRef && !args[i].name.startsWith('$') && argMapLhs[simplifyType(type)] === 1) {
                if (coin(0.9))
                    return;
            }
            type = ThingTalk.Type.fromString(type);
            if (isAction && coin(0.2))
                confirm += dlg._(" with %s %s").format(schema.argcanonicals[i] || schema.args[i], describeArg(dlg, args[i], type, deviceLhs));
            else if (isQuery && !any)
                confirm += dlg._(" if %s is %s").format(schema.argcanonicals[i] || schema.args[i], describeArg(dlg, args[i], type, deviceLhs));
            else
                confirm += dlg._(" and %s is %s").format(schema.argcanonicals[i] || schema.args[i], describeArg(dlg, args[i], type, deviceLhs));
            any = true;
        }
    });
    comparisons.forEach(function(comp) {
        var argcanonical = undefined;
        var argtype = undefined;
        for (var i = 0; i < schema.args.length; i++) {
            if (schema.args[i] === comp.name) {
                argcanonical = schema.argcanonicals[i];
                argtype = ThingTalk.Type.fromString(schema.schema[i]);
                break;
            }
        }
        if (!argcanonical)
            argcanonical = comp.name;
        if (!argtype)
            argtype = Type.String;

        switch (comp.operator) {
        case 'has':
            if (isQuery && !any)
                confirm += dlg._(" if %s has %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
            else
                confirm += dlg._(" and %s has %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
            break;
        case 'contains':
            if (isQuery && !any)
                confirm += dlg._(" if %s contains %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
            else
                confirm += dlg._(" and %s contains %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
            break;
        case 'is':
            if (isQuery && !any)
                confirm += dlg._(" if %s is %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
            else
                confirm += dlg._(" and %s is %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
            break;
        case '<':
            var op;
            if (coin(0.75))
                op = "less than";
            else
                op = "below";
            if (argtype.isMeasure && argtype.unit === 'C' && coin(0.2))
                op = "colder than";
            if (argtype.isMeasure && argtype.unit === 'byte' && coin(0.2))
                op = "smaller than";
            if (isQuery && !any)
                confirm += dlg._(" if %s is %s %s").format(argcanonical, op, describeArg(dlg, comp.value, argtype, deviceLhs));
            else
                confirm += dlg._(" and %s is %s %s").format(argcanonical, op, describeArg(dlg, comp.value, argtype, deviceLhs));
            break;
        case '>':
            var op;
            if (coin(0.5))
                op = "greater than";
            else if (coin(0.5))
                op = "more than";
            else
                op = "above";
            if (argtype.isMeasure && argtype.unit === 'C' && coin(0.2))
                op = "hotter than";
            if (argtype.isMeasure && argtype.unit === 'byte' && coin(0.2))
                op = "bigger than";
            if (isQuery && !any)
                confirm += dlg._(" if %s is %s than %s").format(argcanonical, op, describeArg(dlg, comp.value, argtype, deviceLhs));
            else
                confirm += dlg._(" and %s is %s %s").format(argcanonical, op, describeArg(dlg, comp.value, argtype, deviceLhs));
            break;
        }
        any = true;
    });

    return confirm;
}

module.exports = function reconstructCanonical(dlg, schemaRetriever, json) {
    var intent = Intent.parse(json);

    if (!intent.isRule && !intent.isPrimitive)
        throw new Error('Invalid intent ' + intent);

    var triggerMeta = intent.trigger !== null ? schemaRetriever.getMeta(intent.trigger.kind, 'triggers', intent.trigger.channel) : null;
    var queryMeta = intent.query !== null ? schemaRetriever.getMeta(intent.query.kind, 'queries', intent.query.channel) : null;
    var actionMeta = intent.action !== null ? schemaRetriever.getMeta(intent.action.kind, 'actions', intent.action.channel) : null;

    return Q.all([triggerMeta, queryMeta, actionMeta]).then(function([trigger, query, action]) {
        var scope = {};
        var triggerDesc, queryDesc, actionDesc;
        var triggerTypeMap = {}, queryTypeMap = {};

        // make up slots
        if (trigger !== null) {
            var triggerSlots = trigger.schema.map(function(type, i) {
                var simpleType = simplifyType(type);
                if (triggerTypeMap[simpleType] === undefined)
                    triggerTypeMap[simpleType] = 1;
                else
                    triggerTypeMap[simpleType]++;
                return { name: trigger.args[i], type: type,
                         question: trigger.questions[i],
                         required: (trigger.required[i] || false) };
            });

            var triggerValues = new Array(triggerSlots.length);
            var triggerComparisons = [];
            var toFill = [];

            ThingTalk.Generate.assignSlots(triggerSlots, intent.trigger.args, triggerValues, triggerComparisons,
                                           false, intent.trigger.slots, scope, toFill);

            triggerDesc = describe(dlg, intent.trigger.kind,
                                   intent.trigger.channel,
                                   trigger, triggerValues, triggerComparisons, 'trigger',
                                   null, {});
        }

        if (query !== null) {
            var querySlots = query.schema.map(function(type, i) {
                var simpleType = simplifyType(type);
                if (queryTypeMap[simpleType] === undefined)
                    queryTypeMap[simpleType] = 1;
                else
                    queryTypeMap[simpleType]++;
                return { name: query.args[i], type: type,
                         question: query.questions[i],
                         required: (query.required[i] || false) };
            });

            var queryValues = new Array(querySlots.length);
            var queryComparisons = [];
            var toFill = [];

            var deviceLhs = null;
            var argTypeMap = null;
            if (trigger != null) {
                deviceLhs = intent.trigger.kind;
                argTypeMap = triggerTypeMap;
            }

            ThingTalk.Generate.assignSlots(querySlots, intent.query.args, queryValues, queryComparisons,
                                           false, intent.query.slots, scope, toFill);

            queryDesc = describe(dlg, intent.query.kind,
                                 intent.query.channel,
                                 query, queryValues, queryComparisons, 'query',
                                 deviceLhs, argTypeMap);
        }

        if (action !== null) {
            var actionSlots = action.schema.map(function(type, i) {
                return { name: action.args[i], type: type,
                         question: action.questions[i],
                         required: (action.required[i] || false) };
            });

            var actionValues = new Array(actionSlots.length);
            var actionComparisons = [];
            var toFill = [];

            var deviceLhs = null;
            var argTypeMap = null;
            if (query != null) {
                deviceLhs = intent.query.kind;
                argTypeMap = queryTypeMap;
            } else if (trigger != null) {
                deviceLhs = intent.trigger.kind;
                argTypeMap = triggerTypeMap;
            }

            ThingTalk.Generate.assignSlots(actionSlots, intent.action.args, actionValues, actionComparisons,
                                           true, intent.action.slots, scope, toFill);

            actionDesc = describe(dlg, intent.action.kind,
                                  action.channel,
                                  action, actionValues, actionComparisons, 'action',
                                  deviceLhs, argTypeMap);
        }

        if (trigger && query && action) {
            if (coin(0.2))
                return dlg._("%s then %s if %s").format(queryDesc, actionDesc, triggerDesc);
            else
                return dlg._("if %s then %s and then %s").format(triggerDesc, queryDesc, actionDesc);
        } else if (trigger && query) {
            if (coin(0.1))
                return dlg._("%s when %s").format(queryDesc, triggerDesc);
            else if (coin(0.5))
                return dlg._("if %s %s").format(triggerDesc, queryDesc);
            else if (coin(0.5))
                return dlg._("if %s then %s").format(triggerDesc, queryDesc);
            else
                return dlg._("when %s then %s").format(triggerDesc, queryDesc);
        } else if (trigger && action) {
            if (coin(0.1))
                return dlg._("%s when %s").format(actionDesc, triggerDesc);
            else if (coin(0.5))
                return dlg._("if %s %s").format(triggerDesc, actionDesc);
            else if (coin(0.5))
                return dlg._("if %s then %s").format(triggerDesc, actionDesc);
            else
                return dlg._("when %s then %s").format(triggerDesc, actionDesc);
        } else if (query && action) {
            if (coin(0.3))
                return dlg._("%s and then %s").format(queryDesc, actionDesc);
            else
                return dlg._("%s then %s").format(queryDesc, actionDesc);
        } else if (trigger) {
            return dlg._("notify if %s").format(triggerDesc);
        } else if (query) {
            return queryDesc;
        } else {
            return actionDesc;
        }
    });
}
