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
    }
    const annotations = {};

    return new Ast.FunctionDef(functionType,
                               functionName,
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
    return new Ast.ClassDef(kind, null, queries, actions,
                            imports, metadata, annotations);
}

function mergeFunctionDefAndSchema(fnDef, schema) {
    for (let key of ['confirmation', 'confirmation_remote', 'canonical'])
        fnDef.metadata[key] = schema[key];
    for (let i = 0; i < fnDef.args.length; i++) {
        const arg = fnDef.getArgument(fnDef.args[i]);
        arg.metadata.canonical = schema.argcanonicals[i];
        if (schema.questions[i])
            arg.metadata.prompt = schema.questions[i];
    }
}

module.exports = {
    mergeClassDefAndSchema(classDef, schema) {
        for (let name in classDef.queries)
            mergeFunctionDefAndSchema(classDef.queries[name], schema.queries[name]);
        for (let name in classDef.actions)
            mergeFunctionDefAndSchema(classDef.actions[name], schema.actions[name]);
    },

    schemaListToClassDefs(rows, isMeta) {
        const classes = [];
        for (let row of rows)
            classes.push(makeSchemaClassDef(row.kind, row, isMeta));
        return Ast.Input.Meta(classes, []);
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
                    is_list: fnDef.is_list,
                    is_monitorable: fnDef.is_monitorable,
                    schema: [],
                    args: [],
                    argcanonicals: [],
                    questions: [],
                    required: [],
                    is_input: [],
                    string_values: []
                };
                for (let argname of fnDef.args) {
                    const arg = fnDef.getArgument(argname);
                    out.schema.push(String(arg.type));
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
    },

    toSchema(ast) {
        var triggers = {};
        var actions = {};
        var queries = {};

        function handleOne(ast, out) {
            for (var name in ast) {
                out[name] = {
                    doc: ast[name].doc,
                    confirmation: ast[name].confirmation,
                    confirmation_remote: ast[name].confirmation_remote,
                    canonical: ast[name].canonical,
                    is_list: !!ast[name].is_list,
                    is_monitorable: ('poll_interval' in ast[name] ? ast[name].poll_interval >= 0 : !!ast[name].is_monitorable), 
                    schema: [],
                    args: [],
                    argcanonicals: [],
                    questions: [],
                    required: [],
                    is_input: [],
                    string_values: [],
                };
                for (var arg of ast[name].args) {
                    out[name].schema.push(arg.type);
                    out[name].args.push(arg.name);
                    // convert from_channel to 'from channel' and inReplyTo to 'in reply to'
                    out[name].argcanonicals.push(arg.name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase());
                    out[name].questions.push(arg.question);
                    out[name].required.push(!!arg.required);
                    out[name].is_input.push(!!arg.is_input);
                    out[name].string_values.push(arg.string_values || null);
                }
            }
        }

        handleOne(ast.triggers, triggers);
        handleOne(ast.actions, actions);
        handleOne(ast.queries, queries);

        return { triggers, actions, queries };
    }
};
