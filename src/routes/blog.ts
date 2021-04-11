// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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

import * as Url from 'url';
import express from 'express';
import RSS from 'rss';

import * as blogModel from '../model/blog';

import * as db from '../util/db';
import * as user from '../util/user';
import * as iv from '../util/input_validation';
import { NotFoundError } from '../util/errors';

import * as Config from '../config';

const router = express.Router();

const BLOG_POSTS_PER_PAGE = 10;

router.get('/', iv.validateGET({ page: '?integer' }), (req, res, next) => {
    let page : number;
    if (req.query.page === undefined)
        page = 0;
    else
        page = parseInt(req.query.page);

    db.withClient((dbClient) => {
        return blogModel.getAllPublished(dbClient, page * BLOG_POSTS_PER_PAGE, BLOG_POSTS_PER_PAGE+1);
    }).then((posts) => {
        return res.render('blog_archive', {
            page_title: req._("Genie Blog"),
            page_num: page,
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
        for (const post of posts) {
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
        return blogModel.getForView(dbClient, Number(id));
    }).then((post) => {
        if (post.pub_date === null) {
            if (!req.user || !(req.user.roles & user.Role.BLOG_EDITOR))
                throw new NotFoundError();
        }

        return res.render('blog_post', {
            page_title: req._("Almond Blog - %s").format(post.title),
            post
        });
    }).catch(next);
});

export default router;
