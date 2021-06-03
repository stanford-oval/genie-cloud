// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const express = require('express');
const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');

const db = require('../util/db');
const model = require('../model/mturk');
const deviceModel = require('../model/device');
const example = require('../model/example');
const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const iv = require('../util/input_validation');
const i18n = require('../util/i18n');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../util/errors');

const MTurkUtils = require('../util/mturk');

var router = express.Router();

async function autoValidateParaphrase(dbClient, batchId, language, schemas, utterance, thingtalk) {
    // FIXME this should use Genie's ParaphraseValidator

    const tokenizer = i18n.get(language).genie.getTokenizer();
    const [program, { tokens: preprocessed, entities }] = await Promise.all([
        ThingTalk.Syntax.parse(thingtalk).typecheck(schemas),
        tokenizer.tokenize(utterance)
    ]);

    let target_code;
    try {
        target_code = Genie.ThingTalkUtils.serializePrediction(program, preprocessed, entities, {
            locale: language
        });
    } catch(e) {
        throw new BadRequestError(e.message);
    }
    return example.create(dbClient, {
        utterance: utterance,
        preprocessed: preprocessed.join(' '),
        target_code: target_code.join(' '),
        target_json: '', // FIXME
        type: 'turking' + batchId,
        flags: '', // no "training" flag until validation
        language: language,
        is_base: 0
    });
}

function inputValidateSubmission(req, res, next) {
    for (let i = 1; i < MTurkUtils.SYNTHETIC_PER_PARAPHRASE_HIT + 1; i++) {
        let program_id = req.body[`program_id${i}`];
        let thingtalk = req.body[`thingtalk${i}`];
        if (!iv.checkKey(program_id, 'string')) {
            iv.failKey(req, res, `program_id${i}`, {});
            return;
        }
        if (!iv.checkKey(thingtalk, 'string')) {
            iv.failKey(req, res, `thingtalk${i}`, {});
            return;
        }
        for (let j = 1; j < MTurkUtils.PARAPHRASES_PER_SENTENCE + 1; j ++) {
            let paraphrase = req.body[`paraphrase${i}-${j}`];
            if (!iv.checkKey(paraphrase, 'string')) {
                iv.failKey(req, res, `paraphrase${i}-${j}`, {});
                return;
            }
        }
    }
    next();
}

function makeSubmissionId() {
    // FIXME should probably use a cryptographic ID here
    return (Math.random() + 1).toString(36).substring(2, 10) + (Math.random() + 1).toString(36).substring(2, 10);
}

router.post('/submit', iv.validatePOST({ batch: 'string' }), inputValidateSubmission, (req, res, next) => {
    let submissionId = makeSubmissionId();
    db.withTransaction(async (dbClient) => {
        let submissions = [];

        const batch = await model.getBatchDetails(dbClient, req.body.batch);
        if (batch.status === 'created')
            await model.updateBatch(dbClient, batch.id, { status: 'paraphrasing' });
        else if (batch.status !== 'paraphrasing')
            throw new ForbiddenError(req._("The HIT you're trying to submit was already closed."));

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

                examples.push(autoValidateParaphrase(dbClient, batch.id, batch.language, schemas, paraphrase, thingtalk));
                submissions.push({
                    submission_id: submissionId,
                    program_id: program_id,
                    target_count: 3,
                    accept_count: 0,
                    reject_count: 0
                });
            }
        }

        examples = await Promise.all(examples);
        for (let i = 0; i < examples.length; i++)
            submissions[i].example_id = examples[i];

        await model.logSubmission(dbClient, submissionId, batch.id, req.body.hit, req.body.worker);
        await model.insertSubmission(dbClient, submissions);
    }).then(() => {
        res.render('mturk-submit', { page_title: req._('Thank you'), token: submissionId });
    }).catch(next);
});

