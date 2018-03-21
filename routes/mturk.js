// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const db = require('../util/db');
const ThingTalk = require('thingtalk');

const user = require('../util/user');
const model = require('../model/mturk');
const example = require('../model/example');
const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const TokenizerService = require('../util/tokenizer_service');

var router = express.Router();

router.get('/', user.requireRole(user.Role.ADMIN), (req, res) => {
    db.with;
});

function validateOne(dbClient, batchId, language, schemas, utterance, thingtalk) {
    return Promise.all([ThingTalk.Grammar.parseAndTypecheck(thingtalk, schemas),
                        TokenizerService.tokenize(language, utterance)]).then(([program, { tokens: preprocessed, entities }]) => {

        let target_code = ThingTalk.NNSyntax.toNN(program, entities);
        for (let name in entities) {
            if (name === '$used') continue;
            throw new Error('Unused entity ' + name);
        }
        return example.create(dbClient, {
            utterance: utterance,
            preprocessed: preprocessed.join(' '),
            target_code: target_code.join(' '),
            target_json: '', // FIXME
            type: 'turking' + batchId,
            language: language,
            is_base: 0
        });
    });
}

router.post('/submit', (req, res) => {
    let submissionId = (Math.random() + 1).toString(36).substring(2, 10) + (Math.random() + 1).toString(36).substring(2, 10);
    db.withTransaction((dbClient) => {
        let submissions = [];

        return model.getBatchDetails(dbClient, req.body.batch).then((batch) => {
            const schemas = new ThingTalk.SchemaRetriever(new AdminThingpediaClient(batch.language, dbClient), null, true);
            let examples = [];

            for (let i = 1; i < 5; i ++) {
                let program_id = req.body[`program_id${i}`];
                let thingtalk = req.body[`thingtalk${i}`];
                //let sentence = req.body[`sentence${i}`];
                for (let j = 1; j < 3; j ++) {
                    let paraphrase = req.body[`paraphrase${i}-${j}`];
                    if (paraphrase.toLowerCase().replace(/\./g, '').trim() === 'no idea')
                        continue;

                    examples.push(validateOne(dbClient, req.body.batch, batch.language, schemas, paraphrase, thingtalk));
                    submissions.push({
                        submission_id: submissionId,
                        program_id: program_id,
                        target_count: 3,
                        accept_count: 0,
                        reject_count: 0
                    });
                }
            }

            return Promise.all(examples);
        }).then((examples) => {
            for (let i = 0; i < examples.length; i++)
                submissions[i].example_id = examples[i];

            return model.insertSubmission(dbClient, submissions);
        }).then(() => {
            return model.logSubmission(dbClient, submissionId, req.body.batch, req.body.hit, req.body.worker);
        });
    }).then(() => {
        res.render('mturk-submit', { page_title: req._('Thank you'), token: submissionId });
    }).catch((e) => {
        console.error(e.stack);
        res.render('error', { page_title: req._("Thingpedia - Error"),
            message: 'Submission failed. Please contact the HIT requestor for further instructions.' });
    }).done();
});

router.get(`/:batch/:hit`, (req, res) => {
    const batch = req.params.batch;
    const id = req.params.hit;

    db.withClient((dbClient) => {
        return model.getHIT(dbClient, batch, id);
    }).then((hit) => {
        let program_id = [];
        let sentences = [];
        let code = [];
        for (let i = 1; i < 5; i ++) {
            program_id.push(hit[`id${i}`]);
            code.push(hit[`thingtalk${i}`]);
            sentences.push(hit[`sentence${i}`]);
        }
        res.render('mturk', { page_title: req._('Paraphrase'),
                              hit: id,
                              batch: batch,
                              program_id: program_id,
                              code: code,
                              sentences: sentences, 
                              csrfToken: req.csrfToken() });
    }).catch((e) => {
        res.render('error', { message: 'Page does not exist.'});
    }).done();
});

module.exports = router;
