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

const assert = require('assert');
const ThingTalk = require('thingtalk');

const entityModel = require('../model/entity');
const stringModel = require('../model/strings');

const { clean, splitParams, tokenize } = require('./tokenize');
const TokenizerService = require('./tokenizer_service');
const ThingpediaClient = require('./thingpedia-client');

assert(typeof ThingpediaClient === 'function');

const JAVASCRIPT_MODULE_TYPES = new Set([
    'org.thingpedia.v1', 'org.thingpedia.v2',
    'org.thingpedia.builtin', 'org.thingpedia.embedded'
]);
const SUBCATEGORIES = new Set(['service','media','social-network','communication','home','health','data-management']);

const FORBIDDEN_NAMES = new Set(['__count__', '__noSuchMethod__', '__parent__',
'__proto__', 'constructor', '__defineGetter__', '__defineSetter__', '__lookupGetter__',
'__lookupSetter__', 'eval', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
'toLocaleString', 'toSource', 'toString', 'unwatch', 'watch', 'valueOf']);


async function loadClassDef(dbClient, req, kind, classCode, datasetCode) {
    const tpClient = new ThingpediaClient(req.user.developer_key, req.user.locale, dbClient);
    const schemaRetriever = new ThingTalk.SchemaRetriever(tpClient, null, true);

    let parsed;
    try {
        parsed = await ThingTalk.Grammar.parseAndTypecheck(`${classCode}\n${datasetCode}`, schemaRetriever, true);
    } catch(e) {
        if (e.name === 'SyntaxError' && e.location) {
            const lineNumber = e.location.start.line;
            // add 1 for the \n that we add to separate classCode and datasetCode
            console.log(classCode);
            const classLength = 1 + classCode.split('\n').length;
            e.fileName = lineNumber > classLength ? 'dataset.tt' : 'manifest.tt';
            // mind the 1-based line numbers...
            e.lineNumber = lineNumber > classLength ? lineNumber - classLength + 1 : lineNumber;
        }
        throw e;
    }

    if (!parsed.isMeta || parsed.classes.length !== 1 ||
        (kind !== null && parsed.classes[0].kind !== kind))
        throw new Error("Invalid manifest file: must contain exactly one class, with the same identifier as the device");
    const classDef = parsed.classes[0];

    if (parsed.datasets.length > 1 || (parsed.datasets.length > 0 && parsed.datasets[0].name !== '@' + kind))
        throw new Error("Invalid dataset file: must contain exactly one dataset, with the same identifier as the class");
    const dataset = parsed.datasets.length > 0 ? parsed.datasets[0] :
        new ThingTalk.Ast.Dataset('@' + kind, 'en', [], {});

    return [classDef, dataset];
}

async function validateSchema(dbClient, req, options, classCode, datasetCode) {
    const [classDef, dataset] = await loadClassDef(dbClient, req, options.kind || null,
        classCode, datasetCode);

    const [entities, stringTypes] = await validateAllInvocations(classDef, {
        checkPollInterval: false,
        checkUrl: false,
        deviceName: null
    });
    await entityModel.checkAllExist(dbClient, entities);
    await stringModel.checkAllExist(dbClient, stringTypes);
    await validateDataset(dataset);

    return [classDef, dataset];
}

async function validateDevice(dbClient, req, options, classCode, datasetCode) {
    const name = options.name;
    const description = options.description;
    const kind = options.primary_kind;

    if (!name || !description || !kind)
        throw new Error("Not all required fields were present");
    if (!SUBCATEGORIES.has(options.subcategory))
        throw new Error(req._("Invalid device category %s").format(options.subcategory));
    const [classDef, dataset] = await loadClassDef(dbClient, req, kind, classCode, datasetCode);

    if (!classDef.loader)
        throw new Error("loader mixin missing from class declaration");
    if (!classDef.config)
        classDef.imports.push(new ThingTalk.Ast.ImportStmt.Mixin(['config'], 'org.thingpedia.config.none', []));

    const moduleType = classDef.loader.module;
    const fullcode = !JAVASCRIPT_MODULE_TYPES.has(moduleType);

    const [entities, stringTypes] = await validateAllInvocations(classDef, {
        checkPollInterval: true,
        checkUrl: fullcode,
        deviceName: name
    });
    await entityModel.checkAllExist(dbClient, entities);
    await stringModel.checkAllExist(dbClient, stringTypes);
    if (fullcode) {
        if (!classDef.metadata.name)
            classDef.metadata.name = name;
        if (!classDef.metadata.description)
            classDef.metadata.description = name;
    }
    await validateDataset(dataset);

    return [classDef, dataset];
}

