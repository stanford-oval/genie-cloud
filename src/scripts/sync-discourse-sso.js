// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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


const Tp = require('thingpedia');
const DiscourseSSO = require('discourse-sso');

const model = require('../model/user');
const db = require('../util/db');
const userUtils = require('../util/user');

const Config = require('../config');

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.add_parser('sync-discourse-sso', {
            description: 'Create a Discourse user for an existing Almond user'
        });

        parser.add_argument('username', {
            help: 'The Almond user for which a new Discourse user will be created'
        });
    },

    async main(argv) {
        const sso = new DiscourseSSO(Config.DISCOURSE_SSO_SECRET);

        const user = (await db.withClient((dbClient) => {
            return model.getByName(dbClient, argv.username);
        }))[0];
        if (!user)
            throw new Error(`No such user ${argv.username}`);

        const payload = {
            nonce: '',
            external_id: user.cloud_id,
            email: user.email,
            username: user.username,
            name: user.human_name,
            admin: (user.roles & userUtils.Role.DISCOURSE_ADMIN) === userUtils.Role.DISCOURSE_ADMIN
        };
        console.log(payload);

        await Tp.Helpers.Http.post('https://community.almond.stanford.edu/admin/users/sync_sso',
            sso.buildLoginString(payload) + '&api_username=root&api_key=' + Config.DISCOURSE_API_KEY, {
            dataContentType: 'application/x-www-form-urlencoded'
        });

        await db.tearDown();
    }
};
