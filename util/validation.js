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

const { clean, splitParams } = require('./tokenize');
const ThingpediaClient = require('./thingpedia-client');
const getExampleName = require('./example_names');
const { ValidationError } = require('./errors');
const userUtils = require('./user');
const I18n = require('./i18n');

assert(typeof ThingpediaClient === 'function');

const JAVASCRIPT_MODULE_TYPES = new Set([
    'org.thingpedia.v1', 'org.thingpedia.v2',
    'org.thingpedia.builtin', 'org.thingpedia.embedded'
]);
const SUBCATEGORIES = new Set(['service','media','social-network','communication','home','health','data-management']);

const FORBIDDEN_NAMES = new Set(['__count__', '__noSuchMethod__', '__parent__',
'__proto__', 'constructor', '__defineGetter__', '__defineSetter__', '__lookupGetter__',
'__lookupSetter__', 'eval', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
'toLocaleString', 'toSource', 'toString', 'valueOf']);

const ALLOWED_ARG_METADATA = new Set(['canonical', 'prompt']);
const ALLOWED_FUNCTION_METADATA = new Set(['canonical', 'confirmation', 'confirmation_remote', 'formatted']);
const ALLOWED_CLASS_METADATA = new Set(['name', 'description', 'thingpedia_name', 'thingpedia_description', 'canonical']);

function validateAnnotations(annotations) {
    for (let name of Object.getOwnPropertyNames(annotations)) {
        if (FORBIDDEN_NAMES.has(name))
            throw new ValidationError(`Invalid implementation annotation ${name}`);
    }
}
function validateMetadata(metadata, allowed) {
    for (let name of Object.getOwnPropertyNames(metadata)) {
        if (!allowed.has(name))
            throw new ValidationError(`Invalid natural language annotation ${name}`);
    }
}

async function loadClassDef(dbClient, req, kind, classCode, datasetCode) {
    const tpClient = new ThingpediaClient(req.user.developer_key, req.user.locale, dbClient);
    const schemaRetriever = new ThingTalk.SchemaRetriever(tpClient, null, true);

    let parsed;
    try {
        parsed = await ThingTalk.Grammar.parseAndTypecheck(`${classCode}\n${datasetCode}`, schemaRetriever, true);
    } catch(e) {
        if (e.name === 'SyntaxError' && e.location) {
            let lineNumber = e.location.start.line;
            // add 1 for the \n that we add to separate classCode and datasetCode
            console.log(classCode);
            const classLength = 1 + classCode.split('\n').length;
            const fileName = lineNumber > classLength ? 'dataset.tt' : 'manifest.tt';
            // mind the 1-based line numbers...
            lineNumber = lineNumber > classLength ? lineNumber - classLength + 1 : lineNumber;
            throw new ValidationError(`Syntax error in ${fileName} line ${lineNumber}: ${e.message}`);
        } else {
            throw new ValidationError(e.message);
        }
    }

    if (!parsed.isMeta || parsed.classes.length !== 1 ||
        (kind !== null && parsed.classes[0].kind !== kind))
        throw new ValidationError("Invalid manifest file: must contain exactly one class, with the same identifier as the device");
    const classDef = parsed.classes[0];

    if (parsed.datasets.length > 1 || (parsed.datasets.length > 0 && parsed.datasets[0].name !== '@' + kind))
        throw new ValidationError("Invalid dataset file: must contain exactly one dataset, with the same identifier as the class");
    if (parsed.datasets.length > 0 && parsed.datasets[0].language !== 'en')
        throw new ValidationError("The dataset must be for English: use `en` as the language tag.");
    const dataset = parsed.datasets.length > 0 ? parsed.datasets[0] :
        new ThingTalk.Ast.Dataset(null, '@' + kind, 'en', [], {});

    return [classDef, dataset];
}

