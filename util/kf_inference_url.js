// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2021 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";
const crypto = require('crypto');

function getKfInferenceUrl(id, namespace) {
    // kfserving infernce name have following limitations:
    //   * cannot be longer than 45 characters
    //   * can only contain alphnumeric (lower cased) and '-'
    //   * can only starts with an alphabet
    // To work around these limitations, we will:
    //   * escaped each nonsupported character with x{hex} 
    //   * replace '.' with '-' since '.' is quite common model name
    //   * if escaped name is longer than 45, trim the string to length 45 and replace
    //     the last 5 character with the first 5 character of its hash.
    let escapedId = id.replace(/[^a-wyz0-9\.]/g, (c) => 'x' + c.charCodeAt(0).toString(16));
    escapedId = escapedId.replace(/\./g, '-')
    if (escapedId.length > 45) {
        const digest = crypto.createHash('sha1');
        digest.update(id);
        escapedId = escapedId.substring(0, 40) +  digest.digest('hex').substring(0,5);
    }
    return `http://${escapedId}.${namespace}.svc.cluster.local/v1/models/${escapedId}:predict`;
}

module.exports = function kfInferenceUrl(id, namespace) {
    return getKfInferenceUrl(id, namespace);
};
