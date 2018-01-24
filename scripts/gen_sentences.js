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
const assert = require('assert');
const Q = require('q');

const ThingTalk = require('thingtalk');
const Type = ThingTalk.Type;
const Ast = ThingTalk.Ast;
const Generate = ThingTalk.Generate;
const SchemaRetriever = ThingTalk.SchemaRetriever;
// HACK
const { optimizeFilter } = require('thingtalk/lib/optimize');

const AdminThingpediaClient = require('./deps/admin-thingpedia-client');
const db = require('../util/db');
// const i18n = require('../util/i18n');

class FastSchemaRetriever extends SchemaRetriever {
    getMeta(...args) {
        return super.getMeta(...args).then((schema) => {
            // we don't care about these, wipe them so we can clone faster
            // and use less RAM
            schema.questions = [];
            schema.canonical ='';
            schema.confirmation = '';
            return schema;
        });
    }
}

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
        this.value = new Ast.Value.VarRef(`__const_${symbol.replace(/[:._]/g, (match) => {
            if (match === '_')
                return '__';
            let code = match.charCodeAt(0);
            return code < 16 ? '_0' + code.toString(16) : '_' + code.toString(16);
        })}_${number}`);
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

        let newValue = semanticAction(this.value, derivation.value);
        if (newValue === null) {
            /*if (!derivation.value.isVarRef || !derivation.value.name.startsWith('__const'))
                return null;
            console.log('replace ' + name + ' in ' + this + ' with ' + derivation);
            console.log('values: ' + [this.value, derivation.value].join(' , '));*/
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
function *makeConstantDerivations(symbol, type, prefix = null) {
    for (let i = 0; i < MAX_CONSTANTS; i++) {
        let constant = new Constant(symbol, i, type);
        yield [constant, () => new Derivation(constant.value,
            prefix === null ? [constant] : [prefix, constant], {})];
    }
}

function removeInputParameter(schema, pname) {
    if (!schema.inReq[pname])
        return schema;
    let clone = schema.clone();
    delete clone.inReq[pname];
    return clone;
}

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
}

function findFunctionNameTable(table) {
    if (table.isInvocation)
        return [table.invocation.selector.kind + ':' + table.invocation.channel];

    if (isUnaryTableToTableOp(table))
        return findFunctionNameTable(table.table);

    if (isUnaryStreamToTableOp(table))
        return findFunctionNameStream(table.stream);

    if (table.isJoin)
        return findFunctionNameTable(table.lhs).concat(findFunctionNameTable(table.rhs));

    throw new TypeError();
}

function findFunctionNameStream(stream) {
    if (stream.isTimer || stream.isAtTimer)
        return 'timer';

    if (isUnaryStreamToStreamOp(stream))
        return findFunctionNameStream(stream.stream);

    if (isUnaryTableToStreamOp(stream))
        return findFunctionNameTable(stream.table);

    throw new TypeError();
}

// FIXME this should be in Thingpedia
const NON_MONITORABLE_FUNCTIONS = new Set([
    'org.thingpedia.builtin.thingengine.builtin:get_time',
    'org.thingpedia.builtin.thingengine.builtin:get_date',
    'org.thingpedia.builtin.thingengine.builtin:get_random_between',
    'com.giphy:get',
    'com.thecatapi:get',
    'com.xkcd:random_comic',
]);

function isMonitorable(table) {
    let functions = findFunctionNameTable(table);
    for (let f of functions) {
        if (NON_MONITORABLE_FUNCTIONS.has(f))
            return false;
    }
    return true;
}

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
        return new Ast.Stream.Monitor(reduced, stream.args, removeInputParameter(stream.schema, pname));
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
    if (!passign)
        return [undefined, clone];
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
            return new Ast.Value.VarRef(num.name + '__' + unit);
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
/*function maybeCheckConstants(combiner) {
    return function(children) {
        let result = combiner(children);
        if (result === null)
            return null;
        if (result.hasPlaceholders())
            return result;
        return doCheckConstants(result);
    };
}*/

function combineStreamCommand(stream, command) {
    if (command.table)
        return new Ast.Statement.Rule(new Ast.Stream.Join(stream, command.table, [], null), command.actions);
    else
        return new Ast.Statement.Rule(stream, command.actions);
}

