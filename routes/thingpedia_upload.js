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
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const csurf = require('csurf');
const JSZip = require('jszip');
const ThingTalk = require('thingtalk');
const Tp = require('thingpedia');

var db = require('../util/db');
var code_storage = require('../util/code_storage');
var model = require('../model/device');
var schema = require('../model/schema');
var user = require('../util/user');
var exampleModel = require('../model/example');
var entityModel = require('../model/entity');
var Validation = require('../util/validation');
var ManifestToSchema = require('../util/manifest_to_schema');
var TrainingServer = require('../util/training_server');
var Config = require('../config');

const PARAM_REGEX = /\$(?:([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/;

var router = express.Router();

router.use(multer({ dest: platform.getTmpDir() }).fields([
    { name: 'zipfile', maxCount: 1 },
    { name: 'icon', maxCount: 1 }
]));
router.use(csurf({ cookie: false }));

const DEFAULT_CODE = {"module_type": "org.thingpedia.v2",
                      "params": {},
                      "auth": {"type": "none"},
                      "types": [],
                      "child_types": [],
                      "queries": {},
                      "actions": {},
                    };

router.get('/create', user.redirectLogIn, user.requireDeveloper(), (req, res) => {
    var code = JSON.stringify(DEFAULT_CODE, undefined, 2);
    res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - create new device"),
                                                     csrfToken: req.csrfToken(),
                                                     device: { fullcode: false,
                                                               code: code },
                                                     create: true });
});

function schemaCompatible(s1, s2) {
    return s1.length >= s2.length &&
        s2.every((t, i) => {
            if (t === s1[i]) return true;
            var t1 = ThingTalk.Type.fromString(t);
            var t2 = ThingTalk.Type.fromString(s1[i]);
            return t1.equals(t2);
        });
}

function validateSchema(dbClient, type, ast, req) {
    return schema.getTypesByKinds(dbClient, [type], req.user.developer_org).then((rows) => {
        if (rows.length < 1)
            throw new Error(req._("Invalid device type %s").format(type));

        function validate(where, what, against) {
            for (var name in against) {
                if (!(name in where))
                    throw new Error(req._("Type %s requires %s %s").format(type, what, name));
                var types = where[name].args.map((a) => a.type);
                if (!schemaCompatible(types, against[name]))
                    throw new Error(req._("Schema for %s is not compatible with type %s").format(name, type));
            }
        }

        validate(ast.triggers, 'trigger', rows[0].triggers);
        validate(ast.actions, 'action', rows[0].actions);
        validate(ast.queries, 'query', rows[0].queries);
    });
}

const CATEGORIES = new Set(['physical','data','online','system']);
const CATEGORY_TYPES = new Set(['data-source', 'online-account', 'thingengine-system']);
const SUBCATEGORIES = new Set(['service','media','social-network','communication','home','health','data-management']);
const ALLOWED_MODULE_TYPES = new Set(['org.thingpedia.v2', 'org.thingpedia.v1', 'org.thingpedia.rss', 'org.thingpedia.rest_json', 'org.thingpedia.builtin', 'org.thingpedia.generic_rest.v1']);
const JAVASCRIPT_MODULE_TYPES = new Set(['org.thingpedia.v1', 'org.thingpedia.v2', 'org.thingpedia.builtin']);

function validateDevice(dbClient, req) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var kind = req.body.primary_kind;

    if (!name || !description || !code || !kind)
        throw new Error(req._("Not all required fields were presents"));

    var ast = JSON.parse(code);
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
    if (!ast.auth.type || ['none','oauth2','basic','builtin','discovery'].indexOf(ast.auth.type) < 0)
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
        if (fullcode) {
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

        return Promise.all(ast.types.map((type) => {
            return validateSchema(dbClient, type, ast, req);
        }));
    }).then(() => ast);
}

