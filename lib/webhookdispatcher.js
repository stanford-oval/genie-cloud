// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// Webhook abstraction, engine-side

const Q = require('q');

var _instance = null;

module.exports = class WebhookDispatcher {
    constructor() {
        _instance = this;

        this._clients = {};
    }

    addClient(cloudId, client) {
        this._clients[cloudId] = client;
    }

    removeClient(cloudId) {
        delete this._clients[cloudId];
    }

    removeAllClients() {
        this._clients = {};
    }

    dispatch(req, res) {
        var cloudId = req.params.cloud_id;
        var id = req.params.id;

        if (this._clients[cloudId]) {
            this._clients[cloudId].handleCallback(id, req.method, req.query, req.headers, req.body).then(function(result) {
                if (result) {
                    if (result.contentType)
                        res.type(result.contentType);
                    res.status(result.code).send(result.response);
                } else {
                    res.status(200).json({ result: 'ok' });
                }
            }, function(err) {
                res.status(500).json({ error: err.message });
            }).done();
        } else {
            res.status(404).json({ error: 'Not Found' });
        }
    }

    static get() {
        return _instance;
    }
}