function builtinSayAction(pname) {
    let selector = new Ast.Selector.Device('org.thingpedia.builtin.thingengine.builtin', null, null);
    let param = new Ast.InputParam('message', new Ast.Value.VarRef(pname));
    return new Ast.Invocation(selector, 'say', [param], null);
}

function checkFilter(table, filter) {
    if (!table.schema.out[filter.name])
        return false;

    let ptype = table.schema.out[filter.name];
    let vtype = ptype;
    if (filter.operator === 'contains') {
        if (!vtype.isArray)
            return false;
        vtype = ptype.elem;
    } else if (filter.operator === 'in_array') {
        vtype = ThingTalk.Type.Array(ptype);
    }
    if (!ThingTalk.Type.isAssignable(filter.value.getType(), vtype))
        return false;

    return true;
}

function addFilter(table, filter) {
    if (table.isProjection)
        return new Ast.Table.Projection(addFilter(table.table, filter), table.args, table.schema);

    if (table.isFilter) {
        let existing = table.filter;
        let newFilter = optimizeFilter(Ast.BooleanExpression.And([existing, filter]));
        return new Ast.Table.Filter(table, newFilter, table.schema);
    }

    // FIXME deal with the other table types (maybe)

    return new Ast.Table.Filter(table, filter, table.schema);
}

