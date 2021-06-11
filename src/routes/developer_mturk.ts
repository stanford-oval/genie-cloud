// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as util from 'util';
import * as fs from 'fs';
import csvparse from 'csv-parse';
import express from 'express';
import multer from 'multer';
import csurf from 'csurf';
import * as os from 'os';

import * as db from '../util/db';
import * as user from '../util/user';
import * as model from '../model/mturk';
import * as iv from '../util/input_validation';
import { BadRequestError, ForbiddenError } from '../util/errors';
import { makeRandom } from '../util/random';

import * as MTurkUtils from '../util/mturk';

const router = express.Router();

async function createMTurkBatch(dbClient : db.Client, req : express.Request, res : express.Response) {
    const batch = await model.create(dbClient, {
        id_hash: makeRandom(16),
        name: req.body.name,
        owner: req.user!.developer_org!,
        submissions_per_hit: req.body.submissions_per_hit
    });
    let minibatch : Array<[number, number, string, string]> = [];
    let hitCount = 0;
    function doInsert() {
        const data = minibatch;
        minibatch = [];
        return db.insertOne(dbClient,
        `insert into mturk_input(batch, hit_id, sentence, thingtalk) values ?`, [data]);
    }

    function finish() {
        if (minibatch.length === 0)
            return Promise.resolve();
        return doInsert();
    }

    async function insertOneHIT(programs : Array<{ utterance : string, target_code : string }>) {
        const hitId = hitCount++;
        programs.forEach((p) => {
            minibatch.push([
                batch.id,
                hitId,
                p.utterance,
                p.target_code
            ]);
        });
        if (minibatch.length < 100)
            return;
        await doInsert();
    }

    const parser = csvparse({ columns: true, delimiter: '\t' });
    fs.createReadStream(req.file.path).pipe(parser);

    const promises : Array<Promise<void>> = [];
    let programs : Array<{ utterance : string, target_code : string }> = [];
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

router.post('/create', multer({ dest: os.tmpdir() }).single('upload'), csurf({ cookie: false }),
    user.requireLogIn, user.requireDeveloper(),
    iv.validatePOST({ name: 'string', submissions_per_hit: 'integer' }), (req, res, next) => {
    if (!req.file)
        throw new BadRequestError(`Must upload the CSV file`);
    db.withTransaction(async (dbClient) => {
        try {
            await createMTurkBatch(dbClient, req, res);
        } finally {
            await util.promisify(fs.unlink)(req.file.path);
        }
    }).then(() => {
        res.redirect(303, '/developers/mturk');
    }).catch(next);
});

router.use(csurf({ cookie: false }));
router.use(user.requireLogIn, user.requireDeveloper());

router.get('/', (req, res, next) => {
    db.withClient((dbClient) => {
        return model.getBatchesForOwner(dbClient, req.user!.developer_org!);
    }).then((batches) => {
        res.render('dev_mturk_batch_list', {
            page_title: req._("Almond Developer Console - MTurk Batches"),
            batches: batches,
            csrfToken: req.csrfToken()
        });
    }).catch(next);
});

async function checkBatchOwner(dbClient : db.Client, batchId : string, orgId : number|null) {
    const details = await model.getBatchDetails(dbClient, batchId);
    if (details.owner !== orgId)
        throw new ForbiddenError();
    return details;
}

router.get('/csv/:batch', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const batch = await checkBatchOwner(dbClient, req.params.batch, req.user!.developer_org);
        await MTurkUtils.getParaphrasingBatch(dbClient, batch, res);
    }).catch(next);
});

router.get('/validation/csv/:batch', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const batch = await checkBatchOwner(dbClient, req.params.batch, req.user!.developer_org);
        await MTurkUtils.getValidationBatch(dbClient, batch, res);
    }).catch(next);
});


router.post('/start-validation', (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const batch = await checkBatchOwner(dbClient, req.body.batch, req.user!.developer_org);
        return MTurkUtils.startValidation(req, dbClient, batch);
    }).then(() => {
        res.redirect(303, '/developers/mturk');
    }).catch(next);
});

router.post('/close', (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const batch = await checkBatchOwner(dbClient, req.body.batch, req.user!.developer_org);
        return MTurkUtils.closeBatch(dbClient, batch, !!req.body.autoapprove);
    }).then(() => {
        res.redirect(303, '/developers/mturk');
    }).catch(next);
});

export default router;
