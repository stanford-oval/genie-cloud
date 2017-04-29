// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

module.exports = {
    toSchema(ast) {
        var triggers = {};
        var triggerMeta = {};
        var actions = {};
        var actionMeta = {};
        var queries = {};
        var queryMeta = {};

        function handleOne(ast, out, outMeta) {
            for (var name in ast) {
                out[name] = [];
                outMeta[name] = {
                    doc: ast[name].doc,
                    confirmation: (ast[name].confirmation || ast[name].label),
                    canonical: ast[name].canonical,
                    args: [],
                    questions: [],
                    required: []
                };
                for (var arg of ast[name].args) {
                    out[name].push(arg.type);
                    outMeta[name].args.push(arg.name);
                    outMeta[name].questions.push(arg.question);
                    outMeta[name].required.push(arg.required);
                };
            }
        }

        handleOne(ast.triggers, triggers, triggerMeta);
        handleOne(ast.actions, actions, actionMeta);
        handleOne(ast.queries, queries, queryMeta);

        var types = [triggers, actions, queries];
        var meta = [triggerMeta, actionMeta, queryMeta];
        return [types, meta];
    },

    toManifest(types, meta) {
        var ast = {
            triggers: {},
            actions: {},
            queries: {}
        };

        function handleOne(idx, out) {
            var schemas = types[idx];
            var metas = meta[idx] || {};

            for (var name in schemas) {
                var channelMeta = metas[name] || {};
                var args = [];
                var argnames = channelMeta.args || (schemas[name].map((_, i) => ('arg' + (i+1))));
                var questions = channelMeta.questions || [];
                var argrequired = channelMeta.required || [];
                schemas[name].forEach(function(schema, i) {
                    args.push({
                        type: schema,
                        name: argnames[i],
                        question: questions[i] || '',
                        required: argrequired[i] || false,
                    });
                });
                out[name] = {
                    args: args,
                    doc: channelMeta.doc || '',
                    confirmation: channelMeta.confirmation || '',
                    canonical: channelMeta.canonical || '',
                    examples: []
                }
            }
        }

        handleOne(0, ast.triggers);
        handleOne(1, ast.actions);
        handleOne(2, ast.queries);

        return ast;
    }
}
