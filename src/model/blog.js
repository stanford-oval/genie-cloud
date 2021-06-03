// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const db = require('../util/db');

module.exports = {
    async create(dbClient, post) {
        const id = await db.insertOne(dbClient, `insert into blog_posts set ?`, [post]);
        post.id = id;
        return post;
    },

    delete(dbClient, id) {
        return db.query(dbClient, `delete from blog_posts where id = ?`, [id]);
    },

    update(dbClient, id, post) {
        return db.query(dbClient, `update blog_posts set ?, upd_date = current_timestamp() where id = ?`, [post, id]);
    },

    publish(dbClient, id) {
        return db.query(dbClient, `update blog_posts set pub_date = current_timestamp(), upd_date = current_timestamp() where id = ?`, [id]);
    },
    unpublish(dbClient, id) {
        return db.query(dbClient, `update blog_posts set pub_date = null where id = ?`, [id]);
    },

    getAll(dbClient, start, end) {
        return db.selectAll(dbClient, `select bp.id,author,title,slug,blurb,image,pub_date,upd_date,u.human_name as author_name
            from blog_posts bp,users u where u.id = bp.author order by upd_date desc limit ?,?`, [start, end]);
    },
    getAllPublished(dbClient, start, end) {
        return db.selectAll(dbClient, `
            (select image,title,blurb,link,upd_date,upd_date as pub_date,null as author_name from homepage_links)
            union
            (select image,title,blurb, concat('/blog/', bp.id, '-', slug) as link,upd_date,pub_date,u.human_name as author_name
              from blog_posts bp,users u where u.id = bp.author and pub_date is not null)
            order by upd_date desc limit ?,?`, [start, end]);
    },

    getHomePage(dbClient) {
        return db.selectAll(dbClient,
            `(select image,title,blurb,link,upd_date as sort_key from homepage_links)
            union
             (select image,title,blurb, concat('/blog/', bp.id, '-', slug) as link,upd_date as sort_key
              from blog_posts bp,users u where u.id = bp.author and pub_date is not null
              and in_homepage)
            order by sort_key desc limit 3`);
    },

    getForView(dbClient, id) {
        return db.selectOne(dbClient, `select bp.id,author,title,slug,image,pub_date,upd_date,body,u.human_name as author_name from blog_posts bp,users u where u.id = bp.author and bp.id = ?`, [id]);
    },

    getForEdit(dbClient, id) {
        return db.selectOne(dbClient, `select * from blog_posts where id = ?`, [id]);
    },
};
