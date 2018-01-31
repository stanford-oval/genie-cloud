// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const passport = require('passport');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/schema');
const exampleModel = require('../model/example');
const Validation = require('../util/validation');
const generateExamples = require('../util/generate_examples');
const ManifestToSchema = require('../util/manifest_to_schema');

var router = express.Router();

router.get('/', function(req, res) {
    db.withClient(function(dbClient) {
        return model.getAllForList(dbClient);
    }).then(function(rows) {
        res.render('thingpedia_schema_list', { page_title: req._("Thingpedia - Supported Types"),
                                               schemas: rows });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

function localeToLanguage(locale) {
    // only keep the language part of the locale, we don't
    // yet distinguish en_US from en_GB
    return (locale || 'en').split(/[-_\@\.]/)[0];
}

router.get('/by-id/:kind', function(req, res) {
    var language = req.query.language || (req.user ? localeToLanguage(req.user.locale) : 'en');
    db.withClient(function(dbClient) {
        return model.getMetasByKinds(dbClient, [req.params.kind], req.user ? (req.user.developer_status >= 3 ? -1 : req.user.developer_org) : null, language).then(function(rows) {
            if (rows.length === 0) {
                res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: req._("Not Found.") });
                return null;
            }

            var row = rows[0];
            return row;
        }).tap(function(row) {
            return exampleModel.getBaseBySchema(dbClient, row.id, language).then(function(examples) {
                row.examples = examples;
            });
        }).tap(function(row) {
            if (language === 'en') {
                row.translated = true;
                return;
            }
            return model.isKindTranslated(dbClient, row.kind, language).then(function(t) {
                row.translated = t;
            });
        });
    }).then(function(row) {
        if (row === null)
            return;

        res.render('thingpedia_schema', { page_title: req._("Thingpedia - Type detail"),
                                          csrfToken: req.csrfToken(),
                                          schema: row,
                                          triggers: row.triggers,
                                          actions: row.actions,
                                          queries: row.queries });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/approve/:id', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(schema) {
            if (schema.kind_type !== 'other')
                throw new Error(req._("This schema is associated with a device or app and should not be manipulated directly"));
            return model.approve(dbClient, req.params.id).then(function() {
                res.redirect(303, '/thingpedia/schemas/by-id/' + schema.kind);
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/delete/:id', user.requireLogIn, user.requireDeveloper(),  function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(row) {
            if (row.kind_type !== 'other')
                throw new Error(req._("This schema is associated with a device or app and should not be manipulated directly"));
            if (row.owner !== req.user.developer_org && req.user.developer_status < user.DeveloperStatus.ADMIN) {
                res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: req._("Not Authorized") });
                return;
            }

            return model.delete(dbClient, req.params.id).then(function() {
                res.redirect(303, '/thingpedia/devices');
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e.message });
    }).done();
});

// only allow admins to deal with global schemas for now...
router.get('/create', user.redirectLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    res.render('thingpedia_schema_edit', { page_title: req._("Thingpedia - Create new Type"),
                                           create: true,
                                           csrfToken: req.csrfToken(),
                                           schema: { kind: '',
                                                     code: JSON.stringify({
                                                         triggers: {},
                                                         actions: {},
                                                         queries: {}
                                          })}})
});

function validateSchema(dbClient, req) {
    var code = req.body.code;
    var kind = req.body.kind;

    if (!code || !kind)
        throw new Error(req._("Not all required fields were presents"));
    Validation.validateKind(kind, 'type name');

    var ast = JSON.parse(code);
    Validation.validateAllInvocations(ast);
    return ast;
}

function ensureExamples(dbClient, schemaId, ast) {
    // FIXME
    //return generateExamples(dbClient, kind, ast);

    return exampleModel.deleteBySchema(dbClient, schemaId, 'en').then(() => {
        let examples = ast.examples.map((ex) => {
            return ({
                schema_id: schemaId,
                utterance: ex.utterance,
                target_code: ex.program,
                target_json: '', // FIXME
                type: 'thingpedia',
                language: 'en',
                is_base: 1
            });
        });
        return exampleModel.createMany(dbClient, examples);
    });
}

function findInvocation(ex) {
    const REGEXP = /^(?:tt:)?(\$?[a-z0-9A-Z_.-]+)\.([a-z0-9A-Z_]+)$/;
    var parsed = JSON.parse(ex.target_json);
    if (parsed.action)
        return ['actions', REGEXP.exec(parsed.action.name.id)];
    else if (parsed.trigger)
        return ['triggers', REGEXP.exec(parsed.trigger.name.id)];
    else if (parsed.query)
       return ['queries', REGEXP.exec(parsed.query.name.id)];
    else
        return null;
}

const PARAM_REGEX = /\$(?:([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9\_]+))?})/;

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
        let [_, param1, param2, option] = match;
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

