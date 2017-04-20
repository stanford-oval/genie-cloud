// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
var router = express.Router();
const fs = require('fs');
const path = require('path');

const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

function render(req, res, what) {
    res.render('doc_' + what, { page_title: req._("Thingpedia - Documentation") });
}

router.get('/', function(req, res) {
    Q.try(function() {
        if (req.user) {
            return EngineManager.get().isRunning(req.user.id);
        } else {
            return false;
        }
    }).then((isRunning) => {
        res.render('thingpedia_dev_portal', { page_title: req._("Thingpedia - Developer Portal"), isRunning: isRunning });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.get('/:what', function(req, res) {
    if (!/^[a-z0-9\-.]+$/.test(req.params.what) ||
        !req.params.what.endsWith('.md')) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("Malformed request") });
        return;
    }

    var what = req.params.what.substr(0, req.params.what.length - 3);
    if (fs.existsSync(path.resolve(path.dirname(module.filename),
                                   '../views/doc_' + what + '.jade'))) {
        render(req, res, what);
    } else {
        res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("Not Found.") });
    }
});

module.exports = router;
