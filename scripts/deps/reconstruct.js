// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// A copy of Almond/lib/describe.js that includes some randomization
// to make the sentences less regular

const Q = require('q');

const ThingTalk = require('thingtalk');
const Type = ThingTalk.Type;
const Ast = ThingTalk.Ast;

// devices that shouldn't appear in sentences
const BlackList = new Set([
    'holidays',
    'icalendar',
    'imgflip',
    'builtin',
    'sportradar',
    'thecatapi',
    'weatherapi',
    'ytranslate',
]);

const Intent = require('almond').Intent;

function clean(name) {
    if (name.startsWith('v_'))
        name = name.substr('v_'.length);
    return name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
}

function coin(bias) {
    return Math.random() < bias;
}

function displayLocation(dlg, loc) {
    if (loc.isAbsolute) {
        if (loc.display)
            return loc.display;
        else
            return '[Latitude: ' + Number(loc.lat).toFixed(3) + ' deg, Longitude: ' + Number(loc.lon).toFixed(3) + ' deg]'
    } else {
        switch (loc.relativeTag) {
        case 'current_location':
            return dlg._("here");
        case 'home':
            return dlg._("at home");
        case 'work':
            return dlg._("at work");
        default:
            return loc.relativeTag;
        }
    }
}

function describeArg(dlg, arg, deviceLhs) {
    if (arg.display)
        return arg.display;
    if (arg.isVarRef)
        return clean(arg.name.startsWith('v_') ? arg.name.substr('v_'.length) : arg.name);
    if (arg.isUndefined)
        return '____';
    if (arg.isEvent) {
        switch (arg.name) {
        case null:
            if (coin(0.5))
                return dlg._("the result");
            else
                return dlg._("it");
        case 'title':
            if (coin(0.5))
                return dlg._("the notification");
            else
                return dlg._("the result title");
        case 'body':
            return dlg._("the notification body");
        default:
            if (coin(0.1))
                return dlg._("its %s value").format(clean(arg.name));
            else if (coin(0.3) && deviceLhs && !BlackList.has(deviceLhs))
                return dlg._("the %s from %s").format(clean(arg.name), clean(deviceLhs));
            else if (coin(0.5))
                return dlg._("the %s").format(clean(arg.name));
            else
                return dlg._("its %s").format(clean(arg.name));
        }
    }
    if (arg.isLocation)
        return displayLocation(dlg, arg.value);
    if (arg.isString)
        return '"' + arg.value + '"';
    if (arg.isEntity) {
        if (arg.type === 'tt:username' || arg.type === 'tt:contact_name')
            return '@' + arg.value;
        if (arg.type === 'tt:hashtag')
            return '#' + arg.value;
        if (arg.type === 'tt:contact' && arg.value === dlg.manager.messaging.type + '-account:' + dlg.manager.messaging.account)
            return dlg._("me");
        return arg.value;
    }
    if (arg.isNumber)
        return arg.value;
    if (arg.isEnum)
        return clean(arg.value);
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
        return "%02d:%02d".format(arg.hours, arg.minutes);

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
    if (type.isArray)
        return simplifyType(type.elem);
    return type.toString();
}

