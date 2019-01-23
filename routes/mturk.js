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
const csv = require('csv');
const express = require('express');
const db = require('../util/db');
const ThingTalk = require('thingtalk');
const multer = require('multer');
const csurf = require('csurf');

const user = require('../util/user');
const platform = require('../util/platform');
const model = require('../model/mturk');
const example = require('../model/example');
const AdminThingpediaClient = require('../util/admin-thingpedia-client');
const TokenizerService = require('../util/tokenizer_service');
const iv = require('../util/input_validation');

var router = express.Router();

router.post('/create', multer({ dest: platform.getTmpDir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }),
    user.requireLogIn, user.requireRole(user.Role.ADMIN),
    iv.validatePOST({ body: 'string', submissions_per_hit: 'integer' }), (req, res) => {
    if (!req.files.upload || !req.files.upload.length) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
            message: req._("Must upload the CSV file")
        });
        return;
    }

    Q(db.withTransaction((dbClient) => {
        return model.create(dbClient, { name: req.body.name, submissions_per_hit: req.body.submissions_per_hit }).then((batch) => {
            let minibatch = [];
            let columns = ['batch'];
            for (let i = 1; i < 5; i ++ ) {
                columns.push(`id${i}`);
                columns.push(`thingtalk${i}`);
                columns.push(`sentence${i}`);
            }
            columns = columns.join(',');
            function doInsert() {
                let data = minibatch;
                minibatch = [];
                return db.insertOne(dbClient, `insert into mturk_input(${columns}) values ?`, [data]);
            }

            function finish() {
                if (minibatch.length === 0)
                    return Promise.resolve();
                return doInsert();
            }

            function insertOneHIT(programs) {
                let row = [batch.id];
                programs.forEach((p) => {
                    row.push(p.id);
                    row.push(p.code);
                    row.push(p.sentence);
                });
                minibatch.push(row);
                if (minibatch.length < 100)
                    return Promise.resolve();
                return doInsert();
            }

            const parser = csv.parse({ columns: true, delimiter: '\t' });
            fs.createReadStream(req.files.upload[0].path).pipe(parser);

            let promises = [];
            let programs = [];
            return new Promise((resolve, reject) => {
                parser.on('data', (row) => {
                    programs.push(row);
                    if (programs.length === 4) {
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
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
            message: e.message });
    }).done();
});

router.use(csurf({ cookie: false }));

router.get('/', user.requireLogIn, user.requireRole(user.Role.ADMIN), (req, res) => {
    db.withClient((dbClient) => {
        return model.getBatches(dbClient);
    }).then((batches) => {
        res.render('mturk_batch_list', {
            page_title: req._("Thingpedia - MTurk Batches"),
            batches: batches,
            csrfToken: req.csrfToken()
        });
    });
});

router.get('/csv/:batch', user.requireLogIn, user.requireRole(user.Role.ADMIN), (req, res) => {
    db.withClient((dbClient) => {
        return new Promise((resolve, reject) => {
            res.set('Content-disposition', 'attachment; filename=mturk.csv');
            res.status(200).set('Content-Type', 'text/csv');
            let output = csv.stringify({ header: true });
            output.pipe(res);

            let query = model.streamHITs(dbClient, req.params.batch);
            query.on('result', (row) => {
                output.write({url: `https://almond.stanford.edu/submit/mturk/${req.params.batch}/${row.id}` });
            });
            query.on('end', () => {
                output.end();
            });
            query.on('error', reject);
            output.on('error', reject);
            res.on('finish', resolve);
        });
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
            message: e });
    }).done();
});

router.get('/validation/csv/:batch', user.requireLogIn, user.requireRole(user.Role.ADMIN), (req, res) => {
    db.withClient((dbClient) => {
        return new Promise((resolve, reject) => {
            res.set('Content-disposition', 'attachment; filename=validate.csv');
            res.status(200).set('Content-Type', 'text/csv');
            let output = csv.stringify({ header: true });
            output.pipe(res);

            let query = model.streamHITsToValidate(dbClient, req.params.batch);
            query.on('result', (row) => {
                output.write({url: `https://almond.stanford.edu/validate/mturk/${req.params.batch}/${row.id}` });
            });
            query.on('end', () => {
                output.end();
            });
            query.on('error', reject);
            output.on('error', reject);
            res.on('finish', resolve);
        });
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
            message: e });
    }).done();
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

function validateSubmission(req, res, next) {
    for (let i = 1; i < 5; i++) {
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
        for (let j = 1; j < 3; j ++) {
            let paraphrase = req.body[`paraphrase${i}-${j}`];
            if (!iv.checkKey(paraphrase, 'string')) {
                iv.failKey(req, res, `paraphrase${i}-${j}`, {});
                return;
            }
        }
    }
    next();
}

router.post('/submit', iv.validatePOST({ batch: 'string' }), validateSubmission, (req, res) => {
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
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
            message: 'Submission failed. Please contact the HIT requestor for further instructions.' });
    }).done();
});

router.get(`/submit/:batch/:hit`, (req, res) => {
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
