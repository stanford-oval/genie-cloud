// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const csurf = require('csurf');
const JSZip = require('jszip');
const ThingTalk = require('thingtalk');

var db = require('../util/db');
var code_storage = require('../util/code_storage');
var model = require('../model/device');
var schema = require('../model/schema');
var user = require('../util/user');
var Validation = require('../util/validation');
var generateExamples = require('../util/generate_examples');
var ManifestToSchema = require('../util/manifest_to_schema');

var router = express.Router();

router.use(multer({ dest: platform.getTmpDir() }).fields([
    { name: 'zipfile', maxCount: 1 },
    { name: 'icon', maxCount: 1 }
]));
router.use(csurf({ cookie: false }));

const DEFAULT_CODE = {"params": {},
                      "auth": {"type": "none"},
                      "types": [],
                      "child_types": [],
                      "triggers": {},
                      "actions": {},
                      "queries": {}
                    };

router.get('/create', user.redirectLogIn, user.requireDeveloper(), function(req, res) {
    var code = JSON.stringify(DEFAULT_CODE, undefined, 2);
    res.render('thingpedia_device_create_or_edit', { page_title: "ThingPedia - create new device",
                                                     csrfToken: req.csrfToken(),
                                                     device: { fullcode: true,
                                                               code: code },
                                                     create: true });
});

function schemaCompatible(s1, s2) {
    return s1.length >= s2.length &&
        s2.every(function(t, i) {
            var t1 = ThingTalk.Type.fromString(t);
            var t2 = ThingTalk.Type.fromString(s1[i]);
            try {
                ThingTalk.Type.typeUnify(t1, t2);
                return true;
            } catch(e) {
                return false;
            }
        });
}

function validateSchema(dbClient, type, ast, req) {
    return schema.getTypesByKinds(dbClient, [type], req.user.developer_org).then(function(rows) {
        if (rows.length < 1)
            throw new Error("Invalid device type " + type);

        function validate(where, what, against) {
            for (var name in against) {
                if (!(name in where))
                    throw new Error('Type ' + type + ' requires ' + what + ' ' + name);
                if (!schemaCompatible(where[name].schema, against[name]))
                    throw new Error('Schema for ' + name + ' is not compatible with type ' + type);
            }
        }

        validate(ast.triggers, 'trigger', rows[0].triggers);
        validate(ast.actions, 'action', rows[0].actions);
        validate(ast.queries, 'query', rows[0].queries);
    });
}

function validateDevice(dbClient, req) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var kind = req.body.primary_kind;
    var fullcode = !req.body.fullcode;

    if (!name || !description || !code || !kind)
        throw new Error('Not all required fields were presents');

    var ast = JSON.parse(code);
    if (!ast.params)
        ast.params = {};
    if (!ast.types)
        ast.types = [];
    if (!ast.child_types)
        ast.child_types = [];
    if (!ast.auth)
        ast.auth = {"type":"none"};
    if (!ast.auth.type || ['none','oauth2','basic','builtin','discovery'].indexOf(ast.auth.type) == -1)
        throw new Error("Invalid auth type");
    if (fullcode && ast.auth.type === 'basic' && (!ast.params.username || !ast.params.password))
        throw new Error("Username and password must be provided for basic authentication");
    if (ast.types.indexOf('online-account') >= 0 && ast.types.indexOf('data-source') >= 0)
        throw new Error("Interface cannot be both marked online-account and data-source");

    Validation.validateAllInvocations(ast);

    if (fullcode) {
        if (!ast.name)
            throw new Error("Missing name");
        if (!ast.description)
            throw new Error("Missing description");
        for (var name in ast.triggers) {
            if (!ast.triggers[name].url)
                throw new Error("Missing trigger url for " + name);
        }
        for (var name in ast.actions) {
            if (!ast.actions[name].url)
                throw new Error("Missing action url for " + name);
        }
        for (var name in ast.queries) {
            if (!ast.queries[name].url)
                throw new Error("Missing query url for " + name);
        }
    }

    return Q.all(ast.types.map(function(type) {
        return validateSchema(dbClient, type, ast, req);
    })).then(function() {
        return ast;
    });
}