async function validateDevice(dbClient, req, options, classCode, datasetCode) {
    const name = options.name;
    const description = options.description;
    const kind = options.primary_kind;
    const license = options.license;

    if (!name || !description || !kind || !license)
        throw new ValidationError("Not all required fields were present");
    validateTag(kind, req.user, userUtils.Role.THINGPEDIA_ADMIN);

    if (!SUBCATEGORIES.has(options.subcategory))
        throw new ValidationError(req._("Invalid device category %s").format(options.subcategory));
    const [classDef, dataset] = await loadClassDef(dbClient, req, kind, classCode, datasetCode);
    validateMetadata(classDef.metadata, ALLOWED_CLASS_METADATA);
    validateAnnotations(classDef.annotations);

    if (!classDef.is_abstract) {
        if (!classDef.loader)
            throw new ValidationError("loader mixin missing from class declaration");
        if (!classDef.config)
            classDef.imports.push(new ThingTalk.Ast.ImportStmt.Mixin(null, ['config'], 'org.thingpedia.config.none', []));
    }

    const moduleType = classDef.is_abstract ? null : classDef.loader.module;
    const fullcode = !classDef.is_abstract && !JAVASCRIPT_MODULE_TYPES.has(moduleType);

    const [entities, stringTypes] = await validateAllInvocations(classDef, {
        checkPollInterval: !classDef.is_abstract,
        checkUrl: fullcode,
        deviceName: name
    });
    const missingEntities = await entityModel.findNonExisting(dbClient, entities);
    if (missingEntities.length > 0)
        throw new ValidationError('Invalid entity types: ' + missingEntities.join(', '));

    const missingStrings = await stringModel.findNonExisting(dbClient, stringTypes);
    if (missingStrings.length > 0)
        throw new ValidationError('Invalid string types: ' + missingStrings.join(', '));

    const tokenizer = I18n.get('en-US').genie.getTokenizer();
    if (!classDef.metadata.name)
        classDef.metadata.name = name;
    if (!classDef.metadata.description)
        classDef.metadata.description = description;
    if (!classDef.metadata.canonical)
        classDef.metadata.canonical = tokenizer.tokenize(name).tokens.join(' ');
    await validateDataset(dataset);

    // delete annotations that are specific to devices uploaded with the "thingpedia" CLI tool
    // and are stored elsewhere in Thingpedia
    delete classDef.metadata.thingpedia_name;
    delete classDef.metadata.thingpedia_description;
    for (let key of ['license', 'license_gplcompatible', 'subcategory', 'website', 'repository', 'issue_tracker'])
        delete classDef.annotations[key];

    return [classDef, dataset];
}

function autogenExampleName(ex, names) {
    let baseName = getExampleName(ex);

    if (!names.has(baseName)) {
        names.add(baseName);
        return baseName;
    }

    let counter = 1;
    let name = baseName + counter;
    while (names.has(name)) {
        counter ++;
        name = baseName + counter;
    }
    names.add(name);
    return name;
}

function validateDataset(dataset) {
    const names = new Set;
    dataset.examples.forEach((ex, i) => {
        try {
            let ruleprog = ex.toProgram();

            // try and convert to NN
            ThingTalk.NNSyntax.toNN(ruleprog, {});

            // validate placeholders in all utterances
            validateAnnotations(ex.annotations);
            if (ex.utterances.length === 0) {
                if (Object.prototype.hasOwnProperty.call(ex.annotations, 'utterances'))
                    throw new ValidationError(`utterances must be a natural language annotation (with #_[]), not an implementation annotation`);
                else
                    throw new ValidationError(`missing utterances annotation`);
            }

            if (ex.annotations.name) {
                if (typeof ex.annotations.name !== 'string')
                    throw new ValidationError(`invalid #[name] annotation (must be a string)`);
                if (ex.annotations.name.length > 128)
                    throw new ValidationError(`the #[name] annotation must be at most 128 characters`);
                if (names.has(ex.annotations.name))
                    throw new ValidationError(`duplicate name`);
                names.add(ex.annotations.name);
            } else {
                ex.annotations.name = autogenExampleName(ex, names);
            }

            for (let utterance of ex.utterances)
                validateUtterance(ex.args, utterance);
        } catch(e) {
            throw new ValidationError(`Error in example ${i+1}: ${e.message}`);
        }
    });
}

function validateUtterance(args, utterance) {
    if (/_{4}/.test(utterance))
        throw new ValidationError('Do not use blanks (4 underscores or more) in utterance, use placeholders');

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
            throw new ValidationError(`Invalid placeholder ${param}`);
        if (opt && opt !== 'const' && opt !== 'no-undefined')
            throw new ValidationError(`Invalid placeholder option ${opt} for ${param}`);
        placeholders.add(param);
    }

    for (let arg in args) {
        if (!placeholders.has(arg))
            throw new ValidationError(`Missing placeholder for argument ${arg}`);
    }
}

function validateAllInvocations(classDef, options = {}) {

    let entities = new Set;
    let stringTypes = new Set;
    validateInvocation(classDef.kind, classDef.actions, 'action', entities, stringTypes, options);
    validateInvocation(classDef.kind, classDef.queries, 'query', entities, stringTypes, options);
    return [Array.from(entities), Array.from(stringTypes)];
}

function autogenCanonical(tokenizer, name, kind, deviceName) {
    return `${clean(name)} on ${deviceName ? tokenizer.tokenize(deviceName).tokens.join(' ') : cleanKind(kind)}`;
}

