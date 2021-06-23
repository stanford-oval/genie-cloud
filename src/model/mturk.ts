// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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


import * as db from '../util/db';

export type BatchStatus = 'created' | 'paraphrasing' | 'validating' | 'complete';

export interface Row {
    id : number;
    id_hash : string;
    owner : number;
    name : string;
    language : string;
    submissions_per_hit : number;
    status : BatchStatus;
}
export type OptionalFields = 'language' | 'submissions_per_hit' | 'status';

export interface ParaphraseInputRow {
    id : number;
    batch : number;
    hit_id : number;
    thingtalk : string;
    sentence : string;
}

export interface ParaphraseSubmissionRow {
    example_id : number;
    submission_id : string;
    program_id : number;
    target_count : number;
    accept_count : number;
    reject_count : number;
}
export type ParaphraseSubmissionOptionalFields = 'target_count' | 'accept_count' | 'reject_count';

export interface ValidationInputRow {
    id : number;
    batch : number;
    hit_id : number;
    type : 'real' | 'fake-same' | 'fake-different';
    program_id : number;
    example_id : number|null;
    paraphrase : string|null;
}

export interface ValidationSubmissionRow {
    validation_sentence_id : number;
    submission_id : string;
    answer : 'same' | 'different';
}

export async function create<T extends db.Optional<Row, OptionalFields>>(dbClient : db.Client, batch : db.WithoutID<T>) : Promise<db.WithID<T>> {
    return db.insertOne(dbClient, 'insert into mturk_batch set ?', [batch]).then((id) => {
        batch.id = id;
        return batch as db.WithID<T>;
    });
}
export async function updateBatch(dbClient : db.Client, batchId : number, batch : Partial<Row>) {
    await db.query(dbClient, `update mturk_batch set ? where id = ?`, [batch, batchId]);
}

export type ValidationInputCreateRecord = [
    ValidationInputRow['batch'],
    ValidationInputRow['hit_id'],
    ValidationInputRow['type'],
    ValidationInputRow['program_id'],
    ValidationInputRow['example_id'],
    ValidationInputRow['paraphrase']
];

export async function createValidationHITs(dbClient : db.Client, hits : ValidationInputCreateRecord[]) {
    await db.query(dbClient, `insert into mturk_validation_input(batch,hit_id,type,program_id,example_id,paraphrase) values ?`, [hits]);
}

export async function getHIT(dbClient : db.Client, batch : number, hitId : number) : Promise<ParaphraseInputRow[]> {
    return db.selectAll(dbClient, 'select * from mturk_input where batch = ? and hit_id = ? order by id', [batch, hitId]);
}
export async function getBatch(dbClient : db.Client, batchId : number) : Promise<ParaphraseInputRow[]> {
    return db.selectAll(dbClient, `select * from mturk_input where batch = ?`, [batchId]);
}
export async function getBatchDetails(dbClient : db.Client, batchIdHash : string) : Promise<Row> {
    return db.selectOne(dbClient, `select * from mturk_batch where id_hash = ?`, [batchIdHash]);
}
export async function getBatchDetailsById(dbClient : db.Client, batchId : number) : Promise<Row> {
    return db.selectOne(dbClient, `select * from mturk_batch where id = ?`, [batchId]);
}
export async function getValidationHIT(dbClient : db.Client, batch : number, hitId : number) : Promise<Array<ValidationInputRow & { synthetic : string }>> {
    return db.selectAll(dbClient, `select mvi.*, mi.sentence as synthetic
        from mturk_validation_input mvi, mturk_input mi
        where mvi.batch = ? and mvi.hit_id = ? and mi.id = mvi.program_id
        order by mvi.program_id, mvi.id`,
        [batch, hitId]);
}

export async function logSubmission(dbClient : db.Client, token : string, batch : number, hit : number, worker : string) {
    const log = [token, batch, hit, worker];
    await db.insertOne(dbClient, 'insert into mturk_log(submission_id,batch,hit,worker) values (?)', [log]);
}
export async function logValidationSubmission(dbClient : db.Client, token : string, batch : number, hit : number, worker : string) {
    const log = [token, batch, hit, worker];
    await db.insertOne(dbClient, 'insert into mturk_validation_log(submission_id,batch,hit,worker) values (?)', [log]);
}

export async function getExistingValidationSubmission(dbClient : db.Client, batch : number, hit : number, worker : string) : Promise<Array<{ submission_id : string }>> {
    return db.selectAll(dbClient, `select submission_id from mturk_validation_log
        where batch = ? and hit = ? and worker = ? for update`,
        [batch, hit, worker]);
}

export async function insertSubmission(dbClient : db.Client, submissions : Array<db.Optional<ParaphraseSubmissionRow, ParaphraseSubmissionOptionalFields>>) {
    if (submissions.length === 0)
        return;

    const KEYS = ['submission_id', 'example_id', 'program_id', 'target_count', 'accept_count', 'reject_count'] as const;
    const arrays : any[] = [];
    submissions.forEach((ex) => {
        const vals = KEYS.map((key) => ex[key]);
        arrays.push(vals);
    });

    await db.insertOne(dbClient, 'insert into mturk_output(' + KEYS.join(',') + ') '
                        + 'values ?', [arrays]);
}

