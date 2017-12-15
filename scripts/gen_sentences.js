// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const fs = require('fs');

const ThingTalk = require('thingtalk');
const Type = ThingTalk.Type;
const Ast = ThingTalk.Ast;
const Generate = ThingTalk.Generate;
const SchemaRetriever = ThingTalk.SchemaRetriever;

const AdminThingpediaClient = require('./deps/admin-thingpedia-client');
const db = require('../util/db');
// const i18n = require('../util/i18n');

// const gettext = i18n.get('en');

/*const _metadata = {
    triggers: [],
    queries: [],
    actions: []
};*/

const PARAM_REGEX = /\$(?:\$|([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/;
const NON_TERM_REGEX = /\${([a-zA-Z0-9._:(),]+)}/;

function split(pattern, regexp) {
    // a split that preserves capturing parenthesis

    let clone = new RegExp(regexp, 'g');
    let match = clone.exec(pattern);

    let chunks = [];
    let i = 0;
    while (match !== null) {
        if (match.index > i)
            chunks.push(pattern.substring(i, match.index));
        chunks.push(match);
        i = clone.lastIndex;
        match = clone.exec(pattern);
    }
    if (i < pattern.length)
        chunks.push(pattern.substring(i, pattern.length));
    return chunks;
}

function clean(name) {
    if (/^[vwgp]_/.test(name))
        name = name.substr(2);
    if (name === 'from')
        return 'author';
    return name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
}

function makeProgram(rule) {
    return new Ast.Program([], [], [rule], null);
}

const TIMER_SCHEMA = new Ast.FunctionDef('other',
    ['__timestamp'], // args
    [Type.Measure('ms')], // types
    { __timestamp: 0 }, // index
    {}, // inReq
    {}, // inOpt
    { __timestamp: Type.Measure('ms') }, // out
    'every fixed interval', // canonical
    'every ${interval}', // confirmation
    '', // confirmation_remote
    ['timestamp'], // argcanonicals
    [''] // questions
);

const AT_TIMER_SCHEMA = new Ast.FunctionDef('other',
    ['__timestamp'], // args
    [Type.Measure('ms')], // types
    { __timestamp: 0 }, // index
    {}, // inReq
    {}, // inOpt
    { __timestamp: Type.Measure('ms') }, // out
    'every day', // canonical
    'every day at ${time}', // confirmation
    '', // confirmation_remote
    ['timestamp'], // argcanonicals
    [''] // questions
);

// A numbered constant, eg. QUOTED_STRING_0 or NUMBER_1 or HASHTAG_3
// During generation, this constant is put in the program as a VarRef
// with an unique variable name.
class Constant {
    constructor(symbol, number, type) {
        this.symbol = symbol;
        this.number = number;
        this.type = type;
        this.value = new Ast.Value.VarRef(`__const_${symbol.replace(':', '_')}_${number}`);
        // HACK: VarRefs don't know their own types normally, but these ones do
        this.value.getType = () => type;
    }

    toString() {
        return `${this.symbol}_${this.number}`;
    }
}

class Placeholder {
    constructor(symbol, option) {
        this.symbol = symbol;
        this.option = option;
    }

    toString() {
        return '${' + this.symbol + '}';
    }
}

// A Derivation represents a sentence, possibly with placeholders,
// and a value, possibly with unspecified input parameters, that
// was computed at a certain point in the derivation tree
class Derivation {
    constructor(value, sentence) {
        this.value = value;
        this.sentence = sentence;
        if (!Array.isArray(sentence) || sentence.some((x) => x instanceof Derivation))
            throw new TypeError('Invalid sentence');

        this._flatSentence = null;
    }

    hasPlaceholders() {
        for (let child of this.sentence) {
            if (child instanceof Placeholder)
                return true;
        }
        return false;
    }

    hasPlaceholder(what) {
        for (let child of this.sentence) {
            if (child instanceof Placeholder && child.symbol === what)
                return true;
        }
        return false;
    }

    toString() {
        if (this._flatSentence)
            return this._flatSentence;

        return this._flatSentence = this.sentence.map((x) => String(x)).join('');
    }

    clone() {
        let value = this.value;
        let sentence = Array.from(this.sentence);
        return new Derivation(value, sentence);
    }

    replacePlaceholder(name, derivation, semanticAction, { isConstant }) {
        let newValue = semanticAction(this.value, derivation.value);
        if (newValue === null)
            return null;

        let newSentence = [];
        let found = false;
        for (let child of this.sentence) {
            if (child instanceof Placeholder && child.symbol === name) {
                if (child.option === 'const' && !isConstant)
                    return null;
                newSentence.push(...derivation.sentence);
                found = true;
            } else {
                newSentence.push(child);
            }
        }
        if (!found) {
            //console.log('no placeholder ' + name + ', have', this.sentence);
            return null;
        }
        return new Derivation(newValue, newSentence);
    }

    static combine(children, semanticAction) {
        if (children.length === 1) {
            if (children[0] instanceof Derivation) {
                let clone = children[0].clone();
                clone.value = semanticAction(children[0].value);
                return clone;
            } else if (children[0] instanceof Placeholder) {
                return new Derivation(semanticAction(), children, {
                    [children[0].symbol]: [0]
                });
            } else { // constant or terminal
                return new Derivation(semanticAction(), children, {});
            }
        }

        let sentence = [];
        let values = [];
        for (let child of children) {
            if (typeof child === 'string' || child instanceof Constant || child instanceof Placeholder) { // terminal
                sentence.push(child);
            } else if (child instanceof Derivation) {
                values.push(child.value);
                sentence.push(...child.sentence);
            }
        }

        //console.log('combine: ' + children.join(' ++ '));
        //console.log('values: ' + values.join(' , '));

        let value = semanticAction(...values);
        if (!value)
            return null;
        return new Derivation(value, sentence);
    }
}

function simpleCombine(semanticAction) {
    return function(children) {
        return Derivation.combine(children, semanticAction);
    };
}
function combineReplacePlaceholder(pname, semanticAction, options) {
    return function([c1, c2]) {
        return c1.replacePlaceholder(pname, c2, semanticAction, options);
    };
}

// the maximum number of distinct constants of a certain type in a program
const MAX_CONSTANTS = 5;
function *makeConstantDerivations(symbol, type) {
    for (let i = 0; i < MAX_CONSTANTS; i++) {
        let constant = new Constant(symbol, i, type);
        yield [constant, () => new Derivation(constant.value, [constant], {})];
    }
}

function removeInputParameter(schema, pname) {
    if (!schema.inReq[pname])
        return schema;
    let clone = schema.clone();
    delete clone.inReq[pname];
    return clone;
}

/*
function isUnaryTableToTableOp(table) {
    return table.isFilter ||
        table.isProjection ||
        table.isCompute ||
        table.isAlias ||
        table.isAggregation ||
        table.isArgMinMax ||
        table.isSequence ||
        table.isHistory;
}
function isUnaryStreamToTableOp(table) {
    return table.isWindow || table.isTimeSeries;
}
function isUnaryStreamToStreamOp(stream) {
    return stream.isEdgeNew ||
        stream.isEdgeFilter ||
        stream.isFilter ||
        stream.isProjection ||
        stream.isCompute ||
        stream.isAlias;
}
function isUnaryTableToStreamOp(stream) {
    return stream.isMonitor;
}*/

function betaReduceInvocation(invocation, pname, value) {
    //console.log(`betaReduceInvocation ${pname} -> ${value}`);
    let clone = invocation.clone();
    for (let inParam of clone.in_params) {
        if (inParam.value.isVarRef && inParam.value.name === pname) {
            inParam.value = value;
            return clone;
        }
    }
    //clone.in_params.push(new Ast.InputParam(pname, value));
    return invocation;
}

function betaReduceAction(action, pname, value) {
    // FIXME this is not strictly correct, we should leave the parameter
    // in the schema even if assigned, otherwise typechecking will be
    // very confused
    let clone = betaReduceInvocation(action, pname, value);
    clone.schema = removeInputParameter(action.schema, pname);
    return clone;
}

function betaReduceFilter(filter, pname, value) {
    return (function recursiveHelper(expr) {
        if (expr.isTrue || expr.isFalse)
            return expr;
        if (expr.isAnd)
            return Ast.BooleanExpression.And(expr.operands.map(recursiveHelper));
        if (expr.isOr)
            return Ast.BooleanExpression.Or(expr.operands.map(recursiveHelper));
        if (expr.isNot)
            return Ast.BooleanExpression.Not(recursiveHelper(expr.expr));
        if (expr.isExternal)
            return betaReduceInvocation(expr, pname, value);

        if (expr.value.isVarRef && expr.value.name === pname) {
            let clone = expr.clone();
            clone.value = value;
            return clone;
        } else {
            return expr;
        }
    })(filter);
}

/*
function filterUsesVariable(filter, pname) {
    return (function recursiveHelper(expr) {
        if (expr.isTrue || expr.isFalse)
            return false;
        if (expr.isAnd || expr.isOr)
            return expr.operands.some(recursiveHelper);
        if (expr.isNot)
            return recursiveHelper(expr.expr);
        if (expr.isExternal)
            return false;

        return (expr.value.isVarRef && expr.value.name === pname);
    })(filter);
}*/

function betaReduceTable(table, pname, value) {
    /*if (!table.schema.inReq[pname])
        return table;*/
    if (table.isInvocation) {
        let reduced = betaReduceInvocation(table.invocation, pname, value);
        return new Ast.Table.Invocation(reduced, removeInputParameter(table.schema, pname));
    } else if (table.isFilter) {
        let reduced = betaReduceTable(table.table, pname, value);
        return new Ast.Table.Filter(reduced, betaReduceFilter(table.filter, pname, value), removeInputParameter(table.schema, pname));
    } else if (table.isProjection) {
        return new Ast.Table.Projection(betaReduceTable(table.table, pname, value),
            table.args, removeInputParameter(table.schema, pname));
    }

    throw new Error('NOT IMPLEMENTED: ' + table);
}

function betaReduceStream(stream, pname, value) {
    if (!stream.schema.inReq[pname])
        return stream;
    if (stream.isTimer || stream.isAtTimer)
        throw new TypeError('Nothing to beta-reduce in a timer');
    if (stream.isMonitor) {
        let reduced = betaReduceTable(stream.table, pname, value);
        return new Ast.Stream.Monitor(reduced, removeInputParameter(stream.schema, pname));
    }

    throw new Error('NOT IMPLEMENTED: ' + stream);
}

function unassignInputParameter(schema, passign, pname) {
    if (passign === undefined)
        return schema;
    let clone = schema.clone();
    clone.inReq[passign] = schema.inReq[pname];
    delete clone.inReq[pname];
    return clone;
}

// perform eta reduction
// (turn (\(x) -> f(x)) into just f
function etaReduceInvocation(invocation, pname) {
    let clone = new Ast.Invocation(invocation.selector, invocation.channel,
        Array.from(invocation.in_params), null);
    let passign;
    for (let i = 0; i < clone.in_params.length; i++) {
        let inParam = clone.in_params[i];
        if (inParam.value.isVarRef && inParam.value.name === pname) {
            passign = inParam.name;
            clone.in_params.splice(i, 1);
            break;
        }
    }
    clone.schema = unassignInputParameter(invocation.schema, pname);

    return [passign, clone];
}

function etaReduceTable(table, pname) {
    if (!table.schema.inReq[pname])
        return [undefined, table];
    if (table.isInvocation) {
        let [passign, unassigned] = etaReduceInvocation(table.invocation, pname);
        return [passign, new Ast.Table.Invocation(unassigned, unassignInputParameter(table.schema, passign, pname))];
    } else if (table.isFilter) {
        let [passign, unassigned] = etaReduceTable(table.table, pname);
        return [passign, new Ast.Table.Filter(unassigned, table.filter, unassignInputParameter(table.schema, passign, pname))];
    } else {
        // TODO
        return [undefined, table];
    }
}

function identity(x) {
    return x;
}
function flip(f) {
    return function(x, y) {
        return f(y, x);
    };
}

function makeFilter(op) {
    return function semanticAction(param, value) {
        // param is a Value.VarRef
        //console.log('param: ' + param.name);
        return new Ast.BooleanExpression.Atom(param.name, op, value);
    };
}

function addUnit(unit) {
    return function(num) {
        if (num.isVarRef)
            return new Ast.Value.VarRef(num.name + '_' + unit);
        else
            return new Ast.Value.Measure(num.value, unit);
    };
}

function checkIfComplete(combiner) {
    return function(children) {
        let result = combiner(children);
        if (result === null || result.hasPlaceholders())
            return null;
        else
            return result;
    };
}
function checkIfIncomplete(combiner) {
    return function(children) {
        let result = combiner(children);
        if (result === null || !result.hasPlaceholders())
            return null;
        else
            return result;
    };
}

function doCheckConstants(result) {
    let constants = {};
    for (let piece of result.sentence) {
        if (!(piece instanceof Constant))
            continue;
        if (piece.symbol in constants) {
            if (piece.number !== constants[piece.symbol] + 1)
                return null;
        } else {
            if (piece.number !== 0)
                return null;
        }
        constants[piece.symbol] = piece.number;
    }

    return result;
}

// check that there are no holes in the constants
// (for complete top-level statements)
function checkConstants(combiner) {
    return function(children) {
        let result = combiner(children);
        if (result === null)
            return null;
        return doCheckConstants(result);
    };
}

// check that there are no holes in the constants,
// but only if there are no placeholders (which could
// introduce new constants and break this check)
// for prefixes of top-level statements
function maybeCheckConstants(combiner) {
    return function(children) {
        let result = combiner(children);
        if (result === null)
            return null;
        if (result.hasPlaceholders())
            return result;
        return doCheckConstants(result);
    };
}

function combineStreamCommand(stream, command) {
    if (command.table)
        return new Ast.Statement.Rule(new Ast.Stream.Join(stream, command.table, [], null), command.actions);
    else
        return new Ast.Statement.Rule(stream, command.actions);
}

const GRAMMAR = {
    'constant_String': Array.from(makeConstantDerivations('QUOTED_STRING', Type.String)),
    'constant_Entity(tt:url)': Array.from(makeConstantDerivations('URL', Type.Entity('tt:url'))),
    'constant_Entity(tt:picture)': [],
    'constant_Number': [
        /*['one', simpleCombine(() => Ast.Value.Number(1))],
        ['zero', simpleCombine(() => Ast.Value.Number(0))],
        ['1', simpleCombine(() => Ast.Value.Number(1))],
        ['0', simpleCombine(() => Ast.Value.Number(0))]*/]
        .concat(Array.from(makeConstantDerivations('NUMBER', Type.Number))),
    'constant_Time': Array.from(makeConstantDerivations('TIME', Type.Number)),
    'constant_Measure(ms)': [
        /*['${constant_Number} ms', simpleCombine(addUnit('ms'))],
        ['${constant_Number} milliseconds', simpleCombine(addUnit('ms'))],
        ['${constant_Number} seconds', simpleCombine(addUnit('s'))],
        ['${constant_Number} s', simpleCombine(addUnit('s'))],
        ['${constant_Number} min', simpleCombine(addUnit('min'))],
        ['${constant_Number} minutes', simpleCombine(addUnit('min'))],
        ['${constant_Number} hours', simpleCombine(addUnit('h'))],
        ['${constant_Number} days', simpleCombine(addUnit('day'))],
        ['${constant_Number} weeks', simpleCombine(addUnit('week'))],
        ['${constant_Number} months', simpleCombine(addUnit('mon'))],
        ['${constant_Number} years', simpleCombine(addUnit('year'))]*/]
        .concat(Array.from(makeConstantDerivations('DURATION', Type.Measure('ms')))),
    'constant_Boolean': [['true', simpleCombine(() => Ast.Value.Boolean(true))],
                      ['false', simpleCombine(() => Ast.Value.Boolean(false))],
                      ['yes', simpleCombine(() => Ast.Value.Boolean(true))],
                      ['no', simpleCombine(() => Ast.Value.Boolean(false))]],

    'constant_Any': [
        ['${constant_String}', simpleCombine(identity)],
        ['${constant_Entity(tt:url)}', simpleCombine(identity)],
        ['${constant_Entity(tt:picture)}', simpleCombine(identity)],
        ['${constant_Boolean}', simpleCombine(identity)],
        ['${constant_Number}', simpleCombine(identity)],
        ['${constant_Measure(ms)}', simpleCombine(identity)],
        ['${constant_Time}', simpleCombine(identity)],
    ],
    'constant_Numeric': [
        ['${constant_Number}', simpleCombine(identity)],
        ['${constant_Measure(ms)}', simpleCombine(identity)]
    ],

    // out params nonterminals are automatically generated
    'out_param_Any': [
    ],
    'out_param_Numeric': [
        ['${out_param_Number}', simpleCombine(identity)],
    ],
    'out_param_Array(Any)': [
    ],

    'atom_filter': [
        /*['the ${out_param_Any} is ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['the ${out_param_Any} is equal to ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['the ${out_param_Any} is ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['the ${out_param_Any} is equal to ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['the ${out_param_Numeric} is greater than ${constant_Numeric}', simpleCombine(makeFilter('>'))],
        ['the ${out_param_Numeric} is at least ${constant_Numeric}', simpleCombine(makeFilter('>='))],
        ['the ${out_param_Numeric} is less than ${constant_Numeric}', simpleCombine(makeFilter('<'))],
        ['the ${out_param_Numeric} is at most ${constant_Numeric}', simpleCombine(makeFilter('<='))],*/
    ],

    'with_filter': [
        /*['with ${out_param_Any} equal to ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['with more ${out_param_Numeric} than ${constant_Numeric}', simpleCombine(makeFilter('>'))],
        ['with at least ${constant_Number} ${out_param_Number}', simpleCombine(flip(makeFilter('>=')))],

        ['with less ${out_param_Numeric} than ${constant_Numeric}', simpleCombine(makeFilter('<'))],
        ['with at most ${constant_Number} ${out_param_Numeric}', simpleCombine(flip(makeFilter('<=')))],
        ['with no ${out_param_Boolean}', simpleCombine((param) => new Ast.BooleanExpression.Atom(param.name, '==', Ast.Value.Boolean(false)))],
        ['with no ${out_param_Number}', simpleCombine((param) => new Ast.BooleanExpression.Atom(param.name, '==', Ast.Value.Number(0)))],*/
    ],

    thingpedia_table: [],
    thingpedia_stream: [],
    thingpedia_action: [],

    table: [
        ['${thingpedia_table}', simpleCombine(identity)],
        // TODO add filters
    ],
    complete_table: [
        ['${table}', checkIfComplete(simpleCombine(identity))],
        ['${table_join_replace_placeholder}', checkIfComplete(simpleCombine(identity))]
    ],

    timer: [
        ['every ${constant_Measure(ms)}', simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), interval, TIMER_SCHEMA))],
        ['every day at ${constant_Time}', simpleCombine((time) => new Ast.Stream.AtTimer(time, AT_TIMER_SCHEMA))],
    ],

    // this is autogenerated and depends on projection_*, which is also
    // autogenerated
    projection_Any: [],
    table_join_replace_placeholder: [],

    stream: [
        ['${thingpedia_stream}', checkIfComplete(simpleCombine(identity))],
        ['when ${complete_table} change', simpleCombine((table) => new Ast.Stream.Monitor(table, table.schema))],
        ['when ${projection_Any} changes', simpleCombine((table) => new Ast.Stream.Monitor(table, table.schema))],
        //['when the data in ${complete_table} changes', simpleCombine((table) => new Ast.Stream.Monitor(table, table.schema))],
        ['if ${complete_table} change', simpleCombine((table) => new Ast.Stream.Monitor(table, table.schema))],
        ['if ${projection_Any} changes', simpleCombine((table) => new Ast.Stream.Monitor(table, table.schema))],
        //['if the data in ${complete_table} changes', simpleCombine((table) => new Ast.Stream.Monitor(table, table.schema))],
        ['${timer}', simpleCombine(identity)]
    ],

    /*table_join: ['${table} then ${table}', simpleCombine((lhs, rhs) => new Ast.Table.Join(lhs, rhs, null))],
    stream_join: [],*/
    complete_action: [
        ['${thingpedia_action}', checkIfComplete(simpleCombine(identity))]
    ],
    action_replace_param_with_table: [],

    // commands with the traditional "get something from foo and do the X on bar" form
    // each rule embodies a different form of parameter passing

    // pp from get to do
    // observe that there is no rule of the form "${complete_get_command} then ${complete_action}"
    // this is because a sentence of the form "get X then do Y" makes sense only if X flows into Y
    'get_do_command': [
        ['get ${complete_table} and then ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))],

        // use X to do Y would be good sometimes but it gets confusing quickly
        //['use ${complete_table} to ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))]
    ],
    'when_do_rule': [
        // pp from when to do (optional)
        ['${stream} ${thingpedia_action}', checkConstants(simpleCombine((stream, action) => new Ast.Statement.Rule(stream, [action])))],
        // pp from when+get to do (required)
        ['${complete_when_get_stream} and then ${thingpedia_action}', checkIfIncomplete(checkConstants(simpleCombine((stream, action) => new Ast.Statement.Rule(stream, [action]))))]
    ],

    // pp from when to get (optional)
    'when_get_stream': [
        // FIXME: the schema is not quite right but it's ok because the stream is complete
        // and the table is what we care about
        ['${stream} get ${table}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['${stream} get ${projection_Any}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['${stream} show me ${table}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['${stream} show me ${projection_Any}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],
    ],
    'complete_when_get_stream': [
        ['${when_get_stream}', checkConstants(checkIfComplete(simpleCombine(identity)))]
    ],

    'complete_get_command': [
        ['${action_replace_param_with_table}', checkIfComplete(simpleCombine(identity))],
        ['show me ${complete_table}', simpleCombine((table) => new Ast.Statement.Command(table, [Generate.notifyAction()]))],
        ['get ${complete_table}', simpleCombine((table) => new Ast.Statement.Command(table, [Generate.notifyAction()]))],
        ['${get_do_command}', checkConstants(checkIfComplete(simpleCombine(identity)))]
    ],

    'root': [
        ['notify me ${stream}', checkConstants(checkIfComplete(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()])))))],
        ['${complete_action}', checkConstants(simpleCombine((action) => makeProgram(new Ast.Statement.Command(null, [action]))))],
        ['${complete_get_command}', checkConstants(simpleCombine(makeProgram))],
        ['what are ${complete_table}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],
        //['send me a message ${stream}', simpleCombine((stream) => new Ast.Statement.Rule(stream, [Generate.notifyAction()]))],
        //['send me a reminder ${timer}', simpleCombine((stream) => new Ast.Statement.Rule(stream, [Generate.notifyAction()]))],
        ['${complete_when_get_stream}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]))))],
        ['${when_do_rule}', checkConstants(checkIfComplete(simpleCombine(makeProgram)))],
        ['${stream} ${complete_get_command}', checkConstants(checkIfComplete(simpleCombine((stream, command) => makeProgram(combineStreamCommand(stream, command)))))]
        //['${rule}', combineParamPassing]
    ]
};

