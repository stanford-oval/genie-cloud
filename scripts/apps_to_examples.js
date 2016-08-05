// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details

require('thingengine-core/lib/polyfill');

const Q = require('q');
const fs = require('fs');

const ThingTalk = require('thingtalk');
const AppGrammar = ThingTalk.Grammar;
const AppCompiler = ThingTalk.Compiler;
const Ast = ThingTalk.Ast;
const SchemaRetriever = ThingTalk.SchemaRetriever;

const db = require('../util/db');
const model = require('../model/app');
const ThingPediaClient = require('../util/thingpedia-client');

var _schemaRetriever = new SchemaRetriever(new ThingPediaClient());

function SkipError(msg) {
    this.message = msg;
}

var _skipReasons = {};
function skip(reason) {
    var short = reason;
    if (short.startsWith('App does not compile'))
        short = 'app does not compile';
    if (!(short in _skipReasons))
        _skipReasons[short] = 0;
    _skipReasons[short]++;
    throw new SkipError(reason);
}

function invocationToName(invocation) {
    if (invocation.selector.isGlobalName &&
        invocation.selector.name === 'sabrina' &&
        (invocation.name === 'listen' || invocation.name === 'onpicture'))
        return skip('trigger is @sabrina.listen');

    if (invocation.selector.isBuiltin) {
        if (invocation.selector.name === 'notify' ||
            invocation.selector.name === 'return')
            return ['$builtin', invocation.selector.name];
        if (invocation.selector.name === 'logger')
            return ['builtin', 'debug_log'];
        return ['builtin', invocation.selector.name];
    } else if (invocation.selector.isGlobalName) {
        return [invocation.selector.name, invocation.name];
    } else {
        var type = null;
        invocation.selector.attributes.forEach(function(attr) {
            if (attr.name === 'type' && attr.value.isString)
                type = attr.value.value;
        });
        if (!type)
            return skip('trigger has no type');
        return [type, invocation.name];
    }
}

function simplifyConstructors(expr) {
    if (!expr.isFunctionCall)
        return expr;
    if (expr.name === 'makeLocation' && expr.args[0].isConstant && expr.args[1].isConstant)
        return Ast.Expression.Constant(Ast.Value.Location(expr.args[1].value.value, expr.args[0].value.value));
    if (expr.name === 'makePicture' && expr.args[0].isConstant)
        return Ast.Expression.Constant(Ast.Value.Picture(expr.args[0].value.value));
    return expr;
}

function valueToSempre(value) {
    if (value.isBoolean || value.isString || value.isNumber || value.isEnum || value.isPicture)
        return { value: value.value };
    else if (value.isMeasure)
        return { value: value.value, unit: value.unit };
    else if (value.isLocation)
        return { relativeTag: 'absolute', longitude: value.x, latitude: value.y };
    else if (value.isDate)
        return { year: value.value.getFullYear(), month: value.value.getMonth()+1,
            day: value.value.getDate(), hour: value.value.getHours(),
            minute: value.value.getMinutes(), second: value.value.getSeconds() };
    else
        return skip('unsupported value ' + value);
}

function processTrigger(trigger, schemaType) {
    var invocation = null;
    var conditions = [];
    var nOther = 0;
    trigger.forEach(function(part) {
        if (part.isInvocation)
            invocation = part;
        else if (part.isCondition || part.isBuiltinPredicate)
            conditions.push(part.expr);
        else
            nOther++;
    });

    if (nOther > 0)
        return skip('trigger has non-invocation/non-condition');
    if (!invocation)
        return skip('trigger has no invocation');

    var triggerName = invocationToName(invocation);
    var kind = triggerName[0];
    var channelName = triggerName[1];

    var trigger = { name: { id: 'tt:' + kind + '.' + channelName }, args: [] };
    var scope = {};
    invocation.params.forEach(function(param, i) {
        param = simplifyConstructors(param);
        if (param.isConstant)
            trigger.args.push({ name: i, operator: 'is', value: valueToSempre(param.value) });
        else if (!param.isVarRef && !param.isNull)
            return skip('trigger param is not constant, var ref or null');

        if (param.isVarRef)
            scope[param.name] = i;
    });
    conditions.forEach(function(cond) {
        if (!cond.isFunctionCall && !cond.isBinaryOp)
            return skip('condition is unsupported: ' + cond);
        if (cond.isFunctionCall) {
            if (cond.name !== 'contains')
                return skip('unsupported function call: ' + cond.name);
            cond.args[1] = simplifyConstructors(cond.args[1]);
            if (!cond.args[0].isVarRef || !cond.args[1].isConstant)
                return skip('condition is not simple: ' + cond);
            if (!(cond.args[0].name in scope))
                return skip('name is not in scope');
            trigger.args.push({ name: scope[cond.args[0].name], operator: 'has', value: valueToSempre(cond.args[1].value) });
        } else {
            if (cond.opcode !== '=' && cond.opcode !== '>'
                && cond.opcode !== '<' && cond.opcode !== '=~')
                return skip('unsupported binary op ' + cond.opcode);
            cond.rhs = simplifyConstructors(cond.rhs);
            if (!cond.lhs.isVarRef || !cond.rhs.isConstant)
                return skip('condition is not simple: ' + cond);
            if (!(cond.lhs.name in scope))
                return skip('name is not in scope');
            var op = cond.opcode === '=' ? 'is' : cond.opcode === '=~' ? 'contains': cond.opcode;
            trigger.args.push({ name: scope[cond.lhs.name], operator: op, value: valueToSempre(cond.rhs.value) });
        }
    });

    return _schemaRetriever.getMeta(kind, schemaType, channelName).then(function(meta) {
        trigger.args.forEach(function(arg) {
            arg.name = { id: 'tt:param.' + meta.args[arg.name] };
        });

        return trigger;
    });
}

