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

var router = express.Router();

router.get('/', (req, res) => {
    res.render('thingpedia_translate_portal', { page_title: req._("Translate Thingpedia") });
});

function localeToLanguage(locale) {
    // only keep the language part of the locale, we don't
    // yet distinguish en_US from en_GB
    return (locale || 'en').split(/[-_@.]/)[0];
}

router.get('/by-id/:kind', user.redirectLogIn, (req, res) => {
    const language = req.query.language || localeToLanguage(req.user.locale);
    if (language === 'en') {
        res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("Translations for English cannot be contributed.") });
        return;
    }
    const fromVersion = req.query.fromVersion || null;

    db.withTransaction((dbClient) => {
        return Promise.all([
            model.getMetasByKinds(dbClient, [req.params.kind], req.user.developer_org, 'en'),
            fromVersion !== null ?
                model.getMetasByKindAtVersion(dbClient, req.params.kind, fromVersion, language)
              : model.getMetasByKinds(dbClient, [req.params.kind], req.user.developer_org, language)
        ]).then(([englishrows, translatedrows]) => {
            if (englishrows.length === 0 || translatedrows.length === 0)
                throw new Error(req._("Not Found."));

            var english = englishrows[0];
            var translated = translatedrows[0];

            return Promise.all([
                exampleModel.getBaseBySchema(dbClient, english.id, 'en').then((examples) => {
                    english.examples = examples;
                    return english;
                }),
                exampleModel.getBaseBySchema(dbClient, translated.id, language).then((examples) => {
                    translated.examples = examples;
                    return translated;
                })
            ]);
        });
    }).then(([english, translated]) => {
        // we need to translate canonicals, confirmations, slot-filling questions,
        // argument names (in canonical form) and

        const out = {
            triggers: {},
            actions: {},
            queries: {}
        };
        for (let what of ['triggers', 'actions', 'queries']) {
            if (!translated[what])
                translated[what] = {};
            for (let name in english[what]) {
                if (!translated[what][name]) {
                    translated[what][name] = {
                        canonical: '',
                        confirmation: '',
                        questions: [],
                        argcanonicals: []
                    };
                }
                if (!translated[what][name].questions)
                    translated[what][name].questions = [];
                if (!translated[what][name].examples)
                    translated[what][name].examples = [];
                if (!english[what][name].examples)
                    english[what][name].examples = [];
                // undo the fallback that schema.js does
                if (translated[what][name].confirmation === english[what][name].doc)
                    translated[what][name].confirmation = '';
                if (translated[what][name].confirmation_remote === english[what][name].confirmation)
                    translated[what][name].confirmation_remote = '';

                out[what][name] = {
                    canonical: {
                        english: english[what][name].canonical,
                        translated: translated[what][name].canonical
                    },
                    confirmation: {
                        english: english[what][name].confirmation,
                        translated: translated[what][name].confirmation
                    },
                    confirmation_remote: {
                        english: english[what][name].confirmation_remote,
                        translated: translated[what][name].confirmation_remote
                    },
                    args: [],
                };

                english[what][name].args.forEach((argname, i) => {
                    out[what][name].args.push({
                        id: argname,
                        name: {
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
        out.examples = english.examples.map((e, i) => {
            return { english: e, translated: translated.examples[i] };
        });

        res.render('thingpedia_translate_schema', {
            page_title: req._("Thingpedia - Translate Type"),
            language: language,
            english: english,
            fromVersion: translated.version !== null ? translated.version : fromVersion,
            triggers: out.triggers,
            actions: out.actions,
            queries: out.queries,
            csrfToken: req.csrfToken(),
        });
    }).catch((e) => {
        console.error(e.stack);
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

function ensureExamples(dbClient, schemaId, ast, language) {
    return exampleModel.deleteBySchema(dbClient, schemaId, language).then(() => {
        let examples = ast.examples.map((ex) => {
            return ({
                schema_id: schemaId,
                utterance: ex.utterance,
                preprocessed: ex.utterance,
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

router.post('/by-id/:kind', user.requireLogIn, (req, res) => {
    var language = req.body.language;
    if (!language) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Missing language.") });
        return;
    }
    if (language === 'en') {
        res.status(403).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("Translations for English cannot be contributed.") });
        return;
    }

    db.withTransaction((dbClient) => {
        return model.getMetasByKinds(dbClient, [req.params.kind], req.user.developer_org, 'en').then((englishrows) => {
            if (englishrows.length === 0)
                throw new Error(req._("Not Found."));

            const english = englishrows[0];
            const translations = {};

            for (let what of ['triggers', 'actions', 'queries']) {
                for (let name in english[what]) {
                    const canonical = req.body[what + '_canonical_' + name] || english[what][name].canonical;
                    const confirmation = req.body[what + '_confirmation_' + name] || english[what][name].confirmation;
                    const confirmation_remote = req.body[what + '_confirmation_remote_' + name] || english[what].confirmation_remote;

                    const questions = [];
                    english[what][name].questions.forEach((q, i) => {
                        if (!q)
                            questions[i] = '';
                        else
                            questions[i] = req.body[what + '_question_' + english[what][name].args[i] + '_' + name] || q;
                    });
                    const argcanonicals = [];
                    english[what][name].args.forEach((argname, i) => {
                        argcanonicals[i] = req.body[what + '_argname_' + argname + '_' + name] ||
                            english[what][name].argcanonicals[i] || argname;
                    });

                    translations[name] = {
                        args: english[what][name].args,
                        canonical: canonical,
                        confirmation: confirmation,
                        confirmation_remote: confirmation_remote,
                        questions: questions,
                        argcanonicals: argcanonicals,
                        schema: english[what][name].schema,
                        required: english[what][name].required,
                    };
                    english[what][name].args = english[what][name].args.map((arg, i) => {
                        return { name: arg, type: english[what][name].schema[i], argcanonical: argcanonicals[i], required: english[what][name].required[i], question: questions[i] };
                    });
                }
            }

            return model.insertTranslations(dbClient,
                                            english.id,
                                            english.developer_version,
                                            language,
                                            translations).then(() => {
                return ensureExamples(dbClient, english.kind, english, language);
            });
        });
    }).then(() => {
        res.redirect(303, '/thingpedia/schemas/by-id/' + req.params.kind);
    }).catch((e) => {
        console.error(e.stack);
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router;
