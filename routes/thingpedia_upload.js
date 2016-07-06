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
var expandExamples = require('../util/expand_examples');
var exampleModel = require('../model/example');
var tokenize = require('../util/tokenize');

var router = express.Router();

router.use(multer({ dest: platform.getTmpDir() }).fields([
    { name: 'zipfile', maxCount: 1 },
    { name: 'icon', maxCount: 1 }
]));
router.use(csurf({ cookie: false }));

const DEFAULT_CODE = {"params": {"username": ["Username","text"],
                                 "password": ["Password","password"]},
                      "name": "Example Device of %s",
                      "description": "This is your Example Device",
                      "auth": {"type": "basic"},
                      "triggers": {
                          "source": {
                              "url": "https://www.example.com/api/1.0/poll",
                              "poll-interval": 300000,
                              "args": ["time", "measurement"],
                              "schema": ["Date", "Measure(m)"],
                              "doc": "report the latest measurement"
                          }
                      },
                      "actions": {
                          "setpower": {
                              "url": "http://www.example.com/api/1.0/post",
                              "args": ["power"],
                              "schema": ["Boolean"],
                              "doc": "power on/off the device"
                          }
                      },
                      "queries": {
                          "getpower": {
                              "url": "http://www.example.com/api/1.0/post",
                              "args": ["power"],
                              "schema": ["Boolean"],
                              "doc": "check if the device is on or off"
                          }
                     }
                    };
const DEFAULT_ONLINE_CODE = {"name": "Example Account of %s",
                             "description": "This is your Example Account",
                             "auth": {"type": "oauth2",
                                      "client_id": "your-oauth2-client-id",
                                      "client_secret": "your-oauth2-secret-encrypted-with-rot13",
                                      "authorize": "https://www.example.com/auth/2.0/authorize",
                                      "get_access_token": "https://www.example.com/auth/2.0/token",
                                      "get_profile": "https://www.example.com/api/1.0/profile",
                                      "profile": ["username"],
                                     },
                             "types": ["online-account"],
                             "global-name": "example",
                             "triggers": {
                                 "onmessage": {
                                     "url": "wss://www.example.com/api/1.0/data",
                                     "args": ["message"],
                                     "schema": ["String"],
                                     "doc": "trigger on each new message"
                                 }
                             },
                             "actions": {
                                 "post": {
                                     "url": "https://www.example.com/api/1.0/post",
                                     "args": ["message"],
                                     "schema": ["String"],
                                     "doc": "post a new message",
                                 }
                             },
                             "queries": {
                                "profile": {
                                     "url": "https://www.example.com/api/1.0/profile",
                                     "args": ["username", "pictureUrl", "realName", "link"],
                                     "schema": ["String", "Picture", "String", "String"],
                                     "doc": "read the user profile"
                                 },
                             }
                            };

router.get('/create', user.redirectLogIn, user.requireDeveloper(), function(req, res) {
    if (req.query.class && ['online', 'physical', 'data'].indexOf(req.query.class) < 0) {
        res.status(404).render('error', { page_title: "ThingPedia - Error",
                                          message: "Invalid device class" });
        return;
    }

    var online = req.query.class === 'online';

    var code = JSON.stringify(online ? DEFAULT_ONLINE_CODE : DEFAULT_CODE, undefined, 2);
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

function validateInvocation(where, what) {
    for (var name in where) {
        if (!where[name].schema)
            throw new Error("Missing " + what + " schema for " + name);
        if ((where[name].args && where[name].args.length !== where[name].schema.length) ||
            (where[name].params && where[name].params.length !== where[name].schema.length))
            throw new Error("Invalid number of arguments in " + what + " " + name);
        if (where[name].questions && where[name].questions.length !== where[name].schema.length)
            throw new Error("Invalid number of questions in " + name);
        where[name].schema.forEach(function(t) {
            ThingTalk.Type.fromString(t);
        });
    }
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

    if (!ast.triggers)
        ast.triggers = {};
    if (!ast.actions)
        ast.actions = {};
    if (!ast.queries)
        ast.queries = {};
    validateInvocation(ast.triggers, 'trigger');
    validateInvocation(ast.actions, 'action');
    validateInvocation(ast.queries, 'query');

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
    } else if (!kind.startsWith('org.thingpedia.builtin.')) {
        if (!req.files || !req.files.zipfile || req.files.zipfile.length === 0)
            throw new Error('Invalid zip file');
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
    var triggers = {};
    var triggerMeta = {};
    var actions = {};
    var actionMeta = {};
    var queries = {};
    var queryMeta = {};

    function handleOne(ast, out, outMeta) {
        for (var name in ast) {
            out[name] = ast[name].schema;
            outMeta[name] = {
                doc: ast[name].doc,
                label: (ast[name].confirmation || ast[name].label),
                canonical: ast[name].canonical,
                args: ast[name].params || ast[name].args || [],
                questions: ast[name].questions || []
            };
        }
    }

    handleOne(ast.triggers, triggers, triggerMeta);
    handleOne(ast.actions, actions, actionMeta);
    handleOne(ast.queries, queries, queryMeta);

    var types = [triggers, actions, queries];
    var meta = [triggerMeta, actionMeta, queryMeta];

    return getOrCreateSchema(dbClient, kind, 'primary', types, meta, req, approve).then(function() {
        if (!ast['global-name'])
            return;

        return getOrCreateSchema(dbClient, ast['global-name'], 'global', types, meta, req, approve);
    });
}

function assignmentsToArgs(assignments, argtypes) {
    var args = [];

    for (var name in assignments) {
        var type = argtypes[name];
        var nameVal = { id: 'tt.param.' + name };
        if (type.isString)
            args.push({ name: nameVal, type: 'String', value: { value: assignments[name] },
                        operator: 'is' });
        else if (type.isNumber)
            args.push({ name: nameVal, type: 'Number', value: { value: String(assignments[name]) },
                        operator: 'is' });
        else if (type.isMeasure)
            args.push({ name: nameVal, type: 'Measure', value: { value: String(assignments[name][0]) },
                        unit: assignments[name][1],
                        operator: 'is' });
        else if (type.isBoolean)
            args.push({ name: nameVal, type: 'Bool', value: { value: String(assignments[name]) },
                        operator: 'is' });
        else
            throw new TypeError();
    }

    return args;
}

function exampleToAction(kind, actionName, assignments, argtypes) {
    return {
        action: { name: { id: 'tt:' + kind + '.' + actionName },
                  args: assignmentsToArgs(assignments, argtypes) }
    }
}

function exampleToQuery(kind, queryName, assignments, argtypes) {
    return {
        query: { name: { id: 'tt:' + kind + '.' + queryName },
                 args: assignmentsToArgs(assignments, argtypes) }
    }
}

function exampleToTrigger(kind, triggerName, assignments, argtypes) {
    return {
        trigger: { name: { id: 'tt:' + kind + '.' + triggerName },
                   args: assignmentsToArgs(assignments, argtypes) }
    }
}

function tokensToSlots(tokens) {
    return tokens.filter((t) => t.startsWith('$')).map((t) => t.substr(1));
}

function exampleToBaseAction(kind, actionName, tokens) {
    return {
        action: { name: { id: 'tt:' + kind + '.' + actionName },
                  args: [], slots: tokensToSlots(tokens) }
    }
}

function exampleToBaseQuery(kind, queryName, tokens) {
    return {
        query: { name: { id: 'tt:' + kind + '.' + queryName },
                 args: [], slots: tokensToSlots(tokens) }
    }
}

function exampleToBaseTrigger(kind, triggerName, tokens) {
    return {
        trigger: { name: { id: 'tt:' + kind + '.' + triggerName },
                   args: [], slots: tokensToSlots(tokens) }
    }
}

function ensureExamples(dbClient, ast) {
    if (!ast['global-name'])
        return;

    function handleExamples(schemaId, from, howBase, howExpanded, out) {
        for (var name in from) {
            var fromChannel = from[name];
            if (!Array.isArray(fromChannel.examples))
                continue;

            var argtypes = {};
            var argnames = fromChannel.params || fromChannel.args || [];
            argnames.forEach(function(name, i) {
                argtypes[name] = ThingTalk.Type.fromString(fromChannel.schema[i]);
            });

            fromChannel.examples.forEach(function(ex) {
                var tokens = tokenize.tokenize(ex);
                var json = howBase(ast['global-name'], name, tokens);
                out.push({ schema_id: schemaId, is_base: true, utterance: ex,
                           target_json: JSON.stringify(json) });
            });

            try {
                var expanded = expandExamples(fromChannel.examples, argtypes);
                expanded.forEach(function(ex) {
                    var json = howExpanded(ast['global-name'], name, ex.assignments, argtypes);
                    out.push({ schema_id: schemaId, is_base: false, utterance: ex.utterance,
                               target_json: JSON.stringify(json) });
                });
            } catch(e) {
                console.log('Failed to expand examples: ' + e.message);
            }
        }
    }

    function generateAllExamples(schemaId) {
        var out = [];

        handleExamples(schemaId, ast.actions, exampleToBaseAction, exampleToAction, out);
        handleExamples(schemaId, ast.queries, exampleToBaseQuery, exampleToQuery, out);
        handleExamples(schemaId, ast.triggers, exampleToBaseTrigger, exampleToTrigger, out);

        return out;
    }

    return schema.getByKind(dbClient, ast['global-name']).then(function(existing) {
        return exampleModel.deleteBySchema(dbClient, existing.id).then(function() {
            var examples = generateAllExamples(existing.id);
            if (examples.length > 0)
                return exampleModel.createMany(dbClient, examples);
        });
    });
}

function doCreateOrUpdate(id, create, req, res) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var fullcode = !req.body.fullcode;
    var kind = req.body.primary_kind;
    var approve = !!req.body.approve;
    var online = false;

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
                online = extraKinds.indexOf('online-account') >= 0;

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
                    return model.create(dbClient, obj, extraKinds, extraChildKinds, code);
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

                        return model.update(dbClient, id, obj, extraKinds, extraChildKinds, code);
                    });
                }
            }).then(function(obj) {
                if (obj === null)
                    return null;

                if (!obj.fullcode && !obj.primary_kind.startsWith('org.thingpedia.builtin.')) {
                    var zipFile = new JSZip();
                    // unfortunately JSZip only loads from memory, so we need to load the entire file
                    // at once
                    // this is somewhat a problem, because the file can be up to 30-50MB in size
                    // we just hope the GC will get rid of the buffer quickly
                    return Q.nfcall(fs.readFile, req.files.zipfile[0].path).then(function(buffer) {
                        return zipFile.loadAsync(buffer, { checkCRC32: true });
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
                        parsed['thingpedia-metadata'] = gAst;

                        // upload the file asynchronously to avoid blocking the request
                        setTimeout(function() {
                            zipFile.file('package.json', JSON.stringify(parsed));

                            code_storage.storeZipFile(zipFile.generateNodeStream({ compression: 'DEFLATE',
                                                                                type: 'nodebuffer',
                                                                                platform: 'UNIX'}),
                                                      obj.primary_kind, obj.developer_version)
                                .catch(function(e) {
                                    console.error('Failed to upload zip file to S3: ' + e);
                                }).done();
                        }, 0);
                    }).then(function() {
                        return obj.primary_kind;
                    });
                } else {
                    return obj.primary_kind;
                }
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
                if (done) {
                    if (online)
                        res.redirect('/thingpedia/devices/by-id/' + done);
                    else
                        res.redirect('/thingpedia/devices/by-id/' + done);
                }
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

                return model.getDeveloperCode(dbClient, req.params.id).then(function(row) {
                    d.code = row.code;
                    return d;
                });
            }).then(function(d) {
                try {
                    code = JSON.stringify(JSON.parse(d.code), undefined, 2);
                } catch(e) {
                    code = d.code;
                }
                res.render('thingpedia_device_create_or_edit', { page_title: "ThingPedia - edit device",
                                                                 csrfToken: req.csrfToken(),
                                                                 id: req.params.id,
                                                                 device: { name: d.name,
                                                                           primary_kind: d.primary_kind,
                                                                           description: d.description,
                                                                           code: code,
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
