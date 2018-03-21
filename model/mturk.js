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
        var KEYS = ['name', 'submissions_per_hit'];
        KEYS.forEach((key) => {
            if (batch[key] === undefined)
                batch[key] = null;
        });
        var vals = KEYS.map((key) => batch[key]);
        var marks = KEYS.map(() => '?');

        return db.insertOne(dbClient, 'insert into mturk_batch(' + KEYS.join(',') + ') '
                            + 'values (' + marks.join(',') + ')', vals).then((id) => {
                                batch.id = id;
                                return batch;
                            });
    },

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
        return db.selectAll(dbClient, `select id, name, submissions_per_hit,
            (select count(*) from mturk_input where batch = mturk_batch.id) as hit_count,
            (select count(mout.example_id) from mturk_output mout,
            mturk_log log where log.batch= mturk_batch.id
            and mout.submission_id = log.submission_id) as submissions, (select count(mout.example_id)
            from mturk_output mout, mturk_log log where
            log.batch= mturk_batch.id and (mout.accept_count + mout.reject_count) = mout.target_count
            and mout.submission_id = log.submission_id) as validated from mturk_batch`);
    },

    streamHITs(dbClient, batch) {
        return dbClient.query(`select id from mturk_input where batch = ?`, batch);
    }

};