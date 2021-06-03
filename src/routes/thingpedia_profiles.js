// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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

import express from 'express';
import * as crypto from 'crypto';

import * as db from '../util/db';
import * as orgModel from '../model/organization';
import * as userModel from '../model/user';
import * as deviceModel from '../model/device';

import * as user from '../util/user';

let router = express.Router();

router.get('/organization/:id_hash', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const org = await orgModel.getByIdHash(dbClient, req.params.id_hash);
        const [members, devices] = await Promise.all([
            userModel.getByDeveloperOrg(dbClient, org.id),
            deviceModel.getAllApprovedByOwner(dbClient, org.id)
        ]);
        res.render('public_org_profile', {
            page_title: req._("Almond - Developer Organization"),
            organization: org,
            members: members.filter((m) => !!(m.profile_flags & user.ProfileFlags.VISIBLE_ORGANIZATION_PROFILE)),
            devices
        });
    }).catch((e) => {
        if (e.code === 'ENOENT') {
            res.status(404).render('error', {
                page_title: req._("Almond - Not Found"),
                message: req._("The requested organization does not exist.")
            });
        } else {
            throw e;
        }
    }).catch(next);
});

function md5(x) {
    const hash = crypto.createHash('md5');
    hash.update(x);
    return hash.digest().toString('hex').toLowerCase();
}

router.get('/user/:cloud_id', (req, res, next) => {
    db.withClient(async (dbClient) => {
        const profile = await userModel.getByCloudIdForProfile(dbClient, req.params.cloud_id);

        const emailHash = profile.profile_flags & user.ProfileFlags.SHOW_PROFILE_PICTURE ?
            md5((profile.email || '').trim().toLowerCase()) :
            '00000000000000000000000000000000';
        profile.profile_pic_url = `https://www.gravatar.com/avatar/${emailHash}?s=250&d=mp`;

        res.render('public_user_profile', {
            page_title: req._("Almond - Public Profile of %s").format(user.username),
            profile,
        });
    }).catch((e) => {
        if (e.code === 'ENOENT') {
            res.status(404).render('error', {
                page_title: req._("Almond - Not Found"),
                message: req._("The requested user does not exist.")
            });
        } else {
            throw e;
        }
    }).catch(next);
});

export default router;
