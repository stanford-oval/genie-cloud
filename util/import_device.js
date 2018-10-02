// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const fs = require('fs');
const JSZip = require('jszip');
const ThingTalk = require('thingtalk');

const code_storage = require('../util/code_storage');
const model = require('../model/device');
const schema = require('../model/schema');
const user = require('../util/user');
const exampleModel = require('../model/example');
const entityModel = require('../model/entity');
const Validation = require('../util/validation');
const ManifestToSchema = require('../util/manifest_to_schema');
const tokenizer = require('../util/tokenize');
const graphics = require('../almond/graphics');
const colorScheme = require('../util/color_scheme');

function schemaCompatible(s1, s2) {
    return s1.length >= s2.length &&
        s2.every((t, i) => {
            if (t === s1[i]) return true;
            var t1 = ThingTalk.Type.fromString(t);
            var t2 = ThingTalk.Type.fromString(s1[i]);
            return t1.equals(t2);
        });
}

function validateSchema(dbClient, types, ast, req) {
    if (types.length === 0)
        return Promise.resolve();

    return schema.getTypesAndNamesByKinds(dbClient, types, req.user.developer_org).then((rows) => {
        if (rows.length < types.length)
            throw new Error(req._("Invalid device types %s").format(types));

        function validate(where, what, against, type) {
            for (var name in against) {
                if (!(name in where))
                    throw new Error(req._("Type %s requires %s %s").format(type, what, name));
                var types = where[name].args.map((a) => a.type);
                if (!schemaCompatible(types, against[name].types))
                    throw new Error(req._("Schema for %s is not compatible with type %s").format(name, type));
            }
        }

        for (let row of rows) {
            validate(ast.actions, 'action', row.actions, row.kind);
            validate(ast.queries, 'query', row.queries, row.kind);
        }
    });
}

const CATEGORIES = new Set(['physical','data','online','system']);
const CATEGORY_TYPES = new Set(['data-source', 'online-account', 'thingengine-system']);
const SUBCATEGORIES = new Set(['service','media','social-network','communication','home','health','data-management']);
const ALLOWED_MODULE_TYPES = new Set(['org.thingpedia.v2', 'org.thingpedia.v1', 'org.thingpedia.rss', 'org.thingpedia.rest_json', 'org.thingpedia.builtin', 'org.thingpedia.generic_rest.v1', 'org.thingpedia.embedded']);
const JAVASCRIPT_MODULE_TYPES = new Set(['org.thingpedia.v1', 'org.thingpedia.v2', 'org.thingpedia.builtin']);
const AUTH_TYPES = new Set(['none','oauth2','basic','builtin','discovery','interactive']);

function validateDevice(dbClient, req, options, ast = null) {
    var name = options.name;
    var description = options.description;
    var kind = options.primary_kind;

    if (!name || !description || !kind)
        throw new Error(req._("Not all required fields were present"));

    if (ast === null)
        ast = JSON.parse(options.code);
    if (!ast.module_type || !ALLOWED_MODULE_TYPES.has(ast.module_type))
        throw new Error(req._("Invalid module type"));
    const fullcode = !JAVASCRIPT_MODULE_TYPES.has(ast.module_type);

    if (!ast.params)
        ast.params = {};
    if (!ast.types)
        ast.types = [];
    if (!ast.child_types)
        ast.child_types = [];
    if (!ast.auth)
        ast.auth = {"type":"none"};
    if (ast.module_type === 'org.thingpedia.embedded') {
        ast.auth.type = 'builtin';
        ast.params = {};
    }
    if (!ast.auth.type || !AUTH_TYPES.has(ast.auth.type))
        throw new Error(req._("Invalid authentication type"));
    if (ast.auth.type === 'basic' && (!ast.params.username || !ast.params.password))
        throw new Error(req._("Username and password must be declared for basic authentication"));
    if (!CATEGORIES.has(ast.category))
        throw new Error(req._("Invalid category %s").format(ast.category));
    if (!SUBCATEGORIES.has(ast.subcategory))
        throw new Error(req._("Invalid device domain %s").format(ast.subcategory));
    //if (ast.auth.type === 'oauth2' && !ast.auth.client_id && !ast.auth.client_secret)
    //    throw new Error(req._("Client ID and Client Secret must be provided for OAuth 2 authentication"));
    ast.types = ast.types.filter((t) => {
        return !CATEGORY_TYPES.has(t) && !SUBCATEGORIES.has(t);
    });
    ast.child_types.forEach((t) => {
        if (CATEGORY_TYPES.has(t) || SUBCATEGORIES.has(t))
            throw new Error(req._("Cannot specify category %s as child type").format(t));
    });
    if (ast['global-name'])
        throw new Error(req._("Global names are obsolete, remove them"));

    return Promise.resolve().then(() => {
        return Validation.validateAllInvocations(kind, ast);
    }).then((entities) => {
        return entityModel.checkAllExist(dbClient, Array.from(entities));
    }).then(() => {
        if (fullcode && ast.module_type !== 'org.thingpedia.embedded') {
            if (!ast.name)
                ast.name = name;
            if (!ast.description)
                ast.description = description;
            for (let name in ast.triggers) {
                if (!ast.triggers[name].url)
                    throw new Error(req._("Missing trigger url for %s").format(name));
            }
            for (let name in ast.actions) {
                if (!ast.actions[name].url)
                    throw new Error(req._("Missing action url for %s").format(name));
            }
            for (let name in ast.queries) {
                if (!ast.queries[name].url)
                    throw new Error(req._("Missing query url for %s").format(name));
            }
        }

        return validateSchema(dbClient, ast.types, ast, req);
    }).then(() => ast);
}

