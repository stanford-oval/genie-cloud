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

const Q = require('q');
const fs = require('fs');
const csvparse = require('csv-parse');
const csvstringify = require('csv-stringify');
const express = require('express');
const multer = require('multer');
const csurf = require('csurf');
const Stream = require('stream');
const seedrandom = require('seedrandom');
const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');
const os = require('os');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/mturk');
const deviceModel = require('../model/device');
const example = require('../model/example');
const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const TokenizerService = require('../util/tokenizer_service');
const iv = require('../util/input_validation');
const { BadRequestError, ForbiddenError, InternalError, NotFoundError } = require('../util/errors');

const Config = require('../config');

var router = express.Router();

const SYNTHETIC_PER_PARAPHRASE_HIT = 4;
const PARAPHRASES_PER_SENTENCE = 2;

router.post('/create', multer({ dest: os.tmpdir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }),
    user.requireLogIn, user.requireRole(user.Role.NLP_ADMIN),
    iv.validatePOST({ name: 'string', submissions_per_hit: 'integer' }), (req, res, next) => {
    if (!req.files.upload || !req.files.upload.length) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
            message: req._("Must upload the CSV file")
        });
        return;
    }

    Q(db.withTransaction((dbClient) => {
        return model.create(dbClient, { name: req.body.name, submissions_per_hit: req.body.submissions_per_hit }).then((batch) => {
            let minibatch = [];
            let hitCount = 0;
            function doInsert() {
                let data = minibatch;
                minibatch = [];
                return db.insertOne(dbClient,
                `insert into mturk_input(batch, hit_id, sentence, thingtalk) values ?`, [data]);
            }

            function finish() {
                if (minibatch.length === 0)
                    return Promise.resolve();
                return doInsert();
            }

            function insertOneHIT(programs) {
                let hitId = hitCount++;
                programs.forEach((p) => {
                    minibatch.push([
                        batch.id,
                        hitId,
                        p.utterance,
                        p.target_code
                    ]);
                });
                if (minibatch.length < 100)
                    return Promise.resolve();
                return doInsert();
            }

            const parser = csvparse({ columns: true, delimiter: '\t' });
            fs.createReadStream(req.files.upload[0].path).pipe(parser);

            let promises = [];
            let programs = [];
            return new Promise((resolve, reject) => {
                parser.on('data', (row) => {
                    programs.push(row);
                    if (programs.length === SYNTHETIC_PER_PARAPHRASE_HIT) {
                        promises.push(insertOneHIT(programs));
                        programs = [];
                    }
                });
                parser.on('error', reject);
                parser.on('end', resolve);
            }).then(() => Promise.all(promises)).then(() => finish());
        });
    })).finally(() => {
        return Q.nfcall(fs.unlink, req.files.upload[0].path);
    }).then(() => {
        res.redirect(303, '/mturk');
    }).catch(next);
});

router.use(csurf({ cookie: false }));

router.get('/', user.requireLogIn, user.requireRole(user.Role.NLP_ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return model.getBatches(dbClient);
    }).then((batches) => {
        res.render('mturk_batch_list', {
            page_title: req._("Thingpedia - MTurk Batches"),
            batches: batches,
            csrfToken: req.csrfToken()
        });
    }).catch(next);
});

router.get('/csv/:batch', user.requireLogIn, user.requireRole(user.Role.NLP_ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return new Promise((resolve, reject) => {
            res.set('Content-disposition', 'attachment; filename=mturk.csv');
            res.status(200).set('Content-Type', 'text/csv');
            let output = csvstringify({ header: true });
            output.pipe(res);

            let query = model.streamHITs(dbClient, req.params.batch);
            query.on('result', (row) => {
                output.write({url: Config.SERVER_ORIGIN + `/mturk/submit/${req.params.batch}/${row.hit_id}` });
            });
            query.on('end', () => {
                output.end();
            });
            query.on('error', reject);
            output.on('error', reject);
            res.on('finish', resolve);
        });
    }).catch(next);
});

