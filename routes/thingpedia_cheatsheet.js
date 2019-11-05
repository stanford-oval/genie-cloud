// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015-2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');

const DatasetUtils = require('../util/dataset');
const I18n = require('../util/i18n');
const tokenize = require('../util/tokenize');
const iv = require('../util/input_validation');

const Config = require('../config');

var router = express.Router();

router.get('/', iv.validateGET({ platform: '?string' }), (req, res, next) => {
    const language = req.user ? I18n.localeToLanguage(req.user.locale) : 'en';

    DatasetUtils.getCheatsheet(language, { forPlatform: req.query.platform }).then((devices) => {
        res.render('thingpedia_cheatsheet', { page_title: req._("Thingpedia - Supported Operations"),
                                              CDN_HOST: Config.CDN_HOST,
                                              csrfToken: req.csrfToken(),
                                              devices: devices,
                                              clean: tokenize.clean });
    }).catch(next);
});

module.exports = router;
