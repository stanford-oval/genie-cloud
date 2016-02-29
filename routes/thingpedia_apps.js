// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');

const ThingTalk = require('thingtalk');
const AppCompiler = ThingTalk.Compiler;

const db = require('../util/db');
const user = require('../util/user');
const userModel = require('../model/user');
const model = require('../model/app');
const device = require('../model/device');
const category = require('../model/category');
const schema = require('../model/schema');
const feeds = require('../shared/util/feeds');

const EngineManager = require('../enginemanager');

function SchemaRetriever() {
    this._request = null;
    this._pendingRequests = [];
}

SchemaRetriever.prototype._ensureRequest = function() {
    if (this._request !== null)
        return;

    this._request = Q.delay(0).then(function() {
        var pending = this._pendingRequests;
        this._pendingRequests = [];
        this._request = null;

        return db.withClient(function(dbClient) {
            return schema.getTypesByKinds(dbClient, pending, null);
        }).then(function(rows) {
            var obj = {};

            rows.forEach(function(row) {
                if (row.types === null)
                    return;
                obj[row.kind] = {
                    triggers: row.types[0],
                    actions: row.types[1]
                };
            });

            return obj;
        });
    }.bind(this));
};

SchemaRetriever.prototype.getSchema = function(kind) {
    if (this._pendingRequests.indexOf(kind) < 0)
        this._pendingRequests.push(kind);
    this._ensureRequest();
    return this._request.then(function(everything) {
        if (kind in everything)
            return everything[kind];
        else
            return null;
    });
};

var router = express.Router();

function renderAppList(dbClient, apps, res, page_h1, page_subtitle, page_num) {
    return Q.all(apps.map(function(r) {
        return model.getAllTags(dbClient, r.id).then(function(tags) {
            r.tags = tags;
            return r;
        });
    })).then(function(apps) {
	res.render('thingpedia_app_list', { page_title: "ThingPedia - app collection",
                                            page_h1: page_h1,
                                            page_subtitle: page_subtitle,
                                            page_num: page_num,
                                            apps: apps });
    });
}

function filterVisible(req) {
    if (!req.user)
        return -1;
    if (req.user.developer_status >= user.DeveloperStatus.ADMIN)
        return null;
    else
        return req.user.id;
}

router.get('/', function(req, res) {
    var page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withTransaction(function(client) {
        return model.getAll(client, filterVisible(req), page * 18, 18).then(function(apps) {
            return renderAppList(client, apps, res,
                                 "Try the following recommended apps", '', page);
        });
    }).done();
});

router.get('/search', function(req, res) {
    var q = req.query.q;
    if (!q) {
        res.redirect('/thingpedia/apps');
        return;
    }

    db.withTransaction(function(client) {
        return model.getByFuzzySearch(client, filterVisible(req), q).then(function(apps) {
            return renderAppList(client, apps, res,
                                 "Results of your search");
        });
    }).done();
});

router.get('/by-category/:category(\\d+)', function(req, res) {
    var categoryId = req.params.category;

    db.withTransaction(function(client) {
        return category.get(client, categoryId).then(function(cats) {
            if (cats.length < 1) {
                res.status(404).render('error', { page_title: "ThingPedia - Error",
                                                  message: "Invalid category" });
                return;
            }

            return model.getByTag(client, filterVisible(req), cats[0].tag).then(function(apps) {
                return renderAppList(client, apps, res,
                                     cats[0].name,
                                     cats[0].description);
            });
        });
    });
});

router.get('/by-tag/:tag', function(req, res) {
    var tag = req.params.tag;

    db.withTransaction(function(client) {
        return model.getByTag(client, filterVisible(req), tag).then(function(apps) {
            return renderAppList(client, apps, res,
                                 "Apps with tag \"" + tag + "\"");
        });
    }).done();
})

router.get('/by-device/:id(\\d+)', function(req, res) {
    var deviceId = req.params.id;

    db.withTransaction(function(client) {
        return device.get(client, deviceId).then(function(device) {
            return model.getByDevice(client, filterVisible(req), deviceId).then(function(apps) {
                return renderAppList(client, apps, res,
                                     "Apps for " + device.name);
            });
        });
    }).done();
})

router.get('/by-owner/:id(\\d+)', function(req, res) {
    db.withTransaction(function(client) {
        return userModel.get(client, req.params.id).then(function(user) {
            return model.getByOwner(client, filterVisible(req), req.params.id).then(function(apps) {
                var username = user.human_name || user.username;
                return renderAppList(client, apps, res,
                                     "Apps contributed by " + username);
            });
        });
    }).done();
})


