// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

/// <reference types="./markdown-it-footnote" />
/// <reference types="./markdown-it-table-of-contents" />
/// <reference types="./markdown-it-container-pandoc" />

import express from 'express';
import markdown from 'markdown-it';
import * as Url from 'url';

import * as user from '../util/user';
import * as userUtils from '../util/user';
import * as model from '../model/user';
import * as organization from '../model/organization';
import * as device from '../model/device';
import * as blogModel from '../model/blog';
import * as nlpModelsModel from '../model/nlp_models';
import * as db from '../util/db';
import TrainingServer from '../util/training_server';
import * as iv from '../util/input_validation';
import { makeRandom } from '../util/random';
import { BadRequestError } from '../util/errors';

import * as EngineManager from '../almond/enginemanagerclient';

import * as Config from '../config';

const router = express.Router();

const USERS_PER_PAGE = 50;
const DEVICES_PER_PAGE = 50;

function renderUserList(users : Array<model.Row & { isRunning ?: boolean, engineId ?: number|string|null }>) {
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

router.get('/users', user.requireRole(user.Role.ADMIN),
    iv.validateGET({ page: '?integer', sort: /^$|^(id|username|human_name|registration_time|lastlog_time)\/(asc|desc)$/ }), (req, res, next) => {
    let page : number;
    if (req.query.page === undefined)
        page = 0;
    else
        page = parseInt(req.query.page);
    if (page < 0)
        page = 0;
    const sort = req.query.sort || 'id/asc';

    db.withClient((dbClient) => {
        return model.getAll(dbClient, page * USERS_PER_PAGE, USERS_PER_PAGE + 1, sort);
    }).then(renderUserList).then((users) => {
        res.render('admin_user_list', { page_title: req._("Genie - Administration"),
                                        csrfToken: req.csrfToken(),
                                        users: users,
                                        page_num: page,
                                        sort: sort,
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
        res.render('admin_user_list', { page_title: req._("Genie - User List"),
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

async function getTraining(req : express.Request, res : express.Response) {
    const [jobs, models] = await db.withClient((dbClient) => {
        return Promise.all([
            TrainingServer.get().getJobQueue(dbClient),
            nlpModelsModel.getTrained(dbClient)
        ]);
    });

    const metrics : Record<string, unknown> = {};
    for (const model of models) {
        if (!model.metrics)
            continue;
        const key = model.tag + '/' + model.language;
        metrics[key] = JSON.parse(model.metrics);
    }

    res.render('admin_training', { page_title: req._("Thingpedia - Administration - Natural Language Training"),
                                  csrfToken: req.csrfToken(),
                                  metrics,
                                  jobs });
}

if (Config.WITH_LUINET === 'embedded') {
    router.get('/training', user.requireRole(user.Role.NLP_ADMIN), (req, res, next) => {
        getTraining(req, res).catch(next);
    });

    router.post('/training', user.requireRole(user.Role.NLP_ADMIN), iv.validatePOST({ language: 'string', job_type: 'string' }), (req, res, next) => {
        TrainingServer.get().queue(req.body.language, null, req.body.job_type).then(() => {
            return getTraining(req, res);
        }).catch(next);
    });

    router.post('/training/kill', user.requireRole(user.Role.NLP_ADMIN), iv.validatePOST({ job_id: 'integer' }), (req, res, next) => {
        TrainingServer.get().kill(Number(req.body.job_id)).then(() => {
            return res.redirect(303, '/admin/training');
        }).catch(next);
    });
}

router.post('/users/delete/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    const id = Number(req.params.id);

    if (req.user!.id === id) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You cannot delete yourself") });
        return;
    }

    db.withTransaction((dbClient) => {
        return EngineManager.get().deleteUser(id).then(() => {
            return model.delete(dbClient, id);
        });
    }).then(() => {
        res.redirect(303, '/admin/users');
    }).catch(next);
});

router.post('/users/promote/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    const id = Number(req.params.id);

    db.withTransaction(async (dbClient) => {
        const user = await model.get(dbClient, id);
        if (user.developer_status >= userUtils.DeveloperStatus.ORG_ADMIN)
            return false;

        if (user.developer_org === null) {
            const org = await organization.create(dbClient, {
                name: '',
                comment: '',
                id_hash: makeRandom(8),
                developer_key: makeRandom()
            });
            await userUtils.makeDeveloper(dbClient, user.id, org.id, userUtils.DeveloperStatus.ORG_ADMIN);
            return true;
        } else {
            await model.update(dbClient, user.id, { developer_status: user.developer_status + 1 });
            return false;
        }
    }).then((needsRestart) => {
        if (needsRestart)
            return EngineManager.get().restartUser(id);
        else
            return Promise.resolve();
    }).then(() => {
        res.redirect(303, '/admin/users/search?q=' + id);
    }).catch(next);
});

router.post('/users/demote/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    const id = Number(req.params.id);

    if (req.user!.id === id) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You cannot demote yourself") });
        return;
    }

    db.withTransaction(async (dbClient) => {
        const user = await model.get(dbClient, id);
        if (user.developer_status <= 0)
            return;
        await model.update(dbClient, id, { developer_status: user.developer_status - 1 });
    }).then(() => {
        res.redirect(303, '/admin/users/search?q=' + req.params.id);
    }).catch(next);
});

router.post('/users/revoke-developer/:id', user.requireRole(user.Role.ADMIN), (req, res, next) => {
    const id = Number(req.params.id);

    if (req.user!.id === id) {
        res.render('error', { page_title: req._("Thingpedia - Error"),
                              message: req._("You cannot revoke your own dev credentials yourself") });
        return;
    }

    db.withTransaction(async (dbClient) => {
        // check the user exists
        await model.get(dbClient, id);
        await userUtils.makeDeveloper(dbClient, id, null, userUtils.DeveloperStatus.USER);
    }).then(() => EngineManager.get().restartUserWithoutCache(id)).then(() => {
        res.redirect(303, '/admin/users/search?q=' + id);
    }).catch(next);
});

if (Config.WITH_THINGPEDIA === 'embedded') {
    router.get('/review-queue', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validateGET({ page: '?integer' }), (req, res, next) => {
        let page : number;
        if (req.query.page === undefined)
            page = 0;
        else
            page = parseInt(req.query.page);
        if (page < 0)
            page = 0;

        db.withClient((dbClient) => {
            return device.getReviewQueue(dbClient, page * DEVICES_PER_PAGE, DEVICES_PER_PAGE + 1);
        }).then((devices) => {
            res.render('admin_review_queue', { page_title: req._("Genie - Administration"),
                                               csrfToken: req.csrfToken(),
                                               devices: devices,
                                               page_num: page,
                                               DEVICES_PER_PAGE });
        }).catch(next);
    });
}

router.get('/organizations', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validateGET({ page: '?integer' }), (req, res, next) => {
    let page : number;
    if (req.query.page === undefined)
        page = 0;
    else
        page = parseInt(req.query.page);
    if (page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return organization.getAll(dbClient, page * 20, 21);
    }).then((rows) => {
        res.render('admin_org_list', { page_title: req._("Genie - Developer Organizations"),
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
        res.render('admin_org_list', { page_title: req._("Genie - Developer Organizations"),
                                       csrfToken: req.csrfToken(),
                                       page_num: -1,
                                       organizations: rows,
                                       search: req.query.q });
    }).catch(next);
});

router.get('/organizations/details/:id', user.requireRole(user.Role.THINGPEDIA_ADMIN), (req, res, next) => {
    db.withClient((dbClient) => {
        return Promise.all([
            organization.get(dbClient, Number(req.params.id)),
            organization.getMembers(dbClient, Number(req.params.id)),
            device.getByOwner(dbClient, Number(req.params.id))
        ]);
    }).then(([org, users, devices]) => {
        res.render('admin_org_details', { page_title: req._("Genie - Developer Organization"),
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
        if (user.developer_org !== null && user.developer_org !== Number(req.body.id))
            throw new BadRequestError(req._("%s is already a member of another developer organization.").format(req.body.username));

        const targetStatus = req.body.as_developer ? userUtils.DeveloperStatus.DEVELOPER : userUtils.DeveloperStatus.USER;
        await userUtils.makeDeveloper(dbClient, user.id, Number(req.body.id), targetStatus);
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
        return organization.update(dbClient, Number(req.body.id), { name: req.body.name, comment: req.body.comment });
    }).then(() => {
        res.redirect(303, '/admin/organizations/details/' + req.body.id);
    }).catch(next);
});

const BLOG_POSTS_PER_PAGE = 10;

router.get('/blog', user.requireRole(user.Role.BLOG_EDITOR), iv.validateGET({ page: '?integer' }), (req, res, next) => {
    let page : number;
    if (req.query.page === undefined)
        page = 0;
    else
        page = parseInt(req.query.page);
    if (page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return blogModel.getAll(dbClient, page * BLOG_POSTS_PER_PAGE, BLOG_POSTS_PER_PAGE+1);
    }).then((posts) => {
        return res.render('admin_blog_archive', {
            page_title: req._("Genie - Blog Archive"),
            posts
        });
    }).catch(next);
});

router.get('/blog/update/:id', user.requireRole(user.Role.BLOG_EDITOR), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.getForEdit(dbClient, Number(req.params.id));
    }).then((post) => {
        return res.render('blog_create_or_edit', {
            page_title: req._("Genie - Blog Editor"),
            create: false,
            post,
            messages: req.flash('admin-blog-message'),
        });
    }).catch(next);
});

router.get('/blog/create', user.requireRole(user.Role.BLOG_EDITOR), (req, res, next) => {
    res.render('blog_create_or_edit', {
        page_title: req._("Genie - Blog Editor"),
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

function slugify(s : string) {
    return encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-')).replace(/[^a-z0-9-]/g, '');
}

import mdAnchor from 'markdown-it-anchor';
import mdContainerPandoc from 'markdown-it-container-pandoc';
import mdFootnote from 'markdown-it-footnote';
import mdTOC from 'markdown-it-table-of-contents';

router.post('/blog/update', user.requireRole(user.Role.BLOG_EDITOR),
    iv.validatePOST({ id: 'integer', title: 'string', image: 'string', blurb: 'string', source: 'string' }), (req, res, next) => {
    const md = new markdown({ html: true });
    md.renderer.rules.table_open = (tokens, idx) => {
        return '<table class="table">';
    };
    md.use(mdAnchor);
    md.use(mdContainerPandoc);
    md.use(mdFootnote);
    md.use(mdTOC, { includeLevel: [2,3] });

    const image = Url.resolve(Config.SERVER_ORIGIN, req.body.image);
    const rendered = md.render(req.body.source);
    const slug = slugify(req.body.title);

    db.withClient((dbClient) => {
        return blogModel.update(dbClient, Number(req.body.id), {
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
    const md = new markdown({ html: true });
    md.renderer.rules.table_open = (tokens, idx) => {
        return '<table class="table">';
    };
    md.use(mdAnchor);
    md.use(mdContainerPandoc);
    md.use(mdFootnote);
    md.use(mdTOC, { includeLevel: [2,3] });

    const image = Url.resolve(Config.SERVER_ORIGIN, req.body.image);
    const rendered = md.render(req.body.source);
    const slug = slugify(req.body.title);

    db.withClient((dbClient) => {
        return blogModel.create<db.Optional<blogModel.Row, blogModel.OptionalFields>>(dbClient, {
            author: req.user!.id,
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
        return blogModel.publish(dbClient, Number(req.body.id));
    }).then(() => {
        return res.redirect(303, '/admin/blog');
    }).catch(next);
});

router.post('/blog/unpublish', user.requireRole(user.Role.BLOG_EDITOR), iv.validatePOST({ id: 'integer' }), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.unpublish(dbClient, Number(req.body.id));
    }).then(() => {
        return res.redirect(303, '/admin/blog');
    }).catch(next);
});

router.post('/blog/delete', user.requireRole(user.Role.BLOG_EDITOR), iv.validatePOST({ id: 'integer' }), (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.delete(dbClient, Number(req.body.id));
    }).then(() => {
        return res.redirect(303, '/admin/blog');
    }).catch(next);
});


export default router;
