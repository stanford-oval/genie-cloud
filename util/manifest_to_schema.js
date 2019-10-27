// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;
const Type = ThingTalk.Type;

const { clean } = require('./tokenize');

// FIXME HACK this should be in thingtalk
const { prettyprintType } = require('thingtalk/lib/prettyprint');

function makeSchemaFunctionDef(functionType, functionName, schema, isMeta) {
    const args = [];
    // compat with Thingpedia API quirks
    const types = schema.types || schema.schema;

    types.forEach((type, i) => {
        type = Type.fromString(type);
        const argname = schema.args[i];
        const argrequired = !!schema.required[i];
        const arginput = !!schema.is_input[i];

        let direction;
        if (argrequired)
            direction = Ast.ArgDirection.IN_REQ;
        else if (arginput)
            direction = Ast.ArgDirection.IN_OPT;
        else
            direction = Ast.ArgDirection.OUT;
        const metadata = {};
        if (isMeta) {
            metadata.prompt = schema.questions[i] || '';
            metadata.canonical = schema.argcanonicals[i] || argname;
        }
        const annotations = {};
        if (isMeta && schema.string_values[i])
            annotations.string_values = Ast.Value.String(schema.string_values[i]);

        args.push(new Ast.ArgumentDef(direction, argname,
            type, metadata, annotations));
    });

    const metadata = {};
    if (isMeta) {
        metadata.canonical = schema.canonical || '';
        metadata.confirmation = schema.confirmation || '';

        if (schema.formatted && schema.formatted.length > 0)
            metadata.formatted = schema.formatted;
    }
    const annotations = {};
    if (isMeta)
        annotations.confirm = Ast.Value.Boolean(schema.confirm);

    return new Ast.FunctionDef(functionType,
                               functionName,
                               schema.extends || [],
                               args,
                               schema.is_list,
                               schema.is_monitorable,
                               metadata,
                               annotations);
}

function makeSchemaClassDef(kind, schema, isMeta) {
    const queries = {};
    for (let name in schema.queries)
        queries[name] = makeSchemaFunctionDef('query', name, schema.queries[name], isMeta);
    const actions = {};
    for (let name in schema.actions)
        actions[name] = makeSchemaFunctionDef('action', name, schema.actions[name], isMeta);

    const imports = [];
    const metadata = {};
    const annotations = {};

    if (isMeta && schema.kind_canonical)
        metadata.canonical = schema.kind_canonical;
    return new Ast.ClassDef(kind, null, queries, actions,
                            imports, metadata, annotations);
}

function mergeFunctionDefAndSchema(fnDef, schema) {
    let complete = true;
    for (let key of ['confirmation', 'confirmation_remote', 'canonical']) {
        if (schema[key])
            fnDef.metadata[key] = schema[key];
        else
            complete = false;
    }
    // the formatted story is... messy
    // because we have had the field for a long time
    // but it was never properly filled or filled
    if (schema.formatted && schema.formatted.length > 0)
        fnDef.metadata.formatted = schema.formatted;

    for (let i = 0; i < fnDef.args.length; i++) {
        const arg = fnDef.getArgument(fnDef.args[i]);
        if (schema.argcanonicals[i])
            arg.metadata.canonical = schema.argcanonicals[i];
        else
            complete = false;
        if (schema.questions[i])
            arg.metadata.prompt = schema.questions[i];
    }
    return complete;
}

module.exports = {
    mergeClassDefAndSchema(classDef, schema) {
        let complete = true;
        for (let name in classDef.queries)
            complete = mergeFunctionDefAndSchema(classDef.queries[name], schema.queries[name]) && complete;
        for (let name in classDef.actions)
            complete = mergeFunctionDefAndSchema(classDef.actions[name], schema.actions[name]) && complete;
        return complete;
    },

    schemaListToClassDefs(rows, isMeta) {
        const classes = [];
        for (let row of rows)
            classes.push(makeSchemaClassDef(row.kind, row, isMeta));
        return new Ast.Input.Library(classes, []);
    },

    classDefToSchema(classDef) {
        const result = {
            actions: {},
            queries: {}
        };

        for (let what of ['actions', 'queries']) {
            const into = result[what];
            for (let name in classDef[what]) {
                const fnDef = classDef[what][name];

                const out = into[name] = {
                    doc: fnDef.annotations.doc ? fnDef.annotations.doc.toJS() : '',
                    confirmation: fnDef.metadata.confirmation,
                    confirmation_remote: fnDef.metadata.confirmation_remote || '',
                    canonical: fnDef.metadata.canonical,
                    formatted: fnDef.metadata.formatted || [],
                    is_list: fnDef.is_list,
                    is_monitorable: fnDef.is_monitorable,
                    confirm: fnDef.annotations.confirm.toJS(),
                    extends: fnDef.extends,
                    types: [],
                    args: [],
                    argcanonicals: [],
                    questions: [],
                    required: [],
                    is_input: [],
                    string_values: []
                };
                for (let argname of fnDef.args) {
                    const arg = fnDef.getArgument(argname);
                    out.types.push(prettyprintType(arg.type));
                    out.args.push(argname);
                    // convert from_channel to 'from channel' and inReplyTo to 'in reply to'

                    const argcanonical = arg.metadata.canonical || clean(argname);
                    out.argcanonicals.push(argcanonical);
                    out.questions.push(arg.metadata.prompt || '');
                    out.required.push(!!arg.required);
                    out.is_input.push(!!arg.is_input);

                    if (arg.annotations.string_values)
                        out.string_values.push(arg.annotations.string_values.toJS());
                    else
                        out.string_values.push(null);
                }
            }
        }

        return result;
    }
};
