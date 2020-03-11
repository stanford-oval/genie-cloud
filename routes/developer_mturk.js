// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const util = require('util');
const fs = require('fs');
const csvparse = require('csv-parse');
const express = require('express');
const multer = require('multer');
const csurf = require('csurf');
const os = require('os');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/mturk');
const iv = require('../util/input_validation');
const { ForbiddenError } = require('../util/errors');

const MTurkUtils = require('../util/mturk');

var router = express.Router();

async function createMTurkBatch(dbClient, req, res) {
    const batch = await model.create(dbClient, {
        name: req.body.name,
        owner: req.user.developer_org,
        submissions_per_hit: req.body.submissions_per_hit
    });
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
    await new Promise((resolve, reject) => {
        parser.on('data', (row) => {
            programs.push(row);
            if (programs.length === MTurkUtils.SYNTHETIC_PER_PARAPHRASE_HIT) {
                promises.push(insertOneHIT(programs));
                programs = [];
            }
        });
        parser.on('error', reject);
        parser.on('end', resolve);
    });

    await Promise.all(promises);
    await finish();
}

router.post('/create', multer({ dest: os.tmpdir() }).fields([
    { name: 'upload', maxCount: 1 }
]), csurf({ cookie: false }),
    user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ name: 'string', submissions_per_hit: 'integer' }), (req, res, next) => {
    if (!req.files.upload || !req.files.upload.length) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
            message: req._("Must upload the CSV file")
        });
        return;
    }

    db.withTransaction(async (dbClient) => {
        try {
            await createMTurkBatch(dbClient, req, res);
        } finally {
            await util.promisify(fs.unlink)(req.files.upload[0].path);
        }
    }).then(() => {
        res.redirect(303, '/developers/mturk');
    }).catch(next);
});

router.use(csurf({ cookie: false }));
router.use(user.requireLogIn, user.requireDeveloper());

router.get('/', (req, res, next) => {
    db.withClient((dbClient) => {
        return model.getBatchesForOwner(dbClient, req.user.developer_org);
    }).then((batches) => {
        res.render('dev_mturk_batch_list', {
            page_title: req._("Almond Developer Console - MTurk Batches"),
            batches: batches,
            csrfToken: req.csrfToken()
        });
    }).catch(next);
});

async function checkBatchOwner(dbClient, batchId, orgId) {
    const details = await model.getBatchDetails(dbClient, batchId);
    if (details.owner !== orgId)
        throw new ForbiddenError();
}

router.get('/csv/:batch', (req, res, next) => {
    db.withClient(async (dbClient) => {
        await checkBatchOwner(dbClient, req.params.batch, req.user.developer_org);

        await MTurkUtils.getParaphrasingBatch(dbClient, req.params.batch, res);
    }).catch(next);
});

router.get('/validation/csv/:batch', (req, res, next) => {
    db.withClient(async (dbClient) => {
        await checkBatchOwner(dbClient, req.params.batch, req.user.developer_org);

        await MTurkUtils.getValidationBatch(dbClient, req.params.batch, res);
    }).catch(next);
});


router.post('/start-validation', (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        await checkBatchOwner(dbClient, req.body.batch, req.user.developer_org);

        return MTurkUtils.startValidation(req, dbClient, req.body.batch);
    }).then(() => {
        res.redirect(303, '/developers/mturk');
    }).catch(next);
});

router.post('/close', (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        await checkBatchOwner(dbClient, req.body.batch, req.user.developer_org);

        return MTurkUtils.closeBatch(dbClient, req.body.batch, !!req.body.autoapprove);
    }).then(() => {
        res.redirect(303, '/developers/mturk');
    }).catch(next);
});

module.exports = router;
