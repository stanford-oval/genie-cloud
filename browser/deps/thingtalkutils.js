// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Genie
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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

const { Syntax } = require('thingtalk');

async function parse(code, schemas, loadMetadata = false) {
    let parsed;
    try {
        // first try parsing using normal syntax
        parsed = Syntax.parse(code);
    } catch(e1) {
        // if that fails, try with legacy syntax
        if (e1.name !== 'SyntaxError')
            throw e1;
        try {
            parsed = Syntax.parse(code, Syntax.SyntaxType.Legacy);
        } catch(e2) {
            if (e2.name !== 'SyntaxError')
                throw e2;
            throw e1; // use the first error not the second in case both fail
        }
    }
    return parsed.typecheck(schemas, loadMetadata);
}

async function parsePrediction(code, entities, schemas, strict = false) {
    try {
        let parsed;
        try {
            // first try parsing using normal tokenized syntax
            parsed = Syntax.parse(code, Syntax.SyntaxType.Tokenized, entities);
        } catch(e1) {
            // if that fails, try with legacy NN syntax
            if (e1.name !== 'SyntaxError')
                throw e1;
            try {
                parsed = Syntax.parse(code, Syntax.SyntaxType.LegacyNN, entities);
            } catch(e2) {
                if (e2.name !== 'SyntaxError')
                    throw e2;
                throw e1; // use the first error not the second in case both fail
            }
        }
        await parsed.typecheck(schemas, true);
        return parsed;
    } catch(e) {
        if (strict)
            throw e;
        return null;
    }
}

async function parseAllPredictions(candidates, entities, schemas) {
    return (await Promise.all(candidates.map((cand) => {
        return parsePrediction(cand.code, entities, schemas, false);
    }))).filter((x) => x !== null);
}

/**
 * Convert a program or dialogue state to a sequence of tokens to predict.
 */
function serializePrediction(program,
                             sentence,
                             entities,
                             options = {}) {
    const entityRetriever = new Syntax.EntityRetriever(sentence, entities);
    return Syntax.serialize(program, Syntax.SyntaxType.Tokenized, entityRetriever, {
        compatibility: options.compatibility
    });
}

module.exports = {
    parse,
    parsePrediction,
    parseAllPredictions,
    serializePrediction
};