function validateDataset(dataset) {
    dataset.examples.forEach((ex, i) => {
        try {
            let ruleprog = ex.toProgram();

            // try and convert to NN
            ThingTalk.NNSyntax.toNN(ruleprog, {});

            // validate placeholders in all utterances
            for (let utterance of ex.utterances)
                validateUtterance(ex.args, utterance);
        } catch(e) {
            throw new Error(`Error in example ${i+1}: ${e.message}`);
        }
    });
}

function validateUtterance(args, utterance) {
    if (/_{4}/.test(utterance))
        throw new Error('Do not use blanks (4 underscores or more) in utterance, use placeholders');

    let placeholders = new Set;
    for (let chunk of splitParams(utterance.trim())) {
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
}

function validateAllInvocations(classDef, options = {}) {
    if (FORBIDDEN_NAMES.has(classDef.kind))
        throw new Error(`${classDef.kind} is not allowed as a device ID`);

    let entities = new Set;
    let stringTypes = new Set;
    validateInvocation(classDef.kind, classDef.actions, 'action', entities, stringTypes, options);
    validateInvocation(classDef.kind, classDef.queries, 'query', entities, stringTypes, options);
    return [Array.from(entities), Array.from(stringTypes)];
}

function autogenCanonical(name, kind, deviceName) {
    return `${clean(name)} on ${deviceName ? tokenize(deviceName).join(' ') : cleanKind(kind)}`;
}

function validateInvocation(kind, where, what, entities, stringTypes, options = {}) {
    for (const name in where) {
        if (FORBIDDEN_NAMES.has(name))
            throw new Error(`${name} is not allowed as a function name`);

        if (!where[name].metadata.canonical)
            where[name].metadata.canonical = autogenCanonical(name, kind, options.deviceName);
        if (where[name].metadata.canonical.indexOf('$') >= 0)
            throw new Error(`Detected placeholder in canonical form for ${name}: this is incorrect, the canonical form must not contain parameters`);
        if (!where[name].metadata.confirmation)
            throw new Error(`Missing confirmation for ${name}`);
        if (options.checkPollInterval && what === 'query' && where[name].is_monitorable) {
            if (!where[name].annotations.poll_interval)
                throw new Error(`Missing poll interval for monitorable query ${name}`);
            if (where[name].annotations.poll_interval.toJS() < 0)
                throw new Error(`Invalid negative poll interval for monitorable query ${name}`);
        }
        if (options.checkUrl) {
            if (!where[name].annotations.url)
                throw new Error(`Missing ${what} url for ${name}`);
        }

        for (const argname of where[name].args) {
            if (FORBIDDEN_NAMES.has(argname))
                throw new Error(`${argname} is not allowed as argument name in ${name}`);
            const type = where[name].getArgType(argname);
            const arg = where[name].getArgument(argname);
            if (type.isEntity) {
                entities.add(type.type);
            } else if (type.isString) {
                if (arg.annotations['string_values'])
                    stringTypes.add(arg.annotations['string_values'].toJS());
            } else {
                if (arg.annotations['string_values'])
                    throw new Error('The string_values annotation is valid only for String-typed parameters');
            }
            if (!arg.metadata.canonical)
                arg.metadata.canonical = clean(argname);
            if (arg.required && !arg.metadata.prompt)
                throw new Error('Required argument ' + name + '.' + arg.name + ' must have a slot filling prompt');
        }
    }
}

function cleanKind(kind) {
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
}

module.exports = {
    JAVASCRIPT_MODULE_TYPES,
    cleanKind,

    validateDevice,
    validateSchema,
    validateDataset,

    tokenizeAllExamples(language, examples) {
        return Promise.all(examples.map(async (ex, i) => {
            let replaced = '';
            let params = [];

            for (let chunk of splitParams(ex.utterance.trim())) {
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

            const {tokens, entities} = await TokenizerService.tokenize(language, replaced);
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

            ex.preprocessed = preprocessed ;
        }));
    }
};
