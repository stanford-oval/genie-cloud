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

const Tp = require('thingpedia');

const net = require('net');
const JsonDatagramSocket = require('./json_datagram_socket');
const LocalTokenizerService = require('./local_tokenizer_service');

const Config = require('../config');

function tokenizeWithAlmondNL(language, sentence) {
    let url = Config.NL_SERVER_URL + '/' + language + '/tokenize?q=' + encodeURIComponent(sentence);
    return Tp.Helpers.Http.get(url).then((result) => JSON.parse(result));
}

let _localTokenizer = null;
function getLocalTokenizer() {
    if (_localTokenizer)
        return _localTokenizer;
    return _localTokenizer = new LocalTokenizerService();
}

function tokenizeLocal(language, sentence) {
    return getLocalTokenizer().tokenize(language, sentence);
}

module.exports = {
    tokenize(language, sentence) {
        if (process.env.THINGENGINE_USE_TOKENIZER === 'local')
            return tokenizeLocal(language, sentence);
        else
            return tokenizeWithAlmondNL(language, sentence);
    },

    tearDown() {
        if (_localTokenizer === null)
            return;
        _localTokenizer.end();
    }
};
