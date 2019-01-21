// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// compute the shard of a user, based on a simple hashing scheme

module.exports = function shard(userId, nShards) {
    // in theory, we could just do userId % nShards
    // because userIds are assigned sequentially
    // so that would be balanced
    //
    // in practice

    // randomize the userId a bit

    userId += 33;
    userId *= 7;
    userId += 33;
    userId *= 7;

    return userId % nShards;
};
