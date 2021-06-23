// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
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

export const PARAM_REGEX = /\$(?:\$|([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_-]+))?})/;

export function* split(pattern : string, regexp : RegExp) {
    // a split that preserves capturing parenthesis

    const clone = new RegExp(regexp, 'g');
    let match = clone.exec(pattern);

    let i = 0;
    while (match !== null) {
        if (match.index > i)
            yield pattern.substring(i, match.index);
        yield match;
        i = clone.lastIndex;
        match = clone.exec(pattern);
    }
    if (i < pattern.length)
        yield pattern.substring(i, pattern.length);
}

export function stripUnsafeTokens(tokens : string[]) {
    const cleaned = [];

    for (const tok of tokens) {
        let safe = true;
        for (const char of ['?', '*', '.', '(', ')', '+', '\\']) {
            if (tok.indexOf(char) >= 0) {
                safe = false;
                break;
            }
        }

        if (safe)
            cleaned.push(tok);
    }

    return cleaned;
}

export function splitParams(utterance : string) {
    return Array.from(split(utterance, PARAM_REGEX));
}

export function clean(name : string) {
    if (/^[vwgpd]_/.test(name))
        name = name.substr(2);
    return name.replace(/_/g, ' ').replace(/([^A-Z])([A-Z])/g, '$1 $2').toLowerCase();
}

export function tokenize(string : string) {
    const tokens = string.split(/(\s+|[,."'!?])/g);
    return tokens.filter((t) => !(/^\s*$/).test(t)).map((t) => t.toLowerCase());
}

export function rejoin(tokens : string[]) {
    // FIXME: do something sensible wrt , and .
    return tokens.join(' ');
}
