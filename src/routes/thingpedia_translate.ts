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

import express from 'express';
import * as ThingTalk from 'thingtalk';

import * as db from '../util/db';
import * as user from '../util/user';
import * as model from '../model/schema';
import * as exampleModel from '../model/example';
import * as iv from '../util/input_validation';
import { NotFoundError } from '../util/errors';
import * as I18n from '../util/i18n';
import ThingpediaClient from '../util/thingpedia-client';
import * as DatasetUtils from '../util/dataset';
import * as Validation from '../util/validation';
import * as Importer from '../util/import_device';
import { BadRequestError } from '../util/errors';

const router = express.Router();

router.get('/', (req, res) => {
    res.render('thingpedia_translate_portal', { page_title: req._("Translate Thingpedia") });
});

// TODO precise type annotations
function makeTranslationPairs(english : any, translated : any) {
    // we need to translate canonicals, confirmations, slot-filling questions,
    // argument names (in canonical form) and

    const out : any = {
        actions: {},
        queries: {}
    };
    for (const what of ['actions', 'queries']) {
        if (!translated[what])
            translated[what] = {};
        for (const name in english[what]) {
            if (!translated[what][name]) {
                translated[what][name] = {
                    canonical: '',
                    confirmation: '',
                    formatted: [],
                    questions: [],
                    argcanonicals: []
                };
            }
            out[what][name] = {
                canonical: {
                    english: english[what][name].canonical,
                    translated: translated[what][name].canonical
                },
                confirmation: {
                    english: english[what][name].confirmation,
                    translated: translated[what][name].confirmation
                },
                formatted: [],
                args: [],
            };

            for (let i = 0; i < english[what][name].formatted.length; i++) {
                let englishformat = english[what][name].formatted[i];
                let translatedformat = translated[what][name].formatted[i] || {};

                if (typeof englishformat === 'string')
                    englishformat = { type: 'text', text: englishformat };
                if (typeof translatedformat === 'string')
                    translatedformat = { type: 'text', text: translatedformat };

                const doubleformat : any = {
                    type: englishformat.type,
                };
                for (const key in englishformat) {
                    if (key === 'type')
                        continue;
                    doubleformat[key] = {
                        english: englishformat[key],
                        translated: translatedformat[key]
                    };
                }
                out[what][name].formatted.push(doubleformat);
            }

            english[what][name].args.forEach((argname : string, i : number) => {
                out[what][name].args.push({
                    name: argname,
                    argcanonical: {
                        english: english[what][name].argcanonicals[i],
                        translated: translated[what][name].argcanonicals[i]
                    },
                    question: {
                        english: english[what][name].questions[i],
                        translated: translated[what][name].questions[i]
                    }
                });
            });
        }
    }

    return out;
}

router.get('/by-id/:kind', user.requireLogIn, iv.validateGET({ fromVersion: '?integer',  }), (req, res, next) => {
    const language = I18n.localeToLanguage(req.locale);
    if (language === 'en') {
        res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("Translations for English cannot be contributed.") });
        return;
    }

    db.withTransaction(async (dbClient) => {
        let fromVersion = req.query.fromVersion ? parseInt(req.query.fromVersion) : null;

        const englishinfo = await model.getByKind(dbClient, req.params.kind);
        const englishrows = await model.getMetasByKinds(dbClient, [req.params.kind], req.user!.developer_org, 'en');

        let maxVersion;
        if (englishinfo.owner === req.user!.developer_org ||
            (req.user!.roles & user.Role.THINGPEDIA_ADMIN) === 0)
            maxVersion = englishinfo.developer_version;
        else
            maxVersion = englishinfo.approved_version;

        if (maxVersion === null) // pretend the device does not exist if it is not visible
            throw new NotFoundError();

        if (fromVersion !== null)
            fromVersion = Math.min(fromVersion, maxVersion);
        else
            fromVersion = maxVersion;

        const translatedrows = await model.getMetasByKindAtVersion(dbClient, req.params.kind, fromVersion, language);

        const english = englishrows[0];
        const translated = translatedrows[0] || {};

        const translatedExamples = await exampleModel.getBaseBySchema(dbClient, englishinfo.id, language);
        let dataset;
        if (translatedExamples.length > 0) {
            dataset = await DatasetUtils.examplesToDataset(req.params.kind, language, translatedExamples, { editMode: true });
        } else {
            const englishExamples = await exampleModel.getBaseBySchema(dbClient, englishinfo.id, 'en');
            dataset = await DatasetUtils.examplesToDataset(req.params.kind, language, englishExamples, { editMode: true, skipId: true });
        }

        const { actions, queries } = makeTranslationPairs(english, translated);

        res.render('thingpedia_translate_schema', {
            page_title: req._("Thingpedia - Translate Device"),
            kind: req.params.kind,
            language,
            fromVersion,
            actions,
            queries,
            dataset,
        });

    }, 'serializable', 'read only').catch(next);
});

