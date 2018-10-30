// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;
const Type = ThingTalk.Type;
const Generate = ThingTalk.Generate;

const { clean } = require('../../../util/tokenize');

const { identity,
        flip,
        TIMER_SCHEMA,
        AT_TIMER_SCHEMA } = require('../utils');
const { makeConstantDerivations,
        checkIfComplete,
        checkIfIncomplete,
        checkConstants,
        simpleCombine,
        combineReplacePlaceholder,
        Derivation } = require('../grammar_lib');
const { makeStandardFunctions,
        makeFilter,
        makeEdgeFilterStream,
        makeProgram,
        makePolicy,
        hasGetPredicate,
        makeGetPredicate,
        checkFilter,
        checkNotSelfJoinStream,
        addFilter,
        tableToStream,
        combineStreamCommand,
        combineRemoteProgram,
        addUnit,
        replacePlaceholderWithConstant,
        betaReduceTable,
        betaReduceStream,
        betaReduceAction,
        tableJoinReplacePlaceholder,
        actionReplaceParamWithTable,
        actionReplaceParamWithStream,
        getDoCommand,
        whenDoRule,
        whenGetStream } = require('../ast_manip');

// FIXME this info should be in Thingpedia
// if there is only a single value, this is possible without changing the parameter
// name by adding a #_[canonical] annotation
//
// (quite possibly, we can rely on PPDB and maybe some heuristics to deal
// with synonyms like "picture"-"image"-"photo")
const ARGUMENT_NAMES = {
    'updated': ['update time'],
    'random': ['random number'],

    'picture_url': ['picture', 'image', 'photo'],

    'title': ['headline', 'title'],

    'file_name': ['file name', 'name'],
    'file_size': ['file size', 'size', 'disk usage'],
    // not even silei knows about mime types, so definitely no mime type here!
    'mime_type': ['file type', 'type'],
};

