// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import express from 'express';
import csvstringify from 'csv-stringify';
import * as Stream from 'stream';
import * as seedrandom from 'seedrandom';
import * as Genie from 'genie-toolkit';

import * as db from './db';
import * as model from '../model/mturk';
import { BadRequestError, InternalError } from '../util/errors';

import * as Config from '../config';

const SYNTHETIC_PER_PARAPHRASE_HIT = 4;
const PARAPHRASES_PER_SENTENCE = 2;

async function getParaphrasingBatch(dbClient : db.Client, batch : model.Row, res : express.Response) {
    return new Promise((resolve, reject) => {
        res.set('Content-disposition', 'attachment; filename=mturk.csv');
        res.status(200).set('Content-Type', 'text/csv');
        const output = csvstringify({ header: true });
        output.pipe(res);

        const query = model.streamHITs(dbClient, batch.id);
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

async function getValidationBatch(dbClient : db.Client, batch : model.Row, res : express.Response) {
    return new Promise((resolve, reject) => {
        res.set('Content-disposition', 'attachment; filename=validate.csv');
        res.status(200).set('Content-Type', 'text/csv');
        const output = csvstringify({ header: true });
        output.pipe(res);

        const query = model.streamValidationHITs(dbClient, batch.id);
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
    private _dbClient : db.Client;
    private _batch : model.Row;
    private _targetSize : number;
    private _hitCount : number;

    hadError : boolean;

    constructor(dbClient : db.Client, batch : model.Row, targetSize : number) {
        super({ objectMode: true });
        this.hadError = false;

        this._dbClient = dbClient;
        this._batch = batch;
        this._targetSize = targetSize;
        this._hitCount = 0;
    }

    _write(hit : Record<string, any>, encoding : BufferEncoding, callback : () => void) {
        if (this.hadError) {
            callback();
            return;
        }

        const hitId = this._hitCount++;
        const validationRows : model.ValidationInputCreateRecord[] = [];

        for (let i = 0; i < SYNTHETIC_PER_PARAPHRASE_HIT; i++) {
            const syntheticId = hit[`id${i+1}`];
            for (let j = 0; j < this._targetSize + 2; j++) {

                const paraphraseId = hit[`id${i+1}-${j+1}`];
                const paraphrase = hit[`paraphrase${i+1}-${j+1}`];

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

async function startValidation(req : express.Request, dbClient : db.Client, batch : model.Row) {
    switch (batch.status) {
    case 'created':
        throw new BadRequestError(req._("Cannot start validation: no paraphrases have been submitted yet."));
    case 'paraphrasing':
        await model.updateBatch(dbClient, batch.id, { status: 'validating' });
        break;
    case 'validating':
        // nothing to do
        return;
    case 'complete':
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
            private _syntheticId : number|undefined;
            private _synthetic : string|undefined;
            private _targetCode : string|undefined;
            private _paraphrases : Array<{ id : number, paraphrase : string }>;

            constructor() {
                super({ objectMode: true });
                this._syntheticId = undefined;
                this._synthetic = undefined;
                this._targetCode = undefined;
                this._paraphrases = [];
            }

            _transform(row : model.UnvalidatedRow, encoding : BufferEncoding, callback : () => void) {
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

            private _doFlush() {
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

            _flush(callback : () => void) {
                this._doFlush();
                callback();
            }
        };

        const creator = new Genie.MTurk.ValidationHITCreator(allSynthetics as any /* FIXME ??? */, {
            targetSize,
            sentencesPerTask: SYNTHETIC_PER_PARAPHRASE_HIT,
            rng: seedrandom.alea('almond is awesome'),
            debug: false
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

async function closeBatch(dbClient : db.Client, batch : model.Row, autoApprove : boolean) {
    await model.updateBatch(dbClient, batch.id, { status: 'complete' });

    if (autoApprove)
        await model.autoApproveUnvalidated(dbClient, batch.id);
}

export {
    SYNTHETIC_PER_PARAPHRASE_HIT,
    PARAPHRASES_PER_SENTENCE,

    getParaphrasingBatch,
    getValidationBatch,

    startValidation,
    closeBatch
};
