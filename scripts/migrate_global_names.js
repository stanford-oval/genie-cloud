// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

require('thingengine-core/lib/polyfill');

const Q = require('q');
Q.longStackSupport = true;

const db = require('../util/db');

function getMigrateMaps(dbClient) {
    return db.selectAll(dbClient, `select primary_kind, global_name, ds1.id as global_schema_id,
ds2.id as primary_schema_id from device_class dc, device_schema ds1, device_schema ds2
where global_name is not null and ds2.kind = primary_kind and ds1.kind = global_name`, []).then((rows) => {
        let nameMap = new Map;
        let schemaIdMap = new Map;
        for (let row of rows) {
            schemaIdMap.set(row.global_schema_id, row.primary_schema_id);
            nameMap.set(row.global_name, row.primary_kind);
        }
        return [nameMap, schemaIdMap];
    });
}

function migrateThingpediaExamples(dbClient, schemaIdMap) {
    let migrations = Array.from(schemaIdMap.entries());

    return Q();
    return Q.all(migrations.map(([from, to]) => {
        return db.query(dbClient, `update example_utterances set schema_id = ? where schema_id = ?`, [to, from]);
    }));
}

function migrateLexicon(dbClient, schemaIdMap) {
    let migrations = Array.from(schemaIdMap.entries());

    return Q.all(migrations.map(([from, to]) =>
        db.query(dbClient, `update lexicon set schema_id = ? where schema_id = ?`, [to, from])));
}

function migrateLexicon2(dbClient, schemaIdMap) {
    let migrations = Array.from(schemaIdMap.entries());

    return Q.all(migrations.map(([from, to]) =>
        db.query(dbClient, `update lexicon2 set schema_id = ? where schema_id = ?`, [to, from])));
}

function migrateExampleRuleSchema(dbClient, schemaIdMap) {
    let migrations = Array.from(schemaIdMap.entries());

    return Q.all(migrations.map(([from, to]) =>
        db.query(dbClient, `update example_rule_schema set schema_id = ? where schema_id = ?`, [to, from])));
}

function processExample(dbClient, ex, nameMap) {
    let parsed = JSON.parse(ex.target_json);
    let changed = false;
    function processInvocation(inv) {
        if (!inv)
            return;
        let name = inv.name;
        if (typeof name === 'object')
            name = name.id || name.value;
        let match = /^(?:tt:)?(\$?[a-z0-9A-Z_.-]+)\.([a-z0-9A-Z_]+)$/.exec(name);
        if (match === null)
            throw new TypeError('Invalid selector ' + name + ' in example ' + ex.id);

        let [kind, channel] = [match[1], match[2]];
        if (nameMap.has(kind)) {
            inv.name = { id: 'tt:' + nameMap.get(kind) + '.' + channel }
            changed = true;
        }
    }

    if (parsed.setup) {
        if (parsed.setup.rule) {
            if (parsed.setup.rule.rule) {
                processInvocation(parsed.setup.rule.rule.trigger);
                processInvocation(parsed.setup.rule.rule.query);
                processInvocation(parsed.setup.rule.rule.action);
            } else {
                processInvocation(parsed.setup.rule.trigger);
                processInvocation(parsed.setup.rule.query);
                processInvocation(parsed.setup.rule.action);
            }
        } else {
            processInvocation(parsed.setup.trigger);
            processInvocation(parsed.setup.query);
            processInvocation(parsed.setup.action);
        }
    } else if (parsed.rule) {
        processInvocation(parsed.rule.trigger);
        processInvocation(parsed.rule.query);
        processInvocation(parsed.rule.action);
    } else {
        processInvocation(parsed.trigger);
        processInvocation(parsed.query);
        processInvocation(parsed.action);
    }
    if (!changed)
        return;

    return db.query(dbClient, `update example_utterances set target_json = ? where id = ?`, [JSON.stringify(parsed), ex.id]);
}

function migrateExamples(dbClient, nameMap) {
    return db.selectAll(dbClient, `select id, target_json from example_utterances order by id`).then((examples) => {
        let n = Math.ceil(examples.length / 100);
        function loop(i) {
            if (i === n+1)
                return Q();
            return batch(i).then(() => loop(i+1));
        }
        function batch(i) {
            console.log('Batch ' + i + '/' + n);
            let ex = examples.slice(i*100, i*100+100);
            return Q.all(ex.map((ex) => processExample(dbClient, ex, nameMap)));
        }
        return loop(0);
    });
}

function main() {
    db.withTransaction((dbClient) => {
        return getMigrateMaps(dbClient).then(([nameMap, schemaIdMap]) => {
            console.log('Obtained migration map');
            return migrateThingpediaExamples(dbClient, schemaIdMap).then(() => {
                console.log('Migrated Thingpedia examples');
                //return migrateExampleRuleSchema(dbClient, schemaIdMap);
            }).then(() => {
                console.log('Migrated example_rule_schema');
                //return migrateLexicon(dbClient, schemaIdMap);
            }).then(() => {
                console.log('Migrated lexicon');
               // return migrateLexicon2(dbClient, schemaIdMap);
            }).then(() => {
                console.log('Migrated lexicon2');
                return migrateExamples(dbClient, nameMap);
            });
        });
    }).then(() => process.exit()).done();
}
main();