const GRAMMAR = {
    'constant_String': Array.from(makeConstantDerivations('QUOTED_STRING', Type.String)),
    'constant_Entity(tt:url)': Array.from(makeConstantDerivations('URL', Type.Entity('tt:url'))),
    'constant_Entity(tt:username)': Array.from(makeConstantDerivations('USERNAME', Type.Entity('tt:username'))),
    'constant_Entity(tt:hashtag)': Array.from(makeConstantDerivations('HASHTAG', Type.Entity('tt:hashtag'))),
    'constant_Entity(tt:phone_number)': Array.from(makeConstantDerivations('PHONE_NUMBER', Type.Entity('tt:phone_number'))),
    'constant_Entity(tt:email_address)': Array.from(makeConstantDerivations('EMAIL_ADDRESS', Type.Entity('tt:email_address'))),
    'constant_Entity(tt:picture)': [],

    // HACK: this info should be in Thingpedia
    'constant_Entity(com.google.drive:file_id)': [],
    'constant_Entity(com.twitter:id)': [],
    'constant_Entity(dogapi:image_id)': [],
    'constant_Entity(instagram:media_id)': [],
    'constant_Entity(omlet:feed_id)': [],
    'constant_Entity(com.thecatapi:image_id)': [],

    'constant_Number': [
        /*['one', simpleCombine(() => Ast.Value.Number(1))],
        ['zero', simpleCombine(() => Ast.Value.Number(0))],
        ['1', simpleCombine(() => Ast.Value.Number(1))],
        ['0', simpleCombine(() => Ast.Value.Number(0))]*/]
        .concat(Array.from(makeConstantDerivations('NUMBER', Type.Number))),
    'constant_Time': Array.from(makeConstantDerivations('TIME', Type.Number)),
    'constant_date_point': [
        ['now', simpleCombine(() => Ast.Value.Date(null, '+', null))],
        ['today', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'day'), '+', null))],
        ['yesterday', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'day'), '-', Ast.Value.Measure(1, 'day')))],
        ['tomorrow', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'day'), '-', Ast.Value.Measure(1, 'day')))],
        ['the end of the day', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'day'), '+', null))],
        ['the end of the week', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'week'), '+', null))],
        ['this week', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'week'), '+', null))],
        ['last week', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'week'), '-', Ast.Value.Measure(1, 'week')))]
    ],
    'constant_Date': [
        ['${constant_date_point}', simpleCombine(identity)],
        ['${constant_Measure(ms)} from now', simpleCombine((duration) => Ast.Value.Date(null, '+', duration))],
        ['${constant_Measure(ms)} ago', simpleCombine((duration) => Ast.Value.Date(null, '-', duration))],
        ['${constant_Measure(ms)} after ${constant_date_point}', simpleCombine((duration, point) => Ast.Value.Date(point.value, '+', duration))],
        ['${constant_Measure(ms)} before ${constant_date_point}', simpleCombine((duration, point) => Ast.Value.Date(point.value, '-', duration))]
    ],
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
    'constant_Measure(byte)': [
        // don't mess with kibibytes, mebibytes etc.
        ['${constant_Number} byte', simpleCombine(addUnit('byte'))],
        ['${constant_Number} kb', simpleCombine(addUnit('KB'))],
        ['${constant_Number} mb', simpleCombine(addUnit('MB'))],
        ['${constant_Number} gb', simpleCombine(addUnit('GB'))]
    ],
    'constant_Boolean': [
        /*['true', simpleCombine(() => Ast.Value.Boolean(true))],
        ['false', simpleCombine(() => Ast.Value.Boolean(false))],
        ['yes', simpleCombine(() => Ast.Value.Boolean(true))],
        ['no', simpleCombine(() => Ast.Value.Boolean(false))]*/
    ],
    'constant_Location': [
        ['here', simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('current_location')))],
        ['at home', simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('home')))],
        ['at work', simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('current_location')))]]
        .concat(Array.from(makeConstantDerivations('LOCATION', Type.Location, 'in '))),

    'constant_Any': [
        ['${constant_String}', simpleCombine(identity)],
        ['${constant_Entity(tt:url)}', simpleCombine(identity)],
        ['${constant_Entity(tt:picture)}', simpleCombine(identity)],
        ['${constant_Entity(tt:username)}', simpleCombine(identity)],
        ['${constant_Entity(tt:hashtag)}', simpleCombine(identity)],
        ['${constant_Entity(tt:phone_number)}', simpleCombine(identity)],
        ['${constant_Entity(tt:email_address)}', simpleCombine(identity)],
        ['${constant_Number}', simpleCombine(identity)],
        ['${constant_Time}', simpleCombine(identity)],
        ['${constant_Date}', simpleCombine(identity)],
        ['${constant_Measure(ms)}', simpleCombine(identity)],
        ['${constant_Measure(byte)}', simpleCombine(identity)],
        ['${constant_Boolean}', simpleCombine(identity)],
        ['${constant_Location}', simpleCombine(identity)],
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
        ['the ${out_param_Any} is ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['the ${out_param_Any} is equal to ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['the ${out_param_Any} is equal to ${constant_Any} or ${constant_Any}', simpleCombine((param, v1, v2) => {
            // param is a Value.VarRef
            //console.log('param: ' + param.name);
            if (!v1.getType().equals(v2.getType()))
                return null;
            return new Ast.BooleanExpression.Atom(param.name, 'in_array', Ast.Value.Array([v1, v2]));
        })],
        ['the ${out_param_Any} is either ${constant_Any} or ${constant_Any}', simpleCombine((param, v1, v2) => {
            // param is a Value.VarRef
            //console.log('param: ' + param.name);
            if (!v1.getType().equals(v2.getType()))
                return null;
            return new Ast.BooleanExpression.Atom(param.name, 'in_array', Ast.Value.Array([v1, v2]));
        })],
        ['the ${out_param_Numeric} is greater than ${constant_Numeric}', simpleCombine(makeFilter('>'))],
        ['the ${out_param_Numeric} is at least ${constant_Numeric}', simpleCombine(makeFilter('>='))],
        ['the ${out_param_Numeric} is less than ${constant_Numeric}', simpleCombine(makeFilter('<'))],
        ['the ${out_param_Numeric} is at most ${constant_Numeric}', simpleCombine(makeFilter('<='))],
        ['the ${out_param_Numeric} is between ${constant_Numeric} and ${constant_Numeric}', simpleCombine((param, v1, v2) => {
            if (!v1.getType().equals(v2.getType()))
                return null;
            return new Ast.BooleanExpression.And([
                Ast.BooleanExpression.Atom(param.name, '>=', v1),
                Ast.BooleanExpression.Atom(param.name, '<=', v2)
            ]);
        })],
        ['the ${out_param_Array(Any)} contains ${constant_Any}', simpleCombine(makeFilter('contains'))],
        ['the ${out_param_String} contains ${constant_String}', simpleCombine(makeFilter('=~'))],
        ['the ${out_param_String} starts with ${constant_String}', simpleCombine(makeFilter('starts_with'))],
        ['the ${out_param_String} ends with ${constant_String}', simpleCombine(makeFilter('ends_with'))],
        ['${constant_String} is in ${out_param_String}', simpleCombine(flip(makeFilter('=~')))]
    ],

    'with_filter': [
        ['${out_param_Any} equal to ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['${out_param_Numeric} higher than ${constant_Numeric}', simpleCombine(makeFilter('>'))],
        ['${out_param_Numeric} lower than ${constant_Numeric}', simpleCombine(makeFilter('<'))],
        ['higher ${out_param_Numeric} than ${constant_Numeric}', simpleCombine(makeFilter('>'))],
        ['lower ${out_param_Numeric} than ${constant_Numeric}', simpleCombine(makeFilter('<'))],

        //['with more ${out_param_Number} than ${constant_Number}', simpleCombine(makeFilter('>'))],
        //['with at least ${constant_Number} ${out_param_Number}', simpleCombine(flip(makeFilter('>=')))],

        //['with less ${out_param_Number} than ${constant_Number}', simpleCombine(makeFilter('<'))],
        //['with at most ${constant_Number} ${out_param_Number}', simpleCombine(flip(makeFilter('<=')))],
        ['no ${out_param_Number}    ', simpleCombine((param) => new Ast.BooleanExpression.Atom(param.name, '==', Ast.Value.Number(0)))],
    ],

    thingpedia_table: [],
    thingpedia_stream: [],
    thingpedia_action: [],

    complete_table: [
        ['${thingpedia_table}', checkIfComplete(simpleCombine(identity))],
        ['${table_join_replace_placeholder}', checkIfComplete(simpleCombine(identity))],

        ['${thingpedia_table} if ${atom_filter}', checkIfComplete(simpleCombine((table, filter) => {
            if (!checkFilter(table, filter))
                return null;
            return addFilter(table, filter);
        }))],
        ['${thingpedia_table} if ${atom_filter} and ${atom_filter}', checkIfComplete(simpleCombine((table, f1, f2) => {
            if (!checkFilter(table, f1) || !checkFilter(table, f2))
                return null;
            return addFilter(table, Ast.BooleanExpression.And([f1, f2]));
        }))],
        ['${thingpedia_table} with ${with_filter}', checkIfComplete(simpleCombine((table, filter) => {
            if (!checkFilter(table, filter))
                return null;
            return addFilter(table, filter);
        }))],
        ['${thingpedia_table} having ${with_filter}', checkIfComplete(simpleCombine((table, filter) => {
            if (!checkFilter(table, filter))
                return null;
            return addFilter(table, filter);
        }))],
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
        ['when ${complete_table} change', simpleCombine((table) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Stream.Monitor(table, null, table.schema);
        })],
        ['when ${projection_Any} changes', simpleCombine((table) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Stream.Monitor(table, null, table.schema);
        })],
        //['when the data in ${complete_table} changes', simpleCombine((table) => new Ast.Stream.Monitor(table, table.schema))],
        //['if ${complete_table} change', simpleCombine((table) => new Ast.Stream.Monitor(table, table.schema))],
        //['if ${projection_Any} changes', simpleCombine((table) => new Ast.Stream.Monitor(table, table.schema))],
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
        ['after getting ${complete_table} ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))],
        ['${thingpedia_action} after getting ${complete_table}', checkIfIncomplete(simpleCombine((action, table) => new Ast.Statement.Command(table, [action])))],

        // use X to do Y would be good sometimes but it gets confusing quickly
        ['use ${complete_table} to ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))]
    ],
    'when_do_rule': [
        // pp from when to do (optional)
        ['${stream} ${thingpedia_action}', checkConstants(simpleCombine((stream, action) => new Ast.Statement.Rule(stream, [action])))],
        ['${thingpedia_action} ${stream}', checkConstants(simpleCombine((action, stream) => new Ast.Statement.Rule(stream, [action])))],

        // pp from when to do (required)
        // this is because "monitor X and then Y" makes sense only if X flows into Y
        ['monitor ${complete_table} and then ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [action]);
        }))],
        ['monitor ${projection_Any} and then ${thingpedia_action}', checkIfIncomplete(simpleCombine((proj, action) => {
            if (!isMonitorable(proj))
                return null;
            return new Ast.Statement.Rule(new Ast.Stream.Monitor(proj.table, proj.args, proj.table.schema), [action]);
        }))],

        ['check for new ${complete_table} and then ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [action]);
        }))],
        ['${thingpedia_action} after checking for new ${complete_table}', checkIfIncomplete(simpleCombine((action, table) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [action]);
        }))],
    ],

    // pp from when to get (optional)
    'when_get_stream': [
        // FIXME: the schema is not quite right but it's ok because the stream is complete
        // and the table is what we care about
        ['${stream} get ${table}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['${stream} get ${projection_Any}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['${stream} show me ${table}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['${stream} show me ${projection_Any}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],

        ['get ${table} ${stream}', checkConstants(simpleCombine((table, stream) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['get ${projection_Any} ${stream}', checkConstants(simpleCombine((table, stream) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['show me ${table} ${stream}', checkConstants(simpleCombine((table, stream) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['show me ${projection_Any} ${stream}', checkConstants(simpleCombine((table, stream) => new Ast.Stream.Join(stream, table, [], table.schema)))],
    ],
    'complete_when_get_stream': [
        ['${when_get_stream}', checkConstants(checkIfComplete(simpleCombine(identity)))]
    ],

    'complete_get_do_command': [
        ['${action_replace_param_with_table}', checkIfComplete(simpleCombine(identity))],
        ['${get_do_command}', checkConstants(checkIfComplete(simpleCombine(identity)))]
    ],

    'root': [
        // when => notify
        ['notify me ${stream}', checkConstants(checkIfComplete(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()])))))],
        ['send me a message ${stream}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]))))],
        ['send me a reminder ${timer}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]))))],
        ['monitor ${complete_table}', checkConstants(simpleCombine((table) => {
            if (!isMonitorable(table))
                return null;
            return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, null), [Generate.notifyAction()]));
        }))],
        ['monitor ${projection_Any}', checkConstants(simpleCombine((proj) => {
            if (!isMonitorable(proj))
                return null;
            return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Monitor(proj.table, proj.args, null), [builtinSayAction(proj.args[0])]));
        }))],

        // now => get => notify
        ['show me ${complete_table}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],
        ['get ${complete_table}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],
        ['what are ${complete_table}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],

        // now => get => say(...)
        ['get ${projection_Any}', checkConstants(simpleCombine((proj) => makeProgram(new Ast.Statement.Command(proj.table, [builtinSayAction(proj.args[0])]))))],
        ['what is ${projection_Any}', checkConstants(simpleCombine((proj) => makeProgram(new Ast.Statement.Command(proj.table, [builtinSayAction(proj.args[0])]))))],

        // now => do
        ['${complete_action}', checkConstants(simpleCombine((action) => makeProgram(new Ast.Statement.Command(null, [action]))))],
        // now => get => do
        ['${complete_get_do_command}', checkConstants(simpleCombine(makeProgram))],

        // when join get => notify/say(...)
        ['${complete_when_get_stream}', checkConstants(simpleCombine((stream) => {
            assert(stream.isJoin);
            if (stream.table.isProjection)
                return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Join(stream.stream, stream.table.table, null), [builtinSayAction(stream.table.args[0])]));
            else
                return makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]));
        }))],

        // when => do
        ['${when_do_rule}', checkConstants(checkIfComplete(simpleCombine(makeProgram)))],

        // when => get => do
        ['${stream} ${complete_get_do_command}', checkConstants(checkIfComplete(simpleCombine((stream, command) => makeProgram(combineStreamCommand(stream, command)))))],
        ['${complete_get_do_command} ${stream}', checkConstants(checkIfComplete(simpleCombine((command, stream) => makeProgram(combineStreamCommand(stream, command)))))]
    ]
};

