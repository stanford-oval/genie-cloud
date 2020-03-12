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

const csvstringify = require('csv-stringify');
const Stream = require('stream');
const seedrandom = require('seedrandom');
const Genie = require('genie-toolkit');

const model = require('../model/mturk');
const { BadRequestError, InternalError } = require('../util/errors');

const Config = require('../config');

const SYNTHETIC_PER_PARAPHRASE_HIT = 4;
const PARAPHRASES_PER_SENTENCE = 2;

async function getParaphrasingBatch(dbClient, batch, res) {
    return new Promise((resolve, reject) => {
        res.set('Content-disposition', 'attachment; filename=mturk.csv');
        res.status(200).set('Content-Type', 'text/csv');
        let output = csvstringify({ header: true });
        output.pipe(res);

        let query = model.streamHITs(dbClient, batch.id);
        query.on('result', (row) => {
            output.write({ url: Config.SERVER_ORIGIN + `/mturk/submit/${batch.id_hash}/${row.hit_id}` });
        });
        query.on('end', () => {
            output.end();
        });
        query.on('error', reject);
        output.on('error', reject);
        res.on('finish', resolve);
    });
}

async function getValidationBatch(dbClient, batch, res) {
    return new Promise((resolve, reject) => {
        res.set('Content-disposition', 'attachment; filename=validate.csv');
        res.status(200).set('Content-Type', 'text/csv');
        let output = csvstringify({ header: true });
        output.pipe(res);

        let query = model.streamValidationHITs(dbClient, batch.id);
        query.on('result', (row) => {
            output.write({url: Config.SERVER_ORIGIN + `/mturk/validate/${batch.id_hash}/${row.hit_id}` });
        });
        query.on('end', () => {
            output.end();
        });
        query.on('error', reject);
        output.on('error', reject);
        res.on('finish', resolve);
    });
}


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

async function startValidation(req, dbClient, batch) {
    switch (batch.status) {
    case 'created':
        throw new BadRequestError(req._("Cannot start validation: no paraphrases have been submitted yet."));
    case 'paraphrasing':
        await model.updateBatch(dbClient, batch.id, { status: 'validating' });
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
    const allSynthetics = await model.getBatch(dbClient, batch.id);
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

        const toValidate = model.streamUnvalidated(dbClient, batch.id);
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
}

async function closeBatch(dbClient, batch, autoApprove) {
    await model.updateBatch(dbClient, batch.id, { status: 'closed' });

    if (autoApprove)
        await model.autoApproveUnvalidated(dbClient, batch.id);
}

module.exports = {
    SYNTHETIC_PER_PARAPHRASE_HIT,
    PARAPHRASES_PER_SENTENCE,

    getParaphrasingBatch,
    getValidationBatch,

    startValidation,
    closeBatch
};
