// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// See COPYING for details
"use strict";

const express = require('express');

const db = require('../util/db');
const commandModel = require('../model/example');
const iv = require('../util/input_validation');
const userUtils = require('../util/user');
const { validatePageAndSize } = require('../util/pagination');
const I18n = require('../util/i18n');
const { getCommandDetails } = require('../util/commandpedia');

let router = express.Router();

router.post('/suggest', iv.validatePOST({ description: 'string' }), (req, res, next) => {
    let command = req.body['description'];
    db.withTransaction((dbClient) => {
        return commandModel.suggest(dbClient, command);
    }).then(() => {
        return res.redirect(303, '/');
    }).catch(next);
});

router.get('/all', iv.validateGET({ page: '?number', locale: '?string' }, { json: true }), (req, res, next) => {
    const [page, page_size] = validatePageAndSize(req, 9, 50);
    const language = I18n.localeToLanguage(req.locale);

    db.withTransaction(async (client) => {
        let commands;
        if (userUtils.isAuthenticated(req))
            commands = await commandModel.getCommandsForUser(client, language, req.user.id, page * page_size, page_size);
        else
            commands = await commandModel.getCommands(client, language, page * page_size, page_size);

        getCommandDetails(req.gettext, commands);
        res.cacheFor(30 * 1000);
        res.json({ result: 'ok', data: commands });
    }).catch(next);
});

router.get('/search', iv.validateGET({ q: 'string', page: '?number', locale: '?string' }, { json: true }), (req, res, next) => {
    const q = req.query.q;
    const language = I18n.localeToLanguage(req.locale);

    db.withTransaction(async (client) => {
        let commands;
        if (userUtils.isAuthenticated(req))
            commands = await commandModel.getCommandsByFuzzySearchForUser(client, language, req.user.id, q);
        else
            commands = await commandModel.getCommandsByFuzzySearch(client, language, q);

        getCommandDetails(req.gettext, commands);
        res.cacheFor(30 * 1000);
        res.json({ result: 'ok', data: commands });
    }).catch(next);
});

module.exports = router;
