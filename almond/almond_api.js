// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;
const Formatter = ThingTalk.Formatter;
const { ParserClient } = require('almond-dialog-agent');

const Config = require('../config');

module.exports = class AlmondApi {
    constructor(engine) {
        this._engine = engine;
        this._parser = new ParserClient(Config.NL_SERVER_URL, engine.platform.locale, engine.platform.getSharedPreferences());
        this._formatter = new Formatter(this._engine.platform.locale, this._engine.platform.timezone, this._engine.schemas);

        this._outputs = new Set;
    }

    _sendWs(obj) {
        let str = JSON.stringify(obj);
        for (let out of this._outputs) {
            try {
                out.send(str);
            } catch(e) {
                // ignore errors if the connection was closed, while still sending to other connections
            }
        }
    }
    addOutput(out) {
        this._outputs.add(out);
    }
    removeOutput(out) {
        this._outputs.delete(out);
    }

    notify(appId, icon, outputType, outputValue) {
        return Promise.resolve(this._formatter.formatForType(outputType, outputValue, 'messages')).then((messages) => {
            this._sendWs({ result: {
                appId: appId,
                icon: icon ? Config.CDN_HOST + '/icons/' + icon + '.png' : null,
                raw: outputValue,
                type: outputType,
                formatted: messages
            }});
        });
    }

    notifyError(appId, icon, error) {
        this._sendWs({ error: {
            appId: appId,
            icon: icon ? Config.CDN_HOST + '/icons/' + icon + '.png' : null,
            error: error
        }});
    }

    async _doCreateApp(code, locations) {
        const program = await ThingTalk.Grammar.parseAndTypecheck(code, this._engine.schemas, true);
        for (let slot of program.iterateSlots2()) {
            if (slot instanceof Ast.Selector) {
                if (slot.isBuiltin)
                    continue;
                if (typeof slot.id !== 'string')
                    throw new TypeError(`must select a device for @${slot.kind}`);
                continue;
            }
            const value = slot.get();
            if (value.isLocation && value.value.isRelative) {
                let relativeTag = value.value.relativeTag;
                if (relativeTag === 'current_location')
                    slot.set(locations['current_location'] ? Ast.Value.fromJSON(ThingTalk.Type.Location, locations['current_location']) : null);
                else
                    slot.set(this._resolveUserContext('$context.location.' + relativeTag));
                if (!slot.get())
                    throw new TypeError(`missing location ${relativeTag}`);
            }
        }

        let icon = null;
        for (let [, prim] of program.iteratePrimitives()) {
            if (prim.selector.isBuiltin)
                continue;
            if (prim.selector.kind !== 'org.thingpedia.builtin.thingengine.remote' &&
                !prim.selector.kind.startsWith('__dyn')
                && prim.selector.id) {
                let device = this._engine.devices.getDevice(prim.selector.id);
                icon = device ? device.kind : null;
                if (icon) break;
            }
        }

        let options = { icon };
        return this._engine.apps.createApp(program, options);
    }

    async _doDrainApp(app) {
        // drain the queue of results from the app
        let results = [];
        let errors = [];
        if (!app)
            return [results, errors];

        for (;;) {
            let { item: next, resolve, reject } = await app.mainOutput.next();

            if (next.isDone) {
                resolve();
                break;
            }

            if (next.isNotification) {
                try {
                    const messages = await this._formatter.formatForType(next.outputType, next.outputValue, 'messages');
                    results.push({ raw: next.outputValue, type: next.outputType, formatted: messages });
                    resolve();
                } catch (e) {
                    reject(e);
                }
            } else if (next.isError) {
                errors.push(next.error);
                resolve();
            } else if (next.isQuestion) {
                let e = new Error('User cancelled');
                e.code = 'ECANCELLED';
                reject(e);
            }
        }

        return [results, errors];
    }

    async createApp(data) {
        let code = data.code;
        let locations = data.locations || {};

        let sharedPrefs = this._engine.platform.getSharedPreferences();
        for (let loc in locations) {
            if (loc === 'home' || loc === 'work') {
                let location = Ast.Value.fromJSON(ThingTalk.Type.Location, locations[loc]);
                sharedPrefs.set('context-$context.location.' + loc, location.toJS());
            }
        }
        if (!code)
            return { error: 'Missing program' };

        try {
            const app = await this._doCreateApp(code, locations);
            const [results, errors] = await this._doDrainApp(app);

            return {
                uniqueId: app.uniqueId,
                description: app.description,
                code: app.code,
                icon: Config.CDN_HOST + '/icons/' + app.icon + '.png',
                results, errors
            };
        } catch (e) {
            console.error(e.stack);
            if (e instanceof TypeError)
                return { error: e.message };
            else
                throw e;
        }
    }

    _doParse(sentence) {
        return this._parser.sendUtterance(sentence, null, null);
    }

    parse(sentence, target) {
        return Promise.resolve().then(() => {
            if (target) {
                return { entities: target.entities,
                         candidates: [{ score: 'Infinity', code: target.code }] };
            } else {
                return this._doParse(sentence);
            }
        }).then((analyzed) => {
            return Promise.all(analyzed.candidates.map((candidate) => {
                return this._processCandidate(candidate, analyzed);
            })).then((programs) => {
                return programs.filter((r) => r !== null);
            }).then((programs) => {
                return {
                    tokens: analyzed.tokens,
                    entities: analyzed.entities,
                    candidates: programs.slice(0, 3)
                };
            });
        });
    }

    _tryConfigureDevice(kind) {
        return this._engine.thingpedia.getDeviceSetup([kind]).then((factories) => {
            var factory = factories[kind];
            if (!factory) {
                // something funky happened or thingpedia did not recognize the kind
                return [null, null];
            }

            if (factory.type === 'none') {
                return this._engine.devices.addSerialized({ kind: factory.kind }).then((device) => {
                    return [device, null];
                });
            } else {
                let copy = {};
                Object.assign(copy, factory);
                return [null, copy];
            }
        });
    }

    _chooseDevice(selector, primId, devMap) {
        function describeDevice(device) {
            return {
                uniqueId: device.uniqueId,
                name: device.name,
                description: device.description,
                kind: device.kind,
                icon: Config.CDN_HOST + '/icons/' + device.kind + '.png',
            };
        }

        let kind = selector.kind;
        if (selector.id !== null) {
            if (this._engine.devices.hasDevice(selector.id)) {
                devMap[primId] = [describeDevice(this._engine.devices.getDevice(selector.id))];
                return Promise.resolve(true);
            } else {
                return Promise.resolve(false);
            }
        }

        let devices = this._engine.devices.getAllDevicesOfKind(kind);

        if (devices.length === 0) {
            return this._tryConfigureDevice(kind).then(([device, factory]) => {
                if (device) {
                    selector.device = device;
                    selector.id = device.uniqueId;
                    devMap[primId] = [describeDevice(device)];
                    return true;
                } else if (factory) {
                    devMap[primId] = factory;
                    return true;
                } else {
                    return true;
                }
            });
        } else {
            if (devices.length === 1) {
                selector.device = devices[0];
                selector.id = devices[0].uniqueId;
            }

            devMap[primId] = devices.map((dev) => describeDevice(dev));
            return Promise.resolve(true);
        }
    }

    _resolveUserContext(variable) {
        let sharedPrefs = this._engine.platform.getSharedPreferences();

        switch (variable) {
            case '$context.location.current_location':
                return null;
            case '$context.location.home':
            case '$context.location.work': {
                let value = sharedPrefs.get('context-' + variable);
                if (value !== undefined)
                    return Ast.Value.fromJSON(ThingTalk.Type.Location, value);
                else
                    return null;
            }
            default:
                throw new TypeError('Invalid variable ' + variable);
        }
    }

    _processPrimitives(program, primMap, result) {
        let primitives = Array.from(program.iteratePrimitives());
        return Promise.all(primitives.map(([, prim]) => {
            if (prim.selector.isBuiltin)
                return true;
            const primId = `p_${primMap.size}`;
            primMap.set(prim, primId);

            return this._chooseDevice(prim.selector, primId, result.devices);
        })).then((res) => {
            if (primMap.size === 1) {
                let rule = program.rules[0];
                if (rule.stream)
                    result.commandClass = 'trigger';
                else if (rule.table)
                    result.commandClass = 'query';
                else
                    result.commandClass = 'action';
            }

            return res.every((x) => x);
        });
    }

    _slotFill(program, result) {
        for (const [, slot, ,] of program.iterateSlots()) {
            if (slot instanceof Ast.Selector)
                continue;
            if (slot.value.isUndefined && slot.value.local)
                continue;
            if (slot.value.isLocation && slot.value.value.isRelative) {
                let value = this._resolveUserContext('$context.location.' + slot.value.value.relativeTag);
                if (value !== null) {
                    slot.value.value = value;
                    result.locations[slot.value.value.relativeTag] = true;
                } else {
                    result.locations[slot.value.value.relativeTag] = false;
                }
            }
        }
    }

    async _processCandidate(candidate, analyzed) {
        if (candidate.code[0] === 'bookkeeping') // not a thingtalk program
            return null;

        let program;
        try {
            program = ThingTalk.NNSyntax.fromNN(candidate.code, analyzed.entities);
            await program.typecheck(this._engine.schemas, true);
        } catch(e) {
            console.error('Failed to analyze ' + candidate.code.join(' ') + ' : ' + e.message);
            return null;
        }
        if (!program || !program.isProgram)
            return null;

        const primitives = new Map;

        const result = {
            score: candidate.score,
            code: null,
            commandClass: 'rule',
            devices: {},
            locations: {},
        };
        const ok = await this._processPrimitives(program, primitives, result);
        if (!ok)
            return null;
        this._slotFill(program, result);
        result.code = program.prettyprint(true);
        return result;
    }
};
