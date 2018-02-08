// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const fs = require('fs');
const assert = require('assert');
const Q = require('q');
const seedrandom = require('seedrandom');

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

const TURKING_MODE = false;

// FIXME this should be in Thingpedia
const NON_MONITORABLE_FUNCTIONS = new Set([
    'com.dropbox:open',
    'com.giphy:get',
    'com.imgflip:generate',
    'com.imgflip:list',
    'com.thecatapi:get',
    'com.xkcd:random_comic',
    'com.yandex.translate:detect_language',
    'com.yandex.translate:translate',
    'org.thingpedia.builtin.thingengine.builtin:get_date',
    'org.thingpedia.builtin.thingengine.builtin:get_random_between',
    'org.thingpedia.builtin.thingengine.builtin:get_time',
    'security-camera:get_snapshot',
    'security-camera:get_url',
    'uk.co.thedogapi:get',
]);

const SINGLE_RESULT_FUNCTIONS = new Set([
    'com.bodytrace.scale:get',
    'com.dropbox:get_space_usage',
    'com.dropbox:open',
    'com.giphy:get',
    'com.imgflip:generate',
    'com.linkedin:get_profile',
    'com.phdcomics:get_post',
    'com.thecatapi:get',
    'com.xkcd:get_comic',
    'com.xkcd:random_comic',
    'com.yahoo.finance:get_stock_div',
    'com.yahoo.finance:get_stock_quote',
    'com.yandex.translate:detect_language',
    'com.yandex.translate:translate',
    'edu.stanford.rakesh1.fitbit:getbody',
    'edu.stanford.rakesh1.fitbit:getsteps',
    'gov.nasa:apod',
    'gov.nasa:asteroid',
    'gov.nasa:rover',
    'org.thingpedia.builtin.thingengine.builtin:get_date',
    'org.thingpedia.builtin.thingengine.builtin:get_random_between',
    'org.thingpedia.builtin.thingengine.builtin:get_time',
    'org.thingpedia.builtin.thingengine.phone:get_gps',
    'org.thingpedia.weather:current',
    'org.thingpedia.weather:moon',
    'org.thingpedia.weather:sunrise',
    'security-camera:current_event',
    'security-camera:get_snapshot',
    'security-camera:get_url',
    'thermostat:get_humidity',
    'thermostat:get_hvac_state',
    'thermostat:get_temperature',
    'uk.co.thedogapi:get',
    'us.sportradar:mlb',
    'us.sportradar:nba',
    'us.sportradar:ncaafb',
    'us.sportradar:ncaambb',
    'us.sportradar:soccer_eu',
    'us.sportradar:soccer_us',
]);


const ARGUMENT_NAMES = {
    'updated': ['update time'],

    // FIXME update Thingpedia for this one (coming from get_random_between)
    'random': ['random number'],

    'picture_url': ['picture', 'image', 'photo'],

    'title': ['headline', 'title'],

    'file_name': ['file name', 'name'],
    'file_size': ['file size', 'size', 'disk usage'],
    // not even silei knows about mime types, so definitely no mime type here!
    'mime_type': ['file type', 'type'],
};

// FIXME pick this up from Thingpedia
const ID_TYPES = new Set([
    'Entity(com.twitter:id)',
    'Entity(com.google.drive:file_id)',
    'Entity(instagram:media_id)',
    'Entity(com.thecatapi:image_id)',
    'Entity(dogapi:image_id)',
    'Entity(com.gmail:email_id)',
    'Entity(com.gmail:thread_id)',
    'Entity(com.live.onedrive:file_id)',
    'Entity(gov.nasa:asteroid_id)',
    'Entity(com.youtube:channel_id)',
    'Entity(com.youtube:video_id)'
]);

const NON_CONSTANT_TYPES = new Set([
    'Entity(com.live.onedrive:user_id)',
    'Entity(omlet:feed_id)'
]);

const rng = seedrandom.alea('almond is awesome');
function coin(prob) {
    return rng() <= prob;
}
coin(1);
function uniform(array) {
    return array[Math.floor(rng() * array.length)];
}

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
const NON_TERM_REGEX = /\${(?:choice\(([^)]+)\)|([a-zA-Z0-9._:(),]+))}/;

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

