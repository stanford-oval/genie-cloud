// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

// Webhook abstraction, engine-side

const Q = require('q');
const lang = require('lang');

var _instance = null;

module.exports = new lang.Class({
    Name: 'WebhookDispatcher',

    _init: function() {
        _instance = this;

        this._clients = {};
    },

    addClient: function(cloudId, client) {
        this._clients[cloudId] = client;
    },

    removeClient: function(cloudId) {
        delete this._clients[cloudId];
    },

    dispatch: function(req, res) {
        var cloudId = req.params.cloud_id;
        var id = req.params.id;
        var payload = req.body;

        if (this._clients[cloudId]) {
            this._clients[cloudId].handleCallback(id, payload).then(function() {
                res.json({ result: 'ok' });
            }, function(err) {
                res.status(500).json({ error: err.message });
            }).done();
        } else {
            res.status(404).json({ error: 'Not Found' });
        }
    }
});

module.exports.get = function() {
    return _instance;
}