router.get('/validation/csv/:batch', user.requireLogIn, user.requireRole(user.Role.NLP_ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return new Promise((resolve, reject) => {
            res.set('Content-disposition', 'attachment; filename=validate.csv');
            res.status(200).set('Content-Type', 'text/csv');
            let output = csvstringify({ header: true });
            output.pipe(res);

            let query = model.streamValidationHITs(dbClient, req.params.batch);
            query.on('result', (row) => {
                output.write({url: Config.SERVER_ORIGIN + `/mturk/validate/${req.params.batch}/${row.hit_id}` });
            });
            query.on('end', () => {
                output.end();
            });
            query.on('error', reject);
            output.on('error', reject);
            res.on('finish', resolve);
        });
    }).catch(next);
});

class ValidationHITInserter extends Stream.Writable {
    constructor(dbClient, batch, targetSize) {
        super({ objectMode: true });
        this.hadError = false;

        this._dbClient = dbClient;
        this._batch = batch;
        this._targetSize = targetSize;
        this._hitCount = 0;
    }

    _write(hit, encoding, callback) {
        if (this.hadError) {
            callback();
            return;
        }

        const hitId = this._hitCount++;
        const validationRows = [];

        for (let i = 0; i < SYNTHETIC_PER_PARAPHRASE_HIT; i++) {
            let syntheticId = hit[`id${i+1}`];
            for (let j = 0; j < this._targetSize + 2; j++) {

                let paraphraseId = hit[`id${i+1}-${j+1}`];
                let paraphrase = hit[`paraphrase${i+1}-${j+1}`];

                if (paraphraseId === '-same')
                    validationRows.push([this._batch.id, hitId, 'fake-same', syntheticId, null, paraphrase]);
                else if (paraphraseId === '-different')
                    validationRows.push([this._batch.id, hitId, 'fake-different', syntheticId, null, paraphrase]);
                else
                    validationRows.push([this._batch.id, hitId, 'real', syntheticId, paraphraseId, paraphrase]);
            }
        }

        if (validationRows.length > 0) {
            model.createValidationHITs(this._dbClient, validationRows)
                .then(() => callback(), callback);
        }
    }
}

router.post('/start-validation', user.requireLogIn, user.requireRole(user.Role.NLP_ADMIN), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const batch = await model.getBatchDetails(dbClient, req.body.batch);
        switch (batch.status) {
        case 'created':
            throw new BadRequestError(req._("Cannot start validation: no paraphrases have been submitted yet."));
        case 'paraphrasing':
            await model.updateBatch(dbClient, req.body.batch, { status: 'validating' });
            break;
        case 'validating':
            // nothing to do
            return;
        case 'closed':
            throw new BadRequestError(req._("Cannot start validation: the batch is already closed."));
        default:
            throw new InternalError('E_UNEXPECTED_ENUM', `Invalid batch status ${batch.status}`);
        }

        // now create the validation HITs
        const allSynthetics = await model.getBatch(dbClient, req.body.batch);
        await new Promise((resolve, reject) => {
            const submissionsPerTask = batch.submissions_per_hit;
            const targetSize = PARAPHRASES_PER_SENTENCE * submissionsPerTask;

            const accumulator = new class Accumulator extends Stream.Transform {
                constructor() {
                    super({ objectMode: true });
                    this._syntheticId = undefined;
                    this._synthetic = undefined;
                    this._targetCode = undefined;
                    this._paraphrases = [];
                }

                _transform(row, encoding, callback) {
                    if (this._syntheticId !== row.synthetic_id)
                        this._doFlush();
                    this._syntheticId = row.synthetic_id;
                    this._synthetic = row.synthetic;
                    this._targetCode = row.target_code;
                    this._paraphrases.push({
                        id: row.paraphrase_id,
                        paraphrase: row.utterance
                    });
                    callback();
                }

                _doFlush() {
                    if (this._paraphrases.length === 0)
                        return;
                    this.push({
                        synthetic_id: this._syntheticId,
                        synthetic: this._synthetic,
                        target_code: this._targetCode,
                        paraphrases: this._paraphrases
                    });
                    this._paraphrases = [];
                }

                _flush(callback) {
                    this._doFlush();
                    callback();
                }
            };

            const creator = new Genie.ValidationHITCreator(allSynthetics, {
                targetSize,
                sentencesPerTask: SYNTHETIC_PER_PARAPHRASE_HIT,
                rng: seedrandom.alea('almond is awesome')
            });

            accumulator.pipe(creator);

            const toValidate = model.streamUnvalidated(dbClient, req.body.batch);
            toValidate.on('result', (row) => accumulator.write(row));
            toValidate.on('end', () => accumulator.end());

            // insert the created HITs in the database
            const writer = creator.pipe(new ValidationHITInserter(dbClient, batch, targetSize));
            toValidate.on('error', (e) => {
                writer.hadError = true;
                reject(e);
            });
            writer.on('error', (e) => {
                writer.hadError = true;
                reject(e);
            });
            writer.on('finish', resolve);
        });

    }).then(() => {
        res.redirect(303, '/mturk');
    }).catch(next);
});

