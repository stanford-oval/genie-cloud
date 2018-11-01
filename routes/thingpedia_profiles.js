// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const crypto = require('crypto');

const db = require('../util/db');
const orgModel = require('../model/organization');
const userModel = require('../model/user');
const deviceModel = require('../model/device');

const user = require('../util/user');

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
    });
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
            md5((user.email || '').trim().toLowerCase()) :
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
    });
});

module.exports = router;