const allTypes = new Map;
const allInParams = new Map;
const allOutParams = new Set;

const _language = process.argv[3] || 'en';
const _schemaRetriever = new SchemaRetriever(new AdminThingpediaClient(_language));

function loadTemplateAsDeclaration(ex, decl) {
    decl.name = 'ex_' + ex.id;
    //console.log(Ast.prettyprint(program));

    // ignore optional input parameters
    // if you care about optional, write a lambda template
    // that fills in the optionals

    for (let pname in decl.value.schema.inReq) {
        let ptype = decl.value.schema.inReq[pname];
        if (!(ptype instanceof Type))
            throw new Error('wtf: ' + decl.value.schema);

        // work around bugs in the typechecker
        if (!pname.startsWith('p_')) {
            decl.value.schema.inReq['p_' + pname] = ptype;
            allInParams.set('p_' + pname + '+' + ptype, ptype);
        } else {
            allInParams.set(pname + '+' + ptype, ptype);
        }
        allTypes.set(String(ptype), ptype);
    }
    for (let pname in decl.value.schema.out) {
        let ptype = decl.value.schema.out[pname];
        allOutParams.add(pname + '+' + ptype);
        allTypes.set(String(ptype), ptype);
    }

    let chunks = split(ex.utterance, PARAM_REGEX);
    let grammarrule = [];

    for (let chunk of chunks) {
        if (chunk === '')
            continue;
        if (typeof chunk === 'string') {
            grammarrule.push(chunk.toLowerCase());
            continue;
        }

        let [match, param1, param2, opt] = chunk;
        if (match === '$$') {
            grammarrule.push('$');
            continue;
        }
        let param = param1 || param2;
        grammarrule.push(new Placeholder(param, opt));
    }

    GRAMMAR['thingpedia_' + decl.type].push([grammarrule, simpleCombine(() => decl.value)]);
}