function getOrCreateSchema(dbClient, kind, kind_type, types, meta, req, approve) {
    return schema.getByKind(dbClient, kind).then(function(existing) {
        var obj = {};
        if (existing.owner !== req.user.developer_org &&
            req.user.developer_status < user.DeveloperStatus.ADMIN)
            throw new Error("Not Authorized");

        obj.developer_version = existing.developer_version + 1;
        if (req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER &&
            approve)
            obj.approved_version = obj.developer_version;

        return schema.update(dbClient,
                             existing.id, existing.kind, obj,
                             types, meta);
    }).catch(function(e) {
        console.error(e.stack);
        var obj = {
            kind: kind,
            kind_type: kind_type,
            owner: req.user.developer_org
        };
        if (req.user.developer_status < user.DeveloperStatus.TRUSTED_DEVELOPER ||
            !approve) {
            obj.approved_version = null;
            obj.developer_version = 0;
        } else {
            obj.approved_version = 0;
            obj.developer_version = 0;
        }
        return schema.create(dbClient, obj, types, meta);
    });
}

function ensurePrimarySchema(dbClient, kind, ast, req, approve) {
    var res = ManifestToSchema.toSchema(ast);
    var types = res[0];
    var meta = res[1];

    return getOrCreateSchema(dbClient, kind, 'primary', types, meta, req, approve).then(function() {
        if (!ast['global-name'])
            return;

        return getOrCreateSchema(dbClient, ast['global-name'], 'global', types, meta, req, approve);
    });
}

function ensureExamples(dbClient, ast) {
    if (!ast['global-name'])
        return;

    return generateExamples(dbClient, ast['global-name'], ast);
}