const SAY_SCHEMA = new Ast.FunctionDef('other',
    ['message'], // args
    [Type.Any], // types
    { message: 0 }, // index
    { message: Type.Any }, // inReq
    {}, // inOpt
    {},
    'say', // canonical
    '', // confirmation
    '', // confirmation_remote
    ['message'], // argcanonicals
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
        this.value.constNumber = number;
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

    replacePlaceholder(name, derivation, semanticAction, { isConstant, throwIfMissing = false, allowEmptyPictureURL = false }) {
        let newValue;
        let isDerivation;
        if (!(derivation instanceof Derivation)) {
            newValue = semanticAction(this.value);
            isDerivation = false;
        } else {
            newValue = semanticAction(this.value, derivation.value);
            isDerivation = true;
        }

        if (newValue === null) {
            /*if (!derivation.value.isVarRef || !derivation.value.name.startsWith('__const'))
                return null;*/
            /*if (throwIfMissing && this.hasPlaceholder(name)) {
                console.log('replace ' + name + ' in ' + this + ' with ' + derivation);
                console.log('values: ' + [this.value, derivation.value].join(' , '));
                throw new TypeError('???');
            }*/
            return null;
        }
        let newSentence = [];
        let found = false;
        for (let child of this.sentence) {
            if (child instanceof Placeholder) {
                if (child.symbol === name) {
                    if (child.option === 'const' && !isConstant)
                        return null;
                    if (isDerivation)
                        newSentence.push(...derivation.sentence);
                    else
                        newSentence.push(derivation);
                    found = true;
                } else if (!found) {
                    // refuse to leave a placeholder empty in the middle
                    // this prevents creating duplicates

                    // HACK HACK HACK: unless the hole is "p_picture_url",
                    // because otherwise we will never fill both
                    // p_picture_url and p_caption
                    if (allowEmptyPictureURL && child.symbol === 'p_picture_url')
                        newSentence.push(child);
                    else
                        return null;
                } else {
                    newSentence.push(child);
                }
            } else {
                newSentence.push(child);
            }
        }
        if (!found) {
            /*if (name === 'p_picture_url')
                console.log('no placeholder ' + name + ', have ' + String(this.sentence));
            if (throwIfMissing)
                throw new TypeError('???');*/
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
function enableIfTurking(combiner) {
    if (!TURKING_MODE)
        return null;
    return combiner;
}
function disableIfTurking(combiner) {
    if (TURKING_MODE)
        return null;
    return combiner;
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

function isMonitorable(table) {
    let functions = findFunctionNameTable(table);
    for (let f of functions) {
        if (NON_MONITORABLE_FUNCTIONS.has(f))
            return false;
    }
    return true;
}

function isSingleResult(table) {
    let functions = findFunctionNameTable(table);
    for (let f of functions) {
        if (SINGLE_RESULT_FUNCTIONS.has(f))
            return true;
    }
    return false;
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
    if (stream.isTimer || stream.isAtTimer)
        throw new TypeError('Nothing to beta-reduce in a timer');
    if (stream.isMonitor) {
        let reduced = betaReduceTable(stream.table, pname, value);
        return new Ast.Stream.Monitor(reduced, stream.args, removeInputParameter(stream.schema, pname));
    }
    if (stream.isEdgeFilter) {
        let reduced = betaReduceStream(stream.stream, pname, value);
        return new Ast.Stream.EdgeFilter(reduced, betaReduceFilter(stream.filter, pname, value), removeInputParameter(stream.schema, pname));
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

function makeFilter(op, negate = false) {
    return function semanticAction(param, value) {
        // param is a Value.VarRef
        //console.log('param: ' + param.name);
        let vtype = value.getType();
        if (op === 'contains')
            vtype = Type.Array(vtype);
        if (!allOutParams.has(param.name + '+' + vtype))
            return null;

        let f = new Ast.BooleanExpression.Atom(param.name, op, value);
        if (negate)
            return new Ast.BooleanExpression.Not(f);
        else
            return f;
    };
}

function makeEdgeFilterStream(op) {
    return function semanticAction(proj, value) {
        let vtype = value.getType();

        let f = new Ast.BooleanExpression.Atom(proj.args[0], op, value);
        if (!checkFilter(proj.table, f))
            return null;
        if (!isMonitorable(proj))
            return null;

        return new Ast.Stream.EdgeFilter(new Ast.Stream.Monitor(proj.table, null, proj.table.schema), f, proj.table.schema);
    }
}

function addUnit(unit) {
    return (num) => {
        if (num.isVarRef) {
            let v = new Ast.Value.VarRef(num.name + '__' + unit);
            v.getType = () => Type.Measure(unit);
            return v;
        } else {
            return new Ast.Value.Measure(num.value, unit);
        }
    };
}

function checkIfComplete(combiner, topLevel = false) {
    return checkConstants((children) => {
        let result = combiner(children);
        if (result === null || result.hasPlaceholders())
            return null;
        else
            return result;
    }, topLevel);
}
function checkIfIncomplete(combiner) {
    return (children) => {
        let result = combiner(children);
        if (result === null || !result.hasPlaceholders())
            return null;
        else
            return result;
    };
}

function doCheckConstants(result, topLevel) {
    let constants = {};
    for (let piece of result.sentence) {
        if (!(piece instanceof Constant))
            continue;
        if (piece.symbol in constants) {
            if (piece.number !== constants[piece.symbol] + 1)
                return null;
        } else {
            if (topLevel && piece.number !== 0)
                return null;
        }
        constants[piece.symbol] = piece.number;
    }

    return result;
}

// check that there are no holes in the constants
// (for complete top-level statements)
function checkConstants(combiner, topLevel = true) {
    return function(children) {
        let result = combiner(children);
        if (result === null)
            return null;
        return doCheckConstants(result, topLevel);
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
        return new Ast.Statement.Rule(new Ast.Stream.Join(stream, command.table, [], command.table.schema), command.actions);
    else
        return new Ast.Statement.Rule(stream, command.actions);
}

function builtinSayAction(pname) {
    let selector = new Ast.Selector.Device('org.thingpedia.builtin.thingengine.builtin', null, null);
    if (pname) {
        let param = new Ast.InputParam('message', new Ast.Value.VarRef(pname));
        return new Ast.Invocation(selector, 'say', [param], SAY_SCHEMA);
    } else {
        return new Ast.Invocation(selector, 'say', [], SAY_SCHEMA);
    }
}

function checkFilter(table, filter) {
    if (filter.isNot)
        filter = filter.expr;

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
        // if we already have a filter, don't add a new complex filter
        if (!filter.isAtom && !(filter.isNot && filter.expr.isAtom))
             return null;

        let existing = table.filter;
        let atom = filter.isNot ? filter.expr : filter;
        // check that we don't create a non-sensical filter, eg.
        // p == X && p == Y, or p > X && p > Y
        let operands = existing.isAnd ? existing.operands : [existing];
        for (let operand of operands) {
            if (operand.isAtom && operand.name === atom.name &&
                (operand.operator === atom.operator ||
                 operand.operator === '==' ||
                 atom.operator === '==' ||
                 operand.operator === 'in_array' ||
                 atom.operator === 'in_array'))
                return null;
        }

        let newFilter = optimizeFilter(Ast.BooleanExpression.And([existing, filter]));
        return new Ast.Table.Filter(table.table, newFilter, table.schema);
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
    'constant_Entity(tt:path_name)': [
        ['${constant_String}', simpleCombine(identity)]
    ].concat(Array.from(makeConstantDerivations('PATH_NAME', Type.Entity('tt:path_name')))),
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
    'constant_Currency': Array.from(makeConstantDerivations('CURRENCY', Type.Currency)),
    'constant_Time': Array.from(makeConstantDerivations('TIME', Type.Time)),
    'constant_date_point': [
        ['now', simpleCombine(() => Ast.Value.Date(null, '+', null))],
        ['today', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'day'), '+', null))],
        ['yesterday', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'day'), '-', Ast.Value.Measure(1, 'day')))],
        ['tomorrow', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'day'), '-', Ast.Value.Measure(1, 'day'))))],
        ['the end of the day', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'day'), '+', null)))],
        ['the end of the week',  disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'week'), '+', null)))],
        ['this week', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'week'), '+', null))],
        ['last week', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'week'), '-', Ast.Value.Measure(1, 'week')))]
    ],
    'constant_Date': [
        ['${constant_date_point}', simpleCombine(identity)],
        ['${constant_Measure(ms)} from now', simpleCombine((duration) => Ast.Value.Date(null, '+', duration))],
        ['${constant_Measure(ms)} ago', simpleCombine((duration) => Ast.Value.Date(null, '-', duration))],
        ['${constant_Measure(ms)} after ${constant_date_point}', disableIfTurking(simpleCombine((duration, point) => Ast.Value.Date(point.value, '+', duration)))],
        ['${constant_Measure(ms)} before ${constant_date_point}',  disableIfTurking(simpleCombine((duration, point) => Ast.Value.Date(point.value, '-', duration)))]
        ]
        .concat(Array.from(makeConstantDerivations('DATE', Type.Date))),
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
        ['${constant_Number} byte', disableIfTurking(simpleCombine(addUnit('byte')))],
        ['${constant_Number} kb', simpleCombine(addUnit('KB'))],
        ['${constant_Number} mb', simpleCombine(addUnit('MB'))],
        ['${constant_Number} gb', simpleCombine(addUnit('GB'))],
        ['${constant_Number} tb', simpleCombine(addUnit('TB'))],
        ['${constant_Number} kilobytes', simpleCombine(addUnit('KB'))],
        ['${constant_Number} megabytes', simpleCombine(addUnit('MB'))],
        ['${constant_Number} gigabytes', simpleCombine(addUnit('GB'))],
        ['${constant_Number} terabytes', simpleCombine(addUnit('TB'))]
    ],
    'constant_Measure(kg)': [
        ['${constant_Number} grams', disableIfTurking(simpleCombine(addUnit('g')))],
        ['${constant_Number} kilograms', simpleCombine(addUnit('kg'))],
        ['${constant_Number} kg', simpleCombine(addUnit('kg'))],
        ['${constant_Number} pounds', simpleCombine(addUnit('lb'))],
        ['${constant_Number} lbs', simpleCombine(addUnit('lb'))],
        ['${constant_Number} ounces', disableIfTurking(simpleCombine(addUnit('oz')))],
        ['${constant_Number} oz', disableIfTurking(simpleCombine(addUnit('oz')))],
    ],
    'constant_Measure(C)': [
        ['${constant_Number} c', disableIfTurking(simpleCombine(addUnit('C')))],
        ['${constant_Number} centigrade', disableIfTurking(simpleCombine(addUnit('C')))],
        ['${constant_Number} f', simpleCombine(addUnit('F'))],
        ['${constant_Number} fahrenheit', simpleCombine(addUnit('F'))],
        ['${constant_Number} degrees', simpleCombine(addUnit('F'))],
    ],
    'constant_Measure(m)': [
        ['${constant_Number} m', simpleCombine(addUnit('m'))],
        ['${constant_Number} meters', simpleCombine(addUnit('m'))],
        ['${constant_Number} km', simpleCombine(addUnit('km'))],
        ['${constant_Number} kilometers', simpleCombine(addUnit('km'))],
        ['${constant_Number} ft', disableIfTurking(simpleCombine(addUnit('ft')))],
        ['${constant_Number} in', disableIfTurking(simpleCombine(addUnit('in')))],
        ['${constant_Number} inches', disableIfTurking(simpleCombine(addUnit('in')))],
        ['${constant_Number} cm', disableIfTurking(simpleCombine(addUnit('cm')))],
    ],
    'constant_Measure(mps)': [
        ['${constant_Number} mph', simpleCombine(addUnit('mph'))],
        ['${constant_Number} m/s', disableIfTurking(simpleCombine(addUnit('mps')))],
        ['${constant_Number} kph', simpleCombine(addUnit('kmph'))],
        ['${constant_Number} miles per hour', simpleCombine(addUnit('mph'))],
        ['${constant_Number} kilometers per hour', simpleCombine(addUnit('kmph'))],
        ['${constant_Number} km/h', simpleCombine(addUnit('kmph'))]
    ],
    'constant_Boolean': [
        /*['true', simpleCombine(() => Ast.Value.Boolean(true))],
        ['false', simpleCombine(() => Ast.Value.Boolean(false))],
        ['yes', simpleCombine(() => Ast.Value.Boolean(true))],
        ['no', simpleCombine(() => Ast.Value.Boolean(false))]*/
    ],
    'constant_Location': [
        ['here', simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('current_location')))],
        ['where i am now', simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('current_location')))],
        ['home', simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('home')))],
        ['work', simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('work')))]]
        .concat(Array.from(makeConstantDerivations('LOCATION', Type.Location))),

    'constant_Any': [
        ['${constant_String}', simpleCombine(identity)],
        ['${constant_Entity(tt:url)}', simpleCombine(identity)],
        ['${constant_Entity(tt:picture)}', simpleCombine(identity)],
        ['${constant_Entity(tt:username)}', simpleCombine(identity)],
        ['${constant_Entity(tt:hashtag)}', simpleCombine(identity)],
        ['${constant_Entity(tt:phone_number)}', simpleCombine(identity)],
        ['${constant_Entity(tt:email_address)}', simpleCombine(identity)],
        ['${constant_Entity(tt:path_name)}', simpleCombine(identity)],
        ['${constant_Number}', simpleCombine(identity)],
        ['${constant_Time}', simpleCombine(identity)],
        ['${constant_Date}', disableIfTurking(simpleCombine(identity))],
        ['${constant_Measure(ms)}', simpleCombine(identity)],
        ['${constant_Measure(byte)}', simpleCombine(identity)],
        ['${constant_Measure(mps)}', simpleCombine(identity)],
        ['${constant_Measure(m)}', simpleCombine(identity)],
        ['${constant_Measure(C)}', simpleCombine(identity)],
        ['${constant_Measure(kg)}', simpleCombine(identity)],
        ['${constant_Boolean}', simpleCombine(identity)],
        ['${constant_Location}', simpleCombine(identity)],
    ],
    'constant_Numeric': [
        ['${constant_Number}', simpleCombine(identity)],
        ['${constant_Currency}', simpleCombine(identity)],
        ['${constant_Measure(ms)}', simpleCombine(identity)],
        ['${constant_Measure(byte)}', simpleCombine(identity)],
        ['${constant_Measure(mps)}', simpleCombine(identity)],
        ['${constant_Measure(m)}', simpleCombine(identity)],
        ['${constant_Measure(C)}', simpleCombine(identity)],
        ['${constant_Measure(kg)}', simpleCombine(identity)],
    ],

    // out params nonterminals are automatically generated
    'out_param_Any': [
    ],
    'out_param_Numeric': [
    ],
    'out_param_Array(Any)': [
    ],

    'atom_filter': [
        ['the ${out_param_Any} ${choice(is|is exactly|is equal to)} ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['the ${out_param_Any} ${choice(is not|is n\'t|is different than)} ${constant_Any}', simpleCombine(makeFilter('==', true))],
        ['the ${out_param_Numeric} is ${choice(greater|higher|bigger|more)} than ${constant_Numeric}', simpleCombine(makeFilter('>'))],
        ['the ${out_param_Numeric} is ${choice(at least|not less than)} ${constant_Numeric}', simpleCombine(makeFilter('>='))],
        ['the ${out_param_Numeric} is ${choice(smaller|lower|less)} than ${constant_Numeric}', simpleCombine(makeFilter('<'))],
        ['the ${out_param_Numeric} is ${choice(at most|not more than)} ${constant_Numeric}', simpleCombine(makeFilter('<='))],
        ['the ${out_param_Date} is ${choice(after|later than)} ${constant_Date}', disableIfTurking(simpleCombine(makeFilter('>')))],
        ['the ${out_param_Date} is ${choice(before|earlier than)} ${constant_Date}', disableIfTurking(simpleCombine(makeFilter('<')))],

        // there are too few arrays, so keep both
        ['the ${out_param_Array(Any)} contain ${constant_Any}', simpleCombine(makeFilter('contains'))],
        ['the ${out_param_Array(Any)} do not contain ${constant_Any}', simpleCombine(makeFilter('contains', true))],
        ['the ${out_param_Array(Any)} include ${constant_Any}', simpleCombine(makeFilter('contains'))],
        ['the ${out_param_Array(Any)} do not include ${constant_Any}', simpleCombine(makeFilter('contains', true))],

        ['the ${out_param_String} ${choice(contains|includes)} ${constant_String}', simpleCombine(makeFilter('=~'))],
        ['the ${out_param_String} does not ${choice(contain|include)} ${constant_String}', simpleCombine(makeFilter('=~', true))],
        ['the ${out_param_String} ${choice(starts|begins)} with ${constant_String}', disableIfTurking(simpleCombine(makeFilter('starts_with')))],
        ['the ${out_param_String} does not ${choice(start|begin)} with ${constant_String}', disableIfTurking(simpleCombine(makeFilter('starts_with', true)))],
        ['the ${out_param_String} ${choice(ends|finishes)} with ${constant_String}', disableIfTurking(simpleCombine(makeFilter('ends_with')))],
        ['the ${out_param_String} does not ${choice(end|finish|terminate)} with ${constant_String}', disableIfTurking(simpleCombine(makeFilter('ends_with', true)))],
        ['${constant_String} is in the ${out_param_String}', simpleCombine(flip(makeFilter('=~')))],

        ['${range_filter}', disableIfTurking(simpleCombine(identity))],
        ['${either_filter}', disableIfTurking(simpleCombine(identity))]
    ],
    'edge_filter': [
        ['the ${out_param_Any} ${choice(becomes|becomes equal to)} ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['the ${out_param_Numeric} ${choice(is now greater than|becomes greater than|becomes higher than|goes above|increases above)} ${constant_Numeric}', simpleCombine(makeFilter('>'))],
        ['the ${out_param_Numeric} ${choice(is now smaller than|becomes smaller than|becomes lower than|goes below|decreases below)} ${constant_Numeric}', simpleCombine(makeFilter('<'))],
    ],

    'either_filter': [
        ['the ${out_param_Any} ${choice(is|is equal to|is one of|is either)} ${constant_Any} or ${constant_Any}', simpleCombine((param, v1, v2) => {
            // param is a Value.VarRef
            //console.log('param: ' + param.name);
            if (!v1.getType().equals(v2.getType()))
                return null;
            if (v1.equals(v2)) // can happen with constants (now, 0, 1, etc.)
                return null;
            if (v1.isVarRef && v1.constNumber !== undefined && v2.isVarRef && v2.constNumber !== undefined &&
                v1.constNumber + 1 !== v2.constNumber) // optimization: avoid CONST_X CONST_Y with X + 1 != Y earlier (before the NN catches it)
                return null;
            let vtype = v1.getType();
            if (vtype.isBoolean) // "is equal to true or false" does not make sense
                return null;
            if (!allOutParams.has(param.name + '+' + vtype))
                return null;
            return new Ast.BooleanExpression.Atom(param.name, 'in_array', Ast.Value.Array([v1, v2]));
        })],
        ['the ${out_param_Any} is ${choice(not|neither)} ${constant_Any} nor ${constant_Any}', simpleCombine((param, v1, v2) => {
            // param is a Value.VarRef
            //console.log('param: ' + param.name);
            if (!v1.getType().equals(v2.getType()))
                return null;
            if (v1.equals(v2)) // can happen with constants (now, 0, 1, etc.)
                return null;
            if (v1.isVarRef && v1.constNumber !== undefined && v2.isVarRef && v2.constNumber !== undefined &&
                v1.constNumber + 1 !== v2.constNumber) // optimization: avoid CONST_X CONST_Y with X + 1 != Y earlier (before the NN catches it)
                return null;
            let vtype = v1.getType();
            if (vtype.isBoolean) // "is neither true nor false" does not make sense
                return null;
            if (!allOutParams.has(param.name + '+' + vtype))
                return null;
            return new Ast.BooleanExpression.Not(new Ast.BooleanExpression.Atom(param.name, 'in_array', Ast.Value.Array([v1, v2])));
        })],
    ],
    'range_filter': [
        ['the ${out_param_Numeric} is between ${constant_Numeric} and ${constant_Numeric}', simpleCombine((param, v1, v2) => {
            if (!v1.getType().equals(v2.getType()))
                return null;
            if (v1.equals(v2)) // can happen with constants (now, 0, 1, etc.)
                return null;
            if (v1.isVarRef && v1.constNumber !== undefined && v2.isVarRef && v2.constNumber !== undefined &&
                v1.constNumber + 1 !== v2.constNumber) // optimization: avoid CONST_X CONST_Y with X + 1 != Y earlier (before the NN catches it)
                return null;
            return new Ast.BooleanExpression.And([
                Ast.BooleanExpression.Atom(param.name, '>=', v1),
                Ast.BooleanExpression.Atom(param.name, '<=', v2)
            ]);
        })],
        ['the ${out_param_Numeric} is in the range from ${constant_Numeric} to ${constant_Numeric}', simpleCombine((param, v1, v2) => {
            if (!v1.getType().equals(v2.getType()))
                return null;
            if (v1.equals(v2)) // can happen with constants (now, 0, 1, etc.)
                return null;
            if (v1.isVarRef && v1.constNumber !== undefined && v2.isVarRef && v2.constNumber !== undefined &&
                v1.constNumber + 1 !== v2.constNumber) // optimization: avoid CONST_X CONST_Y with X + 1 != Y earlier (before the NN catches it)
                return null;
            return new Ast.BooleanExpression.And([
                Ast.BooleanExpression.Atom(param.name, '>=', v1),
                Ast.BooleanExpression.Atom(param.name, '<=', v2)
            ]);
        })],
        ['the ${out_param_Date} is between ${constant_Date} and ${constant_Date}', simpleCombine((param, v1, v2) => {
            if (!v1.getType().equals(v2.getType()))
                return null;
            if (v1.equals(v2)) // can happen with constants (now, 0, 1, etc.)
                return null;
            if (v1.isVarRef && v1.constNumber !== undefined && v2.isVarRef && v2.constNumber !== undefined &&
                v1.constNumber + 1 !== v2.constNumber) // optimization: avoid CONST_X CONST_Y with X + 1 != Y earlier (before the NN catches it)
                return null;
            return new Ast.BooleanExpression.And([
                Ast.BooleanExpression.Atom(param.name, '>=', v1),
                Ast.BooleanExpression.Atom(param.name, '<=', v2)
            ]);
        })],
    ],

    'with_filter': [
        ['${out_param_Any} equal to ${constant_Any}', simpleCombine(makeFilter('=='))],
        ['${out_param_Numeric} ${choice(higher|larger|bigger)} than ${constant_Numeric}', simpleCombine(makeFilter('>'))],
        ['${out_param_Numeric} ${choice(smaller|lower)} than ${constant_Numeric}', simpleCombine(makeFilter('<'))],
        ['${choice(higher|larger|bigger)} ${out_param_Numeric} than ${constant_Numeric}', simpleCombine(makeFilter('>'))],
        ['${choice(smaller|lower)} ${out_param_Numeric} than ${constant_Numeric}', simpleCombine(makeFilter('<'))],
        ['${range_with_filter}', disableIfTurking(simpleCombine(identity))]
    ],
    'range_with_filter': [
        ['${out_param_Date} between ${constant_Date} and ${constant_Date}', simpleCombine((param, v1, v2) => {
            if (!v1.getType().equals(v2.getType()))
                return null;
            return new Ast.BooleanExpression.And([
                Ast.BooleanExpression.Atom(param.name, '>=', v1),
                Ast.BooleanExpression.Atom(param.name, '<=', v2)
            ]);
        })],
        ['${out_param_Numeric} between ${constant_Numeric} and ${constant_Numeric}', simpleCombine((param, v1, v2) => {
            if (!v1.getType().equals(v2.getType()))
                return null;
            return new Ast.BooleanExpression.And([
                Ast.BooleanExpression.Atom(param.name, '>=', v1),
                Ast.BooleanExpression.Atom(param.name, '<=', v2)
            ]);
        })],

        ['no ${out_param_Number}', simpleCombine((param) => new Ast.BooleanExpression.Atom(param.name, '==', Ast.Value.Number(0)))],
        ['zero ${out_param_Number}', simpleCombine((param) => new Ast.BooleanExpression.Atom(param.name, '==', Ast.Value.Number(0)))],
    ],

    thingpedia_table: [],
    thingpedia_stream: [],
    thingpedia_action: [],

    complete_table: [
        ['${thingpedia_table}', checkIfComplete(simpleCombine(identity))],
        ['${table_join_replace_placeholder}', checkIfComplete(simpleCombine(identity))],
    ],

    if_filtered_table: [
        ['${complete_table}', simpleCombine(identity)],
        ['${one_filter_table}', simpleCombine(identity)],
        ['${two_filter_table}', disableIfTurking(simpleCombine(identity))],
    ],

    one_filter_table: [
        ['${complete_table} if ${atom_filter}', checkConstants(simpleCombine((table, filter) => {
            if (!checkFilter(table, filter))
                return null;
            return addFilter(table, filter);
        }), false)],
    ],
    two_filter_table: [
        ['${one_filter_table} and ${atom_filter}', checkConstants(simpleCombine((table, filter) => {
            if (!checkFilter(table, filter))
                return null;
            return addFilter(table, filter);
        }), false)],
    ],
    with_filtered_table: [
        ['${complete_table}', simpleCombine(identity)],

        ['${complete_table} ${choice(with|having)} ${with_filter}', checkConstants(simpleCombine((table, filter) => {
            if (isSingleResult(table))
                return null;
            if (!checkFilter(table, filter))
                return null;
            return addFilter(table, filter);
        }), false)],
    ],

    timer: [
        ['every ${constant_Measure(ms)}', simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), interval, TIMER_SCHEMA))],
        ['once in ${constant_Measure(ms)}', simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), interval, TIMER_SCHEMA))],
        ['once a day', simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'day'), TIMER_SCHEMA))],
        ['once a month', simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'mon'), TIMER_SCHEMA))],
        ['once a week', simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'week'), TIMER_SCHEMA))],
        ['once an hour', simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'h'), TIMER_SCHEMA))],
        ['every day at ${constant_Time}', simpleCombine((time) => new Ast.Stream.AtTimer(time, AT_TIMER_SCHEMA))],
        ['daily at ${constant_Time}', simpleCombine((time) => new Ast.Stream.AtTimer(time, AT_TIMER_SCHEMA))],
    ],

    // this is autogenerated and depends on projection_*, which is also
    // autogenerated
    projection_Any: [],
    projection_Numeric: [],
    stream_projection_Any: [],
    table_join_replace_placeholder: [],

    edge_stream: [
        ['when the ${projection_Any} ${choice(becomes|becomes equal to)} ${constant_Any}', simpleCombine(makeEdgeFilterStream('=='))],
        ['when the ${projection_Numeric} ${choice(becomes greater than|becomes higher than|goes above|increases above)} ${constant_Numeric}', simpleCombine(makeEdgeFilterStream('>'))],
        ['when the ${projection_Numeric} ${choice(becomes smaller than|becomes lower than|goes below|decreases below)} ${constant_Numeric}', simpleCombine(makeEdgeFilterStream('<'))],
    ],

    stream: [
        ['${thingpedia_stream}', checkIfComplete(simpleCombine(identity))],
        ['${choice(when|if|in case|whenever|any time|should|anytime)} ${with_filtered_table} change', simpleCombine((table) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Stream.Monitor(table, null, table.schema);
        })],
        ['in case of ${choice(changes|variations|updates)} in ${with_filtered_table}', simpleCombine((table) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Stream.Monitor(table, null, table.schema);
        })],
        ['${choice(when|if|in case|whenever|any time|anytime)} ${projection_Any} changes', simpleCombine((proj) => {
            if (!isMonitorable(proj))
                return null;
            return new Ast.Stream.Monitor(proj.table, proj.args, proj.table.schema);
        })],
        ['${choice(when|if|in case|whenever|any time|should|anytime)} ${with_filtered_table} change and ${edge_filter}', simpleCombine((table, filter) => {
            if (!isMonitorable(table) || !checkFilter(table, filter))
                return null;
            return new Ast.Stream.EdgeFilter(new Ast.Stream.Monitor(table, null, table.schema), filter, table.schema);
        })],
        ['${edge_stream}', simpleCombine(identity)],
        ['${timer}', simpleCombine(identity)]
    ],

    action_replace_param_with_table: [],
    action_replace_param_with_stream: [],

    // commands with the traditional "get something from foo and do the X on bar" form
    // each rule embodies a different form of parameter passing

    // pp from get to do
    // observe that there is no rule of the form "${complete_get_command} then ${complete_action}"
    // this is because a sentence of the form "get X then do Y" makes sense only if X flows into Y
    'get_do_command': [
        ['${choice(get|take|retrieve)} ${if_filtered_table} ${choice(and then|then|,)} ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))],
        ['after ${choice(you get|taking|getting|retrieving)} ${with_filtered_table} ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))],
        ['${thingpedia_action} after ${choice(getting|taking|you get|you retrieve)} ${with_filtered_table}', checkIfIncomplete(simpleCombine((action, table) => new Ast.Statement.Command(table, [action])))],

        // use X to do Y would be good sometimes but it gets confusing quickly
        //['${choice(get|use)} ${with_filtered_table} to ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))]
    ],
    'when_do_rule': [
        // pp from when to do (optional)
        ['${stream} ${thingpedia_action}${choice(| .)}', checkConstants(simpleCombine((stream, action) => new Ast.Statement.Rule(stream, [action])))],
        ['${thingpedia_action} ${stream}${choice(| .)}', checkConstants(simpleCombine((action, stream) => new Ast.Statement.Rule(stream, [action])))],

        // pp from when to do (required)
        // this is because "monitor X and then Y" makes sense only if X flows into Y
        ['${choice(monitor|watch)} ${if_filtered_table} ${choice(and then|then)} ${thingpedia_action}${choice(| .)}', checkIfIncomplete(simpleCombine((table, action) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [action]);
        }))],
        ['${choice(monitor|watch)} ${projection_Any} ${choice(and then|then)} ${thingpedia_action}${choice(| .)}', checkIfIncomplete(simpleCombine((proj, action) => {
            if (!isMonitorable(proj))
                return null;
            return new Ast.Statement.Rule(new Ast.Stream.Monitor(proj.table, proj.args, proj.table.schema), [action]);
        }))],

        ['check for new ${complete_table} ${choice(and then|then)} ${thingpedia_action}${choice(| .)}', checkIfIncomplete(simpleCombine((table, action) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [action]);
        }))],
        ['${thingpedia_action} after checking for new ${complete_table}${choice(| .)}', checkIfIncomplete(simpleCombine((action, table) => {
            if (!isMonitorable(table))
                return null;
            return new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [action]);
        }))],
    ],
    'complete_when_do_rule': [
        ['${when_do_rule}', checkIfComplete(simpleCombine(identity), true)],
        ['${choice(automatically|continuously)} ${action_replace_param_with_stream}', checkIfComplete(simpleCombine(identity), true)],
    ],

    // pp from when to get (optional)
    'when_get_stream': [
        // NOTE: the schema is not quite right but it's ok because the stream is complete
        // and the table is what we care about
        ['${stream} ${choice(get|show me|give me|tell me|retrieve)} ${thingpedia_table}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['${stream} ${choice(get|show me|give me|tell me|retrieve)} ${choice(|what is )}${projection_Any}', checkConstants(simpleCombine((stream, table) => new Ast.Stream.Join(stream, table, [], table.schema)))],

        ['${choice(get|show me|give me|tell me|retrieve)} ${thingpedia_table} ${stream}', checkConstants(simpleCombine((table, stream) => new Ast.Stream.Join(stream, table, [], table.schema)))],
        ['${choice(get|show me|give me|tell me|retrieve)} ${projection_Any} ${stream}', checkConstants(simpleCombine((table, stream) => new Ast.Stream.Join(stream, table, [], table.schema)))],
    ],
    'complete_when_get_stream': [
        ['${when_get_stream}', checkIfComplete(simpleCombine(identity), true)]
    ],

    'complete_get_do_command': [
        ['${action_replace_param_with_table}', checkIfComplete(simpleCombine(identity))],
        ['${get_do_command}', checkIfComplete(simpleCombine(identity))]
    ],

    'when_get_do_rule': [
        ['${stream} ${complete_get_do_command}', checkIfComplete(simpleCombine((stream, command) => combineStreamCommand(stream, command)), true)],
        ['${complete_get_do_command} ${stream}', checkIfComplete(simpleCombine((command, stream) => combineStreamCommand(stream, command)), true)]
    ],

    'root': [
        // when => notify
        ['${choice(notify me|alert me|inform me|let me know|i get notified|i get alerted)} ${stream}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [stream.isTimer || stream.isAtTimer ? builtinSayAction() : Generate.notifyAction()]))))],
        ['send me ${choice(a message|an alert|a notification)} ${stream}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [stream.isTimer || stream.isAtTimer ? builtinSayAction() : Generate.notifyAction()]))))],
        ['send me a reminder ${timer}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [builtinSayAction()]))))],
        ['${choice(monitor|watch)} ${if_filtered_table}', checkConstants(simpleCombine((table) => {
            if (!isMonitorable(table))
                return null;
            return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [Generate.notifyAction()]));
        }))],
        ['${choice(monitor|watch)} ${projection_Any}', checkConstants(simpleCombine((proj) => {
            if (!isMonitorable(proj))
                return null;
            return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Monitor(proj.table, proj.args, proj.table.schema), [builtinSayAction(proj.args[0])]));
        }))],
        ['${choice(let me know|notify me)} ${choice(of|about)} ${choice(changes|updates)} in ${if_filtered_table}', checkConstants(simpleCombine((table) => {
            if (!isMonitorable(table))
                return null;
            return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [Generate.notifyAction()]));
        }))],
        ['${choice(let me know|notify me)} ${choice(of|about)} ${choice(changes|updates)} in ${projection_Any}', checkConstants(simpleCombine((proj) => {
            if (!isMonitorable(proj))
                return null;
            return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Monitor(proj.table, proj.args, proj.table.schema), [builtinSayAction(proj.args[0])]));
        }))],
        ['${choice(alert me|tell me|notify me|let me know)} ${choice(if|when)} ${atom_filter} in ${complete_table}', checkConstants(simpleCombine((filter, table) => {
            if (!isMonitorable(table) || !isSingleResult(table) || !checkFilter(table, filter))
                return null;
            table = addFilter(table, filter);
            if (!table)
                return null;
            return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [Generate.notifyAction()]));
        }))],
        ['${choice(alert me|tell me|notify me|let me know)} ${choice(if|when)} ${edge_filter} in ${complete_table}', checkConstants(simpleCombine((filter, table) => {
            if (!isMonitorable(table) || !isSingleResult(table) || !checkFilter(table, filter))
                return null;
            return makeProgram(new Ast.Statement.Rule(new Ast.Stream.EdgeFilter(new Ast.Stream.Monitor(table, null, table.schema), filter, table.schema), [Generate.notifyAction()]));
        }))],

        // now => get => notify
        ['${choice(tell me|give me|show me|get|present|retrieve|pull up)} ${if_filtered_table}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],
        ['${choice(list|enumerate)} ${with_filtered_table}', checkConstants(simpleCombine((table) => {
            if (isSingleResult(table))
                return null;
            return makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]));
        }))],
        ['${choice(search|find)} ${with_filtered_table}', checkConstants(simpleCombine((table) => {
            if (isSingleResult(table) || !table.isFilter)
                return null;
            return makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]));
        }))],
        ['what are ${with_filtered_table}${choice(| ?)}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],

        // now => get => say(...)
        // don't merge these, the output sizes are too small
        ['${choice(get|show me|give me|tell me|say)} ${projection_Any}', checkConstants(simpleCombine((proj) => makeProgram(new Ast.Statement.Command(proj.table, [builtinSayAction(proj.args[0])]))))],
        ['what is ${projection_Any}${choice(| ?)}', checkConstants(simpleCombine((proj) => makeProgram(new Ast.Statement.Command(proj.table, [builtinSayAction(proj.args[0])]))))],
        ['${choice(show me|tell me|say)} what is ${projection_Any}', checkConstants(simpleCombine((proj) => makeProgram(new Ast.Statement.Command(proj.table, [builtinSayAction(proj.args[0])]))))],
        ['who is ${projection_Entity(tt:username)}${choice(| ?)}', checkConstants(simpleCombine((proj) => makeProgram(new Ast.Statement.Command(proj.table, [builtinSayAction(proj.args[0])]))))],
        ['who is ${projection_Entity(tt:email_address)}${choice(| ?)}', checkConstants(simpleCombine((proj) => makeProgram(new Ast.Statement.Command(proj.table, [builtinSayAction(proj.args[0])]))))],
        ['${projection_Any}', checkConstants(simpleCombine((proj) => makeProgram(new Ast.Statement.Command(proj.table, [builtinSayAction(proj.args[0])]))))],

        // now => do
        ['${thingpedia_action}', checkIfComplete(simpleCombine((action) => makeProgram(new Ast.Statement.Command(null, [action]))), true)],
        // now => get => do
        ['${complete_get_do_command}', checkConstants(simpleCombine(makeProgram))],

        // when join get => notify/say(...)
        ['${complete_when_get_stream}', checkConstants(simpleCombine((stream) => {
            assert(stream.isJoin);
            if (stream.table.isProjection)
                return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Join(stream.stream, stream.table.table, stream.in_params, stream.schema), [builtinSayAction(stream.table.args[0])]));
            else
                return makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]));
        }))],

        // when => do
        ['${complete_when_do_rule}', checkConstants(simpleCombine(makeProgram))],

        // when => get => do
        ['${when_get_do_rule}', simpleCombine(makeProgram)]
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
        allInParams.set(pname + '+' + ptype, ptype);
        allTypes.set(String(ptype), ptype);
    }
    for (let pname in decl.value.schema.out) {
        let ptype = decl.value.schema.out[pname];
        allOutParams.add(pname + '+' + ptype);
        allTypes.set(String(ptype), ptype);
    }

    let chunks = split(ex.utterance.trim(), PARAM_REGEX);
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

                if (type.isEnum) {
                    for (let entry of type.entries)
                        GRAMMAR['constant_' + typestr].push([clean(entry), simpleCombine(() => new Ast.Value.Enum(entry))]);
                } else if (type.isEntity) {
                    if (!NON_CONSTANT_TYPES.has(typestr) && !ID_TYPES.has(typestr))
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
                if (type.isArray)
                    GRAMMAR['out_param_Array(Any)'].push(['${out_param_' + typestr + '}', simpleCombine(identity)]);
                else
                    GRAMMAR['out_param_Any'].push(['${out_param_' + typestr + '}', simpleCombine(identity)]);
                if (type.isMeasure || type.isNumber || type.isCurrency)
                    GRAMMAR['out_param_Numeric'].push(['${out_param_' + typestr + '}', simpleCombine(identity)]);
            }
            if (!ID_TYPES.has(typestr)) {
                GRAMMAR['projection_' + typestr] = [
                    ['${the_out_param_' + typestr + '} of ${complete_table}', simpleCombine((outParam, table) => {
                        let name = outParam.name;
                        if (!table.schema.out[name] || !Type.isAssignable(table.schema.out[name], type))
                            return null;
                        let newSchema = table.schema.clone();
                        newSchema.out = { [name]: table.schema.out[name] };
                        return new Ast.Table.Projection(table, [name], newSchema);
                    })],
                ];
            }
            if (ID_TYPES.has(typestr)) {
                GRAMMAR['single_projection_' + typestr] = [
                    ['${complete_table}', simpleCombine((table) => {
                        for (let pname in table.schema.out) {
                            if (table.schema.out[pname].equals(type))
                                return new Ast.Table.Projection(table, [pname], table.schema);
                        }
                        return null;
                    })]
                ];
            } else if (typestr === 'Entity(tt:picture)') {
                GRAMMAR['single_projection_' + typestr] = [
                    ['${complete_table}', simpleCombine((table) => {
                        if (!table.schema.out['picture_url'])
                            return null;
                        return new Ast.Table.Projection(table, ['picture_url'], table.schema);
                    })]
                ];
            } else if (typestr === 'String') {
                GRAMMAR['single_projection_' + typestr] = [
                    ['${complete_table}', simpleCombine((table) => {
                        let outParams = Object.keys(table.schema.out);
                        if (outParams.length === 1 && table.schema.out[outParams[0]].isString)
                            return new Ast.Table.Projection(table, [outParams[0]], table.schema);

                        for (let pname in table.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = table.schema.out[pname];
                            if (ID_TYPES.has(String(ptype)))
                                return null;
                        }
                        return new Ast.Table.Projection(table, ['$event'], table.schema);
                    })]
                ];
            } else {
                GRAMMAR['single_projection_' + typestr] = [
                    ['${complete_table}', simpleCombine((table) => {
                        let outParams = Object.keys(table.schema.out);
                        if (outParams.length !== 1 || !type.equals(table.schema.out[outParams[0]]))
                            return null;
                        return new Ast.Table.Projection(table, [outParams[0]], table.schema);
                    })]
                ];
            }
            if (!ID_TYPES.has(typestr)) {
                GRAMMAR['stream_projection_' + typestr] = [
                    ['${the_out_param_' + typestr + '} of new ${complete_table}', simpleCombine((outParam, table) => {
                        let name = outParam.name;
                        if (!table.schema.out[name] || !Type.isAssignable(table.schema.out[name], type))
                            return null;
                        if (!isMonitorable(table))
                            return null;
                        let stream = new Ast.Stream.Monitor(table, null, table.schema);
                        let newSchema = stream.schema.clone();
                        newSchema.out = { [name]: stream.schema.out[name] };
                        return new Ast.Stream.Projection(stream, [name], newSchema);
                    })],
                ];
            }
            if (ID_TYPES.has(typestr)) {
                GRAMMAR['single_stream_projection_' + typestr] = [
                    ['new ${complete_table}', simpleCombine((table) => {
                        if (!isMonitorable(table))
                            return null;
                        for (let pname in table.schema.out) {
                            if (table.schema.out[pname].equals(type))
                                return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), [pname], table.schema);
                        }
                        return null;
                    })]
                ];
            } else if (typestr === 'Entity(tt:picture)') {
                GRAMMAR['single_stream_projection_' + typestr] = [
                    ['new ${complete_table}', simpleCombine((table) => {
                        if (!table.schema.out['picture_url'])
                            return null;
                        if (!isMonitorable(table))
                            return null;
                        return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), ['picture_url'], table.schema);
                    })]
                ];
            } else if (typestr === 'String') {
                GRAMMAR['single_stream_projection_' + typestr] = [
                    ['new ${complete_table}', simpleCombine((table) => {
                        if (!isMonitorable(table))
                            return null;
                        let outParams = Object.keys(table.schema.out);
                        if (outParams.length === 1 && table.schema.out[outParams[0]].isString)
                            return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), [outParams[0]], table.schema);

                        for (let pname in table.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = table.schema.out[pname];
                            if (ID_TYPES.has(String(ptype)))
                                return null;
                        }
                        return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), ['$event'], table.schema);
                    })]
                ];
            } else {
                GRAMMAR['single_stream_projection_' + typestr] = [
                    ['new ${complete_table}', simpleCombine((table) => {
                        let outParams = Object.keys(table.schema.out);
                        if (outParams.length !== 1 || !type.equals(table.schema.out[outParams[0]]))
                            return null;
                        if (!isMonitorable(table))
                            return null;
                        return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), [outParams[0]], table.schema);
                    })]
                ];
            }
            if (!ID_TYPES.has(typestr))
                GRAMMAR['projection_Any'].push(['${projection_' + typestr +'}', simpleCombine(identity)]);
            if (type.isNumber || type.isMeasure || type.isCurrency)
                GRAMMAR['projection_Numeric'].push(['${projection_' + typestr +'}', simpleCombine(identity)]);
        }

        for (let [key, ptype] of allInParams) {
            let [pname,] = key.split('+');
            if (!pname.startsWith('p_'))
                continue;
            //console.log(pname + ' := ' + ptype + ' ( ' + key + ' )');

            GRAMMAR.thingpedia_table.push(['${thingpedia_table}${constant_' + ptype + '}', combineReplacePlaceholder(pname, (lhs, value) => {
                let ptype = lhs.schema.inReq[pname];
                if (!ptype || !Type.isAssignable(value.getType(), ptype))
                    return null;
                if (ptype.isEnum && ptype.entries.indexOf(value.toJS()) < 0)
                    return null;
                //if (pname === 'p_low')
                //    console.log('p_low := ' + ptype + ' / ' + value.getType());
                return betaReduceTable(lhs, pname, value);
            }, { isConstant: true, allowEmptyPictureURL: true })]);

            GRAMMAR.thingpedia_stream.push(['${thingpedia_stream}${constant_' + ptype + '}', combineReplacePlaceholder(pname, (lhs, value) => {
                let ptype = lhs.schema.inReq[pname];
                if (!ptype || !Type.isAssignable(value.getType(), ptype))
                    return null;
                if (ptype.isEnum && ptype.entries.indexOf(value.toJS()) < 0)
                    return null;
                return betaReduceStream(lhs, pname, value);
            }, { isConstant: true, allowEmptyPictureURL: true })]);
            GRAMMAR.thingpedia_action.push(['${thingpedia_action}${constant_' + ptype + '}', combineReplacePlaceholder(pname, (lhs, value) => {
                let ptype = lhs.schema.inReq[pname];
                if (!ptype || !Type.isAssignable(value.getType(), ptype))
                    return null;
                if (ptype.isEnum && ptype.entries.indexOf(value.toJS()) < 0)
                    return null;
                return betaReduceAction(lhs, pname, value);
            }, { isConstant: true, allowEmptyPictureURL: true })]);

            // don't parameter pass booleans or enums, as that rarely makes sense
            if (ptype.isEnum || ptype.isBoolean)
                continue;
            
            const tableJoinReplacePlaceholder = (into, projection) => {
                if (projection === null)
                    return null;
                let intotype = into.schema.inReq[pname];
                if (!intotype || !Type.isAssignable(ptype, intotype))
                    return null;
                if (!projection.isProjection || projection.args.length !== 1)
                    throw new TypeError('???');
                let joinArg = projection.args[0];
                if (joinArg === '$event' && ['p_body', 'p_message', 'p_caption', 'p_status'].indexOf(pname) < 0)
                    return null;

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

                let replacement = joinArg === '$event' ? new Ast.Value.Event(null) : new Ast.Value.VarRef(joinArg);
                return new Ast.Table.Join(projection.table, etaReduced, [new Ast.InputParam(passign, replacement)], newSchema);
            };

            if (!ID_TYPES.has(String(ptype)))
                GRAMMAR.table_join_replace_placeholder.push(['${thingpedia_table}${projection_' + ptype + '}', combineReplacePlaceholder(pname, tableJoinReplacePlaceholder, { isConstant: false })]);
            GRAMMAR.table_join_replace_placeholder.push(['${thingpedia_table}${single_projection_' + ptype + '}', combineReplacePlaceholder(pname, tableJoinReplacePlaceholder, { isConstant: false })]);

            const actionReplaceParamWithTable = (into, projection) => {
                if (projection === null)
                    return null;
                let intotype = into.schema.inReq[pname];
                if (!intotype || !Type.isAssignable(ptype, intotype))
                    return null;
                if (!projection.isProjection || !projection.table || projection.args.length !== 1)
                    throw new TypeError('???');
                let joinArg = projection.args[0];
                if (joinArg === '$event' && ['p_body', 'p_message', 'p_caption', 'p_status'].indexOf(pname) < 0)
                    return null;
                let replacement = joinArg === '$event' ? new Ast.Value.Event(null) : new Ast.Value.VarRef(joinArg);
                let reduced = betaReduceAction(into, pname, replacement);

                return new Ast.Statement.Command(projection.table, [reduced]);
            };

            if (!ID_TYPES.has(String(ptype)))
                GRAMMAR.action_replace_param_with_table.push(['${thingpedia_action}${projection_' + ptype + '}', combineReplacePlaceholder(pname, actionReplaceParamWithTable, { isConstant: false })]);
            GRAMMAR.action_replace_param_with_table.push(['${thingpedia_action}${single_projection_' + ptype + '}', combineReplacePlaceholder(pname, actionReplaceParamWithTable, { isConstant: false })]);

            const actionReplaceParamWithStream = (into, projection) => {
                if (projection === null)
                    return null;
                let intotype = into.schema.inReq[pname];
                if (!intotype || !Type.isAssignable(ptype, intotype))
                    return null;
                if (!projection.isProjection || projection.args.length !== 1)
                    throw new TypeError('???');
                let joinArg = projection.args[0];
                if (joinArg === '$event' && ['p_body', 'p_message', 'p_caption', 'p_status'].indexOf(pname) < 0)
                    return null;
                let replacement = joinArg === '$event' ? new Ast.Value.Event(null) : new Ast.Value.VarRef(joinArg);
                let reduced = betaReduceAction(into, pname, replacement);

                return new Ast.Statement.Rule(projection.stream, [reduced]);
            };

            if (!ID_TYPES.has(String(ptype)))
                GRAMMAR.action_replace_param_with_stream.push(['${thingpedia_action}${stream_projection_' + ptype + '}', combineReplacePlaceholder(pname, actionReplaceParamWithStream, { isConstant: false })]);
            GRAMMAR.action_replace_param_with_stream.push(['${thingpedia_action}${single_stream_projection_' + ptype + '}', combineReplacePlaceholder(pname, actionReplaceParamWithStream, { isConstant: false })]);

            const getDoCommand = (command, joinArg) => {
                //if (command.actions.length !== 1 || command.actions[0].selector.isBuiltin)
                //    throw new TypeError('???');
                let actiontype = command.actions[0].schema.inReq[pname];
                if (!actiontype)
                    return null;
                let commandtype = joinArg.isEvent ? Type.String : command.table.schema.out[joinArg.name];
                if (!commandtype || !Type.isAssignable(commandtype, actiontype))
                    return null;

                let reduced = betaReduceAction(command.actions[0], pname, joinArg);
                return new Ast.Statement.Command(command.table, [reduced]);
            };

            if (!TURKING_MODE && !ID_TYPES.has(String(ptype)))
                GRAMMAR.get_do_command.push(['${get_do_command}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, getDoCommand, { isConstant: false })]);
            if (ID_TYPES.has(String(ptype)) || pname === 'p_picture_url') {
                if (pname === 'p_picture_url') {
                    GRAMMAR.get_do_command.push(['${get_do_command}${choice(it|that|them)}', combineReplacePlaceholder(pname, (command) => getDoCommand(command, new Ast.Value.VarRef('picture_url')), { isConstant: false })]);
                } else {
                    GRAMMAR.get_do_command.push(['${get_do_command}${choice(it|that|them)}', combineReplacePlaceholder(pname, (command) => {
                        for (let joinArg in command.table.schema.out) {
                            if (command.table.schema.out[joinArg].equals(ptype))
                                return getDoCommand(command, new Ast.Value.VarRef(joinArg));
                        }
                        return null;
                    }, { isConstant: false })]);
                }
            } else if (ptype.isString && ['p_body', 'p_message', 'p_caption', 'p_status'].indexOf(pname) >= 0) {
                GRAMMAR.get_do_command.push(['${get_do_command}${choice(it|that|them)}', combineReplacePlaceholder(pname, (command) => {
                    for (let pname in command.table.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = command.table.schema.out[pname];
                            if (ID_TYPES.has(String(ptype)))
                                return null;
                    }
                    return getDoCommand(command, new Ast.Value.Event(null));
                }, { isConstant: false })]);
            }

            const whenDoRule = (rule, joinArg) => {
                //if (rule.actions.length !== 1 || rule.actions[0].selector.isBuiltin)
                //    throw new TypeError('???');
                let actiontype = rule.actions[0].schema.inReq[pname];
                if (!actiontype)
                    return null;
                let commandtype = joinArg.isEvent ? Type.String : rule.stream.schema.out[joinArg.name];
                if (!commandtype || !Type.isAssignable(commandtype, actiontype))
                    return null;
                if (joinArg.isEvent && (rule.stream.isTimer || rule.stream.isAtTimer))
                    return null;

                let reduced = betaReduceAction(rule.actions[0], pname, joinArg);
                return new Ast.Statement.Rule(rule.stream, [reduced]);
            };

            if (!TURKING_MODE && !ID_TYPES.has(String(ptype)))
                GRAMMAR.when_do_rule.push(['${when_do_rule}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, whenDoRule, { isConstant: false })]);
            if (ID_TYPES.has(String(ptype)) || pname === 'p_picture_url') {
                if (pname === 'p_picture_url') {
                    GRAMMAR.when_do_rule.push(['${when_do_rule}${choice(it|that|them)}', combineReplacePlaceholder(pname, (rule) => whenDoRule(rule,  new Ast.Value.VarRef('picture_url')), { isConstant: false })]);
                } else {
                    GRAMMAR.when_do_rule.push(['${when_do_rule}${choice(it|that|them)}', combineReplacePlaceholder(pname, (rule) => {
                        for (let joinArg in rule.stream.schema.out) {
                            if (rule.stream.schema.out[joinArg].equals(ptype))
                                return whenDoRule(rule, new Ast.Value.VarRef(joinArg));
                        }
                        return null;
                    }, { isConstant: false })]);
                }
            } else if (ptype.isString && ['p_body', 'p_message', 'p_caption', 'p_status'].indexOf(pname) >= 0) {
                GRAMMAR.when_do_rule.push(['${when_do_rule}${choice(it|that|them)}', combineReplacePlaceholder(pname, (rule) => {
                    for (let pname in rule.stream.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = rule.stream.schema.out[pname];
                            if (ID_TYPES.has(String(ptype)))
                                return null;
                    }
                    return whenDoRule(rule, new Ast.Value.Event(null));
                }, { isConstant: false })]);
            }

            const whenGetStream = (stream, joinArg) => {
                if (!stream.isJoin)
                    throw new TypeError('???');
                let commandtype = stream.table.schema.inReq[pname];
                if (!commandtype)
                    return null;
                let streamtype = joinArg.isEvent ? Type.String : stream.stream.schema.out[joinArg.name];
                if (!streamtype || !Type.isAssignable(streamtype, commandtype))
                    return null;
                if (joinArg.isEvent && (stream.stream.isTimer || stream.stream.isAtTimer))
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

                return new Ast.Stream.Join(stream.stream, etaReduced, stream.in_params.concat([new Ast.InputParam(passign, joinArg)]), newSchema);
            };

            if (!TURKING_MODE && !ID_TYPES.has(String(ptype)))
                GRAMMAR.when_get_stream.push(['${when_get_stream}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, whenGetStream, { isConstant: false })]);
            if (ID_TYPES.has(String(ptype)) || pname === 'p_picture_url') {
                if (pname === 'p_picture_url') {
                    GRAMMAR.when_get_stream.push(['${when_get_stream}${choice(it|that|them)}', combineReplacePlaceholder(pname, (stream) => whenGetStream(stream, new Ast.Value.VarRef('picture_url')), { isConstant: false })]);
                } else {
                    GRAMMAR.when_get_stream.push(['${when_get_stream}${choice(it|that|them)}', combineReplacePlaceholder(pname, (stream) => {
                        for (let joinArg in stream.stream.schema.out) {
                            if (stream.stream.schema.out[joinArg].equals(ptype))
                                return whenGetStream(stream, new Ast.Value.VarRef(joinArg));
                        }
                        return null;
                    }, { isConstant: false })]);
                }
            } else if (ptype.isString && ['p_body', 'p_message', 'p_caption', 'p_status'].indexOf(pname) >= 0) {
                GRAMMAR.when_get_stream.push(['${when_get_stream}${choice(it|that|them)}', combineReplacePlaceholder(pname, (stream) => {
                    for (let pname in stream.stream.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = stream.stream.schema.out[pname];
                            if (ID_TYPES.has(String(ptype)))
                                return null;
                    }
                    return whenGetStream(stream, new Ast.Value.Event(null));
                }, { isConstant: false })]);
            }
        }
        for (let key of allOutParams) {
            let [pname,ptype] = key.split('+');
            if (ptype.startsWith('Enum(') || ptype === 'Boolean')
                continue;

            let expansion;
            if (pname in ARGUMENT_NAMES)
                expansion = ARGUMENT_NAMES[pname];
            else
                expansion = [clean(pname)];
            for (let candidate of expansion)
                GRAMMAR['out_param_' + ptype].push([candidate, simpleCombine(() => new Ast.Value.VarRef(pname))]);
        }
    });
}

class NonTerminal {
    constructor(symbol) {
        this.symbol = symbol;
    }

    toString() {
        return `NT[${this.symbol}]`;
    }
}

class Choice {
    constructor(choices) {
        this.choices = choices;
    }

    choose() {
        return uniform(this.choices);
    }

    toString() {
        return `C[${this.choices.join('|')}]`;
    }
}

const _averagePruningFactor = {};
const _minDistanceFromRoot = {};

function computeDistanceFromRoot() {
    let queue = [];
    _minDistanceFromRoot.root = 0;
    queue.push(['root', 0]);

    while (queue.length > 0) {
        let [category, distance] = queue.shift();
        if (distance > _minDistanceFromRoot[category])
            continue;

        for (let rule of GRAMMAR[category]) {
            for (let expansion of rule[0]) {
                if (expansion instanceof NonTerminal) {
                    let existingDistance = _minDistanceFromRoot[expansion.symbol];
                    if (!(distance+1 >= existingDistance)) { // undefined/NaN-safe comparison
                        _minDistanceFromRoot[expansion.symbol] = distance+1;
                        queue.push([expansion.symbol, distance+1]);
                    }
                }
            }
        }
    }

    for (let category in GRAMMAR) {
        if (_minDistanceFromRoot[category] === undefined) {
            // this happens with autogenerated projection non-terminals of weird types
            // that cannot be parameter passed
            console.log(`nonterm NT[${category}] -> not reachable from root`);
        } else {
            console.log(`nonterm NT[${category}] -> ${_minDistanceFromRoot[category]} steps from root`);
        }
    }
}

function preprocessGrammar() {
    for (let category in GRAMMAR) {
        let preprocessed = [];
        let prunefactors = [];
        _averagePruningFactor[category] = prunefactors;

        let i = 0;
        for (let rule of GRAMMAR[category]) {
            let [expansion, combiner] = rule;
            if (combiner === null)
                continue;

            // initialize prune factor estimates to 0.2
            // so we don't start pruning until we have a good estimate
            prunefactors[i] = 0.2;
            i++;
            if (typeof expansion !== 'string') {
                if (!Array.isArray(expansion))
                    expansion = [expansion];
                preprocessed.push([expansion, combiner]);
                console.log(`rule NT[${category}] -> ${expansion.join('')}`);
                continue;
            }

            let splitexpansion = split(expansion, NON_TERM_REGEX);
            let newexpansion = [];
            for (let chunk of splitexpansion) {
                if (chunk === '')
                    continue;
                if (typeof chunk === 'string') {
                    if (chunk.indexOf('$') >= 0)
                        throw new Error('Invalid syntax for ' + expansion);
                    if (chunk !== chunk.toLowerCase())
                        throw new Error('Terminals must be lower-case in ' + expansion);
                    newexpansion.push(chunk);
                    continue;
                }

                let [,choice,param] = chunk;
                if (choice) {
                    let choices = choice.split('|');
                    newexpansion.push(new Choice(choices));
                } else {
                    if (!GRAMMAR[param])
                        throw new Error('Invalid non-terminal ' + param);

                    newexpansion.push(new NonTerminal(param));
                }
            }
            preprocessed.push([newexpansion, combiner]);

            console.log(`rule NT[${category}] -> ${newexpansion.join('')}`);
        }

        GRAMMAR[category] = preprocessed;
    }

    computeDistanceFromRoot();
}

const POWERS = [1, 1, 1, 1, 1];
for (let i = 5; i < 20; i++)
    POWERS[i] = 0.5 * POWERS[i-1];
const TARGET_GEN_SIZE = 200000;

function *expandRule(charts, depth, nonterminal, rulenumber, [expansion, combiner]) {
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

    // to avoid hitting exponential behavior too often, we tweak the above
    // algorithm to not go above maxdepth for all but one non-terminal,
    // and then cycle through which non-terminal is allowed to grow
    function computeWorstCaseGenSize(maxdepth) {
        let worstCaseGenSize = 0;
        for (let i = 0; i < expansion.length; i++) {
            let fixeddepth = depth-1;
            worstCaseGenSize += (function recursiveHelper(k) {
                if (k === expansion.length)
                    return 1;
                if (k === i) {
                    if (expansion[k] instanceof NonTerminal)
                        return charts[fixeddepth][expansion[k].symbol].length * recursiveHelper(k+1);
                    else
                        return 0;
                }
                if (expansion[k] instanceof NonTerminal) {
                    let sum = 0;
                    for (let j = 0; j <= (k > i ? maxdepth : maxdepth-1); j++)
                        sum += charts[j][expansion[k].symbol].length * recursiveHelper(k+1);
                    return sum;
                } else {
                    return recursiveHelper(k+1);
                }
            })(0);
        }
        return worstCaseGenSize;
    }


    // first compute how many things we expect to produce in the worst case
    let maxdepth = depth-1;
    let worstCaseGenSize = computeWorstCaseGenSize(maxdepth);
    if (worstCaseGenSize === 0)
        return;
        
    // prevent exponential behavior!
    while (worstCaseGenSize >= 50000000 && maxdepth >= 0) {
        console.log(`expand NT[${nonterminal}] -> ${expansion.join('')} : worst case ${worstCaseGenSize}, reducing max depth`);
        maxdepth--;
        worstCaseGenSize = computeWorstCaseGenSize(maxdepth);
    }
    if (maxdepth < 0 || worstCaseGenSize === 0)
        return;

    const estimatedPruneFactor = _averagePruningFactor[nonterminal][rulenumber];
    const estimatedGenSize = worstCaseGenSize * estimatedPruneFactor;
    //const targetGenSize = nonterminal === 'root' ? Infinity : TARGET_GEN_SIZE * POWERS[depth];
    const targetGenSize = TARGET_GEN_SIZE * POWERS[depth];

    console.log(`expand NT[${nonterminal}] -> ${expansion.join('')} : worst case ${worstCaseGenSize}, expect ${Math.round(estimatedGenSize)} (target ${targetGenSize})`);
    const now = Date.now();

    let coinProbability = Math.min(1, targetGenSize/estimatedGenSize);

    let choices = [];
    //let depths = [];
    let actualGenSize = 0;
    let prunedGenSize = 0;
    for (let i = 0; i < expansion.length; i++) {
        let fixeddepth = depth-1;
        yield* (function *recursiveHelper(k) {
            if (k === expansion.length) {
                //console.log('combine: ' + choices.join(' ++ '));
                //console.log('depths: ' + depths);
                if (!(coinProbability < 1) || coin(coinProbability)) {
                    let v = combiner(choices.map((c) => c instanceof Choice ? c.choose() : c));
                    if (v !== null) {
                        actualGenSize ++;
                        if (actualGenSize + prunedGenSize >= 1000 && actualGenSize / (actualGenSize + prunedGenSize) < 0.001 * estimatedPruneFactor) {
                            // this combiner is pruning so aggressively it's messing up our sampling
                            // disable it
                            coinProbability = 1;
                        }

                        yield v;
                    } else {
                        prunedGenSize ++;
                    }
                }
                return;
            }
            if (k === i) {
                if (expansion[k] instanceof NonTerminal) {
                    for (let candidate of charts[fixeddepth][expansion[k].symbol]) {
                        choices[k] = candidate;
                        //depths[k] = fixeddepth;
                        yield* recursiveHelper(k+1);
                    }
                }
                return;
            }
            if (expansion[k] instanceof NonTerminal) {
                for (let j = 0; j <= (k > i ? maxdepth : maxdepth-1); j++) {
                    for (let candidate of charts[j][expansion[k].symbol]) {
                        choices[k] = candidate;
                        //depths[k] = j;
                        yield* recursiveHelper(k+1);
                    }
                }
            } else {
                choices[k] = expansion[k];
                yield* recursiveHelper(k+1);
            }
        })(0);
    }

    //console.log('expand $' + nonterminal + ' -> ' + expansion.join('') + ' : actual ' + actualGenSize);

    const newEstimatedPruneFactor = actualGenSize / (actualGenSize + prunedGenSize);
    if (isNaN(newEstimatedPruneFactor))
        throw new TypeError('???');

    const elapsed = Date.now() - now;
    console.log(`expand NT[${nonterminal}] -> ${expansion.join('')} : emitted ${
        actualGenSize} (took ${(elapsed/1000).toFixed(2)} seconds, coin prob ${coinProbability}, pruning factor ${
            (newEstimatedPruneFactor * 100).toFixed(2)}%)`);

    const movingAverageOfPruneFactor = (0.01 * estimatedPruneFactor + newEstimatedPruneFactor) / (1.01);
    _averagePruningFactor[nonterminal][rulenumber] = movingAverageOfPruneFactor;
}

const MAX_DEPTH = process.argv[4] !== undefined ? parseInt(process.argv[4]) : 6;
if (isNaN(MAX_DEPTH))
    throw new Error('invalid max depth');

function initChart() {
    let chart = {};
    for (let nonterminal in GRAMMAR)
        chart[nonterminal] = [];
    return chart;
}

//const everything = new Set;

function *generate() {
    let charts = [];

    for (let i = 0; i <= MAX_DEPTH; i++) {
        console.log(`--- DEPTH ${i}`);
        charts[i] = initChart();

        for (let nonterminal in GRAMMAR) {
            const minDistance = _minDistanceFromRoot[nonterminal];
            if (minDistance === undefined || minDistance > MAX_DEPTH - i)
                continue;
            let j = 0;
            for (let rule of GRAMMAR[nonterminal]) {
                for (let derivation of expandRule(charts, i, nonterminal, j, rule)) {
                    if (derivation === null)
                        continue;
                    //let key = `$${nonterminal} -> ${derivation}`;
                    /*if (everything.has(key)) {
                        // FIXME we should not generate duplicates in the first place
                        throw new Error('generated duplicate: ' + key);
                        continue;
                    }*/
                    //everything.add(key);
                    //if (nonterminal === 'get_do_command')
                    //    console.log(`$${nonterminal} -> ${derivation}`);
                    charts[i][nonterminal].push(derivation);
                }
                j++;
            }
            if (charts[i][nonterminal].length > 0)
                console.log(`stats: size(charts[${i}][${nonterminal}]) = ${charts[i][nonterminal].length}`);
        }

        for (let root of charts[i].root)
            yield [i,root];
        charts[i].root = [];
        console.log();
    }
}

function asyncIterate(iterator, loop) {
    return Q().then(function minibatch() {
        for (let i = 0; i < 10000; i++) {
            let { value, done } = iterator.next();
            if (done)
                return Q();
            loop(value);
        }

        return Q.delay(10).then(minibatch);
    });
}

function postprocess(sentence) {
    return sentence.replace(/ new my /, ' my new ')
        .replace(/ new the /, ' the new ')
        .replace(/ new a /, ' a new ');
}

function main() {
    const outfile = process.argv[2] || 'output.tsv';
    const output = fs.createWriteStream(outfile);

    loadMetadata(_language).then(() => {
        preprocessGrammar();

        let i = 0;
        return asyncIterate(generate(), ([depth, derivation]) => {
            /*if (derivation.hasPlaceholders())
                throw new Error('Generated incomplete derivation');*/
            let sentence = derivation.toString();
            let program = derivation.value;
            let sequence;
            try {
                sequence = ThingTalk.NNSyntax.toNN(program, {});
                //ThingTalk.NNSyntax.fromNN(sequence, {});
            } catch(e) {
                console.error(sentence);
                console.error(String(program));
                console.error(Ast.prettyprint(program, true).trim());
                throw e;
            }

            let id = String(i);
            id = depth + '000000000'.substring(0,9-id.length) + id;
            output.write(id + '\t' + postprocess(sentence) + '\t' + sequence.join(' ') + '\n');
            i++;
        });
    }).then(() => output.end()).done();

    output.on('finish', () => process.exit());
}
main();