module.exports = class EnglishLanguage {
    constructor(standardSchemas, types, allParams, options) {
        function enableIfTurking(combiner) {
            if (!options.turkingMode)
                return null;
            return combiner;
        }
        function disableIfTurking(combiner) {
            if (options.turkingMode)
                return null;
            return combiner;
        }
        const allOutParams = allParams.out;
        this._allParams = allParams;
        this._types = types;
        this._options = options;

        const { builtinSayAction, locationGetPredicate, timeGetPredicate } = makeStandardFunctions(standardSchemas);

        this.grammar = {
            'constant_String': Array.from(makeConstantDerivations('QUOTED_STRING', Type.String)),
            'constant_Entity(tt:url)': Array.from(makeConstantDerivations('URL', Type.Entity('tt:url'))),
            'constant_Entity(tt:username)': Array.from(makeConstantDerivations('USERNAME', Type.Entity('tt:username'))),
            'constant_Entity(tt:contact_name)': Array.from(makeConstantDerivations('USERNAME', Type.Entity('tt:contact_name'))),
            'constant_Entity(tt:hashtag)': Array.from(makeConstantDerivations('HASHTAG', Type.Entity('tt:hashtag'))),
            'constant_Entity(tt:phone_number)': Array.from(makeConstantDerivations('PHONE_NUMBER', Type.Entity('tt:phone_number'))),
            'constant_Entity(tt:email_address)': Array.from(makeConstantDerivations('EMAIL_ADDRESS', Type.Entity('tt:email_address'))),
            'constant_Entity(tt:path_name)': [
                ['${constant_String}', simpleCombine(identity)]
            ].concat(Array.from(makeConstantDerivations('PATH_NAME', Type.Entity('tt:path_name')))),
            'constant_Entity(tt:picture)': [],
            'constant_Entity(tt:function)': [],
            'constant_Entity(tt:program)': [],
            'constant_Entity(tt:device)': [],

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
                ['tomorrow', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'day'), '+', null)))],
                ['the end of the day', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'day'), '+', null)))],
                ['the end of the week',  disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'week'), '+', null)))],
                ['this week', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'week'), '+', null))],
                ['last week', simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'week'), '-', Ast.Value.Measure(1, 'week')))],
                ['this month', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'mon'), '+', null)))],
                ['this year', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('start_of', 'year'), '+', null)))],
                ['next month', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'mon'), '+', null)))],
                ['next year', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'year'), '+', null)))],
                ['last month', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'mon'), '-', Ast.Value.Measure(1, 'mon'))))],
                ['last year', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(Ast.DateEdge('end_of', 'year'), '-', Ast.Value.Measure(1, 'year'))))],
            ],
            'constant_Date': [
                ['${constant_date_point}', simpleCombine(identity)],
                ['${constant_Measure(ms)} from now', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(null, '+', duration)))],
                ['${constant_Measure(ms)} ago', disableIfTurking(simpleCombine((duration) => Ast.Value.Date(null, '-', duration)))],
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
                ['${constant_Number} mi', simpleCombine(addUnit('mi'))],
                ['${constant_Number} miles', simpleCombine(addUnit('mi'))],
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
                ['where i am now', disableIfTurking(simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('current_location'))))],
                ['home', simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('home')))],
                ['work', simpleCombine(() => Ast.Value.Location(Ast.Location.Relative('work')))]]
                .concat(Array.from(makeConstantDerivations('LOCATION', Type.Location))),

            // this is used for equality filtering, so disableIfTurking anything that is weird when equality compared
            'constant_Any': [
                ['${constant_String}', simpleCombine(identity)],
                ['${constant_Entity(tt:url)}', disableIfTurking(simpleCombine(identity))],
                ['${constant_Entity(tt:picture)}', simpleCombine(identity)],
                ['${constant_Entity(tt:username)}', simpleCombine(identity)],
                ['${constant_Entity(tt:hashtag)}', simpleCombine(identity)],
                ['${constant_Entity(tt:phone_number)}', simpleCombine(identity)],
                ['${constant_Entity(tt:email_address)}', simpleCombine(identity)],
                ['${constant_Entity(tt:path_name)}', simpleCombine(identity)],
                ['${constant_Number}', simpleCombine(identity)],
                ['${constant_Time}', simpleCombine(identity)],
                ['${constant_Date}', disableIfTurking(simpleCombine(identity))],
                ['${constant_Measure(ms)}', disableIfTurking(simpleCombine(identity))],
                ['${constant_Measure(byte)}', disableIfTurking(simpleCombine(identity))],
                ['${constant_Measure(mps)}', disableIfTurking(simpleCombine(identity))],
                ['${constant_Measure(m)}', disableIfTurking(simpleCombine(identity))],
                ['${constant_Measure(C)}', disableIfTurking(simpleCombine(identity))],
                ['${constant_Measure(kg)}', disableIfTurking(simpleCombine(identity))],
                ['${constant_Boolean}', simpleCombine(identity)],
                ['${constant_Location}', simpleCombine(identity)],
                ['${constant_Currency}', simpleCombine(identity)],
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
            'the_out_param_Numeric': [
                ['the ${out_param_Numeric}', simpleCombine(identity)],
                ['its ${out_param_Numeric}', disableIfTurking(simpleCombine(identity))],
                ['their ${out_param_Numeric}', disableIfTurking(simpleCombine(identity))]
            ],
            'the_out_param_Array(Any)': [
                ['the ${out_param_Array(Any)}', simpleCombine(identity)],
                ['its ${out_param_Array(Any)}', disableIfTurking(simpleCombine(identity))],
                ['their ${out_param_Array(Any)}', disableIfTurking(simpleCombine(identity))]
            ],

            // empty defaults for certain parameter types in case we don't have devices with
            // those parameter
            'projection_Entity(tt:username)': [],
            'projection_Entity(tt:email_address)': [],

            'atom_filter': [
                ['before ${constant_Time}', simpleCombine((t1) => timeGetPredicate(null, t1))],
                ['after ${constant_Time}', simpleCombine((t2) => timeGetPredicate(t2, null))],
                ['between ${constant_Time} and ${constant_Time}', simpleCombine((t1, t2) => timeGetPredicate(t1, t2))],
                ['my location is ${constant_Location}', simpleCombine((loc) => locationGetPredicate(loc))],
                ['my location is not ${constant_Location}', simpleCombine((loc) => locationGetPredicate(loc, true))],
                ['i am at ${constant_Location}', simpleCombine((loc) => locationGetPredicate(loc))],
                ['i am not at ${constant_Location}', simpleCombine((loc) => locationGetPredicate(loc, true))],
                ['the ${projection_Any} ${choice(is|is exactly|is equal to)} ${constant_Any}', simpleCombine(makeGetPredicate('=='))],
                ['the ${projection_Any} ${choice(is not|is n\'t|is different than)} ${constant_Any}', simpleCombine(makeGetPredicate('==', true))],

                ['the ${out_param_Any} ${choice(is|is exactly|is equal to)} ${constant_Any}', simpleCombine(makeFilter('==', allOutParams))],
                ['the ${out_param_Any} ${choice(is not|is n\'t|is different than)} ${constant_Any}', simpleCombine(makeFilter('==', allOutParams, true))],
                ['${the_out_param_Numeric} is ${choice(greater|higher|bigger|more|at least|not less than)} ${constant_Numeric}', simpleCombine(makeFilter('>=', allOutParams))],
                ['${the_out_param_Numeric} is ${choice(smaller|lower|less|at most|not more than)} ${constant_Numeric}', simpleCombine(makeFilter('<=', allOutParams))],
                ['${the_out_param_Date} is ${choice(after|later than)} ${constant_Date}', disableIfTurking(simpleCombine(makeFilter('>=', allOutParams)))],
                ['${the_out_param_Date} is ${choice(before|earlier than)} ${constant_Date}', disableIfTurking(simpleCombine(makeFilter('<=', allOutParams)))],

                // there are too few arrays, so keep both
                ['${the_out_param_Array(Any)} contain ${constant_Any}', simpleCombine(makeFilter('contains', allOutParams))],
                ['${the_out_param_Array(Any)} do not contain ${constant_Any}', simpleCombine(makeFilter('contains', allOutParams, true))],
                ['${the_out_param_Array(Any)} include ${constant_Any}', simpleCombine(makeFilter('contains', allOutParams))],
                ['${the_out_param_Array(Any)} do not include ${constant_Any}', simpleCombine(makeFilter('contains', allOutParams, true))],

                ['${the_out_param_String} ${choice(contains|includes)} ${constant_String}', simpleCombine(makeFilter('=~', allOutParams))],
                ['${the_out_param_String} does not ${choice(contain|include)} ${constant_String}', simpleCombine(makeFilter('=~', allOutParams, true))],
                //['${the_out_param_String} ${choice(starts|begins)} with ${constant_String}', disableIfTurking(simpleCombine(makeFilter('starts_with', allOutParams)))],
                //['${the_out_param_String} does not ${choice(start|begin)} with ${constant_String}', disableIfTurking(simpleCombine(makeFilter('starts_with', allOutParams, true)))],
                //['${the_out_param_String} ${choice(ends|finishes)} with ${constant_String}', disableIfTurking(simpleCombine(makeFilter('ends_with', allOutParams)))],
                //['${the_out_param_String} does not ${choice(end|finish|terminate)} with ${constant_String}', disableIfTurking(simpleCombine(makeFilter('ends_with', allOutParams, true)))],
                ['${constant_String} is in ${the_out_param_String}', simpleCombine(flip(makeFilter('=~', allOutParams)))],

                ['${range_filter}', disableIfTurking(simpleCombine(identity))],
                //['${either_filter}', disableIfTurking(simpleCombine(identity))]
            ],
            'edge_filter': [
                ['the ${out_param_Any} ${choice(becomes|becomes equal to)} ${constant_Any}', disableIfTurking(simpleCombine(makeFilter('==', allOutParams)))],
                ['${the_out_param_Numeric} ${choice(is now greater than|becomes greater than|becomes higher than|goes above|increases above|goes over|rises above)} ${constant_Numeric}', simpleCombine(makeFilter('>=', allOutParams))],
                ['${the_out_param_Numeric} ${choice(is now smaller than|becomes smaller than|becomes lower than|goes below|decreases below|goes under)} ${constant_Numeric}', simpleCombine(makeFilter('<=', allOutParams))],
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

            'range': [
                ['between ${constant_Numeric} and ${constant_Numeric}', simpleCombine((v1, v2) => {
                    if (!v1.getType().equals(v2.getType()))
                        return null;
                    if (v1.equals(v2)) // can happen with constants (now, 0, 1, etc.)
                        return null;
                    if (v1.isVarRef && v1.constNumber !== undefined && v2.isVarRef && v2.constNumber !== undefined &&
                        v1.constNumber + 1 !== v2.constNumber) // optimization: avoid CONST_X CONST_Y with X + 1 != Y earlier (before the NN catches it)
                        return null;
                    return [v1, v2];
                })],
                ['in the range from ${constant_Numeric} to ${constant_Numeric}', simpleCombine((v1, v2) => {
                    if (!v1.getType().equals(v2.getType()))
                        return null;
                    if (v1.equals(v2)) // can happen with constants (now, 0, 1, etc.)
                        return null;
                    if (v1.isVarRef && v1.constNumber !== undefined && v2.isVarRef && v2.constNumber !== undefined &&
                        v1.constNumber + 1 !== v2.constNumber) // optimization: avoid CONST_X CONST_Y with X + 1 != Y earlier (before the NN catches it)
                        return null;
                    return [v1, v2];
                })]
            ],
            'range_filter': [
                ['${the_out_param_Numeric} is ${range}', simpleCombine((param, [v1, v2]) => {
                    return new Ast.BooleanExpression.And([
                        Ast.BooleanExpression.Atom(param.name, '>=', v1),
                        Ast.BooleanExpression.Atom(param.name, '<=', v2)
                    ]);
                })],
            ],

            'with_filter': [
                ['${out_param_Any} equal to ${constant_Any}', simpleCombine(makeFilter('==', allOutParams))],
                ['${out_param_Numeric} ${choice(higher|larger|bigger)} than ${constant_Numeric}', simpleCombine(makeFilter('>=', allOutParams))],
                ['${out_param_Numeric} ${choice(smaller|lower)} than ${constant_Numeric}', simpleCombine(makeFilter('<=', allOutParams))],
                ['${choice(higher|larger|bigger)} ${out_param_Numeric} than ${constant_Numeric}', simpleCombine(makeFilter('>=', allOutParams))],
                ['${choice(smaller|lower)} ${out_param_Numeric} than ${constant_Numeric}', simpleCombine(makeFilter('<=', allOutParams))],
                ['${range_with_filter}', disableIfTurking(simpleCombine(identity))],
                ['no ${out_param_Number}', disableIfTurking(simpleCombine((param) => new Ast.BooleanExpression.Atom(param.name, '==', Ast.Value.Number(0))))],
                ['zero ${out_param_Number}', disableIfTurking(simpleCombine((param) => new Ast.BooleanExpression.Atom(param.name, '==', Ast.Value.Number(0))))],
            ],
            'range_with_filter': [
                ['${out_param_Numeric} ${range}', simpleCombine((param, [v1, v2]) => {
                    return new Ast.BooleanExpression.And([
                        Ast.BooleanExpression.Atom(param.name, '>=', v1),
                        Ast.BooleanExpression.Atom(param.name, '<=', v2)
                    ]);
                })],
            ],

            thingpedia_query: [],
            thingpedia_get_command: [],
            thingpedia_stream: [],
            thingpedia_action: [],

            complete_table: [
                ['${thingpedia_query}', checkIfComplete(simpleCombine(identity))],
                ['${table_join_replace_placeholder}', checkIfComplete(simpleCombine(identity))],
            ],
            complete_get_command: [
                ['${thingpedia_get_command}', checkIfComplete(simpleCombine(identity))]
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
                    return addFilter(table, filter, options);
                }), false)],
            ],
            two_filter_table: [
                ['${one_filter_table} and ${atom_filter}', checkConstants(simpleCombine((table, filter) => {
                    if (!checkFilter(table, filter))
                        return null;
                    return addFilter(table, filter, options);
                }), false)],
            ],
            with_filtered_table: [
                ['${complete_table}', simpleCombine(identity)],

                ['${complete_table} ${choice(with|having)} ${with_filter}', checkConstants(simpleCombine((table, filter) => {
                    if (!table.schema.is_list)
                        return null;
                    if (!checkFilter(table, filter))
                        return null;
                    return addFilter(table, filter, options);
                }), false)],
            ],

            timer: [
                ['every ${constant_Measure(ms)}', disableIfTurking(simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), interval, TIMER_SCHEMA)))],
                ['once in ${constant_Measure(ms)}', disableIfTurking(simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), interval, TIMER_SCHEMA)))],
                ['every day', disableIfTurking(simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'day'), TIMER_SCHEMA)))],
                ['daily', disableIfTurking(simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'day'), TIMER_SCHEMA)))],
                ['everyday', disableIfTurking(simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'day'), TIMER_SCHEMA)))],
                ['once a day', disableIfTurking(simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'day'), TIMER_SCHEMA)))],
                ['once a month', disableIfTurking(simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'mon'), TIMER_SCHEMA)))],
                ['once a week', disableIfTurking(simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'week'), TIMER_SCHEMA)))],
                ['once an hour', disableIfTurking(simpleCombine((interval) => new Ast.Stream.Timer(Ast.Value.Date.now(), new Ast.Value.Measure(1, 'h'), TIMER_SCHEMA)))],
                ['every day at ${constant_Time}', simpleCombine((time) => new Ast.Stream.AtTimer(time, AT_TIMER_SCHEMA))],
                ['daily at ${constant_Time}', disableIfTurking(simpleCombine((time) => new Ast.Stream.AtTimer(time, AT_TIMER_SCHEMA)))],
            ],

            // this is autogenerated and depends on projection_*, which is also
            // autogenerated
            projection_Any: [],
            projection_Numeric: [],
            stream_projection_Any: [],
            table_join_replace_placeholder: [],

            edge_stream: [
                ['${choice(when|if)} the ${projection_Any} ${choice(becomes|becomes equal to)} ${constant_Any}', disableIfTurking(simpleCombine(makeEdgeFilterStream('==')))],
                ['${choice(when|if)} the ${projection_Numeric} ${choice(becomes greater than|becomes higher than|goes above|increases above)} ${constant_Numeric}', simpleCombine(makeEdgeFilterStream('>='))],
                ['${choice(when|if)} the ${projection_Numeric} ${choice(becomes smaller than|becomes lower than|goes below|decreases below)} ${constant_Numeric}', simpleCombine(makeEdgeFilterStream('<='))],
            ],

            stream: [
                ['${thingpedia_stream}', checkIfComplete(simpleCombine(identity))],
                ['${choice(when|if|in case|whenever|any time|should|anytime)} ${with_filtered_table} ${choice(change|update)}', disableIfTurking(simpleCombine((table) => {
                    return tableToStream(table, null);
                }))],
                ['${choice(when|if|in case|whenever|any time|should|anytime)} ${with_filtered_table} update', enableIfTurking(simpleCombine((table) => {
                    return tableToStream(table, null);
                }))],
                ['${choice(in case of changes|in case of variations|in case of updates|if something changes|when something changes|if there are changes|if there are updates)} in ${with_filtered_table}', disableIfTurking(simpleCombine((table) => {
                    return tableToStream(table, null);
                }))],
                ['${choice(when|if|in case|whenever|any time|anytime)} ${projection_Any} changes', disableIfTurking(simpleCombine((proj) => {
                    if (proj.args[0] === 'picture_url')
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    let stream;
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    if (outParams.length === 1)
                        stream = tableToStream(proj.table, null);
                    else
                        stream = tableToStream(proj.table, proj.args);
                    return stream;
                }))],
                ['${choice(when|if|in case|whenever|any time|should|anytime)} ${complete_table} change and ${edge_filter}', simpleCombine((table, filter) => {
                    if (!table.schema.is_monitorable || !checkFilter(table, filter) || table.schema.is_list)
                        return null;
                    table = addFilter(table, filter, options);
                    if (!table)
                        return null;
                    return tableToStream(table, null);
                })],
                ['${choice(when|if|in case|whenever|any time|should|anytime)} ${complete_table} change and ${atom_filter}', simpleCombine((table, filter) => {
                    if (!table.schema.is_monitorable || !checkFilter(table, filter))
                        return null;
                    if (options.turkingMode && table.schema.is_list)
                        return null;
                    table = addFilter(table, filter, options);
                    if (!table)
                        return null;
                    return tableToStream(table, null);
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
            'forward_get_do_command': [
                ['${choice(get|take|retrieve)} ${if_filtered_table} ${choice(and then|then|,)} ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))],
                ['${complete_get_command} ${choice(and then|then|,)} ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))],
                ['after ${choice(you get|taking|getting|retrieving)} ${with_filtered_table} ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))],

                // use X to do Y would be good sometimes but it gets confusing quickly
                //['${choice(get|use)} ${with_filtered_table} to ${thingpedia_action}', checkIfIncomplete(simpleCombine((table, action) => new Ast.Statement.Command(table, [action])))]

                ['${forward_get_do_command}${choice( with the same | with identical | using the same )}${out_param_Any}', disableIfTurking(([commandDerivation, middle, rightDerivation]) => {
                    let joinArg = rightDerivation.value.name;
                    if (commandDerivation.hasPlaceholder(joinArg) || commandDerivation.hasPlaceholder('p_' + joinArg))
                        return null;

                    return Derivation.combine([commandDerivation, middle, rightDerivation], (command, joinArg) => {
                        let actiontype = command.actions[0].schema.inReq[joinArg.name];
                        if (!actiontype)
                            return null;
                        if (command.actions[0].in_params.some((p) => p.name === joinArg.name))
                            return null;
                        let commandtype = command.table.schema.out[joinArg.name];
                        if (!commandtype || !Type.isAssignable(commandtype, actiontype))
                            return null;

                        let clone = command.actions[0].clone();
                        clone.invocation.in_params.push(new Ast.InputParam(joinArg.name, joinArg));
                        return new Ast.Statement.Command(command.table, [clone]);
                    });
                })],
            ],

            'backward_get_do_command': [
                ['${thingpedia_action} after ${choice(getting|taking|you get|you retrieve)} ${with_filtered_table}', checkIfIncomplete(simpleCombine((action, table) => new Ast.Statement.Command(table, [action])))],
            ],
            'forward_when_do_rule': [
                // pp from when to do (optional)
                ['${stream} ${thingpedia_action}${choice(| .)}', checkConstants(simpleCombine((stream, action) => new Ast.Statement.Rule(stream, [action])))],

                // pp from when to do (required)
                // this is because "monitor X and then Y" makes sense only if X flows into Y
                ['${choice(monitor|watch)} ${with_filtered_table} ${choice(and then|then)} ${thingpedia_action}${choice(| .)}', checkIfIncomplete(simpleCombine((table, action) => {
                    if (!table.schema.is_monitorable)
                        return null;
                    return new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [action]);
                }))],
                ['${choice(monitor|watch)} ${projection_Any} ${choice(and then|then)} ${thingpedia_action}${choice(| .)}', disableIfTurking(checkIfIncomplete(simpleCombine((proj, action) => {
                    if (!proj.schema.is_monitorable)
                        return null;
                    if (proj.args[0] === 'picture_url')
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    let stream;
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    if (outParams.length === 1)
                        stream = tableToStream(proj.table, null);
                    else
                        stream = tableToStream(proj.table, proj.args);
                    if (!stream)
                        return null;
                    return new Ast.Statement.Rule(stream, [action]);
                })))],

                ['check for new ${complete_table} ${choice(and then|then)} ${thingpedia_action}${choice(| .)}', checkIfIncomplete(simpleCombine((table, action) => {
                    if (!table.schema.is_monitorable)
                        return null;
                    return new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [action]);
                }))],

                ['${forward_when_do_rule}${choice( with the same | with identical | using the same )}${out_param_Any}', disableIfTurking(([ruleDerivation, middle, rightDerivation]) => {
                    let joinArg = rightDerivation.value.name;
                    if (ruleDerivation.hasPlaceholder(joinArg) || ruleDerivation.hasPlaceholder('p_' + joinArg))
                        return null;

                    return Derivation.combine([ruleDerivation, middle, rightDerivation], (rule, joinArg) => {
                        //if (rule.actions.length !== 1 || rule.actions[0].selector.isBuiltin)
                        //    throw new TypeError('???');
                        let actiontype = rule.actions[0].schema.inReq[joinArg.name];
                        if (!actiontype)
                            return null;
                        if (rule.actions[0].in_params.some((p) => p.name === joinArg.name))
                            return null;

                        let commandtype = rule.stream.schema.out[joinArg.name];
                        if (!commandtype || !Type.isAssignable(commandtype, actiontype))
                            return null;
                        if (joinArg.isEvent && (rule.stream.isTimer || rule.stream.isAtTimer))
                            return null;

                        let clone = rule.actions[0].clone();
                        clone.invocation.in_params.push(new Ast.InputParam(joinArg.name, joinArg));
                        return new Ast.Statement.Rule(rule.stream, [clone]);
                    });
                })],
            ],

            'backward_when_do_rule': [
                ['${thingpedia_action} ${stream}${choice(| .)}', checkConstants(simpleCombine((action, stream) => new Ast.Statement.Rule(stream, [action])))],


                ['${thingpedia_action} after checking for new ${complete_table}${choice(| .)}', checkIfIncomplete(simpleCombine((action, table) => {
                    if (!table.schema.is_monitorable)
                        return null;
                    return new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [action]);
                }))],
            ],
            'complete_when_do_rule': [
                ['${forward_when_do_rule}', checkIfComplete(simpleCombine(identity), true)],
                ['${backward_when_do_rule}', disableIfTurking(checkIfComplete(simpleCombine(identity), true))],
                ['${choice(auto |automatically |continuously |)}${action_replace_param_with_stream}', disableIfTurking(checkIfComplete(simpleCombine(identity), true))],
                ['automatically ${action_replace_param_with_stream}', enableIfTurking(checkIfComplete(simpleCombine(identity), true))],
            ],

            // pp from when to get (optional)
            'when_get_stream': [
                // NOTE: the schema is not quite right but it's ok because the stream is complete
                // and the table is what we care about
                ['${stream} ${thingpedia_get_command}', checkConstants(simpleCombine((stream, table) => checkNotSelfJoinStream(new Ast.Stream.Join(stream, table, [], table.schema))))],
                ['${stream} ${choice(get|show me|give me|tell me|retrieve)} ${thingpedia_query}', checkConstants(simpleCombine((stream, table) => checkNotSelfJoinStream(new Ast.Stream.Join(stream, table, [], table.schema))))],
                ['${stream} ${choice(get|show me|give me|tell me|retrieve)} ${choice(|what is )}${projection_Any}', checkConstants(simpleCombine((stream, proj) => {
                    if (proj.args[0] === 'picture_url')
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;

                    return checkNotSelfJoinStream(new Ast.Stream.Join(stream, proj.table, [], proj.table.schema));
                }))],

                ['${thingpedia_get_command} ${stream}', checkConstants(simpleCombine((table, stream) => checkNotSelfJoinStream(new Ast.Stream.Join(stream, table, [], table.schema))))],
                ['${choice(get|show me|give me|tell me|retrieve)} ${thingpedia_query} ${stream}', checkConstants(simpleCombine((table, stream) => checkNotSelfJoinStream(new Ast.Stream.Join(stream, table, [], table.schema))))],
                ['${choice(get|show me|give me|tell me|retrieve)} ${projection_Any} ${stream}', checkConstants(simpleCombine((proj, stream) => {
                    if (proj.args[0] === 'picture_url')
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;

                    return checkNotSelfJoinStream(new Ast.Stream.Join(stream, proj.table, [], proj.table.schema));
                }))],
            ],
            'complete_when_get_stream': [
                ['${when_get_stream}', checkIfComplete(simpleCombine(identity), true)]
            ],

            'complete_get_do_command': [
                ['${action_replace_param_with_table}', checkIfComplete(simpleCombine(identity))],
                ['${forward_get_do_command}', checkIfComplete(simpleCombine(identity))],
                ['${backward_get_do_command}', disableIfTurking(checkIfComplete(simpleCombine(identity)))]
            ],

            'when_get_do_rule': [
                ['${stream} ${complete_get_do_command}', checkIfComplete(simpleCombine((stream, command) => combineStreamCommand(stream, command)), true)],
                ['${complete_get_do_command} ${stream}', checkIfComplete(simpleCombine((command, stream) => combineStreamCommand(stream, command)), true)]
            ],

            'root': [
                // when => notify
                ['notify me ${stream}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [stream.isTimer || stream.isAtTimer ? builtinSayAction() : Generate.notifyAction()]))))],
                ['${choice(alert me|inform me|let me know|i get notified|i get alerted)} ${stream}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [stream.isTimer || stream.isAtTimer ? builtinSayAction() : Generate.notifyAction()]))))],
                ['send me ${choice(a message|an alert|a notification|a pop up notification|a popup notification)} ${stream}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [stream.isTimer || stream.isAtTimer ? builtinSayAction() : Generate.notifyAction()]))))],
                ['send me a reminder ${timer}', checkConstants(simpleCombine((stream) => makeProgram(new Ast.Statement.Rule(stream, [builtinSayAction()]))))],
                ['send me ${choice(a message|an alert|a notification|a reminder|a popup notification)} ${timer} ${choice(saying|with the text)} ${constant_String}', checkConstants(simpleCombine((stream, constant) => makeProgram(new Ast.Statement.Rule(stream, [builtinSayAction(constant)]))))],
                ['alert me ${stream} ${choice(saying|with the text)} ${constant_String}', disableIfTurking(checkConstants(simpleCombine((stream, constant) => makeProgram(new Ast.Statement.Rule(stream, [builtinSayAction(constant)])))))],
                ['show ${choice(the notification|the message|a popup notification that says|a popup containing)} ${constant_String} ${stream}', disableIfTurking(checkConstants(simpleCombine((constant, stream) => makeProgram(new Ast.Statement.Rule(stream, [builtinSayAction(constant)])))))],
                ['${choice(monitor|watch)} ${with_filtered_table}', checkConstants(simpleCombine((table) => {
                    if (!table.schema.is_monitorable)
                        return null;
                    return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Monitor(table, null, table.schema), [Generate.notifyAction()]));
                }))],
                ['${choice(monitor|watch)} ${projection_Any}', disableIfTurking(checkConstants(simpleCombine((proj) => {
                    if (!proj.schema.is_monitorable)
                        return null;
                    let stream = tableToStream(proj.table, proj.args);
                    if (!stream)
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    return makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]));
                })))],
                ['${choice(let me know|notify me)} ${choice(of|about)} ${choice(changes|updates)} in ${if_filtered_table}', checkConstants(simpleCombine((table) => {
                    let stream = tableToStream(table, null);
                    if (!stream)
                        return null;
                    return makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]));
                }))],
                ['${choice(monitor|watch)} ${complete_table} and ${choice(alert me|notify me|inform me|warn me)} ${choice(if|when)} ${atom_filter}', checkConstants(simpleCombine((table, filter) => {
                    if (hasGetPredicate(filter))
                        return null;
                    if (table.schema.is_list || !checkFilter(table, filter))
                        return null;
                    table = addFilter(table, filter, options);
                    if (!table)
                        return null;
                    let stream = tableToStream(table, null);
                    if (!stream)
                        return null;
                    return makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]));
                }))],

                ['${choice(let me know|notify me)} ${choice(of|about)} ${choice(changes|updates)} in ${projection_Any}', disableIfTurking(checkConstants(simpleCombine((proj) => {
                    if (!proj.schema.is_monitorable)
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Monitor(proj.table, null, proj.table.schema), [Generate.notifyAction()]));
                })))],
                ['${choice(alert me|tell me|notify me|let me know)} ${choice(if|when)} ${atom_filter} in ${complete_table}', checkConstants(simpleCombine((filter, table) => {
                    if (hasGetPredicate(filter))
                        return null;
                    if (!table.schema.is_monitorable || !checkFilter(table, filter))
                        return null;
                    if (options.turkingMode && table.schema.is_list)
                        return null;
                    table = addFilter(table, filter, options);
                    if (!table)
                        return null;
                    let stream = tableToStream(table, null);
                    if (!stream)
                        return null;
                    return makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]));
                }))],
                ['${choice(alert me|tell me|notify me|let me know)} ${choice(if|when)} ${edge_filter} in ${complete_table}', checkConstants(simpleCombine((filter, table) => {
                    if (hasGetPredicate(filter))
                        return null;
                    if (!table.schema.is_monitorable || table.schema.is_list || !checkFilter(table, filter))
                        return null;
                    table = addFilter(table, filter, options);
                    if (!table)
                        return null;
                    let stream = tableToStream(table, null);
                    if (!stream)
                        return null;
                    return makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]));
                }))],

                // now => get => notify
                ['${complete_get_command}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],

                ['get ${complete_table}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],
                ['${choice(tell me|give me|show me|present|retrieve|pull up)} ${complete_table}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],
                ['${choice(hey almond |please |)}${choice(list|enumerate)} ${with_filtered_table}', checkConstants(simpleCombine((table) => {
                    if (!table.schema.is_list)
                        return null;
                    return makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]));
                }))],
                ['${choice(hey almond |)}${choice(search|find|i want|i need)} ${with_filtered_table}', checkConstants(simpleCombine((table) => {
                    return makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]));
                }))],
                ['${choice(hey almond |)}what are ${with_filtered_table}${choice(| ?)}', checkConstants(simpleCombine((table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction()]))))],

                // now => get => say(...)
                // don't merge these, the output sizes are too small
                ['${choice(hey almond |)}${choice(get|show me|give me|tell me|say)} ${projection_Any}', checkConstants(simpleCombine((proj) => {
                    if (proj.args[0] === 'picture_url')
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    return makeProgram(new Ast.Statement.Command(proj.table, [Generate.notifyAction()]));
                }))],
                ['${choice(hey almond |)}what is ${projection_Any}${choice(| ?)}', checkConstants(simpleCombine((proj) => {
                    if (proj.args[0] === 'picture_url')
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    return makeProgram(new Ast.Statement.Command(proj.table, [Generate.notifyAction()]));
                }))],
                ['${choice(show me|tell me|say)} what is ${projection_Any}', checkConstants(simpleCombine((proj) => {
                    if (proj.args[0] === 'picture_url')
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    return makeProgram(new Ast.Statement.Command(proj.table, [Generate.notifyAction()]));
                }))],
                ['who is ${projection_Entity(tt:username)}${choice(| ?)}', checkConstants(simpleCombine((proj) => {
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    return makeProgram(new Ast.Statement.Command(proj.table, [Generate.notifyAction()]));
                }))],
                ['who is ${projection_Entity(tt:email_address)}${choice(| ?)}', checkConstants(simpleCombine((proj) => {
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    return makeProgram(new Ast.Statement.Command(proj.table, [Generate.notifyAction()]));
                }))],
                ['${projection_Any}', checkConstants(simpleCombine((proj) => {
                    if (proj.args[0] === 'picture_url')
                        return null;
                    let outParams = Object.keys(proj.table.schema.out);
                    if (outParams.length === 1 && options.turkingMode)
                        return null;
                    return makeProgram(new Ast.Statement.Command(proj.table, [Generate.notifyAction()]));
                }))],

                // now => do
                ['${thingpedia_action}', checkIfComplete(simpleCombine((action) => makeProgram(new Ast.Statement.Command(null, [action]))), true)],
                ['please ${thingpedia_action}', checkIfComplete(simpleCombine((action) => makeProgram(new Ast.Statement.Command(null, [action]))), true)],
                ['i need you to ${thingpedia_action}', checkIfComplete(simpleCombine((action) => makeProgram(new Ast.Statement.Command(null, [action]))), true)],
                ['i want to ${thingpedia_action}', checkIfComplete(simpleCombine((action) => makeProgram(new Ast.Statement.Command(null, [action]))), true)],
                ['i \'d like to ${thingpedia_action}', checkIfComplete(simpleCombine((action) => makeProgram(new Ast.Statement.Command(null, [action]))), true)],
                ['${choice(hey |)}${choice(sabrina|almond)} ${thingpedia_action}', checkIfComplete(simpleCombine((action) => makeProgram(new Ast.Statement.Command(null, [action]))), true)],

                // now => get => do
                ['${complete_get_do_command}', checkConstants(simpleCombine(makeProgram))],

                // when join get => notify/say(...)
                ['${complete_when_get_stream}', checkConstants(simpleCombine((stream) => {
                    assert(stream.isJoin, `unexpected stream in when_get, found ${stream}`);
                    if (stream.table.isProjection)
                        return makeProgram(new Ast.Statement.Rule(new Ast.Stream.Join(stream.stream, stream.table.table, stream.in_params, stream.schema), [Generate.notifyAction()]));
                    else
                        return makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction()]));
                }))],

                // when => do
                ['${complete_when_do_rule}', checkConstants(simpleCombine(makeProgram))],

                // when => get => do
                ['${when_get_do_rule}', simpleCombine(makeProgram)],

                // setup commands
                ['${choice(tell|command|order|request|ask)} ${constant_Entity(tt:username)} to ${thingpedia_action}', checkIfComplete(combineRemoteProgram((principal, action) => makeProgram(new Ast.Statement.Command(null, [action])).set({ principal })), true)],
                ['${choice(tell|command|order|request|inform)} ${constant_Entity(tt:username)} that ${choice(he needs|she needs|i need him|i need her)} to ${thingpedia_action}', checkIfComplete(combineRemoteProgram((principal, action) => makeProgram(new Ast.Statement.Command(null, [action])).set({ principal })), true)],
                ['${choice(tell|command|order|request|ask)} ${constant_Entity(tt:username)} to get ${complete_table} and send it to me', checkConstants(combineRemoteProgram((principal, table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction('return')])).set({ principal })), true)],
                ['${choice(request|ask)} ${constant_Entity(tt:username)} to get ${complete_table}', checkConstants(combineRemoteProgram((principal, table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction('return')])).set({ principal })), true)],
                ['${choice(show me|get)} ${complete_table} from ${constant_Entity(tt:username)}', checkConstants(combineRemoteProgram((table, principal) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction('return')])).set({ principal })), true)],
                ['${choice(show me|get|what is)} ${constant_Entity(tt:username)} \'s ${complete_table}', checkConstants(combineRemoteProgram((principal, table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction('return')])).set({ principal })), true)],
                ['${choice(tell|command|order|request|ask)} ${constant_Entity(tt:username)} to send me ${complete_table}', checkConstants(combineRemoteProgram((principal, table) => makeProgram(new Ast.Statement.Command(table, [Generate.notifyAction('return')])).set({ principal })), true)],
                ['${choice(tell|command|order|request|ask)} ${constant_Entity(tt:username)} to ${choice(let me know|inform me|notify me|alert me)} ${stream}', checkConstants(combineRemoteProgram((principal, stream) => makeProgram(new Ast.Statement.Rule(stream, [Generate.notifyAction('return')])).set({ principal })), true)],

                // policies
                ['${choice(anyone|anybody|everyone|everybody)} ${choice(can|is allowed to|is permitted to|has permission to|has my permission to)} ${thingpedia_action}', checkIfComplete(simpleCombine((action) => makePolicy(null, null, action)), true)],
                ['${choice(anyone|anybody|everyone|everybody)} ${choice(can|is allowed to|is permitted to|has permission to|has my permission to)} ${thingpedia_action} if ${atom_filter}', checkIfComplete(simpleCombine((action, filter) => {
                    if (!filter.isExternal)
                        return null;
                    let policy = makePolicy(null, null, action);
                    if (!policy)
                        return null;
                    policy.action.filter = Ast.BooleanExpression.And([policy.action.filter, filter]);
                    return policy;
                }), true)],
                ['${choice(anyone|anybody|everyone|everybody)} ${choice(can|is allowed to|is permitted to|has permission to|has my permission to)} ${choice(get|see|access|monitor|read)} ${if_filtered_table}', checkIfComplete(simpleCombine((table) => makePolicy(null, table, null)), true)],
                ['${constant_Entity(tt:username)} ${choice(can|is allowed to|is permitted to|has permission to|has my permission to)} ${thingpedia_action}', checkIfComplete(simpleCombine((source, action) => makePolicy(source, null, action)), true)],
                ['${constant_Entity(tt:username)} ${choice(can|is allowed to|is permitted to|has permission to|has my permission to)} ${thingpedia_action} if ${atom_filter}', checkIfComplete(simpleCombine((source, action, filter) => {
                    if (!filter.isExternal)
                        return null;
                    let policy = makePolicy(source, null, action);
                    if (!policy)
                        return null;
                    policy.action.filter = Ast.BooleanExpression.And([policy.action.filter, filter]);
                    return policy;
                }), true)],
                ['${constant_Entity(tt:username)} ${choice(can|is allowed to|is permitted to|has permission to|has my permission to)} ${choice(get|see|access|monitor|read)} ${if_filtered_table}', checkIfComplete(simpleCombine((source, table) => makePolicy(source, table, null)), true)],
            ]
        };
    }

    complete() {
        const grammar = this.grammar;
        const allTypes = this._types.all;
        const idTypes = this._types.id;
        const nonConstantTypes = this._types.nonConstant;

        for (let [typestr, type] of allTypes) {
            if (!grammar['constant_' + typestr]) {
                if (!type.isEnum && !type.isEntity && !type.isArray)
                    throw new Error('Missing definition for type ' + type);
                grammar['constant_' + typestr] = [];
                grammar['constant_Any'].push(['${constant_' + typestr + '}', simpleCombine(identity)]);

                if (type.isEnum) {
                    for (let entry of type.entries)
                        grammar['constant_' + typestr].push([clean(entry), simpleCombine(() => new Ast.Value.Enum(entry))]);
                } else if (type.isEntity) {
                    if (!nonConstantTypes.has(typestr) && !idTypes.has(typestr))
                        grammar['constant_' + typestr] = makeConstantDerivations('GENERIC_ENTITY_' + type.type, type);
                }
            }

            // don't access booleans or enums out arguments generically, as that rarely makes sense
            // (and when it does, you probably want a macro and maybe and edge trigger)
            if (type.isEnum || type.isBoolean)
                continue;

            if (!grammar['out_param_' + typestr]) {
                grammar['out_param_' + typestr] = [];
                grammar['the_out_param_' + typestr] = [
                    ['the ${out_param_' + typestr + '}', simpleCombine(identity)]
                ];
                if (!this._options.turkingMode) {
                    grammar['the_out_param_' + typestr].push(
                        ['its ${out_param_' + typestr + '}', simpleCombine(identity)],
                        ['their ${out_param_' + typestr + '}', simpleCombine(identity)]
                    );
                }
                if (type.isArray)
                    grammar['out_param_Array(Any)'].push(['${out_param_' + typestr + '}', simpleCombine(identity)]);
                else
                    grammar['out_param_Any'].push(['${out_param_' + typestr + '}', simpleCombine(identity)]);
                if (type.isMeasure || type.isNumber || type.isCurrency)
                    grammar['out_param_Numeric'].push(['${out_param_' + typestr + '}', simpleCombine(identity)]);
            }
            if (!idTypes.has(typestr)) {
                grammar['projection_' + typestr] = [
                    ['${the_out_param_' + typestr + '} of ${complete_table}', simpleCombine((outParam, table) => {
                        const name = outParam.name;
                        if (!table.schema.out[name] || !Type.isAssignable(table.schema.out[name], type))
                            return null;
                        if (name === 'picture_url' && this._options.turkingMode)
                            return null;
                        const newSchema = table.schema.filterArguments((arg) => arg.direction !== Ast.ArgDirection.OUT || arg.name === name);
                        return new Ast.Table.Projection(table, [name], newSchema);
                    })],
                ];
            }
            if (idTypes.has(typestr)) {
                grammar['single_projection_' + typestr] = [
                    ['${complete_table}', simpleCombine((table) => {
                        for (let pname in table.schema.out) {
                            if (table.schema.out[pname].equals(type))
                                return new Ast.Table.Projection(table, [pname], table.schema);
                        }
                        return null;
                    })]
                ];
            } else if (typestr === 'Entity(tt:picture)') {
                grammar['single_projection_' + typestr] = [
                    ['${complete_table}', simpleCombine((table) => {
                        if (!table.schema.out['picture_url'])
                            return null;
                        return new Ast.Table.Projection(table, ['picture_url'], table.schema);
                    })]
                ];
            } else if (typestr === 'String') {
                grammar['single_projection_' + typestr] = [
                    ['${complete_table}', simpleCombine((table) => {
                        let outParams = Object.keys(table.schema.out);
                        if (outParams.length === 1 && table.schema.out[outParams[0]].isString)
                            return new Ast.Table.Projection(table, [outParams[0]], table.schema);

                        for (let pname in table.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = table.schema.out[pname];
                            if (idTypes.has(String(ptype)))
                                return null;
                        }
                        return new Ast.Table.Projection(table, ['$event'], table.schema);
                    })]
                ];
            } else {
                grammar['single_projection_' + typestr] = [
                    ['${complete_table}', simpleCombine((table) => {
                        let outParams = Object.keys(table.schema.out);
                        if (outParams.length !== 1 || !type.equals(table.schema.out[outParams[0]]))
                            return null;
                        return new Ast.Table.Projection(table, [outParams[0]], table.schema);
                    })]
                ];
            }
            if (!idTypes.has(typestr)) {
                grammar['stream_projection_' + typestr] = [
                    ['${the_out_param_' + typestr + '} of new ${complete_table}', simpleCombine((outParam, table) => {
                        const name = outParam.name;
                        if (!table.schema.out[name] || !Type.isAssignable(table.schema.out[name], type))
                            return null;
                        if (!table.schema.is_monitorable)
                            return null;
                        const stream = new Ast.Stream.Monitor(table, null, table.schema);
                        const newSchema = stream.schema.filterArguments((arg, i) => arg.direction !== Ast.ArgDirection.OUT || arg.name === name);
                        return new Ast.Stream.Projection(stream, [name], newSchema);
                    })],
                ];
            }
            if (idTypes.has(typestr)) {
                grammar['single_stream_projection_' + typestr] = [
                    ['new ${complete_table}', simpleCombine((table) => {
                        if (!table.schema.is_monitorable)
                            return null;
                        for (let pname in table.schema.out) {
                            if (table.schema.out[pname].equals(type))
                                return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), [pname], table.schema);
                        }
                        return null;
                    })]
                ];
            } else if (typestr === 'Entity(tt:picture)') {
                grammar['single_stream_projection_' + typestr] = [
                    ['new ${complete_table}', simpleCombine((table) => {
                        if (!table.schema.out['picture_url'])
                            return null;
                        if (!table.schema.is_monitorable)
                            return null;
                        return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), ['picture_url'], table.schema);
                    })]
                ];
            } else if (typestr === 'String') {
                grammar['single_stream_projection_' + typestr] = [
                    ['new ${complete_table}', simpleCombine((table) => {
                        if (!table.schema.is_monitorable)
                            return null;
                        let outParams = Object.keys(table.schema.out);
                        if (outParams.length === 1 && table.schema.out[outParams[0]].isString)
                            return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), [outParams[0]], table.schema);

                        for (let pname in table.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = table.schema.out[pname];
                            if (idTypes.has(String(ptype)))
                                return null;
                        }
                        return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), ['$event'], table.schema);
                    })]
                ];
            } else {
                grammar['single_stream_projection_' + typestr] = [
                    ['new ${complete_table}', simpleCombine((table) => {
                        let outParams = Object.keys(table.schema.out);
                        if (outParams.length !== 1 || !type.equals(table.schema.out[outParams[0]]))
                            return null;
                        if (!table.schema.is_monitorable)
                            return null;
                        return new Ast.Stream.Projection(new Ast.Stream.Monitor(table, null, table.schema), [outParams[0]], table.schema);
                    })]
                ];
            }
            if (!idTypes.has(typestr))
                grammar['projection_Any'].push(['${projection_' + typestr +'}', simpleCombine(identity)]);
            if (type.isNumber || type.isMeasure || type.isCurrency)
                grammar['projection_Numeric'].push(['${projection_' + typestr +'}', simpleCombine(identity)]);
        }

        for (let [key, ptype] of this._allParams.in) {
            let [pname,] = key.split('+');
            //if (!pname.startsWith('p_'))
            //    continue;
            //console.log(pname + ' := ' + ptype + ' ( ' + key + ' )');

            grammar.thingpedia_query.push(['${thingpedia_query}${constant_' + ptype + '}', replacePlaceholderWithConstant(pname, betaReduceTable)]);
            grammar.thingpedia_get_command.push(['${thingpedia_get_command}${constant_' + ptype + '}', replacePlaceholderWithConstant(pname, betaReduceTable)]);

            grammar.thingpedia_stream.push(['${thingpedia_stream}${constant_' + ptype + '}', replacePlaceholderWithConstant(pname, betaReduceStream)]);
            grammar.thingpedia_action.push(['${thingpedia_action}${constant_' + ptype + '}', replacePlaceholderWithConstant(pname, betaReduceAction)]);

            // don't parameter pass booleans or enums, as that rarely makes sense
            if (ptype.isEnum || ptype.isBoolean)
                continue;

            if (!idTypes.has(String(ptype)))
                grammar.table_join_replace_placeholder.push(['${thingpedia_query}${projection_' + ptype + '}', combineReplacePlaceholder(pname, tableJoinReplacePlaceholder(pname, ptype), { isConstant: false })]);
            grammar.table_join_replace_placeholder.push(['${thingpedia_query}${single_projection_' + ptype + '}', combineReplacePlaceholder(pname, tableJoinReplacePlaceholder(pname, ptype), { isConstant: false })]);

            if (!idTypes.has(String(ptype)))
                grammar.action_replace_param_with_table.push(['${thingpedia_action}${projection_' + ptype + '}', combineReplacePlaceholder(pname, actionReplaceParamWithTable(pname, ptype), { isConstant: false })]);
            grammar.action_replace_param_with_table.push(['${thingpedia_action}${single_projection_' + ptype + '}', combineReplacePlaceholder(pname, actionReplaceParamWithTable(pname, ptype), { isConstant: false })]);

            if (!idTypes.has(String(ptype)))
                grammar.action_replace_param_with_stream.push(['${thingpedia_action}${stream_projection_' + ptype + '}', combineReplacePlaceholder(pname, actionReplaceParamWithStream(pname, ptype), { isConstant: false })]);
            grammar.action_replace_param_with_stream.push(['${thingpedia_action}${single_stream_projection_' + ptype + '}', combineReplacePlaceholder(pname, actionReplaceParamWithStream(pname, ptype), { isConstant: false })]);

            if (!this._options.turkingMode && !idTypes.has(String(ptype))) {
                grammar.forward_get_do_command.push(['${forward_get_do_command}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, getDoCommand(pname, ptype), { isConstant: false })]);
                grammar.backward_get_do_command.push(['${backward_get_do_command}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, getDoCommand(pname, ptype), { isConstant: false })]);
            }

            if (idTypes.has(String(ptype)) || pname === 'p_picture_url') {
                if (pname === 'p_picture_url') {
                    grammar.forward_get_do_command.push(['${forward_get_do_command}${choice(it|that|them)}', combineReplacePlaceholder(pname, (command) => getDoCommand(pname, ptype)(command, new Ast.Value.VarRef('picture_url')), { isConstant: false })]);
                } else {
                    grammar.forward_get_do_command.push(['${forward_get_do_command}${choice(it|that|them)}', combineReplacePlaceholder(pname, (command) => {
                        for (let joinArg in command.table.schema.out) {
                            if (command.table.schema.out[joinArg].equals(ptype))
                                return getDoCommand(pname, ptype)(command, new Ast.Value.VarRef(joinArg));
                        }
                        return null;
                    }, { isConstant: false })]);
                }
            } else if (ptype.isString && ['p_body', 'p_message', 'p_caption', 'p_status', 'p_text'].indexOf(pname) >= 0) {
                grammar.forward_get_do_command.push(['${forward_get_do_command}${choice(it|that|them)}', combineReplacePlaceholder(pname, (command) => {
                    for (let pname in command.table.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = command.table.schema.out[pname];
                            if (idTypes.has(String(ptype)))
                                return null;
                    }
                    return getDoCommand(pname, ptype)(command, new Ast.Value.Event(null));
                }, { isConstant: false })]);
            }

            if (!this._options.turkingMode && !idTypes.has(String(ptype))) {
                grammar.forward_when_do_rule.push(['${forward_when_do_rule}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, whenDoRule(pname, ptype), { isConstant: false })]);
                grammar.backward_when_do_rule.push(['${backward_when_do_rule}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, whenDoRule(pname, ptype), { isConstant: false })]);
            }

            if (idTypes.has(String(ptype)) || pname === 'p_picture_url') {
                if (pname === 'p_picture_url') {
                    grammar.forward_when_do_rule.push(['${forward_when_do_rule}${choice(it|that|them)}', combineReplacePlaceholder(pname, (rule) => whenDoRule(pname, ptype)(rule,  new Ast.Value.VarRef('picture_url')), { isConstant: false })]);
                } else {
                    grammar.forward_when_do_rule.push(['${forward_when_do_rule}${choice(it|that|them)}', combineReplacePlaceholder(pname, (rule) => {
                        for (let joinArg in rule.stream.schema.out) {
                            if (rule.stream.schema.out[joinArg].equals(ptype))
                                return whenDoRule(pname, ptype)(rule, new Ast.Value.VarRef(joinArg));
                        }
                        return null;
                    }, { isConstant: false })]);
                }
            } else if (ptype.isString && ['p_body', 'p_message', 'p_caption', 'p_status', 'p_text'].indexOf(pname) >= 0) {
                grammar.forward_when_do_rule.push(['${forward_when_do_rule}${choice(it|that|them)}', combineReplacePlaceholder(pname, (rule) => {
                    for (let pname in rule.stream.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = rule.stream.schema.out[pname];
                            if (idTypes.has(String(ptype)))
                                return null;
                    }
                    return whenDoRule(pname, ptype)(rule, new Ast.Value.Event(null));
                }, { isConstant: false })]);
            }

            if (!this._options.turkingMode && !idTypes.has(String(ptype)))
                grammar.when_get_stream.push(['${when_get_stream}${the_out_param_' + ptype + '}', combineReplacePlaceholder(pname, whenGetStream(pname, ptype), { isConstant: false })]);
            if (idTypes.has(String(ptype)) || pname === 'p_picture_url') {
                if (pname === 'p_picture_url') {
                    grammar.when_get_stream.push(['${when_get_stream}${choice(it|that|them)}', combineReplacePlaceholder(pname, (stream) => whenGetStream(pname, ptype)(stream, new Ast.Value.VarRef('picture_url')), { isConstant: false })]);
                } else {
                    grammar.when_get_stream.push(['${when_get_stream}${choice(it|that|them)}', combineReplacePlaceholder(pname, (stream) => {
                        for (let joinArg in stream.stream.schema.out) {
                            if (stream.stream.schema.out[joinArg].equals(ptype))
                                return whenGetStream(pname, ptype)(stream, new Ast.Value.VarRef(joinArg));
                        }
                        return null;
                    }, { isConstant: false })]);
                }
            } else if (ptype.isString && ['p_body', 'p_message', 'p_caption', 'p_status', 'p_text'].indexOf(pname) >= 0) {
                grammar.when_get_stream.push(['${when_get_stream}${choice(it|that|them)}', combineReplacePlaceholder(pname, (stream) => {
                    for (let pname in stream.stream.schema.out) {
                            if (pname === 'picture_url')
                                return null;
                            let ptype = stream.stream.schema.out[pname];
                            if (idTypes.has(String(ptype)))
                                return null;
                    }
                    return whenGetStream(pname, ptype)(stream, new Ast.Value.Event(null));
                }, { isConstant: false })]);
            }
        }
        for (let key of this._allParams.out) {
            let [pname,ptype] = key.split('+');
            if (ptype.startsWith('Enum(') || ptype === 'Boolean')
                continue;

            let expansion;
            if (pname in ARGUMENT_NAMES)
                expansion = ARGUMENT_NAMES[pname];
            else
                expansion = [clean(pname)];
            for (let candidate of expansion) {
                grammar['out_param_' + ptype].push([candidate, simpleCombine(() => new Ast.Value.VarRef(pname))]);
                if (!this._options.turkingMode && !(candidate.endsWith('s') && !candidate.endsWith('address')) &&
                    !candidate.startsWith('estimated diameter') && !candidate.endsWith(' by')) {
                    let plural;
                    if (candidate === 'camera used')
                        plural = 'cameras used';
                    else if (candidate.endsWith('y')) // industry -> industries
                        plural = candidate.substring(0, candidate.length-1) + 'ies';
                    else if (candidate.endsWith('s')) // address -> addresses
                        plural = candidate + 'es';
                    else
                        plural = candidate + 's';
                    grammar['out_param_' + ptype].push([plural, simpleCombine(() => new Ast.Value.VarRef(pname))]);
                }
            }
        }
    }

    postprocess(sentence) {
        return sentence.replace(/ new (my|the|a) /, (_, what) => ` ${what} new `)
            .replace(/ 's (my|their|his|her) /, ` 's `) //'
            .trim();
    }
};