function uploadZipFile(req, obj, ast, stream) {
    var cleanedMetadata = {
        types: ast.types,
        child_types: ast.child_types,
        'global-name': ast['global-name']
    };
    var zipFile = new JSZip();

    Q.try(function() {
        // unfortunately JSZip only loads from memory, so we need to load the entire file
        // at once
        // this is somewhat a problem, because the file can be up to 30-50MB in size
        // we just hope the GC will get rid of the buffer quickly

        var buffers = [];
        var length = 0;
        return Q.Promise(function(callback, errback) {
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
    }).then(function() {
        var packageJson = zipFile.file('package.json');
        if (!packageJson)
            throw new Error('package.json missing from device zip file');

        return packageJson.async('string');
    }).then(function(text) {
        var parsed = JSON.parse(text);
        if (!parsed.name || !parsed.main)
            throw new Error('Invalid package.json');

        parsed['thingpedia-version'] = obj.developer_version;
        parsed['thingpedia-metadata'] = cleanedMetadata;

        zipFile.file('package.json', JSON.stringify(parsed));

        return code_storage.storeZipFile(zipFile.generateNodeStream({ compression: 'DEFLATE',
                                                                      type: 'nodebuffer',
                                                                      platform: 'UNIX'}),
                                         obj.primary_kind, obj.developer_version);
    }).catch(function(e) {
        console.error('Failed to upload zip file to S3: ' + e);
        console.error(e.stack);
    }).done();
}

function doCreateOrUpdate(id, create, req, res) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var fullcode = !req.body.fullcode;
    var kind = req.body.primary_kind;
    var approve = !!req.body.approve;

    var gAst = undefined;

    Q.try(function() {
        return db.withTransaction(function(dbClient) {
            return Q.try(function() {
                return validateDevice(dbClient, req);
            }).catch(function(e) {
                console.error(e.stack);
                res.render('thingpedia_device_create_or_edit', { page_title:
                                                                 (create ?
                                                                  "ThingPedia - create new device" :
                                                                  "ThingPedia - edit device"),
                                                                 csrfToken: req.csrfToken(),
                                                                 error: e,
                                                                 id: id,
                                                                 device: { name: name,
                                                                           primary_kind: kind,
                                                                           description: description,
                                                                           code: code,
                                                                           fullcode: fullcode },
                                                                 create: create });
                return null;
            }).tap(function(ast) {
                if (ast === null)
                    return;

                return ensurePrimarySchema(dbClient, kind, ast, req, approve);
            }).tap(function(ast) {
                if (ast === null)
                    return;

                return ensureExamples(dbClient, ast);
            }).then(function(ast) {
                if (ast === null)
                    return null;

                var extraKinds = ast.types;
                var extraChildKinds = ast.child_types;
                var globalName = ast['global-name'];
                if (!globalName)
                    globalName = null;

                var obj = {
                    primary_kind: kind,
                    global_name: globalName,
                    name: name,
                    description: description,
                    fullcode: fullcode,
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
                    return model.get(dbClient, id).then(function(old) {
                        if (old.owner !== req.user.developer_org &&
                            req.user.developer_status < user.DeveloperStatus.ADMIN)
                            throw new Error("Not Authorized");

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
            }).then(function(obj) {
                if (obj === null)
                    return null;

                if (obj.fullcode || obj.primary_kind.startsWith('org.thingpedia.builtin.'))
                    return obj.primary_kind;

                // do the whole zip file dance asynchronously, or the request will stall for a long time
                // as we download the old file, modify it and reupload it
                var stream;
                if (req.files && req.files.zipfile && req.files.zipfile.length)
                    stream = fs.createReadStream(req.files.zipfile[0].path);
                else if (obj.old_version !== null)
                    stream = code_storage.downloadZipFile(obj.primary_kind, obj.old_version);
                else
                    throw new Error('Invalid zip file');
                uploadZipFile(req, obj, gAst, stream);
                return obj.primary_kind;
            }).then(function(done) {
                if (!done)
                    return done;

                if (req.files.icon && req.files.icon.length) {
                    console.log('req.files.icon', req.files.icon);
                    // upload the icon asynchronously to avoid blocking the request
                    setTimeout(function() {
                        console.log('uploading icon');
                        Q.try(function() {
                            var graphicsApi = platform.getCapability('graphics-api');
                            var image = graphicsApi.createImageFromPath(req.files.icon[0].path);
                            image.resizeFit(512, 512);
                            return Q.ninvoke(image, 'stream', 'png');
                        }).spread(function(stdout, stderr) {
                            return code_storage.storeIcon(stdout, done);
                        }).catch(function(e) {
                            console.error('Failed to upload icon to S3: ' + e);
                        }).done();
                    }, 0);
                }
                return done;
            }).then(function(done) {
                if (done)
                    res.redirect('/thingpedia/devices/by-id/' + done);
            });
        });
    }).finally(function() {
        var toDelete = [];
        if (req.files) {
            if (req.files.zipfile && req.files.zipfile.length)
                toDelete.push(Q.nfcall(fs.unlink, req.files.zipfile[0].path));
            if (req.files.icon && req.files.icon.length)
                toDelete.push(Q.nfcall(fs.unlink, req.files.icon[0].path));
        }
        return Q.all(toDelete);
    }).catch(function(e) {
        console.error(e.stack);
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
}

router.post('/create', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    doCreateOrUpdate(undefined, true, req, res);
});

router.get('/update/:id', user.redirectLogIn, user.requireDeveloper(), function(req, res) {
    Q.try(function() {
        return db.withClient(function(dbClient) {
            return model.get(dbClient, req.params.id).then(function(d) {
                if (d.owner !== req.user.developer_org &&
                    req.user.developer < user.DeveloperStatus.ADMIN)
                    throw new Error("Not Authorized");

                return model.getCodeByVersion(dbClient, req.params.id, d.developer_version).then(function(row) {
                    d.code = row.code;
                    return d;
                });
            }).then(function(d) {
                res.render('thingpedia_device_create_or_edit', { page_title: "ThingPedia - edit device",
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
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/update/:id', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    doCreateOrUpdate(req.params.id, false, req, res);
});

module.exports = router;