function validateInvocation(kind, where, what, entities, stringTypes, options = {}) {
    const tokenizer = I18n.get('en-US').genie.getTokenizer();
    for (const name in where) {
        if (FORBIDDEN_NAMES.has(name))
            throw new ValidationError(`${name} is not allowed as a function name`);
        validateMetadata(where[name].metadata, ALLOWED_FUNCTION_METADATA);
        validateAnnotations(where[name].annotations);

        if (!where[name].metadata.canonical)
            where[name].metadata.canonical = autogenCanonical(tokenizer, name, kind, options.deviceName);
        if (where[name].metadata.canonical.indexOf('$') >= 0)
            throw new ValidationError(`Detected placeholder in canonical form for ${name}: this is incorrect, the canonical form must not contain parameters`);
        if (!where[name].metadata.confirmation)
            throw new ValidationError(`Missing confirmation for ${name}`);
        if (where[name].annotations.confirm) {
            if (!where[name].annotations.confirm.isBoolean)
                throw new ValidationError(`Invalid #[confirm] annotation for ${name}, must be a Boolean`);
        } else {
            if (what === 'query')
                where[name].annotations.confirm = new ThingTalk.Ast.Value.Boolean(false);
            else
                where[name].annotations.confirm = new ThingTalk.Ast.Value.Boolean(true);
        }
        if (options.checkPollInterval && what === 'query' && where[name].is_monitorable) {
            if (!where[name].annotations.poll_interval)
                throw new ValidationError(`Missing poll interval for monitorable query ${name}`);
            if (where[name].annotations.poll_interval.toJS() < 0)
                throw new ValidationError(`Invalid negative poll interval for monitorable query ${name}`);
        }
        if (options.checkUrl) {
            if (!where[name].annotations.url)
                throw new ValidationError(`Missing ${what} url for ${name}`);
        }

        for (const argname of where[name].args) {
            if (FORBIDDEN_NAMES.has(argname))
                throw new ValidationError(`${argname} is not allowed as argument name in ${name}`);
            let type = where[name].getArgType(argname);
            while (type.isArray)
                type = type.elem;
            const arg = where[name].getArgument(argname);
            validateMetadata(arg.metadata, ALLOWED_ARG_METADATA);
            validateAnnotations(arg.annotations);

            if (type.isEntity) {
                entities.add(type.type);
                if (arg.annotations['string_values'])
                    stringTypes.add(arg.annotations['string_values'].toJS());
            } else if (type.isString) {
                if (arg.annotations['string_values'])
                    stringTypes.add(arg.annotations['string_values'].toJS());
            } else {
                if (arg.annotations['string_values'])
                    throw new ValidationError('The string_values annotation is valid only for String-typed parameters');
            }
            if (!arg.metadata.canonical)
                arg.metadata.canonical = clean(argname);
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

function tokenizeOneExample(id, utterance, language) {
    let replaced = '';
    let params = [];

    for (let chunk of splitParams(utterance.trim())) {
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

    const tokenizer = I18n.get(language).genie.getTokenizer();
    const {tokens, entities} = tokenizer.tokenize(replaced);
    if (Object.keys(entities).length > 0)
        throw new ValidationError(`Error in Example ${id}: Cannot have entities in the utterance`);

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

    return preprocessed;
}

async function tokenizeDataset(dataset) {
    return Promise.all(dataset.examples.map(async (ex, i) => {
        await Promise.all(ex.utterances.map(async (_, j) => {
            ex.preprocessed[j] = await tokenizeOneExample(i+1, ex.utterances[j], dataset.language);
        }));
    }));
}


function validateTag(tag, user, adminRole) {
    // first the security/well-formedness checks
    // the name must be a valid DNS name: multiple parts separated
    // by '.'; each part must be alphanumeric, -, or _,
    // and must be both a valid hostname and a valid ThingTalk class-identifier
    // (not start or end with -, not start with a number)
    if (!/^([A-Za-z_][A-Za-z0-9_.-]*)$/.test(tag))
        throw new ValidationError(`Invalid ID ${tag}`);

    if (/\.(js|json|css|htm|html|xml|jpg|jpeg|png|gif|bmp|ico|tif|tiff|woff)$/i.test(tag))
        throw new ValidationError(`Invalid ID ${tag}`);

    const parts = tag.split('.');
    for (let part of parts) {
        if (part.length === 0 || /^[-0-9]/.test(part) || part.endsWith('-'))
            throw new ValidationError(`Invalid ID ${tag}`);

        // JS reserved words and unsafe names are forbidden
        if (FORBIDDEN_NAMES.has(part))
            throw new ValidationError(`${tag} is not allowed as ID because it contains the unsafe keyword ${part}`);
    }

    if (Buffer.from(tag, 'utf8').length > 128)
        throw new ValidationError("The chosen identifier is too long");

    // now the naming convention checks

    // if there is an admin role in this context, and the user has it, anything is allowed
    if (adminRole !== undefined && (user.roles & adminRole) === adminRole)
        return;

    // otherwise, single part names (no dots) are always disallowed
    // names in the org.thingpedia namespace are also disallowed

    if (parts.length <= 1)
        throw new ValidationError(`Invalid ID ${tag}: must contain at least one period`);

    // if the user is in the root org, they're allowed org.thingpedia
    if (user.developer_org === 1)
        return;

    if (parts[0] === 'org' && parts[1] === 'thingpedia') {
        // ignore the 'org.thingpedia.builtin.test' and 'org.thingpedia.test' namespaces, which are free-for-all
        if (parts[2] === 'test' || (parts[2] === 'builtin' && parts[3] === 'test'))
            return;

        throw new ValidationError(`Invalid ID ${tag}: the @org.thingpedia namespace is reserved`);
    }
}

module.exports = {
    ValidationError,

    JAVASCRIPT_MODULE_TYPES,
    cleanKind,

    validateDevice,
    validateDataset,
    validateTag,

    tokenizeDataset,
};
