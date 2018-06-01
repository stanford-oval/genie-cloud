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

const TokenizerService = require('./tokenizer_service');

const KIND_REGEX = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const ARGNAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

const PARAM_REGEX = /\$(?:\$|([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/;

const FORBIDDEN_NAMES = new Set(['__count__', '__noSuchMethod__', '__parent__',
'__proto__', 'constructor', '__defineGetter__', '__defineSetter__', '__lookupGetter__',
'__lookupSetter__', 'eval', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
'toLocaleString', 'toSource', 'toString', 'unwatch', 'watch', 'valueOf']);

// A SchemaRetriever that only returns results for the single device it is configured at,
// and fails for everything else
class SingleDeviceSchemaRetriever {
    constructor(kind, ast) {
        this._kind = kind;
        this._ast = ast;
    }

    _where(where) {
        switch (where) {
            case 'query': return 'queries';
            case 'action': return 'actions';
            case 'trigger': return 'triggers';
            default: return where;
        }
    }

    getSchemaAndNames(kind, what, name) {
        if (kind !== this._kind)
            return Promise.reject(new Error('Cannot use other devices in example commands'));

        const where = this._where(what);
        if (!(name in this._ast[where]))
            throw new Error("Schema " + kind + " has no " + what + " " + name);

        let ret = {
            args: [],
            types: [],
            is_input: [],
            required: [],
            is_list: this._ast[where][name].is_list,
            is_monitorable: 'poll_interval' in this._ast[where][name] ? this._ast[where][name].poll_interval >= 0 : this._ast[where][name].is_monitorable
        };
        for (let arg of this._ast[where][name].args) {
            ret.args.push(arg.name);
            ret.types.push(ThingTalk.Type.fromString(arg.type));
            ret.is_input.push(arg.is_input);
            ret.required.push(arg.required);
        }
        return Promise.resolve(ret);
    }
}

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

module.exports = {
    cleanKind(kind) {
        // convert security-camera to 'security camera' and googleDrive to 'google drive'

        // thingengine.phone -> phone
        if (kind.startsWith('org.thingpedia.builtin.thingengine.'))
            kind = kind.substr('org.thingpedia.builtin.thingengine.'.length);
        // org.thingpedia.builtin.omlet -> omlet
        if (kind.startsWith('org.thingpedia.builtin.'))
            kind = kind.substr('org.thingpedia.builtin.'.length);
        // org.thingpedia.weather -> weather
        if (kind.startsWith('org.thingpedia.'))
            kind = kind.substr('org.thingpedia.'.length);
        // com.xkcd -> xkcd
        if (kind.startsWith('com.'))
            kind = kind.substr('com.'.length);
        if (kind.startsWith('gov.'))
            kind = kind.substr('gov.'.length);
        if (kind.startsWith('org.'))
            kind = kind.substr('org.'.length);
        if (kind.startsWith('uk.co.'))
            kind = kind.substr('uk.co.'.length);

        return kind.replace(/[_\-.]/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
    },

    validateInvocation(where, what, entities) {
        for (var name in where) {
            if (FORBIDDEN_NAMES.has(name))
                throw new Error(`${name} is not allowed as a function name`);

            if (!where[name].canonical)
                throw new Error('Missing canonical form for ' + name);
            if (where[name].canonical.indexOf('$') >= 0)
                throw new Error('Detected placeholder in canonical form ' + name + ': this is incorrect, the canonical form must not contain parameters'); 
            if (!where[name].confirmation)
                throw new Error('Missing confirmation for ' + name);
            if (where[name].examples)
                throw new Error('Examples should be at the toplevel, not under ' + name);
            where[name].doc = where[name].doc || '';
            where[name].args = where[name].args || [];

            if (what === 'action') {
                where[name].is_list = false;
                if ('poll_interval' in where[name])
                    where[name].poll_interval = -1;
                else
                    where[name].is_monitorable = false;
            } else {
                where[name].is_list = !!where[name].is_list;
                if ('poll_interval' in where[name]) {
                    if (typeof where[name].poll_interval !== 'number' || where[name].poll_interval !== Math.floor(where[name].poll_interval)
                        || where[name].poll_interval <= -2)
                        throw new Error('Invalid polling interval for ' + name + ' (must be a positive integer to poll, 0 for push or -1 to disable monitoring)');
                } else {
                    where[name].is_monitorable = !!where[name].is_monitorable;
                }
            }

            for (var arg of where[name].args) {
                if (!arg.name)
                    throw new Error('Missing argument name in ' + name);
                if (!ARGNAME_REGEX.test(arg.name))
                    throw new Error('Invalid argument name ' + arg.name + ' (must contain only letters, numbers and underscore, and cannot start with a number)');
                if (FORBIDDEN_NAMES.has(arg.name))
                    throw new Error(`${arg.name} is not allowed as argument name in ${name}`);
                if (!arg.type)
                    throw new Error("Missing type for argument " + name + '.' + arg.name);
                try {
                    let type = ThingTalk.Type.fromString(arg.type);
                    if (type.isEntity)
                        entities.add(type.type);
                    arg.type = type.toString();
                } catch(e) {
                    throw new Error('Invalid type ' + arg.type + ' for argument ' + name + '.' + arg.name);
                }
                arg.question = arg.question || '';
                arg.required = arg.required || false;
                arg.is_input = arg.is_input || false;
                if (!arg.is_input && what === 'action')
                    throw new Error('Action ' + name + ' cannot have output argument ' + arg.name);
                if (arg.required && !arg.question)
                    throw new Error('Required argument ' + name + '.' + arg.name + ' must have a slot filling question');
                if (arg.required && !arg.is_input)
                    throw new Error('Argument ' + name + '.' + arg.name + ' cannot be both output and required');
            }
        }
    },

    _validateUtterance(args, utterance) {
        if (/_{4}/.test(utterance))
            throw new Error('Do not use blanks (4 underscores or more) in utterance, use placeholders');

        let chunks = split(utterance.trim(), PARAM_REGEX);

        let placeholders = new Set;
        for (let chunk of chunks) {
            if (chunk === '')
                continue;
            if (typeof chunk === 'string')
                continue;

            let [match, param1, param2, opt] = chunk;
            if (match === '$$')
                continue;
            let param = param1 || param2;
            if (!(param in args))
                throw new Error(`Invalid placeholder ${param}`);
            if (opt && opt !== 'const')
                throw new Error(`Invalid placeholder option ${opt} for ${param}`);
            placeholders.add(param);
        }

        for (let arg in args) {
            if (!placeholders.has(arg))
                throw new Error(`Missing placeholder for argument ${arg}`);
        }
    },

    _validateExample(schemaRetriever, ex, i) {
        return Promise.resolve().then(() => {
            if (!ex.utterance || !ex.program)
                throw new Error("Invalid example");
            return ThingTalk.Grammar.parseAndTypecheck(ex.program, schemaRetriever, false);
        }).then((prog) => {
            if (prog.declarations.length + prog.rules.length !== 1)
                throw new Error('Cannot use multiple rules in an example command');
            let ruleprog, args;
            if (prog.rules.length === 1) {
                ruleprog = prog;
                args = {};
            } else {
                ruleprog = ThingTalk.Generate.declarationProgram(prog.declarations[0]);
                args = prog.declarations[0].args;
            }

            // try and convert to NN
            ThingTalk.NNSyntax.toNN(ruleprog, {});
            // validate placeholders in the utterance
            this._validateUtterance(args, ex.utterance);

            // rewrite the program using canonical syntax
            ex.program = ThingTalk.Ast.prettyprint(prog, true).trim();
        }).catch((e) => {
            throw new Error(`Error in Example ${i+1}: ${e.message}`);
        });
    },

    tokenizeAllExamples(language, examples) {
        return Promise.all(examples.map((ex, i) => {
            let replaced = '';
            let params = [];

            for (let chunk of split(ex.utterance, PARAM_REGEX)) {
                if (chunk === '')
                    continue;
                if (typeof chunk === 'string') {
                    replaced += chunk;
                    continue;
                }

                let [match, param1, param2, opt] = chunk;
                if (match === '$$') {
                    replaced += '$';
                    continue;
                }
                let param = param1 || param2;
                replaced += '____ ';
                params.push([param, opt]);
            }

            return TokenizerService.tokenize(language, replaced).then(({tokens, entities}) => {
                if (Object.keys(entities).length > 0)
                    throw new Error(`Error in Example ${i+1}: Cannot have entities in the utterance`);
                
                let preprocessed = '';
                let first = true;
                for (let token of tokens) {
                    if (token === '____') {
                        let [param, opt] = params.shift();
                        if (opt)
                            token = '${' + param + ':' + opt + '}';
                        else
                            token = '${' + param + '}';
                    } else if (token === '$') {
                        token = '$$';
                    }
                    if (!first)
                        preprocessed += ' ';
                    preprocessed += token;
                    first = false;
                }
                return { program: ex.program, utterance: ex.utterance, preprocessed };
            });
        }));
    },

    validateAllInvocations(kind, ast) {
        if (!KIND_REGEX.test(kind))
            throw new Error("Invalid ID, must use alphanumeric characters, underscore and period only.");
        if (FORBIDDEN_NAMES.has(kind))
            throw new Error(`${kind} is not allowed as a device ID`);

        if (!ast.actions)
            ast.actions = {};
        if (!ast.queries)
            ast.queries = {};
        if (ast.triggers && Object.keys(ast.triggers).length > 0)
            throw new Error("Triggers don't exist any more, delete all of them");

        let entities = new Set;
        this.validateInvocation(ast.actions, 'action', entities);
        this.validateInvocation(ast.queries, 'query', entities);

        if (!ast.examples)
            ast.examples = [];

        let schemaRetriever = new SingleDeviceSchemaRetriever(kind, ast);
        return Promise.all(ast.examples.map(this._validateExample.bind(this, schemaRetriever))).then(() => entities);
    }
};
