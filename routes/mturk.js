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

const express = require('express');
const db = require('../util/db');

const model = require('../model/mturk');

var router = express.Router();

router.get(`/:batch/:hit`, (req, res) => {
    const batch = req.params.batch;
    const id = req.params.hit;

    db.withClient((dbClient) => {
        return model.getHIT(dbClient, batch, id);
    }).then((hit) => {
        let program_id = [];
        let sentences = [];
        let code = [];
        for (let i = 1; i < 5; i ++) {
            program_id.push(hit[`id${i}`]);
            code.push(hit[`thingtalk${i}`]);
            sentences.push(hit[`sentence${i}`]);
        }
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

router.post('/submit', (req, res) => {
    let token = (Math.random() + 1).toString(36).substring(2, 10) + (Math.random() + 1).toString(36).substring(2, 10);
    db.withTransaction((dbClient) => {
        // FIXME: validate the submission (= tokenize again, check program
        // syntax/types etc)
        return model.logSubmission(dbClient, token, req.body.batch,
            req.body.hit, req.body.worker).then(() => {
            return model.insertSubmission(dbClient, token, req.body);
        });
    }).then(() => {
        res.render('mturk-submit', { page_title: req._('Thank you'), token: token });
    }).catch((e) => {
        res.render('error', { message: 'Submission failed.' });
    }).done();
});

module.exports = router;
