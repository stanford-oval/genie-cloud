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

const Url = require('url');
const express = require('express');
const RSS = require('rss');

const blogModel = require('../model/blog');

const db = require('../util/db');
const user = require('../util/user');

const Config = require('../config');

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

router.get('/feed.rss', (req, res, next) => {
    db.withClient((dbClient) => {
        return blogModel.getAllPublished(dbClient, 0, BLOG_POSTS_PER_PAGE);
    }).then((posts) => {
        const feed = new RSS({
            title: 'Almond Blog',
            description: 'News & Updates from the Almond Open Virtual Assistant project',
            feed_url: Config.SERVER_ORIGIN + '/blog/feed.rss',
            site_url: Config.SERVER_ORIGIN,
            image_url: Url.resolve(Config.SERVER_ORIGIN, Config.ASSET_CDN + '/images/logo.png'),
            language: 'en',
        });
        for (let post of posts) {
            feed.item({
                title: post.title,
                description: post.blurb,
                url: Config.SERVER_ORIGIN + `/blog/${post.id}-${post.slug}`,
                author: post.author_name,
                date: post.upd_date,
            });
        }

        res.set('Content-Type', 'application/rss+xml');
        res.send(feed.xml());
    }).catch(next);
});

router.get('/:id_slug', (req, res, next) => {
    const id = req.params.id_slug.split('-')[0];

    db.withClient((dbClient) => {
        return blogModel.getForView(dbClient, id);
    }).then((post) => {
        if (post.pub_date === null) {
            if (!req.user || !(req.user.roles & user.Role.BLOG_EDITOR)) {
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
