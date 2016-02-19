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
const EngineManager = require('../enginemanager');

const ThingTalk = require('thingtalk');
const AppCompiler = ThingTalk.Compiler;

var router = express.Router();

function getAllApps(engine) {
    return engine.apps.getAllApps().then(function(apps) {
        return Q.all(apps.map(function(a) {
            return Q.all([a.uniqueId, a.name, a.isRunning, a.isEnabled,
                          a.currentTier, a.state, a.error, a.hasOutVariables])
                .spread(function(uniqueId, name, isRunning,
                                 isEnabled, currentTier, state,
                                 error, hasOutVariables) {
                    var app = { uniqueId: uniqueId, name: name || "Some app",
                                running: isRunning, enabled: isEnabled,
                                currentTier: currentTier,
                                state: state, error: error,
                                hasOutVariables: hasOutVariables };
                    return app;
                });
        }));
    })
}

function getAllDevices(engine) {
    return engine.devices.getAllDevices().then(function(devices) {
        return Q.all(devices.map(function(d) {
            return Q.all([d.uniqueId, d.name, d.description, d.state, d.ownerTier,
                          d.checkAvailable(),
                          d.hasKind('online-account'),
                          d.hasKind('thingengine-system')])
                .spread(function(uniqueId, name, description, state,
                                 ownerTier,
                                 available,
                                 isOnlineAccount,
                                 isThingEngine) {
                    return { uniqueId: uniqueId, name: name || "Unknown device",
                             description: description || "Description not available",
                             kind: state.kind,
                             ownerTier: ownerTier,
                             available: available,
                             isOnlineAccount: isOnlineAccount,
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
        return Q.all([getAllApps(engine), getAllDevices(engine)]);
    }).spread(function(apps, devices) {
        console.log('apps', apps);
        console.log('devices', devices);
        if (shareApps.length > 0) {
            apps.forEach(function(app) {
                if (shareApps[0] === app.uniqueId)
                    sharedApp = app;
            });
        }

        return [apps, devices];
    }).spread(function(appinfo, devinfo) {
        var physical = [], online = [];
        devinfo.forEach(function(d) {
            if (d.isOnlineAccount)
                online.push(d);
            else
                physical.push(d);
        });
        res.render('my_stuff', { page_title: 'ThingEngine - installed apps',
                                 messages: req.flash('app-message'),
                                 sharedApp: sharedApp,
                                 csrfToken: req.csrfToken(),
                                 apps: appinfo,
                                 physicalDevices: physical,
                                 onlineDevices: online,
                                });
    }).catch(function(e) {
        console.log(e.stack);
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

function appsCreate(error, req, res) {
    return EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return feeds.getFeedList(engine, true);
    }).then(function(feeds) {
        res.render('apps_create', { page_title: 'ThingEngine - create app',
                                    csrfToken: req.csrfToken(),
                                    error: error,
                                    code: req.body.code,
                                    parameters: req.body.params || '{}',
                                    tier: req.body.tier || 'cloud',
                                    omlet: { feeds: feeds,
                                             feedId: req.body.feedId }
                                  });
    });
}

router.get('/create', user.redirectLogIn, function(req, res, next) {
    appsCreate(undefined, req, res).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.post('/create', user.requireLogIn, function(req, res, next) {
    var compiler;
    var code = req.body.code;
    var name = req.body.name;
    var description = req.body.description;
    var state, tier;

    Q.try(function() {
        return EngineManager.get().getEngine(req.user.id).then(function(engine) {
            compiler = new AppCompiler();

            return engine.devices.schemas.then(function(schemaRetriever) {
                compiler.setSchemaRetriever(schemaRetriever);

                return Q.try(function() {
                    // sanity check the app
                    return compiler.compileCode(code);
                }).then(function() {
                    state = JSON.parse(req.body.params);
                    if (compiler.feedAccess) {
                        if (!state.$F && !req.body.feedId)
                            throw new Error('Missing feed for feed-shared app');
                        if (!state.$F)
                            state.$F = req.body.feedId;
                    } else {
                        delete state.$F;
                    }

                    tier = req.body.tier;
                    if (tier !== 'server' && tier !== 'cloud' && tier !== 'phone')
                        throw new Error('No such tier ' + tier);
                })
            }).then(function() {
                return engine.apps.loadOneApp(code, state, null, tier,
                                              name, description, true);
            });
        }).then(function() {
            if (req.session['tutorial-continue']) {
                res.redirect(303, req.session['tutorial-continue']);
            } else if (compiler.feedAccess && !req.query.shared) {
                req.flash('app-message', "Application successfully created");
                req.flash('share-apps', 'app-' + compiler.name + state.$F.replace(/[^a-zA-Z0-9]+/g, '-'));
                res.redirect(303, '/apps');
            } else {
                req.flash('app-message', "Application successfully created");
                res.redirect(303, '/apps');
            }
        }).catch(function(e) {
            console.log(e.stack);
            return appsCreate(e.message, req, res);
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.post('/delete', user.requireLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        var id = req.body.id;
        return Q.all([engine, engine.apps.getApp(id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingEngine - Error",
                                              message: "Not found." });
            return;
        }

        return engine.apps.removeApp(app);
    }).then(function() {
        req.flash('app-message', "Application successfully deleted");
        res.redirect(303, '/apps');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.post('/share', user.requireLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        var id = req.body.id;
        return Q.all([engine, engine.apps.getApp(id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingEngine - Error",
                                              message: "Not found." });
            return;
        }

        return app.shareYourSelf();
    }).then(function() {
        req.flash('app-message', "Application successfully shared");
        res.redirect(303, '/apps');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.get('/:id/publish', user.redirectLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([engine, engine.apps.getApp(req.params.id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingEngine - Error",
                                              message: "Not found." });
            return;
        }

        return Q.all([app.name, app.description, app.code])
            .spread(function(name, description, code) {
                return res.render('thingpedia_app_create', { page_title: "ThingEngine App",
                                                             csrfToken: req.csrfToken(),
                                                             op: 'create',
                                                             name: name,
                                                             description: description || '',
                                                             code: code,
                                                             tags: [] });
            });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.get('/:id/show', user.redirectLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([engine, engine.apps.getApp(req.params.id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingEngine - Error",
                                              message: "Not found." });
            return;
        }

        return Q.all([app.name, app.description, app.code, app.state, app.hasOutVariables])
            .spread(function(name, description, code, state, hasOutVariables) {
                return Q.try(function() {
                    if (state.$F) {
                        return engine.messaging.getFeedMeta(state.$F).then(function(f) {
                            return feeds.getFeedName(engine, f, true);
                        });
                    } else {
                        return null;
                    }
                }).then(function(feed) {
                    if (feed)
                        delete state.$F;

                    return res.render('show_app', { page_title: "ThingEngine App",
                                                    appId: req.params.id,
                                                    name: name,
                                                    description: description || '',
                                                    hasOutVariables: hasOutVariables,
                                                    csrfToken: req.csrfToken(),
                                                    code: code,
                                                    feed: feed,
                                                    params: JSON.stringify(state) });
                });
            });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.get('/:id/results', user.redirectLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([engine, engine.apps.getApp(req.params.id)]);
    }).spread(function(engine, app) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingEngine - Error",
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
                return res.render('show_app_results', { page_title: "ThingEngine App",
                                                        appId: req.params.id,
                                                        name: name,
                                                        arrays: arrays,
                                                        tuples: tuples,
                                                        singles: singles });
            });
    }).catch(function(e) {
        console.log(e.stack);
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

router.post('/:id/update', user.requireLogIn, function(req, res, next) {
    EngineManager.get().getEngine(req.user.id).then(function(engine) {
        return Q.all([engine, engine.apps.getApp(req.params.id), engine.devices.schemas])
    }).spread(function(engine, app, schemaRetriever) {
        if (app === undefined) {
            res.status(404).render('error', { page_title: "ThingEngine - Error",
                                              message: "Not found." });
            return;
        }

        var compiler = new AppCompiler();
        compiler.setSchemaRetriever(schemaRetriever);

        return Q.all([app.name, app.description, app.currentTier])
            .spread(function(name, description, currentTier) {
                var code = req.body.code;
                var state;
                return Q.try(function() {
                    // sanity check the app
                    return compiler.compileCode(code);
                }).then(function() {
                    state = JSON.parse(req.body.params);
                    if (compiler.feedAccess) {
                        if (!state.$F && !req.body.feedId)
                            throw new Error('Missing feed for feed-shared app');
                        if (!state.$F)
                            state.$F = req.body.feedId;
                    } else {
                        delete state.$F;
                    }

                    return engine.apps.loadOneApp(code, state, req.params.id, currentTier, true);
                }).then(function() {
                    appsList(req, res, next, "Application successfully updated");
                }).catch(function(e) {
                    return app.state.then(function(state) {
                        if (state.$F) {
                            return engine.messaging.getFeedMeta(state.$F).then(function(f) {
                                return feeds.getFeedName(engine, f, true);
                            });
                        } else {
                            return null;
                        }
                    }).then(function(feed) {
                        res.render('show_app', { page_title: 'ThingEngine App',
                                                 name: name,
                                                 description: description || '',
                                                 csrfToken: req.csrfToken(),
                                                 error: e.message,
                                                 code: code,
                                                 feed: feed,
                                                 params: req.body.params });
                    });
                });
            });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
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

        return Q.all([remoteApp.name, remoteApp.description, remoteApp.hasOutVariables,
                      remoteApp.state, remoteApp.code]);
    }).spread(function(name, description, hasOutVariables, state, code) {
        if (state.$F !== feedId)
            throw new Error('Invalid feed ID');

        return EngineManager.get().getEngine(req.user.id).then(function(engine) {
            return engine.apps.hasApp(appId);
        }).then(function(hasApp) {
            if (hasApp) {
                return res.render('app_shared_installed_already', { page_title: "ThingEngine - Install App",
                                                                    hasOutVariables: hasOutVariables,
                                                                    appId: appId,
                                                                    name: name });
            } else {
                return res.render('app_shared_install', { page_title: "ThingEngine - Install App",
                                                          csrfToken: req.csrfToken(),
                                                          name: name,
                                                          description: description,
                                                          state: JSON.stringify(state),
                                                          code: code });
            }
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingEngine - Error",
                                          message: e.message });
    }).done();
});

module.exports = router;
