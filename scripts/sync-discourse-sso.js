// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Tp = require('thingpedia');
const DiscourseSSO = require('discourse-sso');

const model = require('../model/user');
const db = require('../util/db');
const userUtils = require('../util/user');

const Config = require('../config');

module.exports = {
    initArgparse(subparsers) {
        const parser = subparsers.addParser('sync-discourse-sso', {
            description: 'Create a Discourse user for an existing Almond user'
        });

        parser.addArgument(['username'], {
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
