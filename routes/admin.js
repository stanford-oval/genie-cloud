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
const Url = require('url');

const user = require('../util/user');
const model = require('../model/user');
const organization = require('../model/organization');
const device = require('../model/device');
const blogModel = require('../model/blog');
const db = require('../util/db');
const TrainingServer = require('../util/training_server');
const iv = require('../util/input_validation');
const { makeRandom } = require('../util/random');
const { BadRequestError } = require('../util/errors');

const EngineManager = require('../almond/enginemanagerclient');

const Config = require('../config');

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

router.get('/', user.requireAnyRole(user.Role.ALL_ADMIN), (req, res, next) => {
    res.render('admin_portal', { page_title: req._("Thingpedia - Administration"),
                                 csrfToken: req.csrfToken() });
});

router.get('/users', user.requireRole(user.Role.ADMIN), iv.validateGET({ page: '?integer' }), (req, res, next) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    else
        page = parseInt(page);
    if (page < 0)
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
    }).catch(next);
});

router.get('/users/search', user.requireRole(user.Role.ADMIN), iv.validateGET({ q: 'string' }), (req, res, next) => {
    db.withClient((dbClient) => {
        if (Number.isInteger(+req.query.q))
            return Promise.all([model.get(dbClient, +req.query.q)]);
        else
            return model.getSearch(dbClient, req.query.q);
    }).then(renderUserList).then((users) => {
        res.render('admin_user_list', { page_title: req._("Almond - User List"),
                                        csrfToken: req.csrfToken(),
                                        users: users,
                                        page_num: 0,
                                        search: req.query.search,
                                        USERS_PER_PAGE });
    }).catch(next);
});

router.post('/users/kill/all', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    const engineManager = EngineManager.get();

    Promise.resolve().then(() => {
        return engineManager.killAllUsers();
    }).then(() => {
        res.redirect(303, '/admin/users');
    }).catch(next);
});

router.post('/users/kill/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    const engineManager = EngineManager.get();

    engineManager.killUser(parseInt(req.params.id)).then(() => {
        res.redirect(303, '/admin/users/search?q=' + req.params.id);
    }).catch(next);
});

router.post('/users/start/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    const engineManager = EngineManager.get();

    const id = parseInt(req.params.id);
    engineManager.isRunning(id).then((isRunning) => {
        if (isRunning)
            return Promise.resolve();
        else
            return engineManager.startUser(id);
    }).then(() => {
        res.redirect(303, '/admin/users/search?q=' + req.params.id);
    }).catch(next);
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

router.get('/training', user.requireRole(user.Role.NLP_ADMIN), (req, res, next) => {
    getTraining(req, res).catch(next);
});

router.post('/training', user.requireRole(user.Role.NLP_ADMIN), iv.validatePOST({ language: 'string', job_type: 'string' }), (req, res, next) => {
    TrainingServer.get().queue(req.body.language, null, req.body.job_type).then(() => {
        return getTraining(req, res);
    }).catch(next);
});

router.post('/training/kill', user.requireRole(user.Role.NLP_ADMIN), iv.validatePOST({ job_id: 'integer' }), (req, res, next) => {
    TrainingServer.get().kill(parseInt(req.body.job_id)).then(() => {
        return res.redirect(303, '/admin/training');
    }).catch(next);
});

router.post('/users/delete/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
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
    }).catch(next);
});

router.post('/users/promote/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    let needsRestart = false;

    db.withTransaction((dbClient) => {
        return model.get(dbClient, req.params.id).then((user) => {
            if (user.developer_status >= user.DeveloperStatus.ORG_ADMIN)
                return Promise.resolve();

            if (user.developer_org === null) {
                needsRestart = true;
                return organization.create(dbClient, {
                    name: '',
                    comment: '',
                    id_hash: makeRandom(8),
                    developer_key: makeRandom()
                }).then((org) => {
                    return model.update(dbClient, user.id, { developer_status: user.DeveloperStatus.ORG_ADMIN,
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
    }).catch(next);
});

router.post('/users/demote/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
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
    }).catch(next);
});

router.post('/users/revoke-developer/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    if (req.user.id === req.params.id) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You cannot revoke your own dev credentials yourself") });
        return;
    }

    db.withTransaction((dbClient) => {
        return model.get(dbClient, req.params.id).then((user) => {
            return model.update(dbClient, user.id, { developer_status: 0, developer_org: null });
        });
    }).then(() => EngineManager.get().restartUserWithoutCache(req.params.id)).then(() => {
        res.redirect(303, '/admin/users/search?q=' + req.params.id);
    }).catch(next);
});

router.get('/review-queue', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validateGET({ page: '?integer' }), (req, res, next) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    else
        page = parseInt(page);
    if (page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return device.getReviewQueue(dbClient, page * DEVICES_PER_PAGE, DEVICES_PER_PAGE + 1);
    }).then((devices) => {
        res.render('admin_review_queue', { page_title: req._("Almond - Administration"),
                                           csrfToken: req.csrfToken(),
                                           devices: devices,
                                           page_num: page,
                                           DEVICES_PER_PAGE });
    }).catch(next);
});

router.get('/organizations', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validateGET({ page: '?integer' }), (req, res, next) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    else
        page = parseInt(page);
    if (page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return organization.getAll(dbClient, page * 20, 21);
    }).then((rows) => {
        res.render('admin_org_list', { page_title: req._("Almond - Developer Organizations"),
                                       csrfToken: req.csrfToken(),
                                       page_num: page,
                                       organizations: rows,
                                       search: '' });
    }).catch(next);
});

