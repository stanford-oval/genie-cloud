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

module.exports = {
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
                    is_input: []
                };
                for (var arg of ast[name].args) {
                    out[name].schema.push(arg.type);
                    out[name].args.push(arg.name);
                    // convert from_channel to 'from channel' and inReplyTo to 'in reply to'
                    out[name].argcanonicals.push(arg.name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase());
                    out[name].questions.push(arg.question);
                    out[name].required.push(!!arg.required);
                    out[name].is_input.push(!!arg.is_input);
                }
            }
        }

        handleOne(ast.triggers, triggers);
        handleOne(ast.actions, actions);
        handleOne(ast.queries, queries);

        return { triggers, actions, queries };
    },

    toManifest(meta) {
        let ast = {
        };
        for (let what of ['triggers', 'queries', 'actions']) {
            ast[what] = {};
            for (let name in meta[what]) {
                let argnames = meta[what][name].args;
                let questions = meta[what][name].questions || [];
                let argrequired = meta[what][name].required || [];
                var argisinput = meta[what][name].is_input || [];
                let args = [];
                meta[what][name].schema.forEach((type, i) => {
                    args.push({
                        type: type,
                        name: argnames[i],
                        question: questions[i] || '',
                        required: argrequired[i] || false,
                        is_input: argisinput[i] || false,
                    });
                });
                ast[what][name] = {
                    args: args,
                    doc: meta[what][name].doc || '',
                    confirmation: meta[what][name].confirmation || '',
                    confirmation_remote: meta[what][name].confirmation_remote || '',
                    canonical: meta[what][name].canonical || '',
                    is_list: meta[what][name].is_list,
                    is_monitorable: meta[what][name].is_monitorable
                };
            }
        }
        return ast;
    }
};
