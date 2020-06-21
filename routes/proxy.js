"use strict";

const express = require('express');
var cookieParser = require('cookie-parser');
const secretKey = require('../util/secret_key');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const db = require('../util/db');
const { BadRequestError } = require('../util/errors');
const EngineManager = require('../almond/enginemanagerclient');
const user = require('../util/user');

const router = express.Router();

const sessionStore = new MySQLStore({
    expiration: 86400000 // 1 day, in ms
}, db.getPool());

router.use(cookieParser(secretKey.getSecretKey()));
router.use(session({ resave: false,
                        saveUninitialized: false,
                        store:sessionStore,
                        secret: secretKey.getSecretKey()}));

router.get('/',(req,res,next) => {

  const redirect_address = req.query.redirect;
  const kind = req.query.kind;

  if (!redirect_address || !kind) {
    throw new BadRequestError(req._("Invalid Query"));

  }else{
    req.session.redirect = redirect_address;
    req.session.kind = kind;
    res.render('proxy_confirmation', { page_title: req._("Oauth Confirmation"),redirect_address: redirect_address, kind: kind});
  }

});

router.get('/oauth2/:kind', (req, res, next) => {
    const kind = req.params.kind;
    user.getAnonymousUser().then((new_user) => {
        EngineManager.get().getEngine(new_user.id).then(async (engine) => {
            const result = await engine.devices.addFromOAuth(kind);
            if (result !== null) {

                const redirect = result[0];
                const session = result[1];
                for (var key in session)
                    req.session[key] = session[key];

                res.redirect(303, redirect);
            } else {
                res.redirect(303, '/me');
            }
        }).catch((e) => {
            res.status(400).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: e });
        }).catch(next);
    });


});


module.exports = router;
