"use strict";

const express = require('express');
const Url = require('url');

const EngineManager = require('../almond/enginemanagerclient');
const user = require('../util/user');
const iv = require('../util/input_validation');

const router = express.Router();

router.get('/', iv.validateGET({ redirect: 'string', kind: 'string' }), (req, res, next) => {
    const redirect_address = req.query.redirect;
    const kind = req.query.kind;

    req.session.redirect = redirect_address;
    req.session.kind = kind;

    // show to the user only the hostname and optionally the port
    // because the path name and query are potentially ugly strings
    const parsed = Url.parse(redirect_address);

    res.render('proxy_confirmation', {
        page_title: req._("OAuth Confirmation"),
        redirect_address: parsed.host,
        kind: kind
    });
});

router.post('/oauth2', (req, res, next) => {
    const kind = req.body.device_type;
    user.getAnonymousUser().then((new_user) => {
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
