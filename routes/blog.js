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

const blogModel = require('../model/blog');

const db = require('../util/db');
const user = require('../util/user');

var router = express.Router();

const BLOG_POSTS_PER_PAGE = 10;

router.get('/', (req, res, next) => {
    let page = req.query.page;
    if (page === undefined)
        page = 0;
    page = parseInt(page);
    if (isNaN(page) || page < 0)
        page = 0;

    db.withClient((dbClient) => {
        return blogModel.getAllPublished(dbClient, page * BLOG_POSTS_PER_PAGE, BLOG_POSTS_PER_PAGE+1);
    }).then((posts) => {
        return res.render('blog_archive', {
            page_title: req._("Almond Blog"),
            posts
        });
    }).catch(next);
});

router.get('/:id_slug', (req, res, next) => {
    const id = req.params.id_slug.split('-')[0];

    db.withClient((dbClient) => {
        return blogModel.getForView(dbClient, id);
    }).then((post) => {
        if (post.pub_date === null) {
            if (!req.user || !(req.user.roles & user.Role.ADMIN)) {
                const e = new Error("Not Found");
                e.errno = 'ENOENT';
                throw e;
            }
        }

        return res.render('blog_post', {
            page_title: req._("Almond Blog - %s").format(post.title),
            post
        });
    }).catch(next);
});

module.exports = router;
