// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const jade = require('pug');
const crypto = require('crypto');

const user = require('../util/user');
const model = require('../model/user');
const organization = require('../model/organization');
const snapshot = require('../model/snapshot');
const device = require('../model/device');
const db = require('../util/db');
const TrainingServer = require('../util/training_server');

const OmletOAuth = require('../omlet/oauth2');

function makeRandom() {
    return crypto.randomBytes(32).toString('hex');
}

const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

const USERS_PER_PAGE = 50;
const DEVICES_PER_PAGE = 50;

function renderUserList(users) {
    const engineManager = EngineManager.get();

    return Promise.all(users.map((u) => {
        if (!engineManager)
            return Promise.resolve();
        return engineManager.getProcessId(u.id).then((pid) => {
            if (pid === -1) {
                u.isRunning = false;
                u.engineId = null;
            } else {
                u.isRunning = true;
                u.engineId = pid;
            }
        });
    })).then(() => users);
}

router.get('/', user.redirectRole(user.Role.ADMIN), (req, res) => {
    TrainingServer.get().getCurrentJob().then((current_job) => {
        res.render('admin_portal', { page_title: req._("Thingpedia - Administration"),
                                     csrfToken: req.csrfToken(),
                                     omletAvailable: platform.getSharedPreferences().get('assistant') !== undefined,
                                     omletRunning: false,
                                     currentTrainingJob: current_job });
    }).catch((e) => {
        console.error('Failed to check current training job: ' + e.message);
        res.render('admin_portal', { page_title: req._("Thingpedia - Administration"),
                                     csrfToken: req.csrfToken(),
                                     omletAvailable: platform.getSharedPreferences().get('assistant') !== undefined,
                                     omletRunning: false,
                                     currentTrainingJob: null });
    });
});

router.get('/users', user.redirectRole(user.Role.ADMIN), (req, res) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return model.getAll(dbClient, page * USERS_PER_PAGE, USERS_PER_PAGE + 1);
    }).then(renderUserList).then((users) => {
        res.render('admin_user_list', { page_title: req._("Almond - Administration"),
                                        csrfToken: req.csrfToken(),
                                        users: users,
                                        page_num: page,
                                        search: '',
                                        USERS_PER_PAGE });
    }).done();
});

router.get('/users/search', user.redirectRole(user.Role.ADMIN), (req, res) => {
    db.withClient((dbClient) => {
        if (req.query.q !== '' && !isNaN(req.query.q))
            return Promise.all([model.get(dbClient, Number(req.query.q))]);
        else
            return model.getSearch(dbClient, req.query.q);
    }).then(renderUserList).then((users) => {
        res.render('admin_user_list', { page_title: req._("Almond - User List"),
                                        csrfToken: req.csrfToken(),
                                        users: users,
                                        page_num: 0,
                                        search: req.query.search,
                                        USERS_PER_PAGE });
    }).done();
});