function loadTemplate(ex) {
    return ThingTalk.Grammar.parseAndTypecheck(ex.target_code, _schemaRetriever, true).then((program) => {
        if (program.rules.length === 1 && program.declarations.length === 0)
            ; // ignore examples that consist of a rule (they are just dataset)
        else if (program.declarations.length === 1 && program.declarations.length === 1)
            loadTemplateAsDeclaration(ex, program.declarations[0]);
        else
            console.log('Invalid template ' + ex.id + ' (wrong number of declarations)');
    });
}

function loadMetadata(language) {
    return db.withClient((dbClient) =>
        db.selectAll(dbClient, `select * from example_utterances where type = 'thingpedia' and language = ? and is_base = 1 and target_code <> ''`, [language])
    ).then((examples) => {
        console.log('Loaded ' + examples.length + ' templates');
        return Promise.all(examples.map((ex) => loadTemplate(ex)));
    }).then(() => {
        for (let [typestr, type] of allTypes) {
            if (!GRAMMAR['constant_' + typestr]) {
                GRAMMAR['constant_' + typestr] = [];
                GRAMMAR['constant_Any'].push(['${constant_' + typestr + '}', simpleCombine(identity)]);
                if (type.isMeasure)
                    GRAMMAR['constant_Numeric'].push(['${constant_' + typestr + '}', simpleCombine(identity)]);
            }
            if (type.isEnum) {
                for (let entry of type.entries)
                    GRAMMAR['constant_' + typestr].push([clean(entry), simpleCombine(() => new Ast.Value.Enum(entry))]);
            } else if (type.isEntity) {
                GRAMMAR['constant_' + typestr] = makeConstantDerivations('GENERIC_ENTITY_' + type.type, type);
            }

            // don't access booleans or enums out arguments generically, as that rarely makes sense
            // (and when it does, you probably want a macro and maybe and edge trigger)
            if (type.isEnum || type.isBoolean)
                continue;

            if (!GRAMMAR['out_param_' + typestr]) {
                GRAMMAR['out_param_' + typestr] = [];
                GRAMMAR['the_out_param_' + typestr] = [
                    ['the ${out_param_' + typestr + '}', simpleCombine(identity)]
                ];
                GRAMMAR['out_param_Any'].push(['${out_param_' + typestr + '}', simpleCombine(identity)]);
                if (type.isMeasure)
                    GRAMMAR['out_param_Numeric'].push(['${out_param_' + typestr + '}', simpleCombine(identity)]);
            }
            GRAMMAR['projection_' + typestr] = [
                ['${the_out_param_' + typestr + '} of ${complete_table}', simpleCombine((outParam, table) => {
                    let name = outParam.name;
                    if (!table.schema.out[name] || !Type.isAssignable(table.schema.out[name], type))
                        return null;
                    let newSchema = table.schema.clone();
                    newSchema.out = { [name]: table.schema.out[name] };
                    return new Ast.Table.Projection(table, [name], newSchema);
                })],
                /*['the ${thingpedia_table}', simpleCombine((table) => {
                    let outParams = Object.keys(table.schema.out);
                    if (outParams.length !== 1 || Type.isAssignable(table.schema.out[outParams[0]], type))
                        return null;
                    return new Ast.Table.Projection(table, [outParams[0]], table.schema);
                })],*/
            ];
            GRAMMAR['projection_Any'].push(['${projection_' + typestr +'}', simpleCombine(identity)]);
        }

        for (let [key, ptype] of allInParams) {
            let [pname,] = key.split('+');

            GRAMMAR.thingpedia_table.push(['${thingpedia_table}${constant_' + ptype + '}', combineReplacePlaceholder(pname, (lhs, value) => {
                let ptype = lhs.schema.inReq[pname];
                if (!ptype || !Type.isAssignable(value.getType(), ptype))
                    return null;
                return betaReduceTable(lhs, pname, value);
            }, { isConstant: true })]);
            
            // don't parameter pass booleans or enums, as that rarely makes sense
            if (ptype.isEnum || ptype.isBoolean)
                continue;
            
            GRAMMAR.table_join_replace_placeholder.push(['${table}${projection_' + ptype + '}', combineReplacePlaceholder(pname, (into, projection) => {
                let intotype = into.schema.inReq[pname];
                if (!intotype || !Type.isAssignable(ptype, intotype))
                    return null;
                if (!projection.isProjection || projection.args.length !== 1)
                    throw new TypeError('???');
                let joinArg = projection.args[0];

                let [passign, etaReduced] = etaReduceTable(into, pname);
                if (passign === undefined) {
                    //console.error(`Ignored join between ${into} and ${projection}: cannot find parameter ${pname}`);
                    return null;
                }
                //console.log('passign: ' + passign + ', ptype: ' + ptype);

                // FIXME handle parameter name conflicts
                let newSchema = new Ast.FunctionDef('other',
                    [], // FIXME args
                    [], // FIXME types
                    {}, // FIXME index
                    {}, // inReq,
                    {}, // inOpt
                    {}, // out
                    '', // canonical
                    '', // confirmation
                    '', // confirmation_remote
                    [], // argcanonicals
                    [] // questions
                );
                Object.assign(newSchema.inReq, projection.schema.inReq);
                Object.assign(newSchema.inOpt, projection.schema.inOpt);
                Object.assign(newSchema.inReq, etaReduced.schema.inReq);
                Object.assign(newSchema.inOpt, etaReduced.schema.inOpt);
                Object.assign(newSchema.out, etaReduced.schema.out);
                delete newSchema.inReq[passign];

                return new Ast.Table.Join(projection.table, etaReduced, [new Ast.InputParam(passign, new Ast.Value.VarRef(joinArg))], newSchema);
            }, { isConstant: false })]);

            GRAMMAR.thingpedia_stream.push(['${thingpedia_stream}${constant_' + ptype + '}', combineReplacePlaceholder(pname, (lhs, value) => {
                let ptype = lhs.schema.inReq[pname];
                if (!ptype || !Type.isAssignable(value.getType(), ptype))
                    return null;
                return betaReduceStream(lhs, pname, value);
            }, { isConstant: true })]);
            GRAMMAR.thingpedia_action.push(['${thingpedia_action}${constant_' + ptype + '}', combineReplacePlaceholder(pname, (lhs, value) => {
                let ptype = lhs.schema.inReq[pname];
                if (!ptype || !Type.isAssignable(value.getType(), ptype))
                    return null;
                return betaReduceAction(lhs, pname, value);
            }, { isConstant: true })]);

            GRAMMAR.action_replace_param_with_table.push(['${thingpedia_action}${projection_' + ptype + '}', combineReplacePlaceholder(pname, (into, projection) => {
                let intotype = into.schema.inReq[pname];
                if (!intotype || !Type.isAssignable(ptype, intotype))
                    return null;
                if (!projection.isProjection || projection.args.length !== 1)
                    throw new TypeError('???');
                let joinArg = projection.args[0];
                let reduced = betaReduceAction(into, pname, Ast.Value.VarRef(joinArg));

                return new Ast.Statement.Command(projection.table, [reduced]);
            }, { isConstant: false })]);

            GRAMMAR.get_do_command.push(['${get_do_command}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, (command, joinArg) => {
                if (command.actions.length !== 1 || command.actions[0].selector.isBuiltin)
                    throw new TypeError('???');
                let actiontype = command.actions[0].schema.inReq[pname];
                if (!actiontype)
                    return null;
                let commandtype = command.table.schema.out[joinArg.name];
                if (!commandtype || !Type.isAssignable(commandtype, actiontype))
                    return null;

                let reduced = betaReduceAction(command.actions[0], pname, joinArg);
                return new Ast.Statement.Command(command.table, [reduced]);
            }, { isConstant: false })]);

            GRAMMAR.when_do_rule.push(['${when_do_rule}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, (rule, joinArg) => {
                if (rule.actions.length !== 1 || rule.actions[0].selector.isBuiltin)
                    throw new TypeError('???');
                let actiontype = rule.actions[0].schema.inReq[pname];
                if (!actiontype)
                    return null;
                let commandtype = rule.stream.schema.out[joinArg.name];
                if (!commandtype || !Type.isAssignable(commandtype, actiontype))
                    return null;

                let reduced = betaReduceAction(rule.actions[0], pname, joinArg);
                return new Ast.Statement.Rule(rule.stream, [reduced]);
            }, { isConstant: false })]);

            GRAMMAR.when_get_stream.push(['${when_get_stream}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, (stream, joinArg) => {
                if (!stream.isJoin)
                    throw new TypeError('???');
                let commandtype = stream.table.schema.inReq[pname];
                if (!commandtype)
                    return null;
                let streamtype = stream.stream.schema.out[joinArg.name];
                if (!streamtype || !Type.isAssignable(streamtype, commandtype))
                    return null;

                let [passign, etaReduced] = etaReduceTable(stream.table, pname);
                if (passign === undefined) {
                    //console.error(`Ignored join between ${into} and ${projection}: cannot find parameter ${pname}`);
                    return null;
                }
                //console.log('passign: ' + passign + ', ptype: ' + ptype);

                // FIXME handle parameter name conflicts
                let newSchema = new Ast.FunctionDef('other',
                    [], // FIXME args
                    [], // FIXME types
                    {}, // FIXME index
                    {}, // inReq,
                    {}, // inOpt
                    {}, // out
                    '', // canonical
                    '', // confirmation
                    '', // confirmation_remote
                    [], // argcanonicals
                    [] // questions
                );
                Object.assign(newSchema.inReq, stream.stream.schema.inReq);
                Object.assign(newSchema.inOpt, stream.stream.schema.inOpt);
                Object.assign(newSchema.inReq, etaReduced.schema.inReq);
                Object.assign(newSchema.inOpt, etaReduced.schema.inOpt);
                Object.assign(newSchema.out, etaReduced.schema.out);
                delete newSchema.inReq[passign];

                return new Ast.Stream.Join(stream.stream, etaReduced, [new Ast.InputParam(passign, joinArg)], newSchema);
            }, { isConstant: false })]);
        }
        for (let key of allOutParams) {
            let [pname,ptype] = key.split('+');
            if (ptype.startsWith('Enum(') || ptype === 'Boolean')
                continue;
            GRAMMAR['out_param_' + ptype].push([clean(pname), simpleCombine(() => new Ast.Value.VarRef(pname))]);
        }
    });
}