function describePrimitive(dlg, obj, channelType, fromDevice) {
    var isQuery = channelType === 'query';
    var isAction = channelType === 'action';
    var kind = obj.selector.kind;
    var owner = obj.selector.principal;
    var channel = obj.channel;
    var schema = obj.schema;
    var deviceLhs = fromDevice ? clean(fromDevice.schema.kind) : null;

    var confirm;
    if (kind === 'remote') {
        // special case internal sending/receiving
        if (channel === 'send')
            confirm = dlg._("send it to $__principal");
        else if (channel === 'receive')
            confirm = dlg._("you receive something from $__principal");
        else
            throw TypeError('Invalid @remote channel ' + channel);
    } else if (owner) {
        confirm = schema.confirmation_remote;
        if (!confirm)
            confirm = schema.confirmation;
        if (confirm == schema.confirmation)
            confirm = confirm.replace('your', describeArg(dlg, owner) + '\'s').replace('you', describeArg(dlg, owner));
        else
            confirm = confirm.replace('$__person', describeArg(dlg, owner));
    } else {
        confirm = schema.confirmation;
        if (obj.selector.device)
            confirm = confirm.replace('$__device', obj.selector.device.name);
        else
            confirm = confirm.replace('$__device', clean(kind));
    }

    var any = true;
    for (let inParam of obj.in_params) {
        let argname = inParam.name;
        let index = obj.schema.index[argname];
        let argcanonical = obj.schema.argcanonicals[index] || clean(argname);
        let value = describeArg(dlg, inParam.value, deviceLhs);
        let type = obj.schema.inReq[argname] || obj.schema.inOpt[argname];
        if (confirm.indexOf('$' + argname) >= 0) {
            if (value.isUndefined)
                confirm = confirm.replace('$' + schema.args[i], placeholder(type));
            else
                confirm = confirm.replace('$' + argname, value, deviceLhs);
        } else if (!argname.startsWith('__') && kind !== 'remote' && !inParam.value.isUndefined) {
            if (value.isVarRef && type.isEntity && type.type == 'tt:picture') {
                if (coin(0.9))
                    continue;
            }
            if (isAction && coin(0.2))
                confirm += dlg._(" with %s %s").format(argcanonical, value);
            else if (isQuery && !any)
                confirm += dlg._(" if %s is %s").format(argcanonical, value);
            else
                confirm += dlg._(" and %s is %s").format(argcanonical, value);
            any = true;
        }
    }

    for (let filter of obj.filters) {
        let argname = filter.name;
        if (filter.operator === '=' && confirm.indexOf('$' + argname) >= 0) {
            confirm = confirm.replace('$' + argname, describeArg(dlg, filter.value));
        } else {
            let index = obj.schema.index[argname];
            let argcanonical = obj.schema.argcanonicals[index] || clean(argname);
            let value =  describeArg(dlg, filter.value, deviceLhs);
            let argtype = obj.schema.out[argname];
            switch (filter.operator) {
            case 'contains':
            case '=~':
                if (isQuery && !any)
                    confirm += dlg._(" if %s has %s").format(argcanonical, value);
                else
                    confirm += dlg._(" and %s has %s").format(argcanonical, value);
                break;
            case '=':
                if (isQuery && !any)
                    confirm += dlg._(" if %s is %s").format(argcanonical, value);
                else
                    confirm += dlg._(" and %s is %s").format(argcanonical, value);
                break;
            case '!=':
                if (isQuery && !any)
                    confirm += dlg._(" if %s is not %s").format(argcanonical, value);
                else
                    confirm += dlg._(" and %s is not %s").format(argcanonical, value);
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
                    confirm += dlg._(" if %s is %s %s").format(argcanonical, value);
                else
                    confirm += dlg._(" and %s is %s %s").format(argcanonical, value);
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
                    confirm += dlg._(" if %s is %s %s").format(argcanonical, op, value);
                else
                    confirm += dlg._(" and %s is 5s %s").format(argcanonical, op, value);
                break;
            case '<=':
                if (isQuery && !any)
                    confirm += dlg._(" if %s is less or equal to %s").format(argcanonical, value);
                else
                    confirm += dlg._(" and %s is less or equal to %s").format(argcanonical, value);
                break;
            case '>=':
                if (isQuery && !any)
                    confirm += dlg._(" if %s is greater or equal to %s").format(argcanonical, value);
                else
                    confirm += dlg._(" and %s is greater or equal to %s").format(argcanonical, value);
                break;
            default:
                throw new TypeError('Invalid operator ' + filter.operator);
            }
        }
    }
    return confirm;
}


function describeRule(dlg, r) {
    var triggerDesc = r.trigger ? describePrimitive(dlg, r.trigger, null) : '';

    var queryDesc = r.queries.map((q, i) => describePrimitive(dlg, q, i > 0 ? r.queries[i-1] : r.trigger)).join(dlg._(" and then "));
    var actions = r.actions.filter((a) => !a.selector.isBuiltin);
    var actionDesc = actions.map((a) => describePrimitive(dlg, a, r.queries.length > 0 ? r.queries[r.queries.length-1] : r.trigger)).join(dlg._(" and "));

    var ruleDesc;
    if (triggerDesc && queryDesc && actionDesc) {
        if (coin(0.2))
            return dlg._("%s then %s if %s").format(queryDesc, actionDesc, triggerDesc);
        else
            return dlg._("if %s then %s and then %s").format(triggerDesc, queryDesc, actionDesc);
    } else if (triggerDesc && queryDesc) {
        if (coin(0.1))
            return dlg._("%s when %s").format(queryDesc, triggerDesc);
        else if (coin(0.5))
            return dlg._("if %s %s").format(triggerDesc, queryDesc);
        else if (coin(0.5))
            return dlg._("if %s then %s").format(triggerDesc, queryDesc);
        else
            return dlg._("when %s then %s").format(triggerDesc, queryDesc);
    } else if (triggerDesc && actionDesc) {
        if (coin(0.1))
            return dlg._("%s when %s").format(actionDesc, triggerDesc);
        else if (coin(0.5))
            return dlg._("if %s %s").format(triggerDesc, actionDesc);
        else if (coin(0.5))
            return dlg._("if %s then %s").format(triggerDesc, actionDesc);
        else
            return dlg._("when %s then %s").format(triggerDesc, actionDesc);
    } else if (queryDesc && actionDesc) {
        if (coin(0.3))
            return dlg._("%s and then %s").format(queryDesc, actionDesc);
        else
            return dlg._("%s then %s").format(queryDesc, actionDesc);
    } else if (triggerDesc) {
        return dlg._("notify if %s").format(triggerDesc);
    } else if (queryDesc) {
        return queryDesc;
    } else {
        return actionDesc;
    }
    if (r.once)
        ruleDesc += dlg._(" (only once)");
    return ruleDesc;
}

function describeProgram(dlg, program) {
    return program.rules.map((r) => describeRule(dlg, r)).join(', ');
}

module.exports = describeProgram;
