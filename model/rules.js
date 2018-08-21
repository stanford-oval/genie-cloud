// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

module.exports = {
    getAll(client) {
        return db.selectAll(client, "select * from example_utterances where language = 'en' limit 6");
    },

    getOne(client, ruleId) {
        return db.selectOne(client, "select * from example_utterances where id = ?", [ruleId]);
    }
};