class NonTerminal {
    constructor(symbol) {
        this.symbol = symbol;
    }

    toString() {
        return `NonTerminal(${this.symbol})`;
    }
}

function preprocessGrammar() {
    for (let category in GRAMMAR) {
        let preprocessed = [];

        for (let rule of GRAMMAR[category]) {
            let [expansion, combiner] = rule;
            if (typeof expansion !== 'string') {
                if (!Array.isArray(expansion))
                    expansion = [expansion];
                preprocessed.push([expansion, combiner]);
                //console.log(`rule $${category} -> ${expansion.join('')}`);
                continue;
            }

            let splitexpansion = split(expansion, NON_TERM_REGEX);
            let newexpansion = [];
            for (let chunk of splitexpansion) {
                if (chunk === '')
                    continue;
                if (typeof chunk === 'string') {
                    newexpansion.push(chunk);
                    continue;
                }

                let [,param] = chunk;
                if (!GRAMMAR[param]) {
                    console.error('Invalid non-terminal ' + param);
                    GRAMMAR[param] = [];
                }

                newexpansion.push(new NonTerminal(param));
            }
            preprocessed.push([newexpansion, combiner]);

            //console.log(`rule $${category} -> ${newexpansion.join('')}`);
        }

        GRAMMAR[category] = preprocessed;
    }
}