function ensurePrimarySchema(dbClient, name, kind, ast, req, approve) {
    const metas = ManifestToSchema.toSchema(ast);

    return schema.getByKind(dbClient, kind).then((existing) => {
        if (existing.owner !== req.user.developer_org &&
            req.user.developer_status < user.DeveloperStatus.ADMIN)
            throw new Error(req._("Not Authorized"));

        var obj = {
            kind_canonical: tokenizer.tokenize(name).join(' '),
            developer_version: existing.developer_version + 1
        };
        if (req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER && approve)
            obj.approved_version = obj.developer_version;

        return schema.update(dbClient, existing.id, existing.kind, obj, metas);
    }, (e) => {
        var obj = {
            kind: kind,
            kind_canonical: tokenizer.tokenize(name).join(' '),
            kind_type: 'primary',
            owner: req.user.developer_org
        };
        if (req.user.developer_status < user.DeveloperStatus.TRUSTED_DEVELOPER || !approve) {
            obj.approved_version = null;
            obj.developer_version = 0;
        } else {
            obj.approved_version = 0;
            obj.developer_version = 0;
        }
        return schema.create(dbClient, obj, metas);
    }).then((schema) => {
        return ensureExamples(dbClient, schema.id, ast);
    });
}

function ensureExamples(dbClient, schemaId, ast) {
    return exampleModel.deleteBySchema(dbClient, schemaId, 'en').then(() => {
        return Validation.tokenizeAllExamples('en', ast.examples);
    }).then((examples) => {
        return exampleModel.createMany(dbClient, examples.map((ex) => {
            return ({
                schema_id: schemaId,
                utterance: ex.utterance,
                preprocessed: ex.preprocessed,
                target_code: ex.program,
                target_json: '', // FIXME
                type: 'thingpedia',
                language: 'en',
                is_base: 1
            });
        }));
    });
}

function uploadZipFile(req, obj, ast, stream) {
    var zipFile = new JSZip();

    return Promise.resolve().then(() => {
        // unfortunately JSZip only loads from memory, so we need to load the entire file
        // at once
        // this is somewhat a problem, because the file can be up to 30-50MB in size
        // we just hope the GC will get rid of the buffer quickly

        var buffers = [];
        var length = 0;
        return new Promise((callback, errback) => {
            stream.on('data', (buffer) => {
                buffers.push(buffer);
                length += buffer.length;
            });
            stream.on('end', () => {
                callback(Buffer.concat(buffers, length));
            });
            stream.on('error', errback);
        });
    }).then((buffer) => {
        return zipFile.loadAsync(buffer, { checkCRC32: false });
    }).then(() => {
        var packageJson = zipFile.file('package.json');
        if (!packageJson)
            throw new Error(req._("package.json missing from device zip file"));

        return packageJson.async('string');
    }).then((text) => {
        try {
            var parsed = JSON.parse(text);
        } catch(e) {
            throw new Error("Invalid package.json: SyntaxError at line " + e.lineNumber + ": " + e.message);
        }
        if (!parsed.name || !parsed.main)
            throw new Error(req._("Invalid package.json (missing name or main)"));

        parsed['thingpedia-version'] = obj.developer_version;

        zipFile.file('package.json', JSON.stringify(parsed));

        return code_storage.storeZipFile(zipFile.generateNodeStream({ compression: 'DEFLATE',
                                                                      type: 'nodebuffer',
                                                                      platform: 'UNIX'}),
                                         obj.primary_kind, obj.developer_version);
    }).catch((e) => {
        console.error('Failed to upload zip file to S3: ' + e);
        console.error(e.stack);
        throw e;
    });
}

