"use strict";

const express = require('express');
const { BadRequestError } = require('../util/errors');
const EngineManager = require('../almond/enginemanagerclient');
const user = require('../util/user');

const router = express.Router();

router.get('/', (req, res, next) => {

    const redirect_address = req.query.redirect;
    const kind = req.query.kind;

    if (!redirect_address || !kind) {
        throw new BadRequestError(req._("Invalid Query"));

    } else {
        req.session.redirect = redirect_address;
        req.session.kind = kind;
        res.render('proxy_confirmation', {
            page_title: req._("Oauth Confirmation"),
            redirect_address: redirect_address,
            kind: kind
        });
    }

});

router.post('/oauth2', (req, res, next) => {
    const kind = req.body.device_type;
    user.getAnonymousUser(req.locale).then((new_user) => {
        EngineManager.get().getEngine(new_user.id).then(async (engine) => {
            const [redirect, session] = await engine.startOAuth(kind);
            for (const key in session)
                 req.session[key] = session[key];
            res.redirect(303, redirect);
        }).catch((e) => {
            res.status(400).render('error', {
                page_title: req._("Thingpedia - Error"),
                message: e
            });
        }).catch(next);
    });

});

module.exports = router;