function *expandRule(charts, depth, nonterminal, [expansion, combiner]) {
    const anyNonTerm = expansion.some((x) => x instanceof NonTerminal);

    if (!anyNonTerm) {
        if (depth === 0)
            yield combiner(expansion);
        return;
    }
    if (depth === 0)
        return;

    // for each piece of the expansion, we take turn and use
    // depth-1 of that, depth' < depth-1 of anything before, and
    // depth' <= depth-1 of anything after
    // terminals and placeholders are treated as having only
    // 0 productions
    //
    // this means the order in which we generate is
    // (d-1, 0, 0, ..., 0)
    // (d-1, 0, 0, ..., 1)
    // ...
    // (d-1, 0, 0, ..., d-1)
    // (d-1, 0, 0, ..., 1, 0)
    // ...
    // (d-1, 0, 0, ..., 1, d-1)
    // (d-1, 0, 0, ..., 2, 0)
    // ...
    // (d-1, 0, 0, ..., d-1, d-1)
    // ...
    // (d-1, d-1, d-1, ..., d-1)
    // (0, d-1, 0, ..., 0)
    // (0, d-1, 0, ..., 1)
    // ...
    // (0, d-1, 0, ..., d-1)
    // ...
    // (0, d-1, d-1, ..., d-1)
    // (1, d-1, 0, ..., 0)
    // ...
    // (1, d-1, d-1, ..., d-1)
    // ...
    // (d-2, d-1, 0, ..., 0)
    // ...
    // (d-2, d-1, d-1, ..., d-1)
    // ...
    // (d-2, 0, d-1, 0, ..., 0)
    // ...
    // (d-2, d-2, d-1, d-1, ..., d-1)
    // ...
    // (0, 0, ..., 0, d-1)
    // (0, 0, ..., 1, d-1)
    // ...
    // (0, 0, ..., d-2, d-1)
    // ...
    // (d-2, d-2, ..., d-2, d-1)
    //
    // This is a SUPEREXPONENTIAL algorithm
    // Keep the depth low if you want to live

    //console.log('expand $' + nonterminal + ' -> ' + expansion.join(''));

    let choices = [];
    for (let i = 0; i < expansion.length; i++) {
        let fixeddepth = depth-1;
        yield* (function *recursiveHelper(k) {
            if (k === expansion.length) {
                yield combiner(choices);
                return;
            }
            if (k === i) {
                if (expansion[k] instanceof NonTerminal) {
                    for (let candidate of charts[fixeddepth][expansion[k].symbol]) {
                        choices[k] = candidate;
                        yield* recursiveHelper(k+1);
                    }
                }
                return;
            }
            if (expansion[k] instanceof NonTerminal) {
                for (let j = 0; j <= (k > i ? depth-1 : depth-2); j++) {
                    for (let candidate of charts[j][expansion[k].symbol]) {
                        choices[k] = candidate;
                        yield* recursiveHelper(k+1);
                    }
                }
            } else {
                choices[k] = expansion[k];
                yield* recursiveHelper(k+1);
            }
        })(0);
    }
}

