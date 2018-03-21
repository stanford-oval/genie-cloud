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
    getHIT(dbClient, batch, id) {
        return db.selectOne(dbClient, 'select * from mturk_input where batch = ? and id = ?', [batch, id]);
    },
    getBatchDetails(dbClient, batch) {
        return db.selectOne(dbClient, `select * from mturk_batch where id = ?`, [batch]);
    },

    logSubmission(dbClient, token, batch, hit, worker) {
        const log = [token, batch, hit, worker];
        return db.insertOne(dbClient, 'insert into mturk_log(submission_id,batch,hit,worker) values (?)', [log]);
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
            const vals = KEYS.map((key) => {
                return ex[key];
            });
            arrays.push(vals);
        });

        return db.insertOne(dbClient, 'insert into mturk_output(' + KEYS.join(',') + ') '
                            + 'values ?', [arrays]);
    },

    getUnvalidated(dbClient, batch) {
        return db.selectAll(dbClient, `select ex.* from example_utterances ex, mturk_output mout,
            mturk_log log where log.batch = ? and mout.example_id = ex.id and
            (mout.accept_count + mout.reject_count) < mout.target_count and
            mout.submission_id = log.submission_id`, [batch]);
    },

    getBatches(dbClient, batch) {
        return db.selectAll(dbClient, `select id, name, (select count(ex.id) from example_utterances
            ex, mturk_output mout, mturk_log log where log.batch= mturk_batch.id and
            mout.example_id = ex.id and (mout.accept_count + mout.reject_count) < mout.target_count
            and mout.submission_id = log.submission_id) as unvalidated, (select count(ex.id)
            from example_utterances ex, mturk_output mout, mturk_log log where
            log.batch= mturk_batch.id and mout.example_id = ex.id and
            (mout.accept_count + mout.reject_count) < mout.target_count
            and mout.submission_id = log.submission_id) as validated from mturk_batch`);
    }

};