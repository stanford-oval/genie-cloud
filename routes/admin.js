// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const jade = require('jade');

const user = require('../util/user');
const model = require('../model/user');
const db = require('../util/db');

var TITLE = "ThingEngine";

const EngineManager = require('../enginemanager');

var router = express.Router();

router.get('/', user.redirectRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    db.withClient(function(dbClient) {
        return model.getAll(dbClient);
    }).then(function(users) {
        users.forEach(function(u) {
            u.isRunning = engineManager.isRunning(u.id);
        });

        res.render('admin_user_list', { page_title: "ThingEngine - Administration",
                                        csrfToken: req.csrfToken(),
                                        users: users });
    }).done();
});

router.post('/kill-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    engineManager.killUser(req.params.id);
    res.redirect('/admin');
});

router.post('/start-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    if (engineManager.isRunning(req.params.id))
        engineManager.killUser(req.params.id);

    db.withClient(function(dbClient) {
        return model.get(dbClient, req.params.id);
    }).then(function(user) {
        return engineManager.startUser(user);
    }).then(function() {
        res.redirect('/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.post('/kill-all', user.requireRole(user.Role.ADMIN), function(req, res) {
    var engineManager = EngineManager.get();

    engineManager.stop();
    res.redirect('/admin');
});

router.post('/blow-view-cache', user.requireRole(user.Role.ADMIN), function(req, res) {
    jade.cache = {};
    res.redirect('/admin');
});

router.post('/delete-user/:id', user.requireRole(user.Role.ADMIN), function(req, res) {
    db.withTransaction(function(dbClient) {
        return EngineManager.get().deleteUser(req.params.id).then(function() {
            return model.delete(dbClient, req.params.id);
        });
    }).then(function() {
        res.redirect('/admin');
    }).catch(function(e) {
        res.status(500).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

module.exports = router;
