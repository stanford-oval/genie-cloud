// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details

require('thingengine-core/lib/polyfill');

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
        return compiler;
    });
}

function main() {
    db.withTransaction(function(dbClient) {
        return model.getAll(dbClient, null).then(function(apps) {
            return Q.all(apps.map(function(a) {
                return compileApp(a.code).then(function(compiler) {
                    var nSabrinaInput = 0, nOtherInput = 0, nKeywordInput = 0, nTrueInput = 0;

                    compiler.rules.forEach(function(rule) {
                        if (rule.inputs.invocation !== null) {
                            var selector = rule.inputs.invocation.selector;
                            if (selector.isGlobalName && selector.name === 'sabrina'
                                && rule.inputs.invocation.name === 'listen')
                                nSabrinaInput++;
                            else
                                nOtherInput++;
                        } else if (rule.inputs.keywords.length > 0) {
                            nKeywordInput++;
                        } else {
                            nTrueInput++;
                        }
                    });
                    //console.log('%d: (%d, %d, %d, %d)'.format(a.id, nSabrinaInput, nOtherInput, nKeywordInput, nTrueInput));

                    if (nTrueInput > 0)
                        console.log('App ' + a.id + ' (' + a.name + ') uses true =>');

                    if (nSabrinaInput === 1 && nOtherInput === 0)
                        console.log('App ' + a.id + ' (' + a.name + ') is single command');

                    if (nSabrinaInput > 1 && nOtherInput === 0)
                        console.log('App ' + a.id + ' (' + a.name + ') is multi command');
                }).catch(function(e) {
                    console.log('Compiling of ' + a.id + ' (' + a.name + ') failed: ' + e.message);
                });
            }));
        });
    }).finally(() => { process.exit(); }).done();
}

main();
