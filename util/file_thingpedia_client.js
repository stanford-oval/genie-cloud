// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Genie
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');
const Grammar = ThingTalk.Grammar;
const fs = require('fs');
const util = require('util');

const { uniform } = require('./random');

function exampleToCode(example) {
    const clone = example.clone();
    clone.id = -1;
    clone.utterances = [];
    clone.preprocessed = [];
    clone.metadata = {};
    return clone.prettyprint();
}

module.exports = class FileThingpediaClient {
    constructor(locale, thingpediafilename, entitiesfilename, datasetfilename) {
        this._locale = locale;
        this._entities = {};
        this._thingpedia = null;
        this._devicenames = [];

        this._thingpediafilename = thingpediafilename;
        this._entitiesfilename = entitiesfilename;
        this._datasetfilename = datasetfilename;

        this._loaded = null;
    }

    get developerKey() {
        return null;
    }
    get locale() {
        return this._locale;
    }

    async getModuleLocation() {
        throw new Error(`Cannot download module using FileThingpediaClient`);
    }
    async getDeviceList() {
        throw new Error(`Cannot access device list using FileThingpediaClient`);
    }
    async getDeviceFactories() {
        throw new Error(`Cannot access device factories using FileThingpediaClient`);
    }
    async getDeviceSetup() {
        throw new Error(`Cannot access device setup using FileThingpediaClient`);
    }
    async getKindByDiscovery(id) {
        throw new Error(`Cannot perform device discovery using FileThingpediaClient`);
    }
    async getExamplesByKey() {
        throw new Error(`Cannot search examples using FileThingpediaClient`);
    }
    async getExamplesByKinds() {
        throw new Error(`Cannot search examples using FileThingpediaClient`);
    }
    async clickExample() {
        throw new Error(`Cannot click examples using FileThingpediaClient`);
    }
    async lookupEntity() {
        throw new Error(`Cannot lookup entity using FileThingpediaClient`);
    }

    async _load() {
        this._thingpedia = (await util.promisify(fs.readFile)(this._thingpediafilename)).toString();

        const parsed = ThingTalk.Grammar.parse(this._thingpedia);
        this._devicenames = parsed.classes.map((c) => {
            return {
                kind: c.kind,
                kind_canonical: c.metadata.canonical
            };
        });

        this._entities = JSON.parse(await util.promisify(fs.readFile)(this._entitiesfilename));
    }

    _ensureLoaded() {
        if (this._loaded)
            return this._loaded;
        else
            return this._loaded = this._load();
    }

    // The Thingpedia APIs were changed to return ThingTalk class
    // definitions rather than JSON
    // We convert our JSON datafiles into ThingTalk code here

    async getSchemas(kinds, useMeta) {
        await this._ensureLoaded();

        // we ignore kinds and return everything at once; SchemaRetriever can figure it out
        return this._thingpedia;
    }
    async getDeviceCode(kind) {
        // we don't have the full class, so we just return the meta info
        return this.getSchemas([kind], true);
    }

    getMixins() {
        // no mixins through this ThingpediaClient
        return Promise.resolve({});
    }

    getAllExamples() {
        return util.promisify(fs.readFile)(this._datasetfilename, { encoding: 'utf8' });
    }

    async getAllDeviceNames() {
        await this._ensureLoaded();
        let names = [];
        for (let kind in this._meta)
            names.push({ kind, kind_canonical: this._meta[kind].kind_canonical });
        return names;
    }

    async getAllEntityTypes() {
        await this._ensureLoaded();
        return this._entities;
    }

    async genCheatsheet(random = true, options = {}) {
        await this._ensureLoaded();

        const devices = [];
        const devices_rev = {};
        for (let kind in this._meta) {
            devices_rev[kind] = devices.length;
            devices.push({
                primary_kind: kind,
                name: this._meta[kind].kind_canonical
            });
        }
        devices.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

        let parsedExamples = (await Grammar.parse(await this.getAllExamples())).datasets[0].examples;
        const examples = parsedExamples.map((e) => {
            let kind;
            for (let [, invocation] of e.iteratePrimitives())
                kind = invocation.selector.kind;
            if (kind in devices_rev) {
                let utterance = random ? uniform(e.utterances, options.rng) : e.utterances[0];
                return {
                    kind: kind,
                    utterance: utterance,
                    target_code: exampleToCode(e)
                };
            } else {
                return null;
            }
        }).filter((e) => !!e);
        return [devices, examples];
    }
};