async function validateDataset(req : express.Request, dbClient : db.Client) {
    const tpClient = new ThingpediaClient(req.user!.developer_key, req.user!.locale, undefined, dbClient);
    const schemaRetriever = new ThingTalk.SchemaRetriever(tpClient, null, true);

    const parsed = await ThingTalk.Syntax.parse(req.body.dataset).typecheck(schemaRetriever, false);

    if (!(parsed instanceof ThingTalk.Ast.Library) ||
        parsed.datasets.length !== 1 ||
        parsed.datasets[0].name !== '@' + req.params.kind ||
        parsed.datasets[0].language !== req.body.language)
        throw new Validation.ValidationError("Invalid dataset file: must contain exactly one dataset, with the same identifier as the class and the correct language");

    const dataset = parsed.datasets[0];
    await Validation.tokenizeDataset(dataset);
    await Validation.validateDataset(dataset);

    return dataset;
}

interface PrimitiveTypes {
    string : string;
    number : number;
    null : null;
    undefined : undefined;
    object : object;
}

function safeGet(obj : any, expect : undefined, ...args : string[]) : unknown;
function safeGet<T extends 'string'|'number'|'null'|'undefined'|'object'>(obj : any, expect : T, ...args : string[]) : PrimitiveTypes[T];
function safeGet(obj : any, expect : string|undefined, ...args : string[]) : unknown {
    for (let i = 0; i < args.length - 1; i++) {
        const key = args[i];
        if (typeof obj[key] !== 'object')
            throw new BadRequestError(`Invalid type for parameter [${args.join('][')}]`);
        obj = obj[key];
    }
    const lastKey = args[args.length-1];
    if (expect !== undefined && typeof obj[lastKey] !== expect)
        throw new BadRequestError(`Invalid type for parameter [${args.join('][')}]`);
    return obj[lastKey];
}

function computeTranslations(req : express.Request, english : any) {
    const translations : any = {};

    for (const what of ['actions', 'queries']) {
        for (const name in english[what]) {
            const canonical = safeGet(req.body, 'string', 'canonical', name);
            if (!canonical)
                throw new Validation.ValidationError(`Missing canonical for ${what} ${name}`);
            const confirmation = safeGet(req.body, 'string', 'confirmation', name);
            if (!confirmation)
                throw new Validation.ValidationError(`Missing confirmation for ${what} ${name}`);

            let formatted : any = safeGet(req.body, undefined, 'formatted', name);
            if (formatted !== undefined && !Array.isArray(formatted))
                throw new BadRequestError(`Invalid type for parameter [formatted][${name}]`);
            if (formatted === undefined)
                formatted = [];
            for (let i = 0; i < formatted.length; i++) {
                const formatel = formatted[i];
                if (typeof formatel !== 'object' ||
                    typeof formatel.type !== 'string' ||
                    !(formatel.type !== 'text' || typeof formatel.text === 'string'))
                    throw new BadRequestError(`Invalid type for parameter [formatted][${name}]`);

                if (formatel.type === 'text')
                    formatted[i] = formatel.text;
            }

            const questions = [];
            const argcanonicals = [];
            for (let i = 0; i < english[what][name].args.length; i++) {
                const argname = english[what][name].args[i];
                const argcanonical = safeGet(req.body, 'string', 'argcanonical', name, argname);
                if (!argcanonical)
                    throw new Validation.ValidationError(`Missing argument name for ${argname} in ${what} ${name}`);
                argcanonicals.push(argcanonical);

                if (english[what][name].questions[i]) {
                    const question = safeGet(req.body, 'string', 'question', name, argname);
                    if (!question)
                        throw new Validation.ValidationError(`Missing slot-filling question for ${argname} in ${what} ${name}`);
                    questions.push(question);
                } else {
                    questions.push('');
                }
            }

            translations[name] = {
                canonical,
                confirmation,
                formatted,
                questions,
                argcanonicals,
            };
        }
    }
    return translations;
}

router.post('/by-id/:kind', user.requireLogIn, iv.validatePOST({ language: 'string', dataset: 'string' }), (req, res, next) => {
    const language = req.body.language;
    if (language === 'en') {
        res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("Translations for English cannot be contributed.") });
        return;
    }
    if (!I18n.get(language, false)) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("Invalid language identifier %s.").format(language) });
        return;
    }

    db.withTransaction(async (dbClient) => {
        const englishinfo = await model.getByKind(dbClient, req.params.kind);
        const englishrows = await model.getMetasByKinds(dbClient, [req.params.kind], req.user!.developer_org, 'en');
        if (englishrows.length === 0)
            throw new NotFoundError();

        const english = englishrows[0];
        let dataset, translations;
        try {
            dataset = await validateDataset(req, dbClient);
            translations = computeTranslations(req, english);
        } catch(e) {
            console.error(e);
            if (!(e instanceof Validation.ValidationError))
                throw e;

            res.status(400).render('error', {
                page_title: req._("Thingpedia - Error"),
                message: e
            });
            return;
        }

        await model.insertTranslations(dbClient, englishinfo.id, englishinfo.developer_version, language, translations);
        await Importer.ensureDataset(dbClient, englishinfo.id, null, dataset);
        res.redirect(303, '/thingpedia/classes/by-id/' + req.params.kind);
    }).catch(next);
});

export default router;