router.get('/create', user.redirectLogIn, function(req, res) {
    res.render('thingpedia_app_create', { page_title: "ThingPedia - create a new app",
                                          csrfToken: req.csrfToken(),
                                          op: 'create',
                                          name: '',
                                          description: '',
                                          code: '',
                                          tags: [] });
});

var _schemaRetriever = new SchemaRetriever();

function validateApp(name, description, code) {
    return Q.try(function() {
        if (!name || !description)
            throw new Error("A app must have a name and a description");

        var compiler = new AppCompiler();
        compiler.setSchemaRetriever(_schemaRetriever);
        return compiler.compileCode(code).catch(function(e) {
            throw new Error("Syntax Error: " + e.message);
        });
    });
}

router.post('/create', user.requireLogIn, function(req, res) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var tags = req.body.tags || [];

    return Q.try(function() {
        return validateApp(name, description, code);
    }).then(function() {
        // FINISHME figure out what devices this app uses

        return db.withTransaction(function(dbClient) {
            return model.create(dbClient, { owner: req.user.id,
                                            name: name,
                                            description: description,
                                            code: code })
                .tap(function(app) {
                    return model.addTags(dbClient, app.id, tags);
                });
        });
    }).then(function(app) {
        res.redirect('/thingpedia/apps/' + app.id);
    }).catch(function(err) {
        res.render('thingpedia_app_create', { error: err.message,
                                              op: 'create',
                                              csrfToken: req.csrfToken(),
                                              name: name,
                                              description: description,
                                              code: code,
                                              tags: tags });
    }).done();
});

router.get('/:id(\\d+)', function(req, res) {
    db.withClient(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            return model.getAllTags(dbClient, r.id).then(function(tags) {
                r.tags = tags;
                return r;
            });
        });
    }).then(function(app) {
        if ((!req.user || (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                            app.owner !== req.user.id)) &&
            !app.visible) {
            res.status(403).render('error', { page_title: "ThingPedia - Error",
                                              message: "You are not authorized to perform the requested operation" });
            return;
        }

        res.render('thingpedia_app_view', { page_title: "ThingPedia - app",
                                            csrfToken: req.csrfToken(),
                                            app: app });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    }).done();
});

router.post('/delete/:id(\\d+)', user.requireLogIn, function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                r.owner !== req.user.id) {
                res.status(403).render('error', { page_title: "ThingPedia - Error",
                                                  message: "You are not authorized to perform the requested operation" });
                return;
            }

            return model.delete(dbClient, req.params.id);
        });
    }).then(function(app) {
        res.redirect('/apps');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    }).done();
});

router.post('/set-visible/:id(\\d+)', user.requireLogIn, function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                r.owner !== req.user.id) {
                res.status(403).render('error', { page_title: "ThingPedia - Error",
                                                  message: "You are not authorized to perform the requested operation" });
                return;
            }

            return model.update(dbClient, req.params.id, { visible: true });
        });
    }).then(function(app) {
        res.redirect('/apps');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    }).done();
});

router.post('/set-invisible/:id(\\d+)', user.requireLogIn, function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                r.owner !== req.user.id) {
                res.status(403).render('error', { page_title: "ThingPedia - Error",
                                                  message: "You are not authorized to perform the requested operation" });
                return;
            }

            return model.update(dbClient, req.params.id, { visible: false });
        });
    }).then(function(app) {
        res.redirect('/apps');
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    }).done();
});

function forkApp(req, res, error, name, description, code, tags) {
    return db.withClient(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            if (r.owner === req.user.id) {
                res.redirect('/thingpedia/apps/edit/' + req.params.id);
                return;
            }

            if (tags)
                return r;
            return model.getAllTags(dbClient, r.id).then(function(tags) {
                r.tags = tags;
                return r;
            });
        });
    }).then(function(app) {
        if (app === undefined)
            return;

        return res.render('thingpedia_app_create', { page_title: "ThingPedia - fork a app",
                                                     error: error,
                                                     op: 'fork',
                                                     csrfToken: req.csrfToken(),
                                                     fork_id: app.id,
                                                     fork_owner: app.owner,
                                                     fork_owner_name: app.owner_name,
                                                     fork_name: app.name,
                                                     name: name || app.name,
                                                     description: description || app.description,
                                                     code: code || app.code,
                                                     tags: tags || app.tags.map(function(t) { return t.tag; }) });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    });
}