router.get(`/submit/:batch/:hit`, (req, res, next) => {
    const hitId = parseInt(req.params.hit);

    db.withTransaction(async (dbClient) => {
        const batch = await model.getBatchDetails(dbClient, req.params.batch);
        if (batch.status !== 'created' && batch.status !== 'paraphrasing')
            throw new ForbiddenError(req._("The HIT you're trying to submit was already closed."));

        const hit = await model.getHIT(dbClient, batch.id, hitId);
        if (hit.length === 0)
            throw new NotFoundError();

        const allDeviceKinds = new Set;
        const program_id = [];
        const sentences = [];
        const code = [];
        let hints = [];
        for (const row of hit) {
            program_id.push(row.id);
            code.push(row.thingtalk);
            sentences.push(row.sentence);

            const hint = new Set;
            const parsed = ThingTalk.Syntax.parse(row.thingtalk);
            for (const [,prim] of parsed.iteratePrimitives()) {
                if (prim.selector.isDevice && prim.selector.kind !== 'org.thingpedia.builtin.thingengine.builtin') {
                    allDeviceKinds.add(prim.selector.kind);
                    hint.add(prim.selector.kind);
                }
            }
            hints.push(Array.from(hint));
        }

        const allDevices = await deviceModel.getNamesByKinds(dbClient, Array.from(allDeviceKinds));

        // remove hints that refer to devices we did find (unlikely but defensive)
        hints = hints.map((hint) => hint.filter((d) => !!allDevices[d]));
        return [program_id, code, sentences, hints, allDevices];
    }, 'serializable', 'read only').then(([program_id, code, sentences, hints, allDevices]) => {
        res.render('mturk', { page_title: req._('Paraphrase'),
                              hit: hitId,
                              batch: req.params.batch,
                              program_id: program_id,
                              code: code,
                              sentences: sentences,
                              hints,
                              allDevices,
                              csrfToken: req.csrfToken() });
    }).catch(next);
});

router.post('/validate', iv.validatePOST({ batch: 'string', hit: 'string' }), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const batch = await model.getBatchDetails(dbClient, req.body.batch);

        // catch accidental double-submissions quietly, and do nothing
        const existing = await model.getExistingValidationSubmission(dbClient, batch.id,
            req.body.hit, req.body.worker);
        if (existing.length > 0)
            return existing[0].submission_id;

        if (batch.status !== 'validating')
            throw new ForbiddenError(req._("The HIT you're trying to submit is not open yet, or was already closed."));

        const hits = await model.getValidationHIT(dbClient, batch.id, req.body.hit);
        let submissionId = makeSubmissionId();

        let errors = 0;
        const validationRows = [];
        const good = [];
        const bad = [];
        for (let hit of hits) {
            if (req.body['validation-' + hit.id] !== 'same' && req.body['validation-' + hit.id] !== 'different') {
                throw new BadRequestError(req._("Missing or invalid parameter %s")
                    .format(`validation-${hit.id}`));
            }
            if (hit.type === 'fake-same' && req.body['validation-' + hit.id] !== 'same') {
                errors ++;
            } else if (hit.type === 'fake-different' && req.body['validation-' + hit.id] !== 'different') {
                errors ++;
            } else if (hit.type === 'real') {
                validationRows.push({
                    validation_sentence_id: hit.id,
                    submission_id: submissionId,
                    answer: req.body['validation-' + hit.id]
                });
                if (req.body['validation-' + hit.id] === 'same')
                    good.push(hit.example_id);
                else
                    bad.push(hit.example_id);
            }
        }
        if (errors > 2)
            throw new BadRequestError(req._("You have made too many mistakes. Please go back and try again."));

        await model.logValidationSubmission(dbClient, submissionId, batch.id, req.body.hit, req.body.worker);
        await model.insertValidationSubmission(dbClient, validationRows, good, bad);
        await model.markSentencesGood(dbClient, good);
        await model.markSentencesBad(dbClient, bad);
        return submissionId;
    }).then((submissionId) => {
        res.render('mturk-submit', { page_title: req._('Thank you'), token: submissionId });
    }).catch(next);
});

router.get(`/validate/:batch/:hit`, (req, res, next) => {
    const hitId = req.params.hit;

    db.withTransaction(async (dbClient) => {
        const batch = await model.getBatchDetails(dbClient, req.params.batch);
        if (batch.status !== 'validating')
            throw new ForbiddenError(req._("The HIT you're trying to submit is not open yet, or was already closed."));

        return model.getValidationHIT(dbClient, batch.id, hitId);
    }, 'serializable', 'read only').then((hit) => {
        if (hit.length === 0)
            throw new NotFoundError();
        let sentences = [];

        let current = undefined;
        for (let row of hit) {
            if (current && row.program_id === current.synthetic_id) {
                current.paraphrases.push({
                    id: row.id,
                    paraphrase: row.paraphrase
                });
            } else {
                current = {
                    synthetic_id: row.program_id,
                    synthetic: row.synthetic,
                    paraphrases: [{
                        id: row.id,
                        paraphrase: row.paraphrase
                    }]
                };
                sentences.push(current);
            }
        }

        res.render('mturk_validate', {
            page_title: req._("Almond - Paraphrase Validation"),
            hit: hitId,
            batch: req.params.batch,
            sentences,
            csrfToken: req.csrfToken()
        });
    }).catch(next);
});

module.exports = router;