function migrateManifest(ast, examples, kind) {
    ast.examples = examples.map((ex) => {
        if (ex.target_code)
            return { utterance: ex.utterance, program: ex.target_code };

        let [function_type, [,,function_name]] = findInvocation(ex);
        return legacyCreateExample(ex.utterance, kind, function_name, function_type, ast[function_type][function_name]);
    });
}

function doCreateOrUpdate(id, create, req, res) {
    var code = req.body.code;
    var kind = req.body.kind;
    var approve = !!req.body.approve;

    var gAst = undefined;

    Q.try(function() {
        return db.withTransaction(function(dbClient) {
            return Q.try(function() {
                return validateSchema(dbClient, req);
            }).catch(function(e) {
                console.error(e.stack);
                res.render('thingpedia_schema_edit', { page_title:
                                                       (create ?
                                                        req._("Thingpedia - Create new Type") :
                                                        req._("Thingpedia - Edit Type")),
                                                       csrfToken: req.csrfToken(),
                                                       error: e,
                                                       id: id,
                                                       schema: { kind: kind,
                                                                 code: code },
                                                       create: create });
                return null;
            }).then(function(ast) {
                if (ast === null)
                    return null;

                gAst = ast;
                var res = ManifestToSchema.toSchema(ast);
                var types = res[0];
                var meta = res[1];
                var obj = {
                    kind: kind,
                    // convert security-camera to 'security camera' and googleDrive to 'google drive'
                    kind_canonical: kind.replace(/[_\-]/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase(),
                };

                if (create) {
                    obj.kind_type = 'other';
                    obj.owner = req.user.developer_org;
                    if (req.user.developer_status < user.DeveloperStatus.TRUSTED_DEVELOPER ||
                        !approve) {
                        obj.approved_version = null;
                        obj.developer_version = 0;
                    } else {
                        obj.approved_version = 0;
                        obj.developer_version = 0;
                    }
                    return model.create(dbClient, obj, types, meta);
                } else {
                    return model.get(dbClient, id).then(function(old) {
                        if (old.owner !== req.user.developer_org &&
                            req.user.developer_status < user.DeveloperStatus.ADMIN)
                            throw new Error(req._("Not Authorized"));
                        if (old.kind_type !== 'other')
                            throw new Error(req._("Only non-device specific types can be modified from this page. Upload a new interface package to modify a device type"));

                        obj.developer_version = old.developer_version + 1;
                        if (req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER &&
                            approve)
                            obj.approved_version = obj.developer_version;

                        return model.update(dbClient, id, obj.kind, obj, types, meta);
                    });
                }
            }).tap(function(obj) {
                if (obj === null)
                    return null;

                return ensureExamples(dbClient, obj.id, gAst);
            }).then(function(obj) {
                if (obj === null)
                    return;

                res.redirect('/thingpedia/schemas/by-id/' + obj.kind);
            });
        });
    }).catch(function(e) {
        console.error(e.stack);
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
}

// restrict generic type creation to admins
router.post('/create', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    doCreateOrUpdate(undefined, true, req, res);
});

router.get('/update/:id', user.redirectLogIn, user.requireDeveloper(), function(req, res) {
    Q.try(function() {
        return db.withClient(function(dbClient) {
            return model.get(dbClient, req.params.id).then(function(d) {
                if (d.owner !== req.user.developer_org &&
                    req.user.developer < user.DeveloperStatus.ADMIN)
                    throw new Error(req._("Not Authorized"));
                if (d.kind_type !== 'other')
                    throw new Error(req._("Only non-device and non-app specific types can be modified from this page. Upload a new interface package to modify a device type"));

                return model.getTypesAndMeta(dbClient, req.params.id, d.developer_version).then(function(row) {
                    d.types = JSON.parse(row.types);
                    d.meta = JSON.parse(row.meta);
                    return d;
                });
            }).then(function(d) {
                return exampleModel.getBaseBySchema(dbClient, req.params.id, 'en').then(function(examples) {
                    var ast = ManifestToSchema.toManifest(d.types, d.meta);
                    migrateManifest(ast, examples, d.kind);

                    d.code = JSON.stringify(ast);
                    res.render('thingpedia_schema_edit', { page_title: req._("Thingpedia - Edit type"),
                                                           csrfToken: req.csrfToken(),
                                                           id: req.params.id,
                                                           schema: d,
                                                           create: false });
                });
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

module.exports = router;
