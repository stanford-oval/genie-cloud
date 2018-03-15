// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
var router = express.Router();

router.get('/', function(req, res) {
    //const id = req.params.id;
    sentences = ['tweet "hello"', "get a @cat gif", "get weather in Seattle"];
    res.render('mturk', { page_title: req._("Paraphrase"), sentences: sentences, csrfToken: req.csrfToken() });
});

router.post('/submit', function(req, res) {
    console.log(req);
    res.render('mturk-submit', { page_title: req._("Thank you")});
})

module.exports = router;
