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
const router = express.Router();

router.get('/www17', (req, res) => {
    res.render('pub_www17', { page_title: req._("Publications: WWW-17") });
});

router.get('/mobilesoft16', (req, res) => {
    res.render('pub_mobilesoft16', { page_title: req._("Publications: MobileSoft-16") });
});

router.get('/mobilehci18', (req, res) => {
    res.render('pub_mobilehci18', { page_title: req._("Publications: MobileHCI-18") });
});

router.get('/ubicomp18', (req, res) => {
    res.render('pub_ubicomp18', { page_title: req._("Publications: UbiComp-18") });
});

module.exports = router;