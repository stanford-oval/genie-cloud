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

    logSubmission(dbClient, token, batch, hit, worker) {
        const log = [token, batch, hit, worker];
        return db.insertOne(dbClient, 'insert into mturk_log(submission_id,batch,hit,worker) values (?)', [log]);
    },

    insertSubmission(dbClient, token, body) {
        let promises = [];
        for (let i = 1; i < 5; i ++) {
            let program_id = body[`program_id${i}`];
            let thingtalk = body[`thingtalk${i}`];
            let sentence = body[`sentence${i}`];
            for (let j = 1; j < 3; j ++) {
                let paraphrase = body[`paraphrase${i}-${j}`];
                let row = [token, program_id, thingtalk, sentence, paraphrase];
                promises.push(db.insertOne(dbClient, 'insert into mturk_output(submission_id,program_id,thingtalk,sentence,paraphrase) values (?)', [row]));
            }
        }
        return Promise.all(promises);
    }
};