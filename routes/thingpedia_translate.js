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

const Config = require('../config');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/schema');
const exampleModel = require('../model/example');
const Validation = require('../util/validation');
const generateExamples = require('../util/generate_examples');
const ManifestToSchema = require('../util/manifest_to_schema');

var router = express.Router();

router.get('/', function(req, res) {
    res.render('thingpedia_translate_portal', { page_title: req._("Translate ThingPedia") });
});

function localeToLanguage(locale) {
    // only keep the language part of the locale, we don't
    // yet distinguish en_US from en_GB
    return (locale || 'en').split(/[-_\@\.]/)[0];
}

router.get('/schema/by-id/:kind', user.redirectLogIn, function(req, res) {
    var language = req.query.language || localeToLanguage(req.user.locale);
    db.withTransaction(function(dbClient) {
        return Q.all([model.getMetasByKinds(dbClient, [req.params.kind], req.user.developer_org, 'en'),
            model.getMetasByKinds(dbClient, [req.params.kind], req.user.developer_org, language)]);
    }).spread(function(englishrows, translatedrows) {
        if (englishrows.length === 0 || translatedrows.length === 0) {
            res.status(404).render('error', { page_title: req._("ThingPedia - Error"),
                                              message: req._("Not Found") });
            return;
        }
        var english = englishrows[0];
        var translated = translatedrows[0];

        // generate translation pairs
        // we need to translate canonicals, confirmations, and slot-filling questions

        var pairs = [];
        for (var what of ['triggers', 'actions', 'queries']) {
            if (!translated[what])
                translated[what]
            for (var name in english[what]) {
                if (!translated[what][name]) {
                    translated[what][name] = {
                        canonical: '',
                        confirmation: '',
                        questions: [],
                    };
                }
                if (!translated[what][name].questions)
                    translated[what][name].questions = [];
                // undo the fallback that schema.js does
                if (translated[what][name].confirmation === english[what][name].doc)
                    translated[what][name].confirmation = '';

                pairs.push({
                    id: what + '_canonical_' + name,
                    english: english[what][name].canonical,
                    translated: translated[what][name].canonical
                });
                pairs.push({
                    id: what + '_confirmation_' + name,
                    english: english[what][name].confirmation,
                    translated: translated[what][name].confirmation
                });

                english[what][name].questions.forEach(function(q, i) {
                    if (!q)
                        return;
                    pairs.push({
                        id: what + '_question_' + english[what][name].args[i] + '_' + name,
                        english: q,
                        translated: translated[what][name].questions[i]
                    });
                });
            }
        }

        res.render('thingpedia_translate_schema', {
            page_title: req._("ThingPedia - Translate Type"),
            language: language,
            english: english,
            pairs: pairs,
            csrfToken: req.csrfToken(),
        });
    }).catch(function(e) {
        console.error(e.stack);
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: e });
    }).done();
});

router.post('/schema/by-id/:kind', user.requireLogIn, function(req, res) {
    var language = req.body.language;
    if (!language) {
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                              message: req._("Missing language.") });
        return;
    }

    db.withTransaction(function(dbClient) {
        return model.getMetasByKinds(dbClient, [req.params.kind], req.user.developer_org, 'en').then(function(englishrows) {
            if (englishrows.length === 0) {
                res.status(404).render('error', { page_title: req._("ThingPedia - Error"),
                                                  message: req._("Not Found") });
                return;
            }
            var english = englishrows[0];
            var translations = {};

            for (var what of ['triggers', 'actions', 'queries']) {
                for (var name in english[what]) {
                    var canonical = req.body[what + '_canonical_' + name] || english[what][name].canonical;
                    var confirmation = req.body[what + '_confirmation_' + name] || english[what][name].confirmation;

                    var questions = [];
                    english[what][name].questions.forEach(function(q, i) {
                        if (!q)
                            questions[i] = '';
                        else
                            questions[i] = req.body[what + '_question_' + english[what][name].args[i] + '_' + name] || q;
                    });

                    translations[name] = {
                        canonical: canonical,
                        confirmation: confirmation,
                        questions: questions
                    };
                }
            }

            console.log('translations', translations);
            return model.insertTranslations(dbClient, english.id, english.developer_version, language, translations);
        });
    }).then(function() {
        res.redirect(303, '/thingpedia/translate/schema/by-id/' + req.params.kind);
    }).catch(function(e) {
        console.error(e.stack);
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router;
