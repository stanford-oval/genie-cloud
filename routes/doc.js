// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const path = require('path');
const lunr = require('lunr');
require("lunr-languages/lunr.stemmer.support")(lunr);

const iv = require('../util/input_validation');

var router = express.Router();

for (let doc of require('../doc/doc-list.json')) {
    router.get('/' + doc + '.md', (req, res, next) => {
        res.render('doc_' + doc, {
            page_title: req._("Thingpedia - Documentation"),
            currentPage: doc
        });
    });
}

const searchIndex = require('../doc/fts.json');
searchIndex.index = lunr.Index.load(searchIndex.index);
function highlightSearch(url, metadata) {
    const terms = [];
    let minIndex = Infinity;
    let maxIndex = -Infinity;
    for (let term in metadata) {
        if (metadata[term].content) {
            terms.push(term);
            for (let pos of metadata[term].content.position) {
                minIndex = Math.min(pos[0], minIndex);
                maxIndex = Math.max(pos[1]+pos[0], maxIndex);
            }
        }
    }

    const content = searchIndex.documents[url].content;
    if (!terms.length)
        return content;

    const trimLeft = minIndex > 10;

    const trimmedText = (trimLeft ? '...' : '') +
        content.substring(minIndex-10);

    return trimmedText.replace(new RegExp('\\b(?:' + terms.join('|') + ')\\b', 'ig'),
                               (w) => `<mark>${escape(w)}</mark>`);
}

router.get('/search', iv.validateGET({ q: 'string' }, { json: true }), (req, res) => {
    // lgtm thinks will .search() is a RegExp method, but it's actually a lunr method
    // and there is no regex injection
    const results = searchIndex.index.search(req.query.q); // lgtm [js/regex-injection]
    const data = [];
    for (let i = 0; i < Math.min(5, results.length); i++) {
        const result = results[i];
        data.push({
            url: result.ref,
            score: result.score,
            highlight: highlightSearch(result.ref, result.matchData.metadata)
        });
    }

    res.cacheFor(86400);
    res.json({
        result: 'ok',
        data
    });
});

router.use('/thingpedia-api', express.static(path.join(__dirname, '../doc/thingpedia-api')));

module.exports = router;
