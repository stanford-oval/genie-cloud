// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const fs = require('fs');
const csv = require('csv');

const db = require('../util/db');
const tokenize = require('../util/tokenize');

/**
    frequently appearing tokens in the company stock dataset
     41 bancshares
     41 index
     41 technology
     43 ishares
     47 trust
     48 energy
     49 incorporated
     51 capital
     52 limited
     58 systems
     64 fund
     66 first
     69 pharmaceuticals
     78 technologies
     79 company
     83 holdings
     87 international
    120 ltd
    125 group
    137 financial
    144 corp
    159 bancorp
    471 corporation
*/
const IGNORED_WORDS = new Set(["in", "is", "of", "or", "not", "at", "as", "by", "my", "i", "from", "for", "an",
    "on", "a", "to", "with", "and", "when", "notify", "monitor", "it",
    "me", "the", "if", "abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwz",

    "bancshares", "index", "technology", "ishares", "trust", "energy", "incorporated", "capital",
    "limited", "systems", "fund", "first", "pharmaceuticals", "technologies", "company", "holdings",
    "international", "ltd", "group", "financial", "corp", "bancorp", "corporation"]);

var insertBatch = [];

function insert(dbClient, language, token, entityId, entityValue, entityCanonical, entityName) {
    insertBatch.push([language, token, entityId, entityValue, entityCanonical, entityName]);
    if (insertBatch.length < 100)
        return Promise.resolve();

    var batch = insertBatch;
    insertBatch = [];
    return db.insertOne(dbClient,
        "insert ignore into entity_lexicon(language,token,entity_id,entity_value,entity_canonical,entity_name) values ?", [batch]);
}
function finishBatch(dbClient) {
    if (insertBatch.length === 0)
        return Promise.resolve();
    return db.insertOne(dbClient,
        "insert ignore into entity_lexicon(language,token,entity_id,entity_value,entity_canonical,entity_name) values ?", [insertBatch]);
}

function main() {
  var file = process.argv[2];
  var language = process.argv[3] || 'en';
  var entityType = process.argv[4];
  if (!entityType)
    throw new Error('Missing entity type');

  var fstream = fs.createReadStream(file);
  fstream.setEncoding('utf8');
  //var parser = csv.parse({ columns: null });
  var parser = csv.parse();
  fstream.pipe(parser);

  /*var leagueToEntity = {
    'NBA': 'sportradar:nba_team',
    'MLB': 'sportradar:mlb_team',
    'NCAA-FB': 'sportradar:ncaafb_team',
    'NCAA-MB': 'sportradar:ncaambb_team',
    'NFL': 'sportradar:nfl_team',
    'SOCCER-EU': 'sportradar:eu_soccer_team',
    'SOCCER-US': 'sportradar:us_soccer_team'
  };*/

  db.withTransaction((dbClient) => {
    var promises = [];
    return Q.Promise((callback, errback) => {
      parser.on('data', (row) => {
        //var league = row[0];
        console.log(row);
        var id = row[0].trim();
        var name = row[1];

        var tokens = tokenize.tokenize(name);
        var canonical = tokens.join(' ');
        for (var t of tokens) {
          t = t.trim();
          if (IGNORED_WORDS.has(t))
            continue;
          if (t.length < 2)
            continue;

          //console.log(language + '\t' + entityType + '\t' + id + '\t' + t + '\t' + canonical + '\t' + name);
          promises.push(insert(dbClient, language, t, entityType, id, canonical, name));
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
