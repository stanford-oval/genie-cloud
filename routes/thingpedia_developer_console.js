// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const path = require('path');
const lunr = require('lunr');
require("lunr-languages/lunr.stemmer.support")(lunr);

const db = require('../util/db');
const organization = require('../model/organization');
const device = require('../model/device');
const oauth2 = require('../model/oauth2');
const userModel = require('../model/user');
const user = require('../util/user');
const SendMail = require('../util/sendmail');
const iv = require('../util/input_validation');
const { tokenize } = require('../util/tokenize');

const Config = require('../config');

const EngineManager = require('../almond/enginemanagerclient');

var router = express.Router();

const HAS_ABOUT_GET_INVOLVED = Config.EXTRA_ABOUT_PAGES.some((p) => p.url === 'get-involved');

router.get('/', (req, res, next) => {
    if (!req.user || !req.user.developer_org) {
        if (HAS_ABOUT_GET_INVOLVED)
            res.redirect('/about/get-involved');
        else
            res.redirect('/user/request-developer');
        return;
    }

    db.withTransaction((dbClient) => {
        return Promise.all([
            organization.get(dbClient, req.user.developer_org),
            organization.getMembers(dbClient, req.user.developer_org),
            organization.getInvitations(dbClient, req.user.developer_org),
            device.getByOwner(dbClient, req.user.developer_org)]);
    }).then(([developer_org, developer_org_members, developer_org_invitations, developer_devices]) => {
        res.render('thingpedia_dev_overview', { page_title: req._("Thingpedia - Developer Portal"),
                                                csrfToken: req.csrfToken(),
                                                developer_org,
                                                developer_org_members,
                                                developer_org_invitations,
                                                developer_devices,
        });
    }).catch(next);
});

router.get('/oauth', user.requireLogIn, user.requireDeveloper(), (req, res, next) => {
    db.withClient((dbClient) => {
        return oauth2.getClientsByOwner(dbClient, req.user.developer_org);
    }).then((developer_oauth2_clients) => {
        res.render('thingpedia_dev_oauth', { page_title: req._("Thingpedia - OAuth 2.0 Applications"),
                                             csrfToken: req.csrfToken(),
                                             developer_oauth2_clients: developer_oauth2_clients
        });
    }).catch(next);
});

router.post('/organization/add-member', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ORG_ADMIN), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const [row] = await userModel.getByName(dbClient, req.body.username);
        try {
            if (!row)
                throw new Error(req._("No such user %s").format(req.body.username));
            if (row.developer_org !== null)
                throw new Error(req._("%s is already a member of another developer organization.").format(req.body.username));
            if (!row.email_verified)
                throw new Error(req._("%s has not verified their email address yet.").format(req.body.username));
        } catch(e) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: e });
            return false;
        }
        // check if the user was already invited to this org
        // if so, we do nothing, silently
        const [invitation] = await organization.findInvitation(dbClient, req.user.developer_org, row.id);
        if (invitation)
            return true;

        const org = await organization.get(dbClient, req.user.developer_org);

        let developerStatus = parseInt(req.body.developer_status);
        if (isNaN(developerStatus) || developerStatus < 0)
            developerStatus = 0;
        if (developerStatus > user.DeveloperStatus.ORG_ADMIN)
            developerStatus = user.DeveloperStatus.ORG_ADMIN;

        await sendInvitationEmail(req.user, org, row);
        await organization.inviteUser(dbClient, req.user.developer_org, row.id, developerStatus);
        return true;
    }).then((ok) => {
        if (ok)
            res.redirect(303, '/thingpedia/developers');
    }).catch(next);
});

async function sendInvitationEmail(fromUser, org, toUser) {
    const mailOptions = {
        from: Config.EMAIL_FROM_USER,
        to: toUser.email,
        subject: 'You are invited to join a Thingpedia developer organization',
        text:
`Hello!

${fromUser.human_name || fromUser.username} is inviting you to join the “${org.name}” developer organization.
To accept, click here:
<${Config.SERVER_ORIGIN}/thingpedia/developers/organization/accept-invitation/${org.id_hash}>

----
You are receiving this email because this address is associated
with your Almond account.
`
    };

    return SendMail.send(mailOptions);
}

router.get('/organization/accept-invitation/:id_hash', user.requireLogIn, (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        let org, invitation;
        try {
            if (req.user.developer_org !== null)
                throw new Error(req._("You are already a member of another developer organization."));

            org = await organization.getByIdHash(dbClient, req.params.id_hash);

            [invitation] = await organization.findInvitation(dbClient, org.id, req.user.id);
            if (!invitation)
                throw new Error(req._("The invitation is no longer valid. It might have expired or might have been rescinded by the organization administrator."));
        } catch(e) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: e });
            return [null, null];
        }

        await userModel.update(dbClient, req.user.id, {
            developer_status: invitation.developer_status,
            developer_org: org.id
        });
        await organization.rescindAllInvitations(dbClient, req.user.id);
        return [req.user.id, org.name];
    }).then(async ([userId, orgName]) => {
        if (userId !== null) {
            await EngineManager.get().restartUser(userId);
            res.render('message', {
                page_title: req._("Thingpedia - Developer Invitation"),
                message: req._("You're now a member of the %s organization.").format(orgName)
            });
        }
    }).catch(next);
});