const allTypes = new Map;
const allInParams = new Map;
const allOutParams = new Set;

const _language = process.argv[3] || 'en';
const _schemaRetriever = new FastSchemaRetriever(new AdminThingpediaClient(_language));

function loadTemplateAsDeclaration(ex, decl) {
    decl.name = 'ex_' + ex.id;
    //console.log(Ast.prettyprint(program));

    // ignore builtin actions:
    // debug_log is not interesting, say is special and we handle differently, configure/discover are not
    // composable
    if (decl.type === 'action' && decl.value.selector.kind === 'org.thingpedia.builtin.thingengine.builtin')
        return;

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

    for (let pname in decl.args) {
        let ptype = decl.args[pname];
        if (!(pname in decl.value.schema.inReq)) {
            // somewhat of a hack, we declare the argument for the value,
            // because later we will muck with schema only
            decl.value.schema.inReq[pname] = ptype;
        }
        allInParams.set(pname, ptype);
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
    return Promise.resolve().then(() => ThingTalk.Grammar.parseAndTypecheck(ex.target_code, _schemaRetriever, true)).then((program) => {
        if (program.rules.length === 1 && program.declarations.length === 0)
            ; // ignore examples that consist of a rule (they are just dataset)
        else if (program.declarations.length === 1 && program.declarations.length === 1)
            loadTemplateAsDeclaration(ex, program.declarations[0]);
        else
            console.log('Invalid template ' + ex.id + ' (wrong number of declarations)');
    }).catch((e) => {
        console.error('Failed to load template ' + ex.id + ': ' + e.message);
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
                if (!type.isEnum && !type.isEntity && !type.isArray)
                    throw new Error('Missing definition for type ' + type);
                GRAMMAR['constant_' + typestr] = [];
                GRAMMAR['constant_Any'].push(['${constant_' + typestr + '}', simpleCombine(identity)]);
                if (type.isMeasure)
                    GRAMMAR['constant_Numeric'].push(['${constant_' + typestr + '}', simpleCombine(identity)]);

                if (type.isEnum) {
                    for (let entry of type.entries)
                        GRAMMAR['constant_' + typestr].push([clean(entry), simpleCombine(() => new Ast.Value.Enum(entry))]);
                } else if (type.isEntity) {
                    GRAMMAR['constant_' + typestr] = makeConstantDerivations('GENERIC_ENTITY_' + type.type, type);
                }
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
            console.log(pname + ' := ' + ptype);

            GRAMMAR.thingpedia_table.push(['${thingpedia_table}${constant_' + ptype + '}', combineReplacePlaceholder(pname, (lhs, value) => {
                let ptype = lhs.schema.inReq[pname];
                if (!ptype || !Type.isAssignable(value.getType(), ptype))
                    return null;
                return betaReduceTable(lhs, pname, value);
            }, { isConstant: true })]);

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

const MAX_DEPTH = parseInt(process.argv[4]) || 8;

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
            if (i === MAX_DEPTH && nonterminal !== 'root')
                continue;
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
                    //if (nonterminal === 'complete_table' || nonterminal === 'thingpedia_table')
                    //    console.log(`$${nonterminal} -> ${derivation}`);
                    charts[i][nonterminal].push(derivation);
                }
            }
            if (charts[i][nonterminal].length > 0)
                console.log(`stats: size(charts[${i}][${nonterminal}]) = ${charts[i][nonterminal].length}`);
        }

        for (let root of charts[i].root)
            yield root;
        charts[i].root = [];
        console.log();
    }
}

function asyncIterate(iterator, loop) {
    return Q().then(function minibatch() {
        for (let i = 0; i < 1000; i++) {
            let { value, done } = iterator.next();
            if (done)
                return Q();
            loop(value);
        }

        return Q.delay(10).then(minibatch);
    });
}

function main() {
    const outfile = process.argv[2] || 'output.tsv';
    const output = fs.createWriteStream(outfile);

    loadMetadata(_language).then(() => {
        preprocessGrammar();

        let i = 0;
        return asyncIterate(generate(), (derivation) => {
            /*if (derivation.hasPlaceholders())
                throw new Error('Generated incomplete derivation');*/
            let sentence = derivation.toString();
            let program = derivation.value;
            let sequence;
            try {
                sequence = ThingTalk.NNSyntax.toNN(program, {});
                //ThingTalk.NNSyntax.fromNN(sequence, {});
            } catch(e) {
                console.error(sequence);
                console.error(String(program));
                console.error(Ast.prettyprint(program, true).trim());
                throw e;
            }

            output.write(i + '\t' + sentence + '\t' + sequence.join(' ') + '\n');
            i++;
        });
    }).then(() => output.end()).done();

    output.on('finish', () => process.exit());
}
main();
