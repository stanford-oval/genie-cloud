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
    const REGEXP = /^tt:([a-z0-9A-Z_\-]+)\.([a-z0-9A-Z_]+)$/;
    var name = REGEXP.exec(invocation.name.id);
    var principal = invocation.person;

    var selector;
    if (principal)
        selector = '@(type=' + stringEscape(name[1]) + ', principal=' + stringEscape(principal) + ')';
    else
        selector = '@' + name[1];

    return selector + '.' + name[2]
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