router.get('/organizations/search', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validateGET({ q: 'string' }), (req, res, next) => {
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
    }).catch(next);
});

router.get('/organizations/details/:id', user.requireRole(user.Role.THINGPEDIA_ADMIN), (req, res, next) => {
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
    }).catch(next);
});

router.post('/organizations/add-member', user.requireRole(user.Role.THINGPEDIA_ADMIN),
    iv.validatePOST({ id: 'integer', as_developer: 'boolean', username: 'string' }), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const [user] = await model.getByName(dbClient, req.body.username);
        if (!user)
            throw new BadRequestError(req._("No such user %s").format(req.body.username));
        if (user.developer_org !== null && user.developer_org !== parseInt(req.body.id))
            throw new BadRequestError(req._("%s is already a member of another developer organization.").format(req.body.username));

        await model.update(dbClient, user.id, { developer_status: req.body.as_developer ? 1 : 0,
                                                developer_org: req.body.id });
        return user.id;
    }).then(async (userId) => {
        if (userId !== null) {
            await EngineManager.get().restartUser(userId);
            res.redirect(303, '/admin/organizations/details/' + req.body.id);
        }
    }).catch(next);
});

router.post('/organizations/set-name', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validatePOST({ id: 'integer', name: 'string', comment: '?string' }), (req, res, next) => {
    db.withTransaction((dbClient) => {
        return organization.update(dbClient, req.body.id, { name: req.body.name, comment: req.body.comment });
    }).then(() => {
        res.redirect(303, '/admin/organizations/details/' + req.body.id);
    }).catch(next);
});

const BLOG_POSTS_PER_PAGE = 10;

router.get('/blog', user.requireRole(user.Role.BLOG_EDITOR), iv.validateGET({ page: '?integer' }), (req, res, next) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    else
        page = parseInt(page);
    if (page < 0)
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

router.get('/blog/update/:id', user.requireRole(user.Role.BLOG_EDITOR), (req, res, next) => {
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

router.get('/blog/create', user.requireRole(user.Role.BLOG_EDITOR), (req, res, next) => {
    res.render('blog_create_or_edit', {
        page_title: req._("Almond - Blog Editor"),
        create: true,
        messages: [],
        post: {
            title: '',
            blurb: '',
            image: '',
            source: ''
        }
    });
});

function slugify(s) {
    return encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-')).replace(/[^a-z0-9-]/g, '');
}

router.post('/blog/update', user.requireRole(user.Role.BLOG_EDITOR),
    iv.validatePOST({ id: 'integer', title: 'string', image: 'string', blurb: 'string', source: 'string' }), (req, res, next) => {
    const md = new markdown();
    md.use(require('markdown-it-anchor'));
    md.use(require('markdown-it-highlightjs'));
    md.use(require('markdown-it-container-pandoc'));
    md.use(require('markdown-it-footnote'));
    md.use(require('markdown-it-table-of-contents'), { includeLevel: [2,3] });

    const image = Url.resolve(Config.SERVER_ORIGIN, req.body.image);
    const rendered = md.render(req.body.source);
    const slug = slugify(req.body.title);

    db.withClient((dbClient) => {
        return blogModel.update(dbClient, req.body.id, {
            title: req.body.title,
            blurb: req.body.blurb,
            image: image,
            source: req.body.source,
            slug: slug,
            body: rendered,
        });
    }).then(() => {
        req.flash('admin-blog-message', req._("Saved"));
        return res.redirect(303, '/admin/blog/update/' + req.body.id);
    }).catch(next);
});


router.post('/blog/create', user.requireRole(user.Role.BLOG_EDITOR),
    iv.validatePOST({ title: 'string', image: 'string', blurb: 'string', source: 'string' }), (req, res, next) => {
    const md = new markdown();
    md.use(require('markdown-it-anchor'));
    md.use(require('markdown-it-highlightjs'));
    md.use(require('markdown-it-container-pandoc'));
    md.use(require('markdown-it-footnote'));
    md.use(require('markdown-it-table-of-contents'), { includeLevel: [2,3] });

    const image = Url.resolve(Config.SERVER_ORIGIN, req.body.image);
    const rendered = md.render(req.body.source);
    const slug = slugify(req.body.title);

    db.withClient((dbClient) => {
        return blogModel.create(dbClient, {
            author: req.user.id,
            title: req.body.title,
            image: image,
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

router.post('/blog/publish', user.requireRole(user.Role.BLOG_EDITOR), iv.validatePOST({ id: 'integer' }), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.publish(dbClient, req.body.id);
    }).then(() => {
        return res.redirect(303, '/admin/blog');
    }).catch(next);
});

router.post('/blog/unpublish', user.requireRole(user.Role.BLOG_EDITOR), iv.validatePOST({ id: 'integer' }), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.unpublish(dbClient, req.body.id);
    }).then(() => {
        return res.redirect(303, '/admin/blog');
    }).catch(next);
});

router.post('/blog/delete', user.requireRole(user.Role.BLOG_EDITOR), iv.validatePOST({ id: 'integer' }), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.delete(dbClient, req.body.id);
    }).then(() => {
        return res.redirect(303, '/admin/blog');
    }).catch(next);
});


module.exports = router;