function ensurePrimarySchema(dbClient, kind, ast, req, approve) {
    const [types, meta] = ManifestToSchema.toSchema(ast);

    return schema.getByKind(dbClient, kind).then((existing) => {
        if (existing.owner !== req.user.developer_org &&
            req.user.developer_status < user.DeveloperStatus.ADMIN)
            throw new Error(req._("Not Authorized"));

        var obj = {
            developer_version: existing.developer_version + 1
        };
        if (req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER && approve)
            obj.approved_version = obj.developer_version;

        return schema.update(dbClient,
                             existing.id, existing.kind, obj,
                             types, meta);
    }, (e) => {
        var obj = {
            kind: kind,
            kind_canonical: Validation.cleanKind(kind),
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
        return schema.create(dbClient, obj, types, meta);
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

function isJavaScript(file) {
    return file.mimetype === 'application/javascript' ||
        file.mimetype === 'text/javascript' ||
        (file.originalname && file.originalname.endsWith('.js'));
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

function doCreateOrUpdate(id, create, req, res) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var kind = req.body.primary_kind;
    var approve = !!req.body.approve;

    var gAst = undefined;

    Q.try(() => {
        return db.withTransaction((dbClient) => {
            return Q.try(() => {
                return validateDevice(dbClient, req);
            }).catch((e) => {
                console.error(e.stack);
                res.render('thingpedia_device_create_or_edit', { page_title:
                                                                 (create ?
                                                                  req._("Thingpedia - create new device") :
                                                                  req._("Thingpedia - edit device")),
                                                                 csrfToken: req.csrfToken(),
                                                                 error: e,
                                                                 id: id,
                                                                 device: { name: name,
                                                                           primary_kind: kind,
                                                                           description: description,
                                                                           code: code },
                                                                 create: create });
                return null;
            }).tap((ast) => {
                if (ast === null)
                    return null;

                return ensurePrimarySchema(dbClient, kind, ast, req, approve);
            }).then((ast) => {
                if (ast === null)
                    return null;

                var extraKinds = ast.types;
                var extraChildKinds = ast.child_types;

                var fullcode = !JAVASCRIPT_MODULE_TYPES.has(ast.module_type);

                var obj = {
                    primary_kind: kind,
                    name: name,
                    description: description,
                    fullcode: fullcode,
                    module_type: ast.module_type,
                    category: ast.category,
                    subcategory: ast.subcategory,
                };
                var code = JSON.stringify(ast);
                gAst = ast;

                if (create) {
                    obj.owner = req.user.developer_org;
                    if (req.user.developer_status < user.DeveloperStatus.TRUSTED_DEVELOPER ||
                        !approve) {
                        obj.approved_version = null;
                        obj.developer_version = 0;
                    } else {
                        obj.approved_version = 0;
                        obj.developer_version = 0;
                    }
                    return model.create(dbClient, obj, extraKinds, extraChildKinds, code)
                        .then(() => {
                            obj.old_version = null;
                            return obj;
                        });
                } else {
                    return model.get(dbClient, id).then((old) => {
                        if (old.owner !== req.user.developer_org &&
                            req.user.developer_status < user.DeveloperStatus.ADMIN)
                            throw new Error(req._("Not Authorized"));

                        obj.owner = old.owner;
                        obj.developer_version = old.developer_version + 1;
                        if (req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER &&
                            approve)
                            obj.approved_version = obj.developer_version;

                        return model.update(dbClient, id, obj, extraKinds, extraChildKinds, code)
                            .then(() => {
                                obj.old_version = old.developer_version;
                                return obj;
                            });
                    });
                }
            }).then((obj) => {
                if (obj === null)
                    return null;

                if (obj.fullcode || gAst.module_type === 'org.thingpedia.builtin')
                    return obj.primary_kind;

                if (req.files && req.files.zipfile && req.files.zipfile.length &&
                    isJavaScript(req.files.zipfile[0]))
                    return uploadJavaScript(req, obj, gAst, fs.createReadStream(req.files.zipfile[0].path));

                let stream;
                if (req.files && req.files.zipfile && req.files.zipfile.length)
                    stream = fs.createReadStream(req.files.zipfile[0].path);
                else if (obj.old_version !== null)
                    stream = code_storage.downloadZipFile(obj.primary_kind, obj.old_version);
                else
                    throw new Error(req._("Invalid zip file"));
                return uploadZipFile(req, obj, gAst, stream).then(() => obj.primary_kind);
            }).then((done) => {
                if (!done)
                    return done;

                if (req.files.icon && req.files.icon.length) {
                    // upload the icon asynchronously to avoid blocking the request
                    setTimeout(() => {
                        Promise.resolve().then(() => {
                            var graphicsApi = platform.getCapability('graphics-api');
                            var image = graphicsApi.createImageFromPath(req.files.icon[0].path);
                            image.resizeFit(512, 512);
                            return image.stream('png');
                        }).then(([stdout, stderr]) => {
                            return code_storage.storeIcon(stdout, done);
                        }).catch((e) => {
                            console.error('Failed to upload icon to S3: ' + e);
                        });
                    }, 0);
                }

                // trigger the training server if configured
                TrainingServer.get().queue('en', done);
                return done;
            }).then((done) => {
                if (done)
                    res.redirect('/thingpedia/devices/by-id/' + done);
            });
        });
    }).finally(() => {
        var toDelete = [];
        if (req.files) {
            if (req.files.zipfile && req.files.zipfile.length)
                toDelete.push(Q.nfcall(fs.unlink, req.files.zipfile[0].path));
            if (req.files.icon && req.files.icon.length)
                toDelete.push(Q.nfcall(fs.unlink, req.files.icon[0].path));
        }
        return Q.all(toDelete);
    }).catch((e) => {
        console.error(e.stack);
        res.status(400).render('error', { page_title: "Thingpedia - Error",
                                          message: e });
    }).done();
}

router.post('/create', user.requireLogIn, user.requireDeveloper(), (req, res) => {
    doCreateOrUpdate(undefined, true, req, res);
});

function legacyCreateExample(utterance, kind, function_name, function_type, function_obj) {
    let inargmap = {};
    let outargmap = {};
    for (let arg of function_obj.args) {
        if (arg.is_input)
            inargmap[arg.name] = arg.type;
        else
            outargmap[arg.name] = arg.type;
    }

    let regexp = new RegExp(PARAM_REGEX, 'g');

    let in_args = '';
    let filter = '';
    let arg_decl = '';
    let any_arg = false;
    let any_in_arg = false;
    let any_out_arg = false;

    let match = regexp.exec(utterance);
    while (match !== null) {
        let [, param1, param2,] = match;
        let param = param1 || param2;

        if (param in inargmap) {
            let type = inargmap[param];
            if (any_in_arg)
                in_args += ', ';
            if (any_arg)
                arg_decl += ', ';
            in_args += `${param}=p_${param}`;
            arg_decl += `p_${param} :${type}`;
            any_in_arg = true;
            any_arg = true;
        } else {
            let type = outargmap[param];
            if (any_out_arg)
                filter += ' && ';
            if (any_arg)
                arg_decl += ', ';
            filter += `${param} == p_${param}`;
            arg_decl += `p_${param} :${type}`;
            any_out_arg = true;
            any_arg = true;
        }

        match = regexp.exec(utterance);
    }

    let result = `@${kind}.${function_name}(${in_args})`;
    if (filter !== '')
        result += `, ${filter}`;
    if (function_type === 'triggers')
        result = `let stream x := \\(${arg_decl}) -> monitor ${result};`;
    else if (function_type === 'queries')
        result = `let table x := \\(${arg_decl}) -> ${result};`;
    else
        result = `let action x := \\(${arg_decl}) -> ${result};`;
    return { utterance: utterance, program: result };
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

    if (!ast.examples) {
        ast.examples = [];

        for (let function_type of ['triggers','queries','actions']) {
            for (let function_name in ast[function_type]) {
                let function_obj = ast[function_type][function_name];

                for (let example of (function_obj.examples || []))
                    ast.examples.push(legacyCreateExample(example, device.primary_kind, function_name, function_type, function_obj));
                delete function_obj.examples;
            }
        }
    }

    for (let function_type of ['triggers','queries']) {
        for (let function_name in ast[function_type]) {
            let function_obj = ast[function_type][function_name];

            if (!('poll_interval' in function_obj))
                function_obj.poll_interval = function_obj['poll-interval'] || -1;
            delete function_obj['poll-interval'];
        }
    }

    return JSON.stringify(ast);
}

router.get('/update/:id', user.redirectLogIn, user.requireDeveloper(), function(req, res) {
    Q.try(function() {
        return db.withClient(function(dbClient) {
            return model.get(dbClient, req.params.id).then(function(d) {
                if (d.owner !== req.user.developer_org &&
                    req.user.developer < user.DeveloperStatus.ADMIN)
                    throw new Error(req._("Not Authorized"));

                return model.getCodeByVersion(dbClient, req.params.id, d.developer_version).then(function(row) {
                    d.code = migrateManifest(row.code, d);
                    return d;
                });
            }).then(function(d) {
                res.render('thingpedia_device_create_or_edit', { page_title: req._("Thingpedia - edit device"),
                                                                 csrfToken: req.csrfToken(),
                                                                 id: req.params.id,
                                                                 device: { name: d.name,
                                                                           primary_kind: d.primary_kind,
                                                                           description: d.description,
                                                                           code: d.code,
                                                                           fullcode: d.fullcode },
                                                                 create: false });
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/update/:id', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    doCreateOrUpdate(req.params.id, false, req, res);
});

router.get('/example/:id', function(req, res) {
    Q.try(function() {
        // quotes, giphy, linkedin, tv
        if (['350', '229', '9', '280'].indexOf(req.params.id) === -1)
            throw new Error(req._("Example not found."));

        return db.withClient(function(dbClient) {
            return model.get(dbClient, req.params.id).then(function(d) {
                return model.getCodeByVersion(dbClient, req.params.id, d.developer_version).then(function(row) {
                    d.code = migrateManifest(row.code, d);
                    let ast = JSON.parse(d.code);
                    if ('client_id' in ast.auth)
                        ast.auth.client_id = '*** your-own-client-id ***';
                    if ('client_secret' in ast.auth)
                        ast.auth.client_secret = '*** your-own-client-secret ***';
                    d.code = JSON.stringify(ast);
                    return d;
                });
            }).then(function(d) {
                console.log(d)
                res.render('thingpedia_device_example', { page_title: req._("Thingpedia - example"),
                                                          csrfToken: req.csrfToken(),
                                                          id: req.params.id,
                                                          device: { name: d.name,
                                                                    primary_kind: d.primary_kind,
                                                                    description: d.description,
                                                                    code: d.code,
                                                                    fullcode: d.fullcode },
                                                        });
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
})

module.exports = router;
