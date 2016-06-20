// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details

const Q = require('q');

const ThingTalk = require('thingtalk');
const AppCompiler = ThingTalk.Compiler;
const SchemaRetriever = ThingTalk.SchemaRetriever;

const db = require('../util/db');
const model = require('../model/app');
const ThingPediaClient = require('../util/thingpedia-client');

var _schemaRetriever = new SchemaRetriever(new ThingPediaClient());

function compileApp(code) {
    var compiler = new AppCompiler();

    return Q.try(function() {
        compiler.setSchemaRetriever(_schemaRetriever);
        return compiler.compileCode(code);
    }).then(function() {
        if (compiler.feedAccess)
            return compiler.name + '[F]';
        else
            return compiler.name;
    });
}

function main() {
    db.withTransaction(function(dbClient) {
        return model.getAll(dbClient, null).then(function(apps) {
            return Q.all(apps.map(function(a) {
                if (a.app_id)
                    return;

                return compileApp(a.code).then(function(appId) {
                    return model.update(dbClient, a.id, { app_id: appId });
                }).catch(function(e) {
                    console.log('Compiling of ' + a.id + ' (' + a.name + ') failed: ' + e.message);
                });
            }));
        });
    }).finally(() => { process.exit(); }).done();
}

main();
