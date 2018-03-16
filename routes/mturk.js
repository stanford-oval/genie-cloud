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
const express = require('express');
const db = require('../util/db');

var router = express.Router();

router.get(`/:batch/:hit`, function(req, res) {
    const batch = req.params.batch;
    const id = req.params.hit;
    let program_id = [];
    let sentences = [];
    let code = [];
    db.withClient((dbClient) => {
        return db.selectOne(dbClient, 'select * from mturk_input where batch = ? and id = ?', [batch, id]).then((hit) => {
            for (let i of [1, 2, 3, 4]) {
                program_id.push(hit[`id${i}`]);
                code.push(hit[`thingtalk${i}`]);
                sentences.push(hit[`sentence${i}`]);
            }
        });
    }).then(() => {
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

router.post('/submit', function(req, res) {
    let token = (Math.random() + 1).toString(36).substring(2, 10) + (Math.random() + 1).toString(36).substring(2, 10);
    db.withTransaction((dbClient) => {
        let log = [token, req.body.batch, req.body.hit, req.body.worker];
        return db.insertOne(dbClient, 'insert into mturk_log(submission_id,batch,hit,worker) values (?)', [log]).then(() => {
            let promises = [];
            for (let i = 1; i < 5; i ++) {
                let program_id = req.body[`program_id${i}`];
                let thingtalk = req.body[`thingtalk${i}`];
                let sentence = req.body[`sentence${i}`];
                for (let j = 1; j < 3; j ++) {
                    let paraphrase = req.body[`paraphrase${i}-${j}`];
                    let row = [token, program_id, thingtalk, sentence, paraphrase];
                    promises.push(db.insertOne(dbClient, 'insert into mturk_output(submission_id,program_id,thingtalk,sentence,paraphrase) values (?)', [row]));
                }
            }
            return Q.all(promises);
        });
    }).then(() => {
        res.render('mturk-submit', { page_title: req._('Thank you'), token: token });
    }).catch((e) => {
        res.render('error', { message: 'Submission failed.' });
    }).done();
})

module.exports = router;
