// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const passport = require('passport');
const multer = require('multer');
const csurf = require('csurf');
const JSZip = require('node-zip');
const ThingTalk = require('thingtalk');

var db = require('../util/db');
var code_storage = require('../util/code_storage');
var model = require('../model/device');
var schema = require('../model/schema');
var user = require('../util/user');

var router = express.Router();

router.use(multer().single('zipfile'));
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
                              "doc": "report the latest measurement"
                          }
                      },
                      "actions": {
                          "setpower": {
                              "url": "http://www.example.com/api/1.0/post",
                              "args": ["power"],
                              "doc": "power on/off the device"
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
                                 "profile": {
                                     "url": "https://www.example.com/api/1.0/profile",
                                     "poll-interval": 86400000,
                                     "args": ["username", "pictureUrl", "realName", "link"],
                                     "doc": "trigger on user profile changes (once a day)"
                                 },
                                 "onmessage": {
                                     "url": "wss://www.example.com/api/1.0/data",
                                     "args": ["message"],
                                     "doc": "trigger on each new message"
                                 }
                             },
                             "actions": {
                                 "post": {
                                     "url": "https://www.example.com/api/1.0/post",
                                     "args": ["message"],
                                     "doc": "post a new message",
                                 }
                             }
                            };

router.get('/create', user.redirectLogIn, user.requireDeveloper(), function(req, res) {
    if (req.query.class && ['online', 'physical'].indexOf(req.query.class) < 0) {
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
            return ThingTalk.Type.compatible(t1, t2);
        });
}

function validateSchema(dbClient, type, ast, allowFailure) {
    return schema.getTypesByKind(dbClient, type).then(function(rows) {
        if (rows.length < 1) {
            if (allowFailure)
                return;
            else
                throw new Error("Invalid device type " + type);
        }

        var types = rows[0].types;
        for (var trigger in types[0]) {
            if (!(trigger in ast.triggers))
                throw new Error('Type ' + type + ' requires trigger ' + trigger);
            if (!schemaCompatible(ast.triggers[trigger].schema, types[0][trigger]))
                throw new Error('Schema for ' + trigger + ' is not compatible with type ' + type);
        }
        for (var action in types[1]) {
            if (!(action in ast.actions))
                throw new Error('Type ' + type + ' requires action ' + action);
            if (!schemaCompatible(ast.actions[action].schema, types[1][action]))
                throw new Error('Schema for ' + action + ' is not compatible with type ' + type);
        }
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
    if (!ast.auth)
        ast.auth = {"type":"none"};
    if (!ast.auth.type || ['none','oauth2','basic','builtin'].indexOf(ast.auth.type) == -1)
        throw new Error("Invalid auth type");
    if (ast.auth.type === 'basic' && (!ast.params.username || !ast.params.password))
        throw new Error("Username and password must be provided for basic authentication");

    if (!ast.triggers)
        ast.triggers = {};
    if (!ast.actions)
        ast.actions = {};
    for (var name in ast.triggers) {
        if (!ast.triggers[name].schema)
            throw new Error("Missing trigger schema for " + name);
        if ((ast.triggers[name].args && ast.triggers[name].args.length !== ast.triggers[name].schema.length) ||
            (ast.triggers[name].params && ast.triggers[name].params.length !== ast.triggers[name].schema.length))
            throw new Error("Invalid number of arguments in " + name);
        ast.triggers[name].schema.forEach(function(t) {
            ThingTalk.Type.fromString(t);
        });
    }
    for (var name in ast.actions) {
        if (!ast.actions[name].schema)
            throw new Error("Missing action schema for " + name);
        if ((ast.actions[name].args && ast.actions[name].args.length !== ast.actions[name].schema.length) ||
            (ast.actions[name].params && ast.actions[name].params.length !== ast.actions[name].schema.length))
            throw new Error("Invalid number of arguments in " + name);
        ast.actions[name].schema.forEach(function(t) {
            ThingTalk.Type.fromString(t);
        });
    }

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
                throw new Error("Missing trigger url for " + name);
        }
    } else if (!kind.startsWith('org.thingpedia.builtin.')) {
        if (!req.file || !req.file.buffer || !req.file.buffer.length)
            throw new Error('Invalid zip file');
    }

    return Q.all(ast.types.map(function(type) {
        return validateSchema(dbClient, type, ast, type === ast['global-name']);
    })).then(function() {
        return ast;
    });
}

function ensurePrimarySchema(dbClient, kind, ast) {
    var triggers = {};
    var actions = {};

    for (var name in ast.triggers)
        triggers[name] = ast.triggers[name].schema;
    for (var name in ast.actions)
        actions[name] = ast.actions[name].schema;

    return schema.getByKind(dbClient, kind).then(function(existing) {
        return schema.update(dbClient,
                             existing.id, { developer_version: existing.developer_version + 1,
                                            approved_version: existing.approved_version + 1},
                             [triggers, actions]);
    }).catch(function(e) {
        return schema.create(dbClient, { developer_version: 0,
                                         approved_version: 0,
                                         kind: kind },
                             [triggers, actions]);
    }).then(function() {
        if (!ast['global-name'])
            return;

        return schema.getByKind(dbClient, ast['global-name']).then(function(existing) {
            return schema.update(dbClient,
                                 existing.id, { developer_version: existing.developer_version + 1,
                                                approved_version: existing.approved_version + 1 },
                                 [triggers, actions]);
        }).catch(function(e) {
            return schema.create(dbClient, { developer_version: 0,
                                             approved_version: 0,
                                             kind: ast['global-name'] },
                                 [triggers, actions]);
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

    Q.try(function() {
        return db.withTransaction(function(dbClient) {
            return Q.try(function() {
                return validateDevice(dbClient, req);
            }).catch(function(e) {
                res.render('thingpedia_device_create_or_edit', { page_title:
                                                                 (create ?
                                                                  "ThingPedia - create new device" :
                                                                  "ThingPedia - edit device"),
                                                                 csrfToken: req.csrfToken(),
                                                                 error: e.message,
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

                return ensurePrimarySchema(dbClient, kind, ast);
            }).then(function(ast) {
                if (ast === null)
                    return null;

                var extraKinds = ast.types;
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

                if (create) {
                    obj.owner = req.user.id;
                    if (req.user.developer_status < user.DeveloperStatus.TRUSTED_DEVELOPER ||
                        !approve) {
                        obj.approved_version = null;
                        obj.developer_version = 0;
                    } else {
                        obj.approved_version = 0;
                        obj.developer_version = 0;
                    }
                    return model.create(dbClient, obj, extraKinds, code);
                } else {
                    return model.get(dbClient, id).then(function(old) {
                        if (old.owner !== req.user.id &&
                            req.user.developer_status < user.DeveloperStatus.ADMIN)
                            throw new Error("Not Authorized");

                        obj.owner = old.owner;
                        obj.developer_version = old.developer_version + 1;
                        if (req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER &&
                            approve)
                            obj.approved_version = obj.developer_version;

                        return model.update(dbClient, id, obj, extraKinds, code);
                    });
                }
            }).then(function(obj) {
                if (obj === null)
                    return false;

                if (!obj.fullcode && !obj.primary_kind.startsWith('org.thingpedia.builtin.')) {
                    var zipFile = new JSZip(req.file.buffer, { checkCRC32: true });

                    var packageJson = zipFile.file('package.json');
                    if (!packageJson)
                        throw new Error('package.json missing from device zip file');

                    var parsed = JSON.parse(packageJson.asText());
                    if (!parsed.name || !parsed.main)
                        throw new Error('Invalid package.json');

                    parsed['thingpedia-version'] = obj.developer_version;

                    // upload the file asynchronously to avoid blocking the request
                    setTimeout(function() {
                        zipFile.file('package.json', JSON.stringify(parsed));

                        code_storage.storeFile(zipFile.generate({compression: 'DEFLATE',
                                                                 type: 'nodebuffer',
                                                                 platform: 'UNIX'}),
                                               obj.primary_kind, obj.developer_version)
                            .catch(function(e) {
                                console.error('Failed to upload zip file to S3: ' + e.message);
                            }).done();
                    }, 0);
                }

                return true;
            }).then(function(done) {
                if (done) {
                    if (online)
                        res.redirect('/thingpedia/devices?class=online');
                    else
                        res.redirect('/thingpedia/devices?class=physical');
                }
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    }).done();
}

router.post('/create', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    doCreateOrUpdate(undefined, true, req, res);
});

router.get('/update/:id', user.redirectLogIn, user.requireDeveloper(), function(req, res) {
    Q.try(function() {
        return db.withClient(function(dbClient) {
            return model.get(dbClient, req.params.id).then(function(d) {
                if (d.owner !== req.user.id &&
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
                                          message: e.message });
    }).done();
});

router.post('/update/:id', user.requireLogIn, user.requireDeveloper(), function(req, res) {
    doCreateOrUpdate(req.params.id, false, req, res);
});

module.exports = router;
