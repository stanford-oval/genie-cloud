// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

module.exports = {
    create(dbClient, batch) {
        return db.insertOne(dbClient, 'insert into mturk_batch set ?', [batch]).then((id) => {
            batch.id = id;
            return batch;
        });
    },
    updateBatch(dbClient, batchId, batch) {
        return db.query(dbClient, `update mturk_batch set ? where id = ?`, [batch, batchId]);
    },

    createValidationHITs(dbClient, hits) {
        return db.query(dbClient, `insert into mturk_validation_input(batch,hit_id,type,program_id,example_id,paraphrase) values ?`, [hits]);
    },

    getHIT(dbClient, batch, hitId) {
        return db.selectAll(dbClient, 'select * from mturk_input where batch = ? and hit_id = ? order by id', [batch, hitId]);
    },
    getBatch(dbClient, batchId) {
        return db.selectAll(dbClient, `select * from mturk_input where batch = ?`, [batchId]);
    },
    getBatchDetails(dbClient, batchIdHash) {
        return db.selectOne(dbClient, `select * from mturk_batch where id_hash = ?`, [batchIdHash]);
    },
    getBatchDetailsById(dbClient, batchId) {
        return db.selectOne(dbClient, `select * from mturk_batch where id = ?`, [batchId]);
    },
    getValidationHIT(dbClient, batch, hitId) {
        return db.selectAll(dbClient, `select mvi.*, mi.sentence as synthetic
            from mturk_validation_input mvi, mturk_input mi
            where mvi.batch = ? and mvi.hit_id = ? and mi.id = mvi.program_id
            order by mvi.program_id, mvi.id`,
            [batch, hitId]);
    },

    logSubmission(dbClient, token, batch, hit, worker) {
        const log = [token, batch, hit, worker];
        return db.insertOne(dbClient, 'insert into mturk_log(submission_id,batch,hit,worker) values (?)', [log]);
    },
    logValidationSubmission(dbClient, token, batch, hit, worker) {
        const log = [token, batch, hit, worker];
        return db.insertOne(dbClient, 'insert into mturk_validation_log(submission_id,batch,hit,worker) values (?)', [log]);
    },

    getExistingValidationSubmission(dbClient, batch, hit, worker) {
        return db.selectAll(dbClient, `select submission_id from mturk_validation_log
            where batch = ? and hit = ? and worker = ? for update`,
            [batch, hit, worker]);
    },

    insertSubmission(dbClient, submissions) {
        if (submissions.length === 0)
            return Promise.resolve();

        const KEYS = ['submission_id', 'example_id', 'program_id', 'target_count', 'accept_count', 'reject_count'];
        const arrays = [];
        submissions.forEach((ex) => {
            KEYS.forEach((key) => {
                if (ex[key] === undefined)
                    ex[key] = null;
            });
            const vals = KEYS.map((key) => ex[key]);
            arrays.push(vals);
        });

        return db.insertOne(dbClient, 'insert into mturk_output(' + KEYS.join(',') + ') '
                            + 'values ?', [arrays]);
    },

    insertValidationSubmission(dbClient, submissions) {
        if (submissions.length === 0)
            return Promise.resolve();

        const KEYS = ['submission_id', 'validation_sentence_id', 'answer'];
        const arrays = [];
        submissions.forEach((ex) => {
            KEYS.forEach((key) => {
                if (ex[key] === undefined)
                    ex[key] = null;
            });
            const vals = KEYS.map((key) => ex[key]);
            arrays.push(vals);
        });

        return db.insertOne(dbClient, 'insert into mturk_validation_output(' + KEYS.join(',') + ') '
                            + 'values ?', [arrays]);
    },

    async markSentencesGood(dbClient, exampleIds) {
        if (exampleIds.length === 0)
            return;

        await db.query(dbClient, `update mturk_output set accept_count = accept_count + 1
            where example_id in (?)`, [exampleIds]);
        await db.query(dbClient, `update example_utterances ex, mturk_output mo
            set ex.flags = if(ex.flags = '', 'training', concat_ws(',', 'training', ex.flags))
            where ex.id in (?) and ex.id = mo.example_id and mo.accept_count >= mo.target_count
            and mo.reject_count = 0`, [exampleIds]);
    },

    async markSentencesBad(dbClient, exampleIds) {
        if (exampleIds.length === 0)
            return;
        await db.query(dbClient, `update mturk_output set reject_count = reject_count + 1
            where example_id in (?)`, [exampleIds]);
        await db.query(dbClient, `update example_utterances ex
            set ex.flags = trim(both ',' from replace(concat(',', ex.flags, ','), ',training,', ','))
            where ex.id in (?)`, [exampleIds]);
    },

    streamUnvalidated(dbClient, batch) {
        return dbClient.query(`select
            ex.id as paraphrase_id, ex.utterance,
            m_in.id as synthetic_id, m_in.sentence as synthetic, m_in.thingtalk as target_code
            from example_utterances ex, mturk_output mout, mturk_input m_in,
            mturk_log log where log.batch = ? and mout.example_id = ex.id and
            (mout.accept_count + mout.reject_count) < mout.target_count and
            not find_in_set('training', ex.flags) and
            mout.submission_id = log.submission_id and m_in.id = mout.program_id
            order by m_in.id`, batch);
    },

    autoApproveUnvalidated(dbClient, batch) {
        return db.query(dbClient, `update example_utterances ex, mturk_output mout,
            set ex.flags = if(ex.flags = '', 'training', concat_ws(',', 'training', ex.flags))
            where mout.batch = ? and mout.example_id = ex.id and
            mout.reject_count = 0 and mout.submission_id = log.submission_id
            and not find_in_set('training', ex.flags)`, [batch]);
    },

    getBatches(dbClient) {
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
    },
    getBatchesForOwner(dbClient, ownerId) {
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
    },

    streamHITs(dbClient, batch) {
        return dbClient.query(`select hit_id from mturk_input where batch = ? group by hit_id`, batch);
    },
    streamValidationHITs(dbClient, batch) {
        return dbClient.query(`select hit_id from mturk_validation_input where batch = ? group by hit_id`, batch);
    }
};
