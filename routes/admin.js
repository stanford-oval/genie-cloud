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
const markdown = require('markdown-it');

const user = require('../util/user');
const model = require('../model/user');
const organization = require('../model/organization');
const device = require('../model/device');
const blogModel = require('../model/blog');
const db = require('../util/db');
const TrainingServer = require('../util/training_server');

const { makeRandom } = require('../util/random');

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

router.use(user.requireLogIn);

router.get('/', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    res.render('admin_portal', { page_title: req._("Thingpedia - Administration"),
                                 csrfToken: req.csrfToken() });
});

router.get('/users', user.requireRole(user.Role.ADMIN), (req, res) => {
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

router.get('/users/search', user.requireRole(user.Role.ADMIN), (req, res) => {
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
        res.redirect(303, '/admin/users/search?q=' + req.params.id);
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
        res.redirect(303, '/admin/users/search?q=' + req.params.id);
    }).catch((e) => {
        res.status(500).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    }).done();
});

async function getTraining(req, res) {
    const [jobs, metrics] = await Promise.all([
        TrainingServer.get().getJobQueue(),
        TrainingServer.get().getMetrics()
    ]);
    res.render('admin_training', { page_title: req._("Thingpedia - Administration - Natural Language Training"),
                                 csrfToken: req.csrfToken(),
                                 metrics,
                                 jobs });
}

router.get('/training', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    getTraining(req, res).catch(next);
});

router.post('/training', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    TrainingServer.get().queue(req.body.language, null, req.body.job_type).then(() => {
        return getTraining(req, res);
    }).catch(next);
});

router.post('/training/kill', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    TrainingServer.get().kill(parseInt(req.body.job_id)).then(() => {
        return res.redirect(303, '/admin/training');
    }).catch(next);
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
                return organization.create(dbClient, {
                    name: '',
                    comment: '',
                    id_hash: makeRandom(8),
                    developer_key: makeRandom()
                }).then((org) => {
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

router.get('/review-queue', user.requireDeveloper(user.DeveloperStatus.ADMIN), (req, res) => {
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
            organization.getMembers(dbClient, req.params.id),
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

            return model.update(dbClient, user.id, { developer_status: req.body.as_developer ? 1 : 0,
                                                     developer_org: req.body.id }).then(() => user.id);
        });
    }).then((userId) => EngineManager.get().restartUser(userId)).then(() => {
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

const BLOG_POSTS_PER_PAGE = 10;

router.get('/blog', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return blogModel.getAll(dbClient, page * BLOG_POSTS_PER_PAGE, BLOG_POSTS_PER_PAGE+1);
    }).then((posts) => {
        return res.render('admin_blog_archive', {
            page_title: req._("Almond - Blog Archive"),
            posts
        });
    }).catch(next);
});

router.get('/blog/update/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.getForEdit(dbClient, req.params.id);
    }).then((post) => {
        return res.render('blog_create_or_edit', {
            page_title: req._("Almond - Blog Editor"),
            create: false,
            post,
            messages: req.flash('admin-blog-message'),
        });
    }).catch(next);
});

router.get('/blog/create', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    res.render('blog_create_or_edit', {
        page_title: req._("Almond - Blog Editor"),
        create: true,
        messages: [],
        post: {
            title: '',
            blurb: '',
            source: ''
        }
    });
});

function slugify(s) {
    return encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-'));
}

router.post('/blog/update', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    const md = new markdown();
    md.use(require('markdown-it-anchor'));
    md.use(require('markdown-it-highlightjs'));
    md.use(require('markdown-it-container-pandoc'));
    md.use(require('markdown-it-footnote'));
    md.use(require('markdown-it-table-of-contents'), { includeLevel: [2,3] });

    const rendered = md.render(req.body.source);
    const slug = slugify(req.body.title);

    db.withClient((dbClient) => {
        return blogModel.update(dbClient, req.body.id, {
            title: req.body.title,
            blurb: req.body.blurb,
            source: req.body.source,
            slug: slug,
            body: rendered,
        });
    }).then(() => {
        req.flash('admin-blog-message', req._("Saved"));
        return res.redirect(303, '/admin/blog/update/' + req.body.id);
    }).catch(next);
});


router.post('/blog/create', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    const md = new markdown();
    md.use(require('markdown-it-anchor'));
    md.use(require('markdown-it-highlightjs'));
    md.use(require('markdown-it-container-pandoc'));
    md.use(require('markdown-it-footnote'));
    md.use(require('markdown-it-table-of-contents'), { includeLevel: [2,3] });

    const rendered = md.render(req.body.source);
    const slug = slugify(req.body.title);

    db.withClient((dbClient) => {
        return blogModel.create(dbClient, {
            author: req.user.id,
            title: req.body.title,
            blurb: req.body.blurb,
            source: req.body.source,
            slug: slug,
            body: rendered,
        });
    }).then((post) => {
        req.flash('admin-blog-message', req._("Saved"));
        return res.redirect(303, '/admin/blog/update/' + post.id);
    }).catch(next);
});

router.post('/blog/publish', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.publish(dbClient, req.body.id);
    }).then(() => {
        return res.redirect(303, '/admin/blog');
    }).catch(next);
});

router.post('/blog/unpublish', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.unpublish(dbClient, req.body.id);
    }).then(() => {
        return res.redirect(303, '/admin/blog');
    }).catch(next);
});

router.post('/blog/delete', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.delete(dbClient, req.body.id);
    }).then(() => {
        return res.redirect(303, '/admin/blog');
    }).catch(next);
});


module.exports = router;
