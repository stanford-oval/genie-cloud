// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Sabrina
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

const SemanticAnalyzer = require('./semantic');

function clean(name) {
    return name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
}

function coin(bias) {
    return Math.random() < bias;
}

function describeArg(dlg, arg, type, deviceLhs) {
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
    if (arg.isMeasure)
        return arg.value + ' ' + arg.unit;
    if (arg.isBoolean)
        if (coin(0.5))
            return arg.value ? dlg._("yes") : dlg._("no");
        else
            return arg.value ? dlg._("true") : dlg._("false");
    if (arg.isDate)
        return arg.value.toDateString();
    if (arg.isEnum)
        return clean(arg.value);
    if (arg.display)
        return arg.display;
    if (arg.isString)
        return '"' + arg.value + '"';
    if (arg.isUsername)
        return '@' + arg.value;
    if (arg.isHashtag)
        return '#' + arg.value;
    if (arg.isNumber || arg.isPhoneNumber || arg.isEmailAddress || arg.isURL)
        return arg.value;

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

function typeCompat(t1, t2) {
    try {
        Type.typeUnify(t1, t2);
        return true;
    } catch(e) {
        return false;
    }
}

function assignSlots(slots, prefilled, values, comparisons, fillAll, mustFill, scope, toFill) {
    var newScope = {};

    slots.forEach((slot, i) => {
        var found = false;
        for (var pre of prefilled) {
            if (pre.name !== slot.name)
                continue;

            if (pre.operator === 'is') {
                if (!pre.value.isVarRef)
                    Type.typeUnify(slot.type, Ast.typeForValue(pre.value));
                values[i] = pre.value;
                pre.assigned = true;
                found = true;
                break;
            }
        }

        if (!found) {
            values[i] = undefined;
            if (fillAll || mustFill.has(slot.name) || slot.required)
                toFill.push(i);
            else
                newScope[slot.name] = slot;
        }
    });

    prefilled.forEach((pre) => {
        var found = false;
        for (var slot of slots) {
            if (slot.name === pre.name) {
                found = true;
                break;
            }
        }

        if (!found)
            throw new Error("I don't know what to do with " + pre.name + " " + pre.operator + " " + pre.value);

        if (pre.assigned)
            return;

        comparisons.push(pre);
    });
    if (fillAll && comparisons.length > 0)
        throw new Error("Actions cannot have conditions");

    for (var name in newScope)
        scope[name] = newScope[name];
}

module.exports = function reconstructCanonical(dlg, schemaRetriever, json) {
    var analyzed = new SemanticAnalyzer(json);
    var parsed = analyzed.root;

    if (analyzed.isSpecial) {
        switch (analyzed.special) {
        case 'tt:root.special.debug':
            return 'debug';
        case 'tt:root.special.help':
            return dlg._("help");
        case 'tt:root.special.nevermind':
            return dlg._("never mind");
        case 'tt:root.special.failed':
            return dlg._("none of the above");
        default:
            return analyzed.special.substr('tt:root.special.'.length);
        }
    }
    if (analyzed.isEasterEgg) {
        switch (analyzed.egg) {
        case 'tt:root.special.hello':
            return dlg._("hello");
        case 'tt:root.special.thankyou':
            return dlg._("thank you");
        case 'tt:root.special.sorry':
            return dlg._("sorry");
        case 'tt:root.special.cool':
            return dlg._("cool");
        default:
            return analyzed.egg.substr('tt:root.special.'.length);
        }
    }
    // differentiate true/false even if they end up with the same semantic
    // analysis
    if (analyzed.isYes)
        return parsed.answer ? dlg._("true") : dlg._("yes");
    if (analyzed.isNo)
        return parsed.answer ? dlg._("false") : dlg._("no");

    if (analyzed.isAnswer)
        return describeArg(dlg, analyzed.value);
    if (analyzed.isDiscovery)
        return dlg._("search for devices");
    if (analyzed.isList) {
        switch (analyzed.list) {
        case 'device':
            return dlg._("list devices");
        case 'query':
        case 'command':
            return dlg._("list commands");
        default:
            return 'list ' + analyzed.list;
        }
    }
    if (analyzed.isHelp)
        return dlg._("help %s").format(analyzed.name);
    if (analyzed.isConfigure)
        return dlg._("configure %s").format(analyzed.name);
    if (analyzed.isSetting)
        return dlg._("my name is %s").format(analyzed.name);

    if (analyzed.isRule) {
        var triggerMeta = analyzed.trigger !== null ? schemaRetriever.getMeta(analyzed.trigger.kind, 'triggers', analyzed.trigger.channel) : null;
        var queryMeta = analyzed.query !== null ? schemaRetriever.getMeta(analyzed.query.kind, 'queries', analyzed.query.channel) : null;
        var actionMeta = analyzed.action !== null ? schemaRetriever.getMeta(analyzed.action.kind, 'actions', analyzed.action.channel) : null;

        return Q.all([triggerMeta, queryMeta, actionMeta]).spread(function(trigger, query, action) {
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

                assignSlots(triggerSlots, analyzed.trigger.args, triggerValues, triggerComparisons,
                            false, analyzed.trigger.slots, scope, toFill);

                triggerDesc = describe(dlg, analyzed.trigger.kind,
                                       analyzed.trigger.channel,
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
                    deviceLhs = analyzed.trigger.kind;
                    argTypeMap = triggerTypeMap;
                }

                assignSlots(querySlots, analyzed.query.args, queryValues, queryComparisons,
                            false, analyzed.query.slots, scope, toFill);

                queryDesc = describe(dlg, analyzed.query.kind,
                                     analyzed.query.channel,
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
                    deviceLhs = analyzed.query.kind;
                    argTypeMap = queryTypeMap;
                } else if (trigger != null) {
                    deviceLhs = analyzed.trigger.kind;
                    argTypeMap = triggerTypeMap;
                }

                assignSlots(actionSlots, analyzed.action.args, actionValues, actionComparisons,
                            true, analyzed.action.slots, scope, toFill);

                actionDesc = describe(dlg, analyzed.action.kind,
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
            } else
                throw new TypeError("Must have at least 2 among trigger, query and action");
        });
    }

    // action, trigger, query
    var name, args, schemaType;
    if (parsed.action) {
        schemaType = 'actions';
    } else if (parsed.query) {
        schemaType = 'queries';
    } else if (parsed.trigger) {
        schemaType = 'triggers';
    } else {
        throw new TypeError('Not action, query or trigger');
    }

    return schemaRetriever.getMeta(analyzed.kind, schemaType, analyzed.channel).then(function(meta) {
        // make up slots
        var scope = {};
        var slots = meta.schema.map(function(type, i) {
            return { name: meta.args[i], type: type,
                     question: meta.questions[i],
                     required: (meta.required[i] || false) };
        });

        var values = new Array(slots.length);
        var comparisons = [];
        var toFill = [];
        assignSlots(slots, analyzed.args, values, comparisons,
                    analyzed.isAction, analyzed.slots, scope, toFill);

        if (analyzed.isTrigger) {
            return dlg._("notify if %s").format(describe(dlg, analyzed.kind,
                                                         analyzed.channel,
                                                         meta, values, comparisons, 'trigger',
                                                         null, {}));
        } else {
            return describe(dlg, analyzed.kind,
                            analyzed.channel,
                            meta, values, comparisons, analyzed.isQuery ? 'query' : 'action',
                            null, {});
        }
    });
}
