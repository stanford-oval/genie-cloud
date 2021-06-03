// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
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
