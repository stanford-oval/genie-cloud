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

const SemanticAnalyzer = require('./semantic');

function clean(name) {
    return name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
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
            //return dlg._("the result");
            return dlg._("it");
        case '$event.title':
            return dlg._("the notification");
        default:
            return "the " + clean(arg.name) + ((deviceLhs !== undefined) ? (" from " + clean(deviceLhs)) : "");
	    //return (type.isURL || type.isPicture ? "it" : "the " + arg.name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase());
        }
    }
    if (arg.isString)
        return '"' + arg.value + '"';
    if (arg.isUsername)
        return '@' + arg.value;
    if (arg.isHashtag)
        return '#' + arg.value;
    if (arg.isNumber || arg.isPhoneNumber || arg.isEmailAddress || arg.isURL)
        return arg.value;
    if (arg.isMeasure)
        return arg.value + ' ' + arg.unit;
    if (arg.isBoolean)
        return arg.value ? dlg._("on") : dlg._("off");
    if (arg.isDate)
        return arg.value.toString();
    if (arg.isEnum)
        return clean(arg.value);

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

function describe(dlg, kind, channel, schema, args, comparisons, isQuery, deviceLhs) {
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
            if (args[i].isVarRef)
                return;
            type = ThingTalk.Type.fromString(type);
            if (isQuery && !any)
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
            if (isQuery && !any)
                confirm += dlg._(" if %s is less than %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
            else
                confirm += dlg._(" and %s is less than %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
            break;
        case '>':
            if (isQuery && !any)
                confirm += dlg._(" if %s is greater than %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
            else
                confirm += dlg._(" and %s is greater than %s").format(argcanonical, describeArg(dlg, comp.value, argtype, deviceLhs));
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

            // make up slots
            if (trigger !== null) {
                var triggerSlots = trigger.schema.map(function(type, i) {
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
                                       trigger, triggerValues, triggerComparisons, false);
            }

            if (query !== null) {
                var querySlots = query.schema.map(function(type, i) {
                    return { name: query.args[i], type: type,
                             question: query.questions[i],
                             required: (query.required[i] || false) };
                });

                var queryValues = new Array(querySlots.length);
                var queryComparisons = [];
                var toFill = [];

		var deviceLhs = undefined;
		if(trigger != null) deviceLhs = analyzed.trigger.kind;
                assignSlots(querySlots, analyzed.query.args, queryValues, queryComparisons,
                            false, analyzed.query.slots, scope, toFill);

                queryDesc = describe(dlg, analyzed.query.kind,
                                     analyzed.query.channel,
                                     query, queryValues, queryComparisons, true, deviceLhs);
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

		var deviceLhs = undefined;
		if(trigger != null) deviceLhs = analyzed.trigger.kind;
		else if(query != null) deviceLhs = analyzed.query.kind;

                assignSlots(actionSlots, analyzed.action.args, actionValues, actionComparisons,
                            true, analyzed.action.slots, scope, toFill);

                actionDesc = describe(dlg, analyzed.action.kind,
                                      action.channel,
                                      action, actionValues, actionComparisons, false, deviceLhs);
            }

            if (trigger && query && action)
                return dlg._("if %s then %s and then %s").format(triggerDesc, queryDesc, actionDesc);
            else if (trigger && query)
                return dlg._("if %s then %s").format(triggerDesc, queryDesc);
            else if (trigger && action)
                return dlg._("if %s then %s").format(triggerDesc, actionDesc);
            else if (query && action)
                return dlg._("%s then %s").format(queryDesc, actionDesc);
            else
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
            return dlg._("notify if %s").format(describeTrigger(dlg, analyzed.kind,
                                                                analyzed.channel,
                                                                meta, values, comparisons));
        } else {
            return describe(dlg, analyzed.kind,
                            analyzed.channel,
                            meta, values, comparisons);
        }
    });
}
