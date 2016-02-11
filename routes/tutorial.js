// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const child_process = require('child_process');

const user = require('../util/user');
const model = require('../model/user');
const db = require('../util/db');

var router = express.Router();

const EngineManager = require('../enginemanager');

router.get('/1', function(req, res) {
    req.session['tutorial-continue'] = '/tutorial/2';
    res.render('tutorial_begin', { page_title: "ThingEngine Tutorial" });
});

router.get('/2', function(req, res) {
    if (req.user.assistant_feed_id === null) {
        res.redirect('/tutorial/1');
        return;
    }

    req.session['tutorial-continue'] = '/tutorial/3';
    res.render('tutorial_install_app', { page_title: "ThingEngine Tutorial" });
});

router.get('/3', function(req, res) {
    if (req.user.assistant_feed_id === null) {
        res.redirect('/tutorial/1');
        return;
    }

    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return engine.apps.getApp('app-HelloWorld');
    }).then(function(a) {
        if (a === undefined) {
            res.redirect('/tutorial/2');
            return;
        }

        delete req.session['tutorial-continue'];
        res.render('tutorial_done', { page_title: "ThingEngine Tutorial" });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

module.exports = router;
