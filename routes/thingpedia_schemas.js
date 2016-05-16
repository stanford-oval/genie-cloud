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
const model = require('../model/schema');

const EngineManager = require('../lib/enginemanager');

var router = express.Router();

router.get('/by-id/:kind', function(req, res) {
    db.withClient(function(dbClient) {
        return model.getTypesAndMetaByKind(dbClient, req.params.kind);
    }).then(function(rows) {
        if (rows.length === 0)
            throw new Error('Not Found');

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
                                          triggers: types.triggers,
                                          actions: types.actions,
                                          queries: types.queries,
                                          kind: rows[0].kind,
                                          developer_version: rows[0].developer_version });
    }).catch(function(e) {
        res.status(400).render('error', { page_title: "ThingPedia - Error",
                                          message: e });
    }).done();
});

module.exports = router;
