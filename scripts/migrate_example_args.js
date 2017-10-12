// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Mobisocial Stanford Lab <mobisocial@lists.stanford.edu>
//
// See COPYING for details

require('thingengine-core/lib/polyfill');

const Q = require('q');
const deq = require('deep-equal');
const db = require('../util/db');

const ThingTalk = require('thingtalk');
const SEMPRESyntax = ThingTalk.SEMPRESyntax;
const SchemaRetriever = require('./deps/schema_retriever');

const BATCH_SIZE = 100;

function normalizePrimitive(json) {
    json.args.sort((a, b) => {
        let aname = a.name.id;
        let bname = b.name.id;
        if (aname  < bname)
            return -1;
        if (aname > bname)
            return 1;
        return 0;
    });
    json.args.forEach((a) => {
        if (a.value.display === null)
            delete a.value.display;
    });
    if (!json.predicate)
        return;
    json.predicate.forEach((orExpr) => {
        orExpr.sort((a, b) => {
            let aname = a.name.id;
            let bname = b.name.id;
            if (aname  < bname)
                return -1;
            if (aname > bname)
                return 1;
            return 0;
        });
        orExpr.forEach((o) => {
            if (o.value.display === null)
                delete o.value.display;
        });
    });
}

function normalize(json) {
    if (json.rule)
        return normalize(json.rule);

    let fncount = 0;
    if (json.trigger) {
        normalizePrimitive(json.trigger);
        fncount ++;
    }
    if (json.query) {
        normalizePrimitive(json.query);
        fncount ++;
    }
    if (json.action) {
        normalizePrimitive(json.action);
        fncount ++;
    }
    if (fncount > 1)
        return {rule:json};
    else
        return json;
}

function processExample(dbClient, schemaRetriever, ex, state) {
    return Q.try(() => {
        let json = JSON.parse(ex.target_json);
        if (!json.rule && !json.trigger && !json.query && !json.action)
            return;
        // FIXME deal with "setup" and "predicate"

        normalizedJson = normalize(json);

        return SEMPRESyntax.parseToplevel(schemaRetriever, normalizedJson).then((prog) => {
            let newJson = normalize(SEMPRESyntax.toSEMPRE(prog));
            let newString = JSON.stringify(newJson);
            if (ex.target_json !== newString && !deq(newJson, normalizedJson)) {
                state.count ++;
                return db.query(dbClient, "update example_utterances set target_json = ? where id = ?", [newString, ex.id]);
            }
        });
    }).catch((e) => {
        console.error(ex.id + ': ' + e.message);
        //console.error(e.stack);
    });
}

function main() {
    const language = process.argv[2] || 'en';

    db.withClient((schemaClient) => {
        let schemaRetriever = new SchemaRetriever(schemaClient, language);

        let minId = 0;
        let done = false;
        return (function loop() {
            return db.withTransaction((dbClient) => {
                return db.selectAll(dbClient, "select id,target_json from example_utterances where id > ? and language = ? and type not in ('ifttt','obsolete') and is_base = 0 order by id asc limit ? for update", [minId, language, BATCH_SIZE])
                    .then((rows) => {
                        if (rows.length === 0) {
                            done = true;
                            return;
                        }
                        let maxId = minId;
                        for (let row of rows)
                            maxId = Math.max(row.id, maxId);
                        let state = { count: 0 };
                        return Q.all(rows.map((r) => processExample(dbClient, schemaRetriever, r, state))).then(() => {
                            console.log(`Processed batch from ${minId} to ${maxId} (${state.count} updates)`);
                            minId = maxId;
                        });
                    });
            }).then(() => {
                if (!done)
                    return loop();
            });
        })();
    }).then(() => {
        console.log('Done!');
        process.exit();
    }).done();
}
main();