export async function insertValidationSubmission(dbClient : db.Client, submissions : ValidationSubmissionRow[]) {
    if (submissions.length === 0)
        return Promise.resolve();

    const KEYS = ['submission_id', 'validation_sentence_id', 'answer'] as const;
    const arrays : any[] = [];
    submissions.forEach((ex) => {
        const vals = KEYS.map((key) => ex[key]);
        arrays.push(vals);
    });

    return db.insertOne(dbClient, 'insert into mturk_validation_output(' + KEYS.join(',') + ') '
                        + 'values ?', [arrays]);
}

export async function markSentencesGood(dbClient : db.Client, exampleIds : number[]) {
    if (exampleIds.length === 0)
        return;

    await db.query(dbClient, `update mturk_output set accept_count = accept_count + 1
        where example_id in (?)`, [exampleIds]);
    await db.query(dbClient, `update example_utterances ex, mturk_output mo
        set ex.flags = if(ex.flags = '', 'training', concat_ws(',', 'training', ex.flags))
        where ex.id in (?) and ex.id = mo.example_id and mo.accept_count >= mo.target_count
        and mo.reject_count = 0`, [exampleIds]);
}

export async function markSentencesBad(dbClient : db.Client, exampleIds : number[]) {
    if (exampleIds.length === 0)
        return;
    await db.query(dbClient, `update mturk_output set reject_count = reject_count + 1
        where example_id in (?)`, [exampleIds]);
    await db.query(dbClient, `update example_utterances ex
        set ex.flags = trim(both ',' from replace(concat(',', ex.flags, ','), ',training,', ','))
        where ex.id in (?)`, [exampleIds]);
}

export interface UnvalidatedRow {
    paraphrase_id : number;
    utterance : string;
    synthetic_id : number;
    synthetic : string;
    target_code : string;
}

export function streamUnvalidated(dbClient : db.Client, batch : number) {
    return dbClient.query(`select
        ex.id as paraphrase_id, ex.utterance,
        m_in.id as synthetic_id, m_in.sentence as synthetic, m_in.thingtalk as target_code
        from example_utterances ex, mturk_output mout, mturk_input m_in,
        mturk_log log where log.batch = ? and mout.example_id = ex.id and
        (mout.accept_count + mout.reject_count) < mout.target_count and
        not find_in_set('training', ex.flags) and
        mout.submission_id = log.submission_id and m_in.id = mout.program_id
        order by m_in.id`, batch);
}

export async function autoApproveUnvalidated(dbClient : db.Client, batch : number) {
    await db.query(dbClient, `update example_utterances ex, mturk_output mout,
        set ex.flags = if(ex.flags = '', 'training', concat_ws(',', 'training', ex.flags))
        where mout.batch = ? and mout.example_id = ex.id and
        mout.reject_count = 0 and mout.submission_id = log.submission_id
        and not find_in_set('training', ex.flags)`, [batch]);
}

type BatchRow = Pick<Row, "id"|"id_hash"|"owner"|"name"|"submissions_per_hit"|"status"> & {
    owner_name : string;
    input_count : number;
    submissions : number;
    validated : number;
};

export async function getBatches(dbClient : db.Client) : Promise<BatchRow[]> {
    return db.selectAll(dbClient, `select mturk_batch.id, mturk_batch.id_hash, mturk_batch.owner, mturk_batch.name,
        submissions_per_hit, status, organizations.name as owner_name,
        (select count(*) from mturk_input where batch = mturk_batch.id) as input_count,
        (select count(mout.example_id) from mturk_output mout,
            mturk_log log where log.batch= mturk_batch.id
            and mout.submission_id = log.submission_id) as submissions,
        (select count(mout.example_id)
            from mturk_output mout, mturk_log log where
            log.batch= mturk_batch.id and (mout.accept_count + mout.reject_count) >= mout.target_count
            and mout.submission_id = log.submission_id) as validated
        from mturk_batch join organizations on mturk_batch.owner = organizations.id`);
}
export async function getBatchesForOwner(dbClient : db.Client, ownerId : number) : Promise<Array<Omit<BatchRow, "owner_name">>> {
    return db.selectAll(dbClient, `select mturk_batch.id, mturk_batch.id_hash, mturk_batch.owner, mturk_batch.name,
        submissions_per_hit, status,
        (select count(*) from mturk_input where batch = mturk_batch.id) as input_count,
        (select count(mout.example_id) from mturk_output mout,
            mturk_log log where log.batch= mturk_batch.id
            and mout.submission_id = log.submission_id) as submissions,
        (select count(mout.example_id)
            from mturk_output mout, mturk_log log where
            log.batch= mturk_batch.id and (mout.accept_count + mout.reject_count) >= mout.target_count
            and mout.submission_id = log.submission_id) as validated
        from mturk_batch where owner = ?`, [ownerId]);
}

export function streamHITs(dbClient : db.Client, batch : number) {
    return dbClient.query(`select hit_id from mturk_input where batch = ? group by hit_id`, batch);
}
export function streamValidationHITs(dbClient : db.Client, batch : number) {
    return dbClient.query(`select hit_id from mturk_validation_input where batch = ? group by hit_id`, batch);
}
