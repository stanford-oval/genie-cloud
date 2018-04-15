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

const express = require('express');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/schema');
const exampleModel = require('../model/example');
const entityModel = require('../model/entity');
const Validation = require('../util/validation');
const ManifestToSchema = require('../util/manifest_to_schema');

var router = express.Router();

router.get('/', (req, res) => {
    db.withClient((dbClient) => {
        return model.getAllForList(dbClient);
    }).then((rows) => {
        res.render('thingpedia_schema_list', { page_title: req._("Thingpedia - Supported Types"),
                                               schemas: rows });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

function localeToLanguage(locale) {
    // only keep the language part of the locale, we don't
    // yet distinguish en_US from en_GB
    return (locale || 'en').split(/[-_@.]/)[0];
}

router.get('/by-id/:kind', (req, res) => {
    const language = req.query.language || (req.user ? localeToLanguage(req.user.locale) : 'en');
    db.withClient((dbClient) => {
        return model.getMetasByKinds(dbClient, [req.params.kind], req.user ? (req.user.developer_status >= 3 ? -1 : req.user.developer_org) : null, language).then((rows) => {
            if (rows.length === 0) {
                res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: req._("Not Found.") });
                return null;
            }

            return rows[0];
        }).then((row) => {
            if (row === null)
                return null;
            return exampleModel.getBaseBySchema(dbClient, row.id, language).then((examples) => {
                row.examples = examples;
                return row;
            });
        }).then((row) => {
            if (row === null)
                return null;
            if (language === 'en') {
                row.translated = true;
                return row;
            }
            return model.isKindTranslated(dbClient, row.kind, language).then((t) => {
                row.translated = t;
                return row;
            });
        });
    }).then((row) => {
        if (row === null)
            return;

        res.render('thingpedia_schema', { page_title: req._("Thingpedia - Type detail"),
                                          csrfToken: req.csrfToken(),
                                          schema: row,
                                          triggers: row.triggers,
                                          actions: row.actions,
                                          queries: row.queries });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/approve/:id', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    db.withTransaction((dbClient) => {
        return model.get(dbClient, req.params.id).then((schema) => {
            if (schema.kind_type !== 'other')
                throw new Error(req._("This schema is associated with a device or app and should not be manipulated directly"));
            return model.approve(dbClient, req.params.id).then(() => {
                res.redirect(303, '/thingpedia/schemas/by-id/' + schema.kind);
            });
        });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/delete/:id', user.requireLogIn, user.requireDeveloper(),  (req, res) => {
    db.withTransaction((dbClient) => {
        return model.get(dbClient, req.params.id).then((row) => {
            if (row.kind_type !== 'other')
                throw new Error(req._("This schema is associated with a device or app and should not be manipulated directly"));
            if (row.owner !== req.user.developer_org && req.user.developer_status < user.DeveloperStatus.ADMIN) {
                res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                                  message: req._("Not Authorized") });
                return Promise.resolve();
            }

            return model.delete(dbClient, req.params.id).then(() => {
                res.redirect(303, '/thingpedia/devices');
            });
        });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e.message });
    }).done();
});

// only allow admins to deal with global schemas for now...
router.get('/create', user.redirectLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    res.render('thingpedia_schema_edit', { page_title: req._("Thingpedia - Create new Type"),
                                           create: true,
                                           csrfToken: req.csrfToken(),
                                           schema: { kind: '',
                                                     code: JSON.stringify({
                                                         actions: {},
                                                         queries: {}
                                          })}});
});

function validateSchema(dbClient, req) {
    var code = req.body.code;
    var kind = req.body.kind;

    if (!code || !kind)
        throw new Error(req._("Not all required fields were presents"));

    var ast = JSON.parse(code);
    return Validation.validateAllInvocations(kind, ast).then((entities) => {
        return entityModel.checkAllExist(dbClient, Array.from(entities));
    }).then(() => ast);
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

const PARAM_REGEX = /\$(?:([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/;

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

    Promise.resolve().then(() => {
        return db.withTransaction((dbClient) => {
            return Promise.resolve().then(() => {
                return validateSchema(dbClient, req);
            }).catch((e) => {
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
            }).then((ast) => {
                if (ast === null)
                    return null;

                gAst = ast;
                var res = ManifestToSchema.toSchema(ast);
                var types = res[0];
                var meta = res[1];
                var obj = {
                    kind: kind,
                    kind_canonical: Validation.cleanKind(kind),
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
                    return model.get(dbClient, id).then((old) => {
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
            }).tap((obj) => {
                if (obj === null)
                    return null;

                return ensureExamples(dbClient, obj.id, gAst);
            }).then((obj) => {
                if (obj === null)
                    return;

                res.redirect('/thingpedia/schemas/by-id/' + obj.kind);
            });
        });
    }).catch((e) => {
        console.error(e.stack);
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
}

// restrict generic type creation to admins
router.post('/create', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    doCreateOrUpdate(undefined, true, req, res);
});

router.get('/update/:id', user.redirectLogIn, user.requireDeveloper(), (req, res) => {
    Promise.resolve().then(() => {
        return db.withClient((dbClient) => {
            return model.get(dbClient, req.params.id).then((d) => {
                if (d.owner !== req.user.developer_org &&
                    req.user.developer < user.DeveloperStatus.ADMIN)
                    throw new Error(req._("Not Authorized"));
                if (d.kind_type !== 'other')
                    throw new Error(req._("Only non-device and non-app specific types can be modified from this page. Upload a new interface package to modify a device type"));

                return Promise.all([
                    d,
                    model.getMetasByKindAtVersion(dbClient, d.kind, d.developer_version, 'en'),
                    exampleModel.getBaseBySchema(dbClient, req.params.id, 'en')
                ]);
            });
        }).then(([d, [meta], examples]) => {
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
                        canonical: meta[what][name].canonical || ''
                    };
                }
            }
            migrateManifest(ast, examples, d.kind);

            d.code = JSON.stringify(ast);
            res.render('thingpedia_schema_edit', { page_title: req._("Thingpedia - Edit type"),
                                                   csrfToken: req.csrfToken(),
                                                   id: req.params.id,
                                                   schema: d,
                                                   create: false });
        });
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
});

router.post('/update/:id', user.requireLogIn, user.requireDeveloper(), (req, res) => {
    doCreateOrUpdate(req.params.id, false, req, res);
});

module.exports = router;
