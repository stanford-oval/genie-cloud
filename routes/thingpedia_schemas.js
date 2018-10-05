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

const Validation = require('../util/validation');
const Importer = require('../util/import_device');
const SchemaUtils = require('../util/manifest_to_schema');
const DatasetUtils = require('../util/dataset');
const I18n = require('../util/i18n');

var router = express.Router();

router.get('/', (req, res, next) => {
    db.withClient((dbClient) => {
        return model.getAllForList(dbClient);
    }).then((rows) => {
        res.render('thingpedia_schema_list', { page_title: req._("Thingpedia - List of All Classes"),
                                               schemas: rows });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).catch(next);
});

function getOrgId(req) {
    if (!req.user)
        return null;
    if (req.user.developer_status >= user.DeveloperStatus.ADMIN)
        return -1;
    else
        return req.user.developer_org;
}

router.get('/by-id/:kind', (req, res, next) => {
    const language = req.query.language || (req.user ? I18n.localeToLanguage(req.user.locale) : 'en');
    db.withClient(async (dbClient) => {
        const rows = await model.getMetasByKinds(dbClient, [req.params.kind], getOrgId(req), language);
        if (rows.length === 0) {
            res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Not Found.") });
            return;
        }
        const row = rows[0];

        let [translated, examples] = await Promise.all([
            language === 'en' ? true : model.isKindTranslated(dbClient, req.params.kind, language),
            exampleModel.getByKinds(dbClient, [req.params.kind], getOrgId(req), language),
        ]);
        row.translated = translated;

        row.code = SchemaUtils.schemaListToClassDefs(rows, true).prettyprint();
        row.dataset = DatasetUtils.examplesToDataset(req.params.kind, 'en', examples,
                                                       { editMode: true });

        res.render('thingpedia_schema', { page_title: req._("Thingpedia - Type detail"),
                                          csrfToken: req.csrfToken(),
                                          schema: row });
    }).catch(next);
});

router.post('/approve', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    db.withTransaction(async (dbClient) => {
        const schema = await model.getByKind(dbClient, req.body.kind);
        if (schema.kind_type !== 'other')
            throw new Error(req._("This schema is associated with a device or app and should not be manipulated directly"));
        await model.approve(dbClient, schema.id);
    }).then(() => {
        res.redirect(303, '/thingpedia/classes/by-id/' + req.body.kind);
    }).catch((e) => {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/delete', user.requireLogIn, user.requireDeveloper(),  (req, res) => {
    db.withTransaction(async (dbClient) => {
        const row = await model.getByKind(dbClient, req.body.kind);
        if (row.owner !== req.user.developer_org &&
            req.user.developer < user.DeveloperStatus.ADMIN) {
            // note that this must be exactly the same error used by util/db.js
            // so that a true not found is indistinguishable from not having permission
            const err = new Error("Not Found");
            err.code = 'ENOENT';
            throw err;
        }
        if (row.kind_type !== 'other')
            throw new Error(req._("This schema is associated with a device or app and should not be manipulated directly"));

        return model.delete(dbClient, row.id);
    }).then(() => {
        res.redirect(303, '/thingpedia/devices');
    }).catch((e) => {
        if (e.code === 'ENOENT')
            res.status(404);
        else
            res.status(400);
        res.render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e.message });
    }).done();
});

// only allow admins to deal with global schemas for now...
router.get('/create', user.redirectLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    res.render('thingpedia_schema_edit', { page_title: req._("Thingpedia - Create New Class"),
                                           create: true,
                                           schema: { kind: '',
                                                     code: '',
                                                     dataset: '' }
                                          });
});

function doCreateOrUpdate(kind, create, req, res) {
    if (!create)
        req.body.kind = kind;
    const approve = req.user.developer_status >= user.DeveloperStatus.TRUSTED_DEVELOPER &&
        !!req.body.approve;

    return db.withTransaction(async (dbClient) => {
        let classDef;
        let dataset;
        let old = null;
        try {
            [classDef, dataset] = await Validation.validateSchema(dbClient, req, req.body,
                                                                  req.body.code, req.body.dataset);

            if (!create) {
                try {
                    old = await model.getByKind(dbClient, kind);
                } catch(e) {
                    throw new Error(req._("Existing device not found"));
                }
                if (old.owner !== req.user.developer_org &&
                    req.user.developer_status < user.DeveloperStatus.ADMIN)
                    throw new Error(req._("Existing device not found"));
            }
        } catch(e) {
            console.error(e.stack);
            res.render('thingpedia_schema_edit', { page_title:
                                                   (create ?
                                                    req._("Thingpedia - Create New Class") :
                                                    req._("Thingpedia - Edit Class")),
                                                   error: e,
                                                   schema: { kind: kind,
                                                             code: req.body.code,
                                                             dataset: req.body.dataset },
                                                   create: create });
            return;
        }

        kind = classDef.kind;
        const metas = SchemaUtils.classDefToSchema(classDef);
        const obj = {
            kind: kind,
            kind_canonical: Validation.cleanKind(kind),
        };

        if (create) {
            obj.kind_type = 'other';
            obj.owner = req.user.developer_org;
            obj.developer_version = 0;
            if (approve)
                obj.approved_version = 0;
            else
                obj.approved_version = null;
            await model.create(dbClient, obj, metas);
        } else {
            obj.developer_version = old.developer_version + 1;
            if (approve)
                obj.approved_version = obj.developer_version;

            await model.update(dbClient, old.id, obj.kind, obj, metas);
        }

        await Importer.ensureDataset(dbClient, obj.id, dataset);
        res.redirect('/thingpedia/classes/by-id/' + obj.kind);
    });
}

// restrict generic type creation to admins
router.post('/create', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res, next) => {
    doCreateOrUpdate(undefined, true, req, res).catch(next);
});

router.get('/update/:kind', user.redirectLogIn, user.requireDeveloper(), (req, res, next) => {
    db.withClient(async (dbClient) => {
        const schema = await model.getByKind(dbClient, req.params.kind);
        if (schema.owner !== req.user.developer_org &&
            req.user.developer < user.DeveloperStatus.ADMIN) {
            // note that this must be exactly the same error used by util/db.js
            // so that a true not found is indistinguishable from not having permission
            const err = new Error("Not Found");
            err.code = 'ENOENT';
            throw err;
        }
        if (schema.kind_type !== 'other')
            throw new Error(req._("Only non-device and non-app specific types can be modified from this page. Upload a new interface package to modify a device type"));

        const [meta, examples] = await Promise.all([
            model.getMetasByKindAtVersion(dbClient, schema.kind, schema.developer_version, 'en'),
            exampleModel.getBaseBySchemaKind(dbClient, req.params.kind, 'en')
        ]);

        schema.code = SchemaUtils.schemaListToClassDefs(meta, true).prettyprint();
        schema.dataset = DatasetUtils.examplesToDataset(req.params.kind, 'en', examples,
                                                       { editMode: true });

        res.render('thingpedia_schema_edit', { page_title: req._("Thingpedia - Edit type"),
                                               id: req.params.id,
                                               schema: schema,
                                               create: false });
    }).catch((e) => {
        if (e.code === 'ENOENT')
            res.status(404);
        else
            res.status(400);
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: e });
    }).catch(next);
});

router.post('/update/:kind', user.requireLogIn, user.requireDeveloper(), (req, res, next) => {
    doCreateOrUpdate(req.params.kind, false, req, res).catch(next);
});

module.exports = router;