router.post('/close', user.requireLogIn, user.requireRole(user.Role.NLP_ADMIN), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        // check that the batch exists
        await model.getBatchDetails(dbClient, req.body.batch);
        await model.updateBatch(dbClient, req.body.batch, { status: 'closed' });

        if (req.body.autoapprove)
            await model.autoApproveUnvalidated(dbClient, req.body.batch);

    }).then(() => {
        res.redirect(303, '/mturk');
    }).catch(next);
});

async function autoValidateParaphrase(dbClient, batchId, language, schemas, utterance, thingtalk) {
    // FIXME this should use Genie's ParaphraseValidator

    const [program, { tokens: preprocessed, entities }] = await Promise.all([
        ThingTalk.Grammar.parseAndTypecheck(thingtalk, schemas),
        TokenizerService.tokenize(language, utterance)
    ]);

    let target_code;
    try {
        target_code = ThingTalk.NNSyntax.toNN(program, preprocessed, entities);
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
    for (let i = 1; i < SYNTHETIC_PER_PARAPHRASE_HIT + 1; i++) {
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
        for (let j = 1; j < PARAPHRASES_PER_SENTENCE + 1; j ++) {
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
            await model.updateBatch(dbClient, req.body.batch, { status: 'paraphrasing' });
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

                examples.push(autoValidateParaphrase(dbClient, req.body.batch, batch.language, schemas, paraphrase, thingtalk));
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

        await model.logSubmission(dbClient, submissionId, req.body.batch, req.body.hit, req.body.worker);
        await model.insertSubmission(dbClient, submissions);
    }).then(() => {
        res.render('mturk-submit', { page_title: req._('Thank you'), token: submissionId });
    }).catch(next);
});

router.get(`/submit/:batch/:hit`, (req, res, next) => {
    const batchId = parseInt(req.params.batch);
    const hitId = parseInt(req.params.hit);

    db.withTransaction(async (dbClient) => {
        const batch = await model.getBatchDetails(dbClient, batchId);
        if (batch.status !== 'created' && batch.status !== 'paraphrasing')
            throw new ForbiddenError(req._("The HIT you're trying to submit was already closed."));

        const hit = await model.getHIT(dbClient, batchId, hitId);
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
            const parsed = ThingTalk.Grammar.parse(row.thingtalk);
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
                              batch: batchId,
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
        // catch accidental double-submissions quietly, and do nothing
        const existing = await model.getExistingValidationSubmission(dbClient, req.body.batch,
            req.body.hit, req.body.worker);
        if (existing.length > 0)
            return existing[0].submission_id;

        const batch = await model.getBatchDetails(dbClient, req.body.batch);
        if (batch.status !== 'validating')
            throw new ForbiddenError(req._("The HIT you're trying to submit is not open yet, or was already closed."));

        const hits = await model.getValidationHIT(dbClient, req.body.batch, req.body.hit);
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

        await model.logValidationSubmission(dbClient, submissionId, req.body.batch, req.body.hit, req.body.worker);
        await model.insertValidationSubmission(dbClient, validationRows, good, bad);
        await model.markSentencesGood(dbClient, good);
        await model.markSentencesBad(dbClient, bad);
        return submissionId;
    }).then((submissionId) => {
        res.render('mturk-submit', { page_title: req._('Thank you'), token: submissionId });
    }).catch(next);
});

router.get(`/validate/:batch/:hit`, (req, res, next) => {
    const batchId = req.params.batch;
    const hitId = req.params.hit;

    db.withTransaction(async (dbClient) => {
        const batch = await model.getBatchDetails(dbClient, batchId);
        if (batch.status !== 'validating')
            throw new ForbiddenError(req._("The HIT you're trying to submit is not open yet, or was already closed."));

        return model.getValidationHIT(dbClient, batchId, hitId);
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
            batch: batchId,
            sentences,
            csrfToken: req.csrfToken()
        });
    }).catch(next);
});

module.exports = router;