router.post('/organization/rescind-invitation', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ORG_ADMIN), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const [row] = await userModel.getByCloudId(dbClient, req.body.user_id);
        try {
            if (!row)
                throw new Error(req._("No such user"));
        } catch(e) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: e });
            return false;
        }

        await organization.rescindInvitation(dbClient, req.user.developer_org, row.id);
        return true;
    }).then((ok) => {
        if (ok)
            res.redirect(303, '/thingpedia/developers');
    }).catch(next);
});

router.post('/organization/remove-member', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ORG_ADMIN), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const users = await userModel.getByCloudId(dbClient, req.body.user_id);
        try {
            if (users[0].cloud_id === req.user.cloud_id)
                throw new Error(req._("You cannot remove yourself from your developer organization."));
            if (users.length === 0)
                throw new Error(req._("No such user"));
            if (users[0].developer_org !== req.user.developer_org)
                throw new Error(req._("The user is not a member of your developer organization."));
        } catch(e) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: e });
            return null;
        }

        await userModel.update(dbClient, users[0].id, {
            developer_status: 0,
            developer_org: null
        });
        return users[0].id;
    }).then(async (userId) => {
        if (userId !== null) {
            await EngineManager.get().restartUserWithoutCache(userId);
            res.redirect(303, '/thingpedia/developers');
        }
    }).catch(next);
});

router.post('/organization/promote', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ORG_ADMIN), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const users = await userModel.getByCloudId(dbClient, req.body.user_id);
        try {
            if (users.length === 0)
                throw new Error(req._("No such user"));
            if (users[0].developer_org !== req.user.developer_org)
                throw new Error(req._("The user is not a member of your developer organization."));
        } catch(e) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: e });
            return false;
        }
        if (users[0].developer_status >= user.DeveloperStatus.ORG_ADMIN)
            return true;

        await userModel.update(dbClient, users[0].id, {
            developer_status: users[0].developer_status + 1,
        });
        return true;
    }).then((ok) => {
        if (ok)
            res.redirect(303, '/thingpedia/developers');
    }).catch(next);
});

router.post('/organization/demote', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ORG_ADMIN), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const users = await userModel.getByCloudId(dbClient, req.body.user_id);
        try {
            if (users[0].cloud_id === req.user.cloud_id)
                throw new Error(req._("You cannot demote yourself."));
            if (users.length === 0)
                throw new Error(req._("No such user"));
            if (users[0].developer_org !== req.user.developer_org)
                throw new Error(req._("The user is not a member of your developer organization."));
        } catch(e) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: e });
            return false;
        }
        if (users[0].developer_status <= 0)
            return true;

        await userModel.update(dbClient, users[0].id, {
            developer_status: users[0].developer_status - 1,
        });
        return true;
    }).then((ok) => {
        if (ok)
            res.redirect(303, '/thingpedia/developers');
    }).catch(next);
});

router.post('/organization/edit-profile', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ORG_ADMIN),
    iv.validatePOST({ name: 'string' }), (req, res, next) => {
    for (let token of tokenize(req.body.name)) {
        if (['stanford', 'almond'].indexOf(token) >= 0) {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("You cannot use the word “%s” in your organization name.").format(token) });
            return;
        }
    }

    db.withTransaction((dbClient) => {
        return organization.update(dbClient, req.user.developer_org, { name: req.body.name });
    }).then(() => {
        res.redirect(303, '/thingpedia/developers');
    }).catch(next);
});


router.get('/train', (req, res) => {
    res.render('thingpedia_dev_train_almond', { page_title: req._("Thingpedia - Train Almond"), csrfToken: req.csrfToken() });
});

router.get('/status', (req, res) => {
    res.redirect('/me/status');
});

for (let doc of require('../doc/doc-list.json')) {
    router.get('/' + doc + '.md', (req, res, next) => {
        res.render('doc_' + doc, {
            page_title: req._("Thingpedia - Documentation"),
            currentPage: doc
        });
    });
}

const searchIndex = require('../doc/fts.json');
searchIndex.index = lunr.Index.load(searchIndex.index);
function highlightSearch(url, metadata) {
    const terms = [];
    let minIndex = Infinity;
    let maxIndex = -Infinity;
    for (let term in metadata) {
        if (metadata[term].content) {
            terms.push(term);
            for (let pos of metadata[term].content.position) {
                minIndex = Math.min(pos[0], minIndex);
                maxIndex = Math.max(pos[1]+pos[0], maxIndex);
            }
        }
    }
    
    const content = searchIndex.documents[url].content;
    if (!terms.length)
        return content;
    
    const trimLeft = minIndex > 10;
    
    const trimmedText = (trimLeft ? '...' : '') +
        content.substring(minIndex-10);
        
    return trimmedText.replace(new RegExp('\\b(?:' + terms.join('|') + ')\\b', 'ig'),
                               (w) => `<mark>${escape(w)}</mark>`);
}

router.get('/search', iv.validateGET({ q: 'string' }, { json: true }), (req, res) => {
    const results = searchIndex.index.search(req.query.q);
    const data = [];
    for (let i = 0; i < Math.min(5, results.length); i++) {
        const result = results[i];
        data.push({
            url: result.ref,
            score: result.score,
            highlight: highlightSearch(result.ref, result.matchData.metadata)
        });
    }
    
    res.cacheFor(86400);
    res.json({
        result: 'ok',
        data
    });
});

router.use('/thingpedia-api', express.static(path.join(__dirname, '../doc/thingpedia-api')));

module.exports = router;
