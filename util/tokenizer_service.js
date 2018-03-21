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

const Config = require('../config');

module.exports = {
    tokenize(language, sentence) {
        let url = Config.SEMPRE_URL + '/' + language + '/tokenize?q=' + encodeURIComponent(sentence);
        console.log(url);
        return Tp.Helpers.Http.get(url).then((result) => JSON.parse(result));
    }
};