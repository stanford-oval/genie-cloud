// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

module.exports = {
    getAll(client) {
        return db.selectAll(client, "select * from models");
    },

    getForLanguage(client, language) {
        return db.selectAll(client, "select * from models where language = ?", [language]);
    },
};