function uploadJavaScript(req, obj, ast, stream) {
    var zipFile = new JSZip();

    return Promise.resolve().then(() => {
        zipFile.file('package.json', JSON.stringify({
            name: obj.primary_kind,
            author: req.user.username + '@thingpedia.stanford.edu',
            main: 'index.js',
            'thingpedia-version': obj.developer_version
        }));
        zipFile.file('index.js', stream);
        return code_storage.storeZipFile(zipFile.generateNodeStream({ compression: 'DEFLATE',
                                                                      type: 'nodebuffer',
                                                                      platform: 'UNIX'}),
                                         obj.primary_kind, obj.developer_version);
    }).catch((e) => {
        console.error('Failed to upload zip file to S3: ' + e);
        console.error(e.stack);
        throw e;
    });
}

function isFullCode(moduleType) {
    return !JAVASCRIPT_MODULE_TYPES.has(moduleType);
}

async function uploadIcon(primary_kind, iconPath, deleteAfterwards = true) {
    try {
        var image = graphics.createImageFromPath(iconPath);
        image.resizeFit(512, 512);
        const [stdout,] = await image.stream('png');
        await code_storage.storeIcon(stdout, primary_kind);
        await colorScheme(iconPath, primary_kind);
    } catch(e) {
        console.error('Failed to upload icon to S3: ' + e);
        console.error(e.stack);
    } finally {
        if (deleteAfterwards)
            await Q.nfcall(fs.unlink, iconPath);
    }
}

async function importDevice(dbClient, req, primary_kind, manifest, { owner = 0, zipFilePath = null, iconPath = null, approve = true }) {
    const device = {
        primary_kind: primary_kind,
        owner: owner,
        name: manifest.thingpedia_name,
        description: manifest.thingpedia_description,
        fullcode: isFullCode(manifest.module_type),
        module_type: manifest.module_type,
        category: manifest.category,
        subcategory: manifest.subcategory,
        approved_version: (approve ? 0 : null),
        developer_version: 0
    };
    delete manifest.thingpedia_name;
    delete manifest.thingpedia_description;

    await validateDevice(dbClient, req, device, manifest);

    await ensurePrimarySchema(dbClient, device.name, device.primary_kind,
                              manifest, req, approve);

    var extraKinds = manifest.types;
    var extraChildKinds = manifest.child_types;

    await model.create(dbClient, device, extraKinds,
                       extraChildKinds,
                       JSON.stringify(manifest));

    if (device.fullcode || device.module_type === 'org.thingpedia.builtin')
        return device;

    if (zipFilePath === null)
        return device;

    if (zipFilePath.endsWith('.js')) {
        await uploadJavaScript(req, device, manifest,
                               fs.createReadStream(zipFilePath));
    } else {
        await uploadZipFile(req, device, manifest,
                            fs.createReadStream(zipFilePath));
    }

    if (iconPath !== null)
        uploadIcon(device.primary_kind, iconPath, false);

    return device;
}

function migrateManifest(code, device) {
    let ast = JSON.parse(code);

    delete ast.global_name;
    delete ast['global-name'];
    ast.category = device.category;
    ast.subcategory = device.subcategory;

    ast.types = (ast.types || []).filter((t) => {
        if (CATEGORY_TYPES.has(t) || SUBCATEGORIES.has(t))
            return false;
        return true;
    });
    ast.child_types = ast.child_types || [];

    for (let function_type of ['triggers','queries']) {
        for (let function_name in ast[function_type]) {
            let function_obj = ast[function_type][function_name];

            if (!('poll_interval' in function_obj))
                function_obj.poll_interval = function_obj['poll-interval'] || -1;
            delete function_obj['poll-interval'];
        }
    }

    // examples are now stored elsewhere
    delete ast.examples;

    return ast;
}

module.exports = {
    validateDevice,
    ensurePrimarySchema,

    isFullCode,
    uploadZipFile,
    uploadJavaScript,
    uploadIcon,

    importDevice,

    migrateManifest
};
