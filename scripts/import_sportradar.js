// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const fs = require('fs');
const csv = require('csv');

const Tp = require('thingpedia');

const db = require('../util/db');
const tokenize = require('../util/tokenize');

const IGNORED_WORDS = new Set(["in", "is", "of", "or", "not", "at", "as", "by", "my", "i", "from", "for", "an",
    "on", "a", "to", "with", "and", "when", "notify", "monitor", "it",
    "me", "the", "if", "abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwz",

    "fc", "state", "college"]);

var insertBatch = [];

function makeType(testTrain, primCompound, nparams) {
    //return (testTrain === 'test' ? 'test' : 'turking') + '-' + (primCompound === 'compound' ? 'compound' : 'prim') + nparams;
    return 'test' + '-' + (primCompound === 'compound' ? 'compound' : 'prim') + nparams;
}

function insert(dbClient, language, token, entityId, entityValue, entityCanonical, entityName) {
    insertBatch.push([language, token, entityId, entityValue, entityCanonical, entityName]);
    if (insertBatch.length < 100)
        return;

    var batch = insertBatch;
    insertBatch = [];
    return db.insertOne(dbClient,
        "insert ignore into entity_lexicon(language,token,entity_id,entity_value,entity_canonical,entity_name) values ?", [batch]);
}
function finishBatch(dbClient) {
    if (insertBatch.length === 0)
        return;
    return db.insertOne(dbClient,
        "insert ignore into entity_lexicon(language,token,entity_id,entity_value,entity_canonical,entity_name) values ?", [insertBatch]);
}

function main() {
  var file = process.argv[2];
  var language = process.argv[3] || 'en';

  var fstream = fs.createReadStream(file);
  fstream.setEncoding('utf8');
  var parser = csv.parse({ columns: null });
  fstream.pipe(parser);

  var leagueToEntity = {
    'NBA': 'sportradar:nba_team',
    'MLB': 'sportradar:mlb_team',
    'NCAA-FB': 'sportradar:ncaafb_team',
    'NCAA-MB': 'sportradar:ncaambb_team',
    'NFL': 'sportradar:nfl_team',
    'SOCCER-EU': 'sportradar:eu_soccer_team',
    'SOCCER-US': 'sportradar:us_soccer_team'
  };

  db.withTransaction(function(dbClient) {
    var promises = [];
    return Q.Promise(function(callback, errback) {
      parser.on('data', (row) => {
        var league = row[0];
        var id = row[1].trim();
        var name = row[2];

        var tokens = tokenize.tokenize(name);
        var canonical = tokens.join(' ');
        for (var t of tokens) {
          if (IGNORED_WORDS.has(t))
            continue;
          if (t.length < 2)
            continue;

          //console.log(language + ',' + leagueToEntity[league] + ',' + id + ',' + t + ',' + canonical + ',' + name);
          promises.push(insert(dbClient, language, t, leagueToEntity[league], id.toLowerCase(), canonical, name));
        }
      });
      parser.on('end', callback);
      parser.on('error', errback);
    })
    .then(() => Q.all(promises))
    .then(() => finishBatch(dbClient));
  }).then(() => process.exit()).done();
}
main();