const MAX_DEPTH = 10;

function initChart() {
    let chart = {};
    for (let nonterminal in GRAMMAR)
        chart[nonterminal] = [];
    return chart;
}

const everything = new Set;

function *generate() {
    let charts = [];

    for (let i = 0; i <= MAX_DEPTH; i++) {
        console.log(`--- DEPTH ${i}`);
        charts[i] = initChart();

        for (let nonterminal in GRAMMAR) {
            for (let rule of GRAMMAR[nonterminal]) {
                for (let derivation of expandRule(charts, i, nonterminal, rule)) {
                    if (derivation === null)
                        continue;
                    let key = `$${nonterminal} -> ${derivation}`;
                    if (everything.has(key)) {
                        // FIXME we should not generate duplicates in the first place
                        //throw new Error('generated duplicate: ' + key);
                        continue;
                    }
                    everything.add(key);
                    //console.log(`$${nonterminal} -> ${derivation}`);
                    charts[i][nonterminal].push(derivation);
                }
            }
            if (charts[i][nonterminal].length > 0)
                console.log(`stats: size(charts[${i}][${nonterminal}]) = ${charts[i][nonterminal].length}`);
        }

        for (let root of charts[i].root)
            yield root;
        console.log();
    }
}

function main() {
    const outfile = process.argv[2] || 'output.tsv';
    const output = fs.createWriteStream(outfile);

    loadMetadata(_language).then(() => {
        preprocessGrammar();

        let i = 0;
        for (let derivation of generate()) {
            if (derivation.hasPlaceholders())
                throw new Error('Generated incomplete derivation');
            let sentence = derivation.toString();
            let program = derivation.value;
            let sequence;
            try {
                sequence = ThingTalk.NNSyntax.toNN(program, {});
                //ThingTalk.NNSyntax.fromNN(sequence, {});
            } catch(e) {
                console.error(sequence);
                console.error(Ast.prettyprint(program, true).trim());
                throw e;
            }

            output.write(i + '\t' + sentence + '\t' + sequence.join(' ') + '\n');
            i++;
        }
    }).then(() => output.end()).done();

    output.on('finish', () => process.exit());
}
main();