router.get('/fork/:id(\\d+)', user.redirectLogIn, function(req, res) {
    forkApp(req, res).done();
});

router.post('/fork/:id(\\d+)', user.requireLogIn, function(req, res) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var tags = req.body.tags || [];

    Q.try(function() {
        return validateApp(name, description, code);
    }).then(function() {
        // FINISHME figure out what devices this app uses

        return db.withTransaction(function(dbClient) {
            return model.create(dbClient, { owner: req.user.id,
                                            name: name,
                                            description: description,
                                            code: code })
                .tap(function(app) {
                    return model.addTags(dbClient, app.id, tags);
                });
        });
    }).then(function(app) {
        res.redirect('/thingpedia/apps/' + app.id);
    }).catch(function(err) {
        return forkApp(req, res, err.message, name, description, code, tags);
    }).done();
});

router.get('/edit/:id(\\d+)', user.redirectLogIn, function(req, res) {
    return db.withClient(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(r) {
            if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                r.owner !== req.user.id) {
                res.status(403).render('error', { page_title: "ThingPedia - Error",
                                                  message: "You are not authorized to perform the requested operation" });
                return;
            }

            return model.getAllTags(dbClient, r.id).then(function(tags) {
                r.tags = tags;
                return r;
            });
        });
    }).then(function(app) {
        if (app === undefined)
            return;

        res.render('thingpedia_app_create', { page_title: "ThingPedia - edit a app",
                                              op: 'edit',
                                              csrfToken: req.csrfToken(),
                                              app_id: app.id,
                                              name: app.name,
                                              description: app.description,
                                              code: app.code,
                                              tags: app.tags.map(function(t) { return t.tag; }) });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    }).done();
});

router.post('/edit/:id(\\d+)', user.requireLogIn, function(req, res) {
    var name = req.body.name;
    var description = req.body.description;
    var code = req.body.code;
    var tags = req.body.tags || [];

    Q.try(function() {
        return validateApp(name, description, code);
    }).then(function() {
        return db.withTransaction(function(dbClient) {
            return model.get(dbClient, req.params.id).then(function(r) {
                if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
                    r.owner !== req.user.id) {
                    res.status(403).render('error', { page_title: "ThingPedia - Error",
                                                      message: "You are not authorized to perform the requested operation" });
                    return;
                }

                // FINISHME figure out what devices this app uses
                return model.update(dbClient, req.params.id, { name: name,
                                                               description: description,
                                                               code: code })
                    .then(function() {
                        return model.removeAllTags(dbClient, req.params.id);
                    })
                    .then(function(app) {
                        return model.addTags(dbClient, req.params.id, tags);
                    })
                    .then(function() {
                        res.redirect('/thingpedia/apps/' + req.params.id);
                    });
            });
        });
    }).catch(function(err) {
        res.render('thingpedia_app_create', { page_title: "ThingPedia - edit a app",
                                              error: err.message,
                                              op: 'edit',
                                              csrfToken: req.csrfToken(),
                                              app_id: req.params.id,
                                              name: name,
                                              description: description,
                                              code: code,
                                              tags: tags });
    }).done();
});

    var compiler;

router.get('/install/:id(\\d+)', user.redirectLogIn, function(req, res, next) {
    db.withClient(function(dbClient) {
        return model.get(dbClient, req.params.id);
    }).then(function(app) {
        if (req.user.developer_status !== user.DeveloperStatus.ADMIN &&
            app.owner !== req.user.id &&
            !app.visible) {
            res.status(403).render('error', { page_title: "ThingPedia - Error",
                                              message: "You are not authorized to perform the requested operation" });
            return;
        }

        // sanity check the app for version incompatibilities
        var compiler = new AppCompiler();
        compiler.setSchemaRetriever(_schemaRetriever);
        return compiler.compileCode(app.code).then(function() {
            var params = Object.keys(compiler.params).map(function(k) {
                return [k, compiler.params[k]];
            });

            return Q.try(function() {
                if (compiler.feedAccess) {
                    return EngineManager.get().getEngine(req.user.id).then(function(engine) {
                        return feeds.getFeedList(engine, true);
                    });
                } else {
                    return null;
                }
            }).then(function(feeds) {
                res.render('app_install', { page_title: "ThingPedia - Install App",
                                            csrfToken: req.csrfToken(),
                                            thingpediaId: req.params.id,
                                            params: params,
                                            name: app.name,
                                            description: app.description,
                                            feeds: feeds,
                                            code: app.code });
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    }).done();
});

module.exports = router;