function processAction(action) {
    if (action.length > 1)
        return skip('action has more than one element');
    var invocation = action[0];
    if (!invocation.isInvocation)
        return skip('action is not invocation');

    var actionName = invocationToName(invocation);
    var kind = actionName[0];
    var channelName = actionName[1];

    var action = { name: { id: 'tt:' + kind + '.' + channelName }, args: [] };
    invocation.params.forEach(function(param, i) {
        param = simplifyConstructors(param);
        if (param.isConstant)
            action.args.push({ name: i, operator: 'is', value: valueToSempre(param.value) });
        else if (!param.isVarRef)
            return skip('action param is not constant or var ref');
    });

    return _schemaRetriever.getMeta(kind, 'actions', channelName).then(function(meta) {
        action.args.forEach(function(arg) {
            arg.name = { id: 'tt:param.' + meta.args[arg.name] };
        });
        return action;
    });
}

function emit(name, description, obj, output) {
    output.write(name);
    output.write('\t');
    output.write(JSON.stringify(description));
    output.write('\t');
    output.write(JSON.stringify(obj));
    output.write('\n');
}

function processApp(name, description, code, output) {
    var ast = AppGrammar.parse(code);

    var nRules = 0, nCommands = 0, nOther = 0;
    ast.statements.forEach(function(stmt) {
        if (stmt.isRule)
            nRules++;
        else if (stmt.isCommand)
            nCommands++;
        else
            nOther++;
    });

    if (nOther > 0)
        return skip('has non-rule/non-command');
    if (nRules + nCommands > 1)
        return skip('more than one rule or command');

    if (nRules > 0) {
        var rule = ast.statements[0];
        if (rule.sequence.length > 3)
            return skip('more than 3 action + trigger + query');
        var trigger = processTrigger(rule.sequence[0], 'triggers');
        if (rule.sequence.length > 2) {
            var query = processTrigger(rule.sequence[1], 'queries');
            var action = processAction(rule.sequence[2]);
        } else {
            var query = undefined;
            var action = processAction(rule.sequence[1]);
        }
        return Q.all([trigger, query, action]).spread(function(trigger, query, action) {
            if ((action.name.id === 'tt:$builtin.notify' ||
                 action.name.id === 'tt:sabrina.say' ||
                 action.name.id === 'tt:sabrina.picture') &&
                action.args.length === 0)
                action = undefined;
            if (action === undefined && query === undefined)
                return emit(name, description, { trigger: trigger }, output);
            else
                return emit(name, description, { rule: { trigger: trigger, query: query, action: action }}, output);
        });
    } else {
        var command = ast.statements[0];
        if (rule.sequence.length > 2)
            return skip('more than 2 action + query');
        if (command.sequence.length > 1) {
            var query = processTrigger(rule.sequence[0], 'queries');
            var action = processAction(rule.sequence[1]);
        } else {
            var query = undefined;
            var action = processAction(rule.sequence[0]);
        }
        return Q.all([query, action]).spread(function(query, action) {
            if ((action.name.id === 'tt:$builtin.notify' ||
                 action.name.id === 'tt:sabrina.say' ||
                 action.name.id === 'tt:sabrina.picture') &&
                action.args.length === 0)
                action = undefined;
            if (action !== undefined && query !== undefined)
                return skip('have both action and query in command');
            if (action)
                return emit(name, description, { action: action }, output);
            else
                return emit(name, description, { query: query }, output);
        });
    }
}

function compileApp(code) {
    var compiler = new AppCompiler();

    return Q.try(function() {
        compiler.setSchemaRetriever(_schemaRetriever);
        return compiler.compileCode(code);
    }).then(function() {
        return compiler;
    });
}

function main() {
    var output = fs.createWriteStream(process.argv[2]);

    db.withTransaction(function(dbClient) {
        return model.getAll(dbClient, null).then(function(apps) {
            return Q.all(apps.map(function(a) {
                return Q.try(function() {
                    return compileApp(a.code).then(function() {
                        return processApp(a.name, a.description, a.code, output);
                    }, function(e) {
                        skip('App does not compile: ' + e.message);
                    });
                }).catch(function(e) {
                    if (e instanceof SkipError)
                        console.log('Skipped ' + a.id + ' (' + a.name + '): ' + e.message);
                    else
                        console.log('Conversion of ' + a.id + ' (' + a.name + ') failed: ' + e.message);
                });
            }));
        });
    }).then(() => {
        console.log('skip reasons', _skipReasons);
        output.end();
    }).done();

    output.on('finish', () => process.exit());
}

main();
