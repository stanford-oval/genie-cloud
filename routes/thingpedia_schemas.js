// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const express = require('express');
const passport = require('passport');

const db = require('../util/db');
const user = require('../util/user');
const model = require('../model/schema');

var router = express.Router();

router.get('/by-id/:kind', function(req, res) {
    db.withClient(function(dbClient) {
        return model.getMetasByKinds(dbClient, req.params.kind, req.user ? req.user.developer_org : null);
    }).then(function(rows) {
        if (rows.length === 0) {
            res.status(404).render('error', { page_title: "ThingPedia - Error",
                                              message: 'Not Found' });
            return;
        }

        var types = { triggers: [], queries: [], actions: [] };

        function doOne(what, id) {
            for (var name in rows[0].types[id]) {
                var obj = {
                    name: name,
                    schema: rows[0].types[id][name]
                };
                if (name in rows[0].meta[id]) {
                    obj.params = rows[0].meta[id][name].args;
                    obj.doc = rows[0].meta[id][name].doc;
                } else {
                    obj.params = obj.schema.map(function(_, i) {
                        return 'arg' + (i+1);
                    });
                    obj.doc = '';
                }
                types[what].push(obj);
            }
        }

        doOne('triggers', 0);
        doOne('actions', 1);
        doOne('queries', 2);
        res.render('thingpedia_schema', { page_title: 'ThingPedia - Schema detail',
                                          csrfToken: req.csrfToken(),
                                          schema: rows[0],
                                          triggers: types.triggers,
                                          actions: types.actions,
                                          queries: types.queries });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/approve/:id', user.requireLogIn, user.requireDeveloper(user.DeveloperStatus.ADMIN), function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(schema) {
            if (schema.kind_type !== 'other')
                throw new Error('This schema is associated with a device and should not be manipulated directly');
            return model.approve(dbClient, req.params.id).then(function() {
                res.redirect(303, '/thingpedia/schemas/by-id/' + schema.kind);
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

router.post('/delete/:id', user.requireLogIn, user.requireDeveloper(),  function(req, res) {
    db.withTransaction(function(dbClient) {
        return model.get(dbClient, req.params.id).then(function(row) {
            if (row.kind_type !== 'other')
                throw new Error('This schema is associated with a device and should not be manipulated directly');
            if (row.owner !== req.user.developer_org && req.user.developer_status < user.DeveloperStatus.ADMIN) {
                res.status(403).render('error', { page_title: "ThingPedia - Error",
                                                  message: "Not Authorized" });
                return;
            }

            return model.delete(dbClient, req.params.id).then(function() {
                res.redirect(303, '/thingpedia/devices');
            });
        });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e.message });
    }).done();
});

module.exports = router;
