// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const express = require('express');
const highlightjs = require('highlight.js');
highlightjs.registerLanguage('tt', require('../util/highlightjs-thingtalk'));

const ThingTalk = require('thingtalk');

const db = require('../util/db');
const user = require('../util/user');
const deviceModel = require('../model/device');
const schemaModel = require('../model/schema');
const exampleModel = require('../model/example');

const SchemaUtils = require('../util/manifest_to_schema');
const DatasetUtils = require('../util/dataset');
const Importer = require('../util/import_device');
const I18n = require('../util/i18n');

var router = express.Router();

function getOrgId(req) {
    if (!req.user)
        return null;
    if ((req.user.roles & user.Role.THINGPEDIA_ADMIN) !== 0)
        return -1;
    else
        return req.user.developer_org;
}

router.get('/by-id/:kind', (req, res, next) => {
    const language = I18n.localeToLanguage(req.locale);
    db.withClient(async (dbClient) => {
        const orgId = getOrgId(req);
        const [devices, schemas, examples] = await Promise.all([
            deviceModel.getFullCodeByPrimaryKind(dbClient, req.params.kind, orgId),
            schemaModel.getMetasByKinds(dbClient, [req.params.kind], orgId, language),
            exampleModel.getByKinds(dbClient, [req.params.kind], getOrgId(req), language),
        ]);
        if (devices.length === 0 || schemas.length === 0) {
            res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Not Found.") });
            return;
        }
        const parsed = ThingTalk.Grammar.parse(Importer.migrateManifest(devices[0].code, devices[0]));
        const classDef = parsed.classes[0];
        const schema = schemas[0];
        const translated = SchemaUtils.mergeClassDefAndSchema(classDef, schema);
        const config = classDef.config;
        if (config) {
            config.in_params.forEach((p) => {
                if ((p.name.endsWith('_secret') || p.name.endsWith('_key')) && p.value.isString)
                    p.value.value = '<hidden>';
            });
        }
        const code = parsed.prettyprint();

        const highlightedCode = highlightjs.highlight('tt', code).value;
        const dataset = DatasetUtils.examplesToDataset(req.params.kind, language, examples,
            { editMode: true });
        const highlighedDataset = highlightjs.highlight('tt', dataset).value;

        const row = {
            owner: devices[0].owner,
            approved_version: devices[0].approved_version,
            developer_version: devices[0].developer_version,
            kind: req.params.kind,
            translated: translated,
            code: code,
            highlightedCode: highlightedCode,
            dataset: dataset,
            highlighedDataset: highlighedDataset
        };

        res.render('thingpedia_schema', { page_title: req._("Thingpedia - Type detail"),
                                          csrfToken: req.csrfToken(),
                                          schema: row });
    }).catch(next);
});

module.exports = router;
