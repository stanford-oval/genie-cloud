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

var insertBatch = [];

function insert(dbClient, language, entityId, entityValue, entityCanonical, entityName) {
    insertBatch.push([language, entityId, entityValue, entityCanonical, entityName]);
    if (insertBatch.length < 100)
        return Promise.resolve();

    var batch = insertBatch;
    insertBatch = [];
    return db.insertOne(dbClient,
        "insert ignore into entity_lexicon(language,entity_id,entity_value,entity_canonical,entity_name) values ?", [batch]);
}
function finishBatch(dbClient) {
    if (insertBatch.length === 0)
        return Promise.resolve();
    return db.insertOne(dbClient,
        "insert ignore into entity_lexicon(language,entity_id,entity_value,entity_canonical,entity_name) values ?", [insertBatch]);
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
        promises.push(insert(dbClient, language, entityType, id, canonical, name));
      });
      parser.on('end', callback);
      parser.on('error', errback);
    })
    .then(() => Q.all(promises))
    .then(() => finishBatch(dbClient));
  }).then(() => process.exit()).done();
}
main();
