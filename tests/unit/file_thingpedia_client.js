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
const TpClient = require('thingpedia-client');
const fs = require('fs');
const util = require('util');

module.exports = class FileThingpediaClient extends TpClient.BaseClient {
    constructor(args) {
        super({ locale: args.locale, getDeveloperKey() { return null; } });
        this._locale = args.locale;
        this._devices = null;
        this._entities = null;

        this._thingpediafilename = args.thingpedia;
        this._entityfilename = args.entities;
        this._datasetfilename = args.dataset;
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
        this._devices = (await util.promisify(fs.readFile)(this._thingpediafilename)).toString();

        if (this._entityfilename)
            this._entities = JSON.parse(await util.promisify(fs.readFile)(this._entityfilename)).data;
        else
            this._entities = null;
    }

    _ensureLoaded() {
        if (this._loaded)
            return this._loaded;
        else
            return this._loaded = this._load();
    }

    async getSchemas(kinds, useMeta) {
        await this._ensureLoaded();

        // ignore kinds, just return the full file, SchemaRetriever will take care of the rest
        return this._devices;
    }
    async getDeviceCode(kind) {
        await this._ensureLoaded();
        const parsed = ThingTalk.Grammar.parse(this._devices);
        return parsed.classes.find((c) => c.name === kind).prettyprint();
    }

    getAllExamples() {
        return util.promisify(fs.readFile)(this._datasetfilename, { encoding: 'utf8' });
    }

    async getAllDeviceNames() {
        await this._ensureLoaded();

        const parsed = ThingTalk.Grammar.parse(this._devices);
        let names = [];
        for (let classDef of parsed.classes) {
            names.push({
                kind: classDef.kind,
                kind_canonical: classDef.metadata.canonical
            });
        }
        return names;
    }

    async getAllEntityTypes() {
        await this._ensureLoaded();
        return this._entities;
    }
};
