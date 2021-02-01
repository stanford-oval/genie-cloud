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

function escapeInferenceName(s) {
    let escaped = '';
    for  (let c of s) {
        if (c === '0') {
            escaped += '00';
            continue;
        }
        if (/[a-z0-9]/.test(c)) {
            escaped += c;
            continue;
        }
        escaped += '0' + c.charCodeAt(0).toString(16);
    }
    return escaped;
}

function getKfInferenceUrl(id, namespace) {
    const escapedId = escapeInferenceName(id);
    return `http://${escapedId}.${namespace}.svc.cluster.local/v1/models/${escapedId}:predict`;
}

module.exports = function kfInferenceUrl(id, namespace) {
    return getKfInferenceUrl(id, namespace);
};
