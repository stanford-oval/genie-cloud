// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const Url = require('url');

const Messaging = require('./messaging');
const OmletFactory = require('./omlet');

module.exports = {
    phase1(req, res) {
        var client = OmletFactory();

        return Q.try(function() {
            client.connect();

            return Q.ninvoke(client._ldClient.auth, 'getAuthPage',
                             platform.getOrigin() + '/admin/assistant-setup/callback',
                             ['PublicProfile', 'OmletChat']);
        }).then(function(resp) {
            var parsed = Url.parse(resp.Link, true);
            req.session['omlet-query-key'] = parsed.query.k;
            res.redirect(resp.Link);
        }).finally(function() {
            return client.disable();
        });
    },

    phase2(req, res) {
        var client = OmletFactory();

        var code = req.query.code;
        var key = req.session['omlet-query-key'];

        return Q.Promise(function(callback, errback) {
            client.connect();

            client._ldClient.onSignedUp = callback;
            client._ldClient.auth.confirmAuth(code, key);
        }).finally(function() {
            client.disable();
        });
    }
}
