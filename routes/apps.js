// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');

const db = require('../util/db');
const user = require('../util/user');
const userModel = require('../model/user');
const EngineManager = require('../lib/enginemanager');

const ThingTalk = require('thingtalk');
const AppGrammar = ThingTalk.Grammar;

var router = express.Router();

function getAllApps(req, engine) {
    return engine.apps.getAllApps().then(function(apps) {
        return Q.all(apps.map(function(a) {
            return Q.all([a.uniqueId, a.name, a.isRunning, a.isEnabled,
                          a.state, a.error])
                .spread(function(uniqueId, name, isRunning,
                                 isEnabled, state, error) {
                    var app = { uniqueId: uniqueId, name: name || req._("Some app"),
                                running: isRunning, enabled: isEnabled,
                                state: state, error: error };
                    return app;
                });
        }));
    })
}

function getAllDevices(req, engine) {
    return engine.devices.getAllDevices().then(function(devices) {
        return Q.all(devices.map(function(d) {
            return Q.all([d.uniqueId, d.name, d.description, d.kind, d.ownerTier,
                          d.checkAvailable(),
                          d.isTransient,
                          d.hasKind('online-account'),
                          d.hasKind('data-source'),
                          d.hasKind('thingengine-system')])
                .spread(function(uniqueId, name, description, kind,
                                 ownerTier,
                                 available,
                                 isTransient,
                                 isOnlineAccount,
                                 isDataSource,
                                 isThingEngine) {
                    return { uniqueId: uniqueId, name: name || req._("Unknown device"),
                             description: description || req._("Description not available"),
                             kind: kind,
                             ownerTier: ownerTier,
                             available: available,
                             isTransient: isTransient,
                             isOnlineAccount: isOnlineAccount,
                             isDataSource: isDataSource,
                             isThingEngine: isThingEngine };
                });
        }));
    }).then(function(devinfo) {
        return devinfo.filter(function(d) {
            return !d.isThingEngine;
        });
    });
}

router.get('/', user.redirectLogIn, function(req, res) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([getAllApps(req, engine), getAllDevices(req, engine)]);
    }).spread(function(appinfo, devinfo) {
        var physical = [], online = [], datasource = [];
        devinfo.forEach(function(d) {
            if (d.isDataSource)
                datasource.push(d);
            else if (d.isOnlineAccount)
                online.push(d);
            else
                physical.push(d);
        });
        res.render('my_stuff', { page_title: req._("ThingPedia - My Sabrina"),
                                 messages: req.flash('app-message'),
                                 csrfToken: req.csrfToken(),
                                 apps: appinfo,
                                 datasourceDevices: datasource,
                                 physicalDevices: physical,
                                 onlineDevices: online,
                                });
    }).catch(function(e) {
        console.log(e.stack);
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: e });
    }).done();
});

router.post('/create', user.requireLogIn, function(req, res, next) {
    var compiler;
    var code = req.body.code;
    var name = req.body.name;
    var description = req.body.description;
    var state;
    var ast;
    var appId = req.body.appId || undefined;

    Q.try(function() {
        return EngineManager.get().getEngine(req.user.id).then(function(engine) {
            // sanity check the app
            ast = AppGrammar.parse(code);
            state = JSON.parse(req.body.params);
            if (ast.name.feedAccess) {
                if (!state.$F && !req.body.feedId)
                    throw new Error(req._("Missing feed for feed-shared app"));
                if (!state.$F)
                    state.$F = req.body.feedId;
            } else {
                delete state.$F;
            }

            return engine.apps.loadOneApp(code, state, appId, undefined,
                                          name, description, true);
        }).then(function() {
            if (ast.name.feedAccess && !req.query.shared) {
                req.flash('app-message', req._("Application successfully created"));
                req.flash('share-apps', 'app-' + ast.name.name + state.$F.replace(/[^a-zA-Z0-9]+/g, '-'));
                res.redirect(303, '/apps');
            } else {
                req.flash('app-message', req._("Application successfully created"));
                res.redirect(303, '/apps');
            }
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: e });
    }).done();
});

router.post('/delete', user.requireLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        var id = req.body.id;
        return Q.all([engine, engine.apps.getApp(id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: req._("ThingPedia - Error"),
                                              message: req._("Not found.") });
            return;
        }

        return engine.apps.removeApp(app);
    }).then(function() {
        req.flash('app-message', "Application successfully deleted");
        res.redirect(303, '/apps');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: e });
    }).done();
});

router.get('/:id/results', user.redirectLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([engine, engine.apps.getApp(req.params.id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: req._("ThingPedia - Error"),
                                              message: req._("Not found.") });
            return;
        }

        return Q.all([app.name, app.description, app.code, app.pollOutVariables()])
            .spread(function(name, description, code, results) {
                // FIXME do something smarter with feedAccessible keywords
                // and complex types

                var arrays = [];
                var tuples = [];
                var singles = [];
                results.forEach(function(r) {
                    if (Array.isArray(r.value)) {
                        if (r.type.startsWith('(') && !r.feedAccess)
                            tuples.push(r);
                        else
                            arrays.push(r);
                    } else {
                        singles.push(r);
                    }
                });
                return res.render('show_app_results', { page_title: req._("ThingPedia App"),
                                                        appId: req.params.id,
                                                        name: name,
                                                        description: description,
                                                        code: code,
                                                        arrays: arrays,
                                                        tuples: tuples,
                                                        singles: singles });
            });
    }).catch(function(e) {
        console.log(e.stack);
        res.status(400).render('error', { page_title: req._("ThingPedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router;
