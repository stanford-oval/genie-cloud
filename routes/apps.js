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
const feeds = require('../shared/util/feeds');
const thingpediaApps = require('../model/app');
const EngineManager = require('../lib/enginemanager');

const ThingTalk = require('thingtalk');
const AppGrammar = ThingTalk.Grammar;

var router = express.Router();

function getAllApps(engine) {
    return engine.apps.getAllApps().then(function(apps) {
        return Q.all(apps.map(function(a) {
            return Q.all([a.uniqueId, a.name, a.isRunning, a.isEnabled,
                          a.state, a.error])
                .spread(function(uniqueId, name, isRunning,
                                 isEnabled, state, error) {
                    return Q.try(function() {
                        if (state.$F) {
                            return engine.messaging.getFeedMeta(state.$F).then(function(f) {
                                return feeds.getFeedName(engine, f, true);
                            });
                        } else {
                            return null;
                        }
                    }).then(function(feed) {
                        var app = { uniqueId: uniqueId, name: name || "Some app",
                                    running: isRunning, enabled: isEnabled,
                                    state: state, error: error, feed: feed };
                        return app;
                    });
                });
        }));
    })
}

function getMyThingpediaApps(req) {
    return db.withClient(function(dbClient) {
        return thingpediaApps.getByOwner(dbClient, null, req.user.id).then(function(apps) {
            return Q.all(apps.map(function(r) {
                return thingpediaApps.getAllTags(dbClient, r.id).then(function(tags) {
                    r.tags = tags;
                    return r;
                });
            }));
        });
    });
}

function getAllDevices(engine) {
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
                    return { uniqueId: uniqueId, name: name || "Unknown device",
                             description: description || "Description not available",
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
    var shareApps = req.flash('share-apps');
    var sharedApp = null;

    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([getAllApps(engine), getAllDevices(engine), getMyThingpediaApps(req)]);
    }).spread(function(apps, devices, thingpediaApps) {
        if (shareApps.length > 0) {
            apps.forEach(function(app) {
                if (shareApps[0] === app.uniqueId)
                    sharedApp = app;
            });
        }

        return [apps, devices, thingpediaApps];
    }).spread(function(appinfo, devinfo, thingpediaAppinfo) {
        var physical = [], online = [], datasource = [];
        devinfo.forEach(function(d) {
            if (d.isDataSource)
                datasource.push(d);
            else if (d.isOnlineAccount)
                online.push(d);
            else
                physical.push(d);
        });
        var invisible = [], visible = [];
        thingpediaAppinfo.forEach(function(a) {
            if (a.visible)
                visible.push(a);
            else
                invisible.push(a);
        });
        res.render('my_stuff', { page_title: 'ThingPedia - My Sabrina',
                                 messages: req.flash('app-message'),
                                 sharedApp: sharedApp,
                                 csrfToken: req.csrfToken(),
                                 apps: appinfo,
                                 thingpediaVisible: visible,
                                 thingpediaInvisible: invisible,
                                 datasourceDevices: datasource,
                                 physicalDevices: physical,
                                 onlineDevices: online,
                                });
    }).catch(function(e) {
        console.log(e.stack);
        res.status(400).render('error', { page_title: "ThingPedia - Error",
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

    Q.try(function() {
        return EngineManager.get().getEngine(req.user.id).then(function(engine) {
            // sanity check the app
            ast = AppGrammar.parse(code);
            var state = JSON.parse(req.body.params);
            if (ast.name.feedAccess) {
                if (!state.$F && !req.body.feedId)
                    throw new Error('Missing feed for feed-shared app');
                if (!state.$F)
                    state.$F = req.body.feedId;
            } else {
                delete state.$F;
            }

            return engine.apps.loadOneApp(code, state, null, undefined,
                                          name, description, true);
        }).then(function() {
            if (ast.name.feedAccess && !req.query.shared) {
                req.flash('app-message', "Application successfully created");
                req.flash('share-apps', 'app-' + ast.name.name + state.$F.replace(/[^a-zA-Z0-9]+/g, '-'));
                res.redirect(303, '/apps');
            } else {
                req.flash('app-message', "Application successfully created");
                res.redirect(303, '/apps');
            }
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/delete', user.requireLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        var id = req.body.id;
        return Q.all([engine, engine.apps.getApp(id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingPedia - Error",
                                              message: "Not found." });
            return;
        }

        return engine.apps.removeApp(app);
    }).then(function() {
        req.flash('app-message', "Application successfully deleted");
        res.redirect(303, '/apps');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/share', user.requireLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        var id = req.body.id;
        return Q.all([engine, engine.apps.getApp(id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingPedia - Error",
                                              message: "Not found." });
            return;
        }

        return app.shareYourSelf();
    }).then(function() {
        req.flash('app-message', "Application successfully shared");
        res.redirect(303, '/apps');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.get('/:id/publish', user.redirectLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([engine, engine.apps.getApp(req.params.id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingPedia - Error",
                                              message: "Not found." });
            return;
        }

        return Q.all([app.name, app.description, app.code])
            .spread(function(name, description, code) {
                return res.render('thingpedia_app_create', { page_title: "ThingPedia App",
                                                             csrfToken: req.csrfToken(),
                                                             op: 'create',
                                                             name: name,
                                                             description: description || '',
                                                             code: code,
                                                             tags: [] });
            });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.get('/:id/results', user.redirectLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([engine, engine.apps.getApp(req.params.id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingPedia - Error",
                                              message: "Not found." });
            return;
        }

        return Q.all([app.name, app.pollOutVariables()])
            .spread(function(name, results) {
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
                return res.render('show_app_results', { page_title: "ThingPedia App",
                                                        appId: req.params.id,
                                                        name: name,
                                                        arrays: arrays,
                                                        tuples: tuples,
                                                        singles: singles });
            });
    }).catch(function(e) {
        console.log(e.stack);
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.get('/shared/:cloudId/:appId/:feedId', user.redirectLogIn, function(req, res) {
    var feedId = (new Buffer(req.params.feedId, 'base64')).toString();
    var appId = 'app-' + req.params.appId + feedId.replace(/[^a-zA-Z0-9]+/g, '-');

    db.withClient(function(dbClient) {
        return userModel.getByCloudId(dbClient, req.params.cloudId);
    }).then(function(users) {
        if (users.length === 0)
            throw new Error('Invalid user ID');

        return EngineManager.get().getEngine(users[0].id);
    }).then(function(remoteEngine) {
        return remoteEngine.apps.getApp(appId);
    }).then(function(remoteApp) {
        if (remoteApp === undefined)
            throw new Error('Invalid app ID');

        return Q.all([remoteApp.name, remoteApp.description,
                      remoteApp.state, remoteApp.code]);
    }).spread(function(name, description, state, code) {
        if (state.$F !== feedId)
            throw new Error('Invalid feed ID');

        return EngineManager.get().getEngine(req.user.id).then(function(engine) {
            return engine.apps.hasApp(appId);
        }).then(function(hasApp) {
            if (hasApp) {
                return res.render('app_shared_installed_already', { page_title: "ThingPedia - Enable App",
                                                                    appId: appId,
                                                                    name: name });
            } else {
                return res.render('app_shared_install', { page_title: "ThingPedia - Enable App",
                                                          csrfToken: req.csrfToken(),
                                                          name: name,
                                                          description: description,
                                                          state: JSON.stringify(state),
                                                          code: code });
            }
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

module.exports = router;
