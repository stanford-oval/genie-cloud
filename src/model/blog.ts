// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as db from '../util/db';

export interface Row {
    id : number;
    author : number;
    slug : string;
    title : string;
    image : string;
    blurb : string;
    source : string;
    body : string;
    pub_date : Date|null;
    upd_date : Date;
    in_homepage : boolean;
}
export type OptionalFields = 'pub_date' | 'upd_date' | 'in_homepage';

export interface HomePageLinkRow {
    id : number;
    title : string;
    image : string;
    blurb : string;
    link : string;
    upd_date : Date;
}

export async function create<T extends db.Optional<Row, OptionalFields>>(dbClient : db.Client, post : db.WithoutID<T>) : Promise<db.WithID<T>> {
    const id = await db.insertOne(dbClient, `insert into blog_posts set ?`, [post]);
    post.id = id;
    return post as db.WithID<T>;
}

async function _delete(dbClient : db.Client, id : number) {
    await db.query(dbClient, `delete from blog_posts where id = ?`, [id]);
}
export { _delete as delete };

export async function update(dbClient : db.Client, id : number, post : Partial<Row>) {
    await db.query(dbClient, `update blog_posts set ?, upd_date = current_timestamp() where id = ?`, [post, id]);
}

export async function publish(dbClient : db.Client, id : number) {
    await db.query(dbClient, `update blog_posts set pub_date = current_timestamp(), upd_date = current_timestamp() where id = ?`, [id]);
}
export async function unpublish(dbClient : db.Client, id : number) {
    await db.query(dbClient, `update blog_posts set pub_date = null where id = ?`, [id]);
}

export async function getAll(dbClient : db.Client, start : number, end : number) : Promise<Row[]> {
    return db.selectAll(dbClient, `select bp.id,author,title,slug,blurb,image,pub_date,upd_date,u.human_name as author_name
        from blog_posts bp,users u where u.id = bp.author order by upd_date desc limit ?,?`, [start, end]);
}
export async function getAllPublished(dbClient : db.Client, start : number, end : number) : Promise<Row[]> {
    return db.selectAll(dbClient, `
        (select image,title,blurb,link,upd_date,upd_date as pub_date,null as author_name from homepage_links)
        union
        (select image,title,blurb, concat('/blog/', bp.id, '-', slug) as link,upd_date,pub_date,u.human_name as author_name
            from blog_posts bp,users u where u.id = bp.author and pub_date is not null)
        order by upd_date desc limit ?,?`, [start, end]);
}

export async function getHomePage(dbClient : db.Client) : Promise<HomePageLinkRow[]> {
    return db.selectAll(dbClient,
        `(select image,title,blurb,link,upd_date as sort_key from homepage_links)
        union
            (select image,title,blurb, concat('/blog/', bp.id, '-', slug) as link,upd_date as sort_key
            from blog_posts bp,users u where u.id = bp.author and pub_date is not null
            and in_homepage)
        order by sort_key desc limit 3`);
}

export async function getForView(dbClient : db.Client, id : number) : Promise<Row & { author_name : string }> {
    return db.selectOne(dbClient, `select bp.id,author,title,slug,image,pub_date,upd_date,body,u.human_name as author_name from blog_posts bp,users u where u.id = bp.author and bp.id = ?`, [id]);
}

export async function getForEdit(dbClient : db.Client, id : number) : Promise<Row> {
    return db.selectOne(dbClient, `select * from blog_posts where id = ?`, [id]);
}
