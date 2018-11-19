// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');

const ThingTalk = require('thingtalk');

const AdminThingpediaClient = require('../util/admin-thingpedia-client');

const entityModel = require('../model/entity');
const stringModel = require('../model/strings');

const { coin, uniform, categorical } = require('../util/random');
const binarySearch = require('../util/binary_search');
const db = require('../util/db');

function isGoodWord(word) {
    return /^([a-zA-Z0-9]+|'s|\?)$/.test(word);
}

function isReplaceToken(tok) {
    return /^(GENERIC_ENTITY_|QUOTED_STRING_|HASHTAG_|USERNAME_)/.test(tok);
}

function blowupFactor(example, params) {
    if (example.flags.indexOf('synthetic') >= 0)
        return 3;
    if (params.size === 0)
        return 10;
    if (example.flags.indexOf('augmented') >= 0)
        return 15;
    return 30;
}

class WeightedValueList {
    constructor(values, weights) {
        assert.strictEqual(values.length, weights.length);

        this._values = values;

        if (weights.length > 0) {
            const cumsum = new Array(weights.length);
            cumsum[0] = weights[0];
            for (let i = 1; i < weights.length; i++)
                cumsum[i] = cumsum[i-1] + weights[i];
            this._cumsum = cumsum;
        } else {
            this._cumsum = [];
        }
    }

    get size() {
        return this._values.length;
    }

    sample(rng) {
        const sample = rng() * this._cumsum[this._cumsum.length-1];
        return this._values[binarySearch(this._cumsum, sample)];
    }
}

class UniformValueList {
    constructor(values) {
        this._values = values;
    }

    get size() {
        return this._values.length;
    }

    sample(rng) {
        return uniform(this._values, rng);
    }
}

class ValueListLoader {
    constructor(language, dbClient) {
        this._language = language;
        this._dbClient = dbClient;

        this._emptyList = new UniformValueList([]);
        this._cache = new Map;
    }

    get([valueListType, valueListName]) {
        if (valueListType === null && valueListName === null)
            return this._emptyList;
        const key = valueListType + ':' + valueListName;
        if (this._cache.has(key))
            return this._cache.get(key);

        const promise = this._load(valueListType, valueListName);
        this._cache.set(key, promise);
        return promise;
    }

    async _loadString(stringType) {
        const rows = await stringModel.getValues(this._dbClient, stringType, this._language);
        return new WeightedValueList(rows.map((r) => r.preprocessed), rows.map((r) => r.weight));
    }
    async _loadEntity(entityType) {
        const rows = await entityModel.getValues(this._dbClient, entityType, this._language);
        return new UniformValueList(rows.map((r) => r.entity_canonical));
    }

    async _load(valueListType, valueListName) {
        switch (valueListType) {
        case 'string':
            return this._loadString(valueListName);
        case 'entity':
            return this._loadEntity(valueListName);
        default:
            throw new TypeError(`Unexpected value list type ${valueListType}`);
        }
    }
}

const OPERATORS = new Set(['==', '=', '=~', '~=', 'in_array', 'contains', 'starts_with', 'ends_with', '>=', '<=']);

const IGNORABLE_TOKENS = {
    'sportradar': ['fc', 'ac', 'us', 'if', 'as', 'rc', 'rb', 'il', 'fk', 'cd', 'cf'],
    'imgflip:meme_id': ['the'],
    'tt:currency_code': ['us'],
    'tt:stock_id': ['l.p.', 's.a.', 'plc', 'n.v', 's.a.b', 'c.v.'],
    'org:freedesktop:app_id': ['gnome']
};
const ABBREVIATIONS = [
    ['ltd', 'ltd.', 'limited'],
    ['corp', 'corp.', 'corporation'],
    ['l.l.c', 'llc'],
    ['&', 'and'],
    ['inc.', 'inc', 'incorporated'],
];
const PROCESSED_ABBREVIATIONS = {};
for (let abbr of ABBREVIATIONS) {
    for (let variant of abbr)
        PROCESSED_ABBREVIATIONS[variant] = abbr;

}

function *resampleIgnorableAndAbbreviations(ptype, sentence, rng) {
    if (!ptype.isEntity)
        return;
    const ignorable = ptype.type.startsWith('sportradar') ? IGNORABLE_TOKENS['sportradar'] : (IGNORABLE_TOKENS[ptype.type] || []);

    for (let word of sentence) {
        if (ignorable.indexOf(word) >= 0) {
            if (coin(0.5, rng))
                continue;
        } else if (word in PROCESSED_ABBREVIATIONS) {
            yield uniform(PROCESSED_ABBREVIATIONS[word], rng);
        } else {
            yield word;
        }
    }
}

module.exports = class ParameterReplacer {
    constructor(language, schemas, dbClient, rng = Math.random) {
        this._language = language;
        this._schemas = schemas || null;
        this._dbClient = dbClient || null;
        this._loader = null;
        this._rng = rng;

        this._warned = new Set;
    }

    async initialize() {
        if (this._dbClient === null)
            this._dbClient = await db.connect();
        if (this._schemas === null) {
            let tpClient = new AdminThingpediaClient(this._language, this._dbClient);
            this._schemas = new ThingTalk.SchemaRetriever(tpClient, null, true);
        }
        this._loader = new ValueListLoader(this._language, this._dbClient);
    }

    _getEntityListKey(entityType) {
        switch (entityType) {
        case 'tt:username':
        case 'tt:contact':
        case 'tt:email_address':
        case 'tt:phone_number':
            return ['string', 'tt:person_first_name'];

        default:
            return ['entity', entityType];
        }
    }

    async _getParamListKey(fn, pname, ptype) {
        if (fn === '$source' || fn === '$executor')
            return ['string', 'tt:person_first_name'];
        while (ptype.isArray)
            ptype = ptype.elem;

        if (!ptype.isEntity && !ptype.isString)
            throw new TypeError(`Unexpected replaced type ${ptype}`);

        const lastDot = fn.lastIndexOf('.');
        const kind = fn.substring(0, lastDot);
        const functionName = fn.substring(lastDot+1);

        const schema = await this._schemas.getFullMeta(kind);
        const functionDef = functionName in schema.queries ?
            schema.queries[functionName] :
            schema.actions[functionName];

        const arg = functionDef.getArgument(pname);
        if (arg.annotations.string_values && arg.annotations.string_values.value)
            return ['string', arg.annotations.string_values.toJS()];

        if (ptype.isEntity)
            return this._getEntityListKey(ptype.type);

        return [null, null];
    }

    async _sampleParam(pid) {
        const [fn, pname, ptypestr, pop] = pid.split('+');
        const ptype = ThingTalk.Type.fromString(ptypestr);

        const valueList = await this._loader.get(await this._getParamListKey(fn, pname, ptype));
        if (valueList.size === 0) {
            if (!this._warned.has(pid)) {
                console.log(`Found no values for ${pid}`);
                this._warned.add(pid);
            }
            return null;
        }

        let attempts = 50;
        while (attempts > 0) {
            const sampled = valueList.sample(this._rng);
            let words = sampled.split(' ');
            words = Array.from(resampleIgnorableAndAbbreviations(ptype, words, this._rng));

            if (pop === '=~') {
                let seq;
                if (words.length > 4) {
                    const sampledLengthIdx = categorical([0.4, 0.3, 0.2, 0.1]);
                    const length = [1,2,3,4][sampledLengthIdx];
                    const idx = Math.floor(this._rng() * (words.length-length));

                    seq = words.slice(idx, idx+length);
                } else if (words.length > 2) {
                    const sampledLengthIdx = categorical([0.5, 0.5]);
                    const length = [1,2][sampledLengthIdx];
                    const idx = Math.floor(this._rng() * (words.length-length));

                    seq = words.slice(idx, idx+length);
                } else {
                    seq = words;
                }
                if (seq.some((w) => !isGoodWord(w))) {
                    attempts -= 1;
                    continue;
                }
                return seq.join(' ');
            }

            if (words.some((w) => !isGoodWord(w))) {
                attempts -= 1;
                continue;
            }

            if (words.length > 10) {
                // if we keep getting samples that are too long, make one last ditch
                // attempt by taking a long substring of the sample
                if (attempts === 1) {
                    const sampledLengthIdx = categorical([0.1, 0.3, 0.3, 0.3]);
                    const length = [7, 8, 9, 10][sampledLengthIdx];
                    const idx = Math.floor(this._rng() * (words.length-length));

                    let seq = words.slice(idx, idx+length);
                    if (seq.some((w) => !isGoodWord(w))) {
                        attempts -= 1;
                        continue;
                    }
                    return seq.join(' ');
                } else {
                    attempts -= 1;
                    continue;
                }
            }
            return sampled;
        }
        return null;
    }

    async _replaceTokensInSentence(id, sentence, parameters, replacements) {
        let output = [];

        for (let token of sentence) {
            if (replacements.has(token)) {
                output.push(replacements.get(token));
            } else if (isReplaceToken(token)) {
                if (!parameters.has(token)) {
                    // ignore this: we might have decided not to replace the parameter
                    output.push(token);
                    continue;
                }
                const replace = await this._sampleParam(parameters.get(token));
                if (!replace) {
                    output.push(token);
                } else {
                    replacements.set(token, replace);
                    output.push(replace);
                }
            } else {
                output.push(token);
            }
        }
        return output;
    }

    _replaceTokensInProgram(program, replacements) {
        let output = [];
        for (let token of program) {
            if (replacements.has(token)) {
                output.push('"', replacements.get(token), '"');
                if (token.startsWith('HASHTAG_'))
                    output.push('^^tt:hashtag');
                else if (token.startsWith('USERNAME_'))
                    output.push('^^tt:username');
                else if (token.startsWith('GENERIC_ENTITY_'))
                    output.push('^^' + token.substring('GENERIC_ENTITY_'.length, token.length-2));
            } else {
                output.push(token);
            }
        }
        return output;
    }

    _computeReplaceableParameters(sentence, program) {
        const parameters = new Map;

        let curFn = [];
        let curParam = null;
        let curOp = null;
        for (let token of program) {
            if (['join', '=>'].indexOf(token) >= 0) {
                curFn = [];
            } else if (token.startsWith('@')) {
                curFn.push(token.substring(1));
            } else if (token === '}') {
                curFn.pop();
            } else if (token.startsWith('param:')) {
                curParam = token.substring('param:'.length);
                let colonIndex = curParam.indexOf(':');
                let curType = curParam.substring(colonIndex+1);
                curParam = curParam.substring(0, colonIndex);
                curParam = curParam + '+' + curType;
                curOp = null;
            } else if (token === 'executor') {
                curFn.push('$executor');
                curParam = 'executor+Entity(tt:contact)';
            } else if (OPERATORS.has(token)) {
                curOp = token;
            } else if (isReplaceToken(token)) {
                if (/^(QUOTED_STRING|HASHTAG|USERNAME)_/.test(token)) {
                    // with some probability, we leave the parameter quoted
                    // this ensures that some sentences are trained with quotes too
                    // which is useful because quoted sentences are more reliable
                    // in the face of unks
                    // we only do this for QUOTED_STRING, HASHTAG and USERNAME
                    // (and not GENERIC_ENTITY) because those NER extractors are always
                    // enabled, while the GENERIC_ENTITY one is enabled or disabled
                    // in almond-tokenizer manually
                    if (coin(0.1, this._rng))
                        return parameters;
                }

                if (curFn.length === 0) {
                    assert.strictEqual(curParam, 'source+Entity(tt:contact)');
                    parameters.set(token, '$source+' + curParam + '+' + curOp);
                } else {
                    parameters.set(token, curFn[curFn.length-1] + '+' + curParam + '+' + curOp);
                }
            }
        }

        return parameters;
    }

    process(example) {
        const sentence = example.preprocessed.split(' ');
        const program = example.target_code.split(' ');

        const parameters = this._computeReplaceableParameters(sentence, program);

        const promises = [];
        for (let i = 0; i < blowupFactor(example, parameters); i++) {
            promises.push((async () => {
                const replacements = new Map();
                const new_sentence = (await this._replaceTokensInSentence(example.id, sentence, parameters, replacements)).join(' ');
                const new_program = (await this._replaceTokensInProgram(program, replacements)).join(' ');

                let flags = example.flags.replace(/,exact/, '');
                return {
                    type: example.type,
                    flags: flags ? flags + ',replaced' : 'replaced',
                    utterance: example.utterance,
                    preprocessed: new_sentence,
                    target_code: new_program
                };
            })());
        }
        return Promise.all(promises);
    }
};
