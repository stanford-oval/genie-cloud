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

const Config = require('../config');

// If you change this file, you must also change model/user.js:getAllForShardId
module.exports = function userToShardId(userId) {
    const nShards = Config.THINGENGINE_MANAGER_ADDRESS.length;

    // this sharding is not perfect (it can cause the number of developer
    // users to be unbalanced), but it is close enough and it is simple
    // to implement
    // if that turns out to be a problem, we can switch to shard based
    // on cloud_id, which is a guaranteed unique number
    return userId % nShards;
}