router.post('/users/kill/all', user.requireRole(user.Role.ADMIN), (req, res) => {
    const engineManager = EngineManager.get();

    Promise.resolve().then(() => {
        return engineManager.killAllUsers();
    }).then(() => {
        res.redirect(303, '/admin/users');
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
});

router.post('/users/kill/:id', user.requireRole(user.Role.ADMIN), (req, res) => {
    const engineManager = EngineManager.get();

    engineManager.killUser(parseInt(req.params.id)).then(() => {
        res.redirect(303, '/admin/users');
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/users/start/:id', user.requireRole(user.Role.ADMIN), (req, res) => {
    const engineManager = EngineManager.get();

    engineManager.isRunning(parseInt(req.params.id)).then((isRunning) => {
        if (isRunning)
            return engineManager.killUser(parseInt(req.params.id));
        else
            return Promise.resolve();
    }).then(() => {
        return engineManager.startUser(parseInt(req.params.id));
    }).then(() => {
        res.redirect(303, '/admin/users');
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/blow-view-cache', user.requireRole(user.Role.ADMIN), (req, res) => {
    jade.cache = {};
    res.redirect(303, '/admin');
});

router.post('/start-training', user.requireRole(user.Role.ADMIN), (req, res) => {
    TrainingServer.get().queue(req.query.language || 'en', null);
    res.redirect(303, '/admin');
});

router.post('/users/delete/:id', user.requireRole(user.Role.ADMIN), (req, res) => {
    if (req.user.id === req.params.id) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You cannot delete yourself") });
        return;
    }

    db.withTransaction((dbClient) => {
        return EngineManager.get().deleteUser(parseInt(req.params.id)).then(() => {
            return model.delete(dbClient, req.params.id);
        });
    }).then(() => {
        res.redirect(303, '/admin/users');
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/users/promote/:id', user.requireRole(user.Role.ADMIN), (req, res) => {
    let needsRestart = false;

    db.withTransaction((dbClient) => {
        return model.get(dbClient, req.params.id).then((user) => {
            if (user.developer_status >= 3)
                return Promise.resolve();

            if (user.developer_org === null) {
                needsRestart = true;
                return organization.create(dbClient, { name: '', comment: '', developer_key: makeRandom() }).then((org) => {
                    return model.update(dbClient, user.id, { developer_status: 1,
                                                             developer_org: org.id });
                });
            } else {
                return model.update(dbClient, user.id, { developer_status: user.developer_status + 1 });
            }
        });
    }).then(() => {
        if (needsRestart)
            return EngineManager.get().restartUser(req.params.id);
        else
            return Promise.resolve();
    }).then(() => {
        res.redirect(303, '/admin/users/search?q=' + req.params.id);
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/users/demote/:id', user.requireRole(user.Role.ADMIN), (req, res) => {
    if (req.user.id === req.params.id) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You cannot demote yourself") });
        return;
    }

    db.withTransaction((dbClient) => {
        return model.get(dbClient, req.params.id).then((user) => {
            if (user.developer_status <= 0)
                return Promise.resolve();
            return model.update(dbClient, user.id, { developer_status: user.developer_status - 1 });
        });
    }).then(() => {
        res.redirect(303, '/admin/users/search?q=' + req.params.id);
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/users/revoke-developer/:id', user.requireRole(user.Role.ADMIN), (req, res) => {
    if (req.user.id === req.params.id) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You cannot revoke your own dev credentials yourself") });
        return;
    }

    db.withTransaction((dbClient) => {
        return model.get(dbClient, req.params.id).then((user) => {
            return model.update(dbClient, user.id, { developer_status: 0, developer_org: null });
        });
    }).then(() => EngineManager.get().restartUser(req.params.id)).then(() => {
        res.redirect(303, '/admin/users/search?q=' + req.params.id);
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.get('/review-queue', user.redirectLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return device.getReviewQueue(dbClient, page * DEVICES_PER_PAGE, DEVICES_PER_PAGE + 1);
    }).then((devices) => {
        res.render('admin_review_queue', { page_title: req._("Almond - Administration"),
                                           csrfToken: req.csrfToken(),
                                           devices: devices,
                                           page_num: page,
                                           DEVICES_PER_PAGE });
    }).done();
});

router.get('/omlet/setup', user.redirectRole(user.Role.ADMIN), (req, res) => {
    if (platform.getSharedPreferences().get('assistant')) {
        res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: req._("Omlet is already setup") });
        return;
    }

    OmletOAuth.phase1(req, res).done();
});

router.get('/omlet/setup/callback', user.requireRole(user.Role.ADMIN), (req, res) => {
    OmletOAuth.phase2(req, res).then(() => {
        res.redirect(303, '/admin');
    }).done();
});

router.get('/organizations', user.requireRole(user.Role.ADMIN), (req, res) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return organization.getAll(dbClient, page * 20, 21);
    }).then((rows) => {
        res.render('admin_org_list', { page_title: req._("Almond - Developer Organizations"),
                                       csrfToken: req.csrfToken(),
                                       page_num: page,
                                       organizations: rows,
                                       search: '' });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.get('/organizations/search', user.requireRole(user.Role.ADMIN), (req, res) => {
    if (!req.query.q) {
        res.redirect(303, '/admin/organizations');
        return;
    }

    db.withClient((dbClient) => {
        return organization.getByFuzzySearch(dbClient, req.query.q);
    }).then((rows) => {
        res.render('admin_org_list', { page_title: req._("Almond - Developer Organizations"),
                                       csrfToken: req.csrfToken(),
                                       page_num: -1,
                                       organizations: rows,
                                       search: req.query.q });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.get('/organizations/details/:id', user.requireRole(user.Role.ADMIN), (req, res) => {
    db.withClient((dbClient) => {
        return Promise.all([
            organization.get(dbClient, req.params.id),
            model.getByDeveloperOrg(dbClient, req.params.id),
            device.getByOwner(dbClient, req.params.id)
        ]);
    }).then(([org, users, devices]) => {
        res.render('admin_org_details', { page_title: req._("Almond - Developer Organization"),
                                          csrfToken: req.csrfToken(),
                                          org: org,
                                          members: users,
                                          devices: devices });
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/organizations/add-member', user.requireRole(user.Role.ADMIN), (req, res) => {
    db.withTransaction((dbClient) => {
        return model.getByName(dbClient, req.body.username).then(([user]) => {
            if (!user)
                throw new Error(req._("No such user %s").format(req.body.username));
            if (user.developer_org !== null)
                throw new Error(req._("%s is already a member of another developer organization.").format(req.body.username));

            return model.update(dbClient, user.id, { developer_status: 1,
                                                     developer_org: req.body.id });
        });
    }).then(() => EngineManager.get().restartUser(req.body.id)).then(() => {
        res.redirect(303, '/admin/organizations/details/' + req.body.id);
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

router.post('/organizations/set-name', user.requireRole(user.Role.ADMIN), (req, res) => {
    db.withTransaction((dbClient) => {
        return organization.update(dbClient, req.body.id, { name: req.body.name, comment: req.body.comment });
    }).then(() => {
        res.redirect(303, '/admin/organizations/details/' + req.body.id);
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

module.exports = router;
