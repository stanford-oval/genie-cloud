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
const Describe = ThingTalk.Describe;
const Type = ThingTalk.Type;
const Generate = ThingTalk.Generate;
const { ParserClient, Intent, Formatter } = require('almond');

const Config = require('../config');

const FACTORING_IMPLEMENTED = false; // FIXME

module.exports = class AlmondApi {
    constructor(engine) {
        this._engine = engine;
        this._parser = new ParserClient(undefined, engine.platform.locale);
        this._formatter = new Formatter(this._engine);

        this._outputs = new Set;
    }

    _sendWs(obj) {
        let str = JSON.stringify(obj);
        for (let out of this._outputs)
            out.send(str);
    }
    addOutput(out) {
        this._outputs.add(out);
    }
    removeOutput(out) {
        this._outputs.delete(out);
    }

    notify(appId, icon, outputType, outputValue) {
        return this._formatter.formatForType(outputType, outputValue, 'messages').then((messages) => {
            this._sendWs({ result: {
                appId: appId,
                icon: icon ? Config.S3_CLOUDFRONT_HOST + '/icons/' + icon + '.png' : null,
                raw: outputValue,
                type: outputType,
                formatted: messages
            }});
        });
    }

    notifyError(appId, icon, error) {
        this._sendWs({ error: {
            appId: appId,
            icon: icon ? Config.S3_CLOUDFRONT_HOST + '/icons/' + icon + '.png' : null,
            error: error
        }});
    }

    _findPrimaryIdentity() {
        if (!this._engine.messaging.isAvailable)
            return null;
        let identities = this._engine.messaging.getIdentities();
        var omletId = null;
        var email = null;
        var phone = null;
        for (var i = 0; i < identities.length; i++) {
            var id = identities[i];
            if (id.startsWith('omlet:') && omletId === null)
                omletId = id;
            else if (id.startsWith('email:') && email === null)
                email = id;
            else if (id.startsWith('phone:') && phone === null)
                phone = id;
        }
        if (phone !== null)
            return phone;
        if (email !== null)
            return email;
        if (omletId !== null)
            return omletId;
        return null;
    }

    createApp(data) {
        let code = data.code;
        let slots = data.slots || {};
        let locations = data.locations || {};
        let devices = data.devices || {};

        let sharedPrefs = this._engine.platform.getSharedPreferences();
        for (let loc in locations) {
            if (loc === 'home' || loc === 'work') {
                let location = Ast.Value.fromJSON(ThingTalk.Type.Location, locations[loc]);
                sharedPrefs.set('context-$context.location.' + loc, location.toJS());
            }
        }
        if (!code)
            return { error: 'Missing program' };

        return ThingTalk.Grammar.parseAndTypecheck(code, this._engine.schemas, true).then((program) => {
            let i = 0;
            return Promise.all(Array.from(Generate.iteratePrimitives(program)).map(([,prim]) => {
                if (prim.selector.isBuiltin)
                    return Promise.resolve();

                const primId = `p_${i}`;
                i++;

                if (prim.selector.principal) {
                    let messaging = this._engine.messaging;
                    let principal = prim.selector.principal;
                    if (principal.isVarRef && principal.name.startsWith('__const_SLOT_')) {
                        let slotValue = slots[principal.name.substring('__const_SLOT_'.length)];
                        principal = prim.selector.principal = Ast.Value.fromJSON(Type.Entity('tt:contact'), slotValue);
                    } else if (principal.isVarRef) {
                        throw new TypeError(`invalid principal ${principal.name}`);
                    }
                    if (principal.value.startsWith(messaging.type + '-account:'))
                        return Promise.resolve();
                    return messaging.getAccountForIdentity(principal.value).then((account) => {
                        if (account) {
                            let accountPrincipal = messaging.type + '-account:' + account;
                            console.log('Converted ' + principal.value + ' to ' + accountPrincipal);
                            prim.selector.principal = Ast.Value.Entity(accountPrincipal, 'tt:contact', principal.display);
                        }
                    });
                } else {
                    if (prim.selector.id === null)
                        prim.selector.id = devices[primId];
                    if (typeof prim.selector.id !== 'string')
                        throw new TypeError(`must select a device for primitive ${primId}`);
                    return Promise.resolve();
                }
            })).then(() => {
                return Promise.all(Array.from(Generate.iterateSlots(program)).map(([schema, slot, prim, scope]) => {
                    if (slot instanceof Ast.Selector)
                        return;
                    if (slot.value.isUndefined)
                        throw new TypeError(`cannot have slots in this API, call /parse first`);

                    const argname = slot.name;
                    if (slot.value.isVarRef && slot.value.name.startsWith('__const_SLOT_')) {
                        let slotValue = slots[slot.value.name.substring('__const_SLOT_'.length)];
                        let type = schema.inReq[argname] || schema.inOpt[argname] || schema.out[argname];
                        if (slot instanceof Ast.BooleanExpression && slot.operator === 'contains')
                            type = type.elem;
                        slot.value = Ast.Value.fromJSON(type, slotValue);
                    } else if (slot.value.isLocation && slot.value.value.isRelative) {
                        let relativeTag = slot.value.value.relativeTag;
                        if (relativeTag === 'current_location')
                            slot.value = locations['current_location'] ? Ast.Value.fromJSON(ThingTalk.Type.Location, locations['current_location']) : null;
                        else
                            slot.value = this._resolveUserContext('$context.location.' + relativeTag);
                        if (!slot.value)
                            throw new TypeError(`missing location ${relativeTag}`);
                    }
                }));
            }).then(() => {
                const gettext = this._engine.platform.getCapability('gettext');
                const description = Describe.describeProgram(gettext, program);
                const name = Describe.getProgramName(gettext, program);

                let icon = null;
                for (let [, prim] of Generate.iteratePrimitives(program)) {
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

                let appMeta = {
                    $icon: icon
                };

                let newprogram, sendprograms;
                if (FACTORING_IMPLEMENTED) {
                    [newprogram, sendprograms] = Generate.factorProgram(this._engine.messaging, program);
                } else {
                    newprogram = program;
                    sendprograms = [];
                }
                if (sendprograms.length > 0 && !this._engine.messaging.isAvailable)
                    throw new TypeError('Must configure a Matrix account before using remote programs');

                let app;
                if (newprogram !== null) {
                    let code = Ast.prettyprint(newprogram);
                    app = this._engine.apps.loadOneApp(code, appMeta, undefined, undefined,
                                                       name, description, true);
                } else {
                    app = Promise.resolve(null);
                }

                return app.then((app) => {
                    let identity = this._findPrimaryIdentity();
                    for (let [principal, program] of sendprograms) {
                        //console.log('program: ' + Ast.prettyprint(program));
                        this._engine.remote.installProgramRemote(principal.value, identity, program).catch((e) => {
                            if (app) {
                                app.reportError(e);
                                // destroy the app if the user denied it
                                this._engine.apps.removeApp(app);
                            } else {
                                console.log('Ignored error from permission control request: ' + e.code + ': ' + e.message);
                                console.log(e.stack);
                            }
                        });
                    }

                    // drain the queue of results from the app
                    let results = [];
                    let errors = [];

                    function loop() {
                        if (!app)
                            return Promise.resolve();
                        return app.mainOutput.next().then(({ item: next, resolve, reject }) => {
                            if (next.isDone) {
                                resolve();
                                return Promise.resolve();
                            }

                            if (next.isNotification) {
                                return this._formatter.formatForType(next.outputType, next.outputValue, 'messages').then((messages) => {
                                    results.push({ raw: next.outputValue, type: next.outputType, formatted: messages });
                                    resolve();
                                    return loop.call(this);
                                }).catch((e) => {
                                    reject(e);
                                    return loop.call(this);
                                });
                            } else if (next.isError) {
                                errors.push(next.error);
                            } else if (next.isQuestion) {
                                let e = new Error('User cancelled');
                                e.code = 'ECANCELLED';
                                reject(e);
                            }
                            resolve();
                            return loop.call(this);
                        });
                    }

                    return loop.call(this).then(() => {
                        return {
                            uniqueId: app.uniqueId,
                            description: app.description,
                            code: app.code,
                            icon: Config.S3_CLOUDFRONT_HOST + '/icons/' + app.icon + '.png',
                            results, errors
                        };
                    });
                });
            });
        }).catch((e) => {
            console.error(e.stack);
            if (e instanceof TypeError)
                return { error: e.message };
            else
                throw e;
        });
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
            return Promise.all(analyzed.candidates.slice(0, 3).map((candidate) => {
                return this._processCandidate(candidate, analyzed);
            })).then((programs) => {
                return programs.filter((r) => r !== null);
            }).then((programs) => {
                return {
                    tokens: analyzed.tokens,
                    entities: analyzed.entities,
                    candidates: programs
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
                return this._engine.devices.loadOneDevice({ kind: factory.kind }, true).then((device) => {
                    return [device, null];
                });
            } else if (factory.type === 'link' || factory.type === 'oauth2') {
                let copy = {};
                copy.factoryType = 'link';
                copy.name = factory.text;
                copy.kind = factory.kind;
                copy.href = factory.type === 'link' ? factory.href : '/me/devices/oauth2/' + factory.kind;
                return [null, copy];
            } else {
                let copy = {};
                copy.factoryType = 'other';
                copy.kind = kind;
                copy.fields = factory.fields;
                copy.choices = factory.choices;
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
                icon: Config.S3_CLOUDFRONT_HOST + '/icons/' + device.kind + '.png',
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

    _choosePrincipal(prim, primId, slots) {
        let principal = prim.selector.principal;
        if (principal.type === 'tt:contact_name') {
            let slotId = slots.length;
            let contact = prim.selector.principal.value;
            prim.selector.principal.value = Ast.Value.VarRef('__const_SLOT_' + slotId);
            slots.push({
                primId: primId,
                name: '__principal',
                type: 'Entity(tt:contact)',
                contact_name: contact
            });
            return true;
        } else {
            let messaging = this._engine.messaging;
            if (!messaging.isAvailable)
                return false;
            if (principal.value.startsWith(messaging.type + '-account:'))
                return true;
            return messaging.getAccountForIdentity(principal.value).then((account) => {
                if (account) {
                    let accountPrincipal = messaging.type + '-account:' + account;
                    console.log('Converted ' + principal.value + ' to ' + accountPrincipal);
                    prim.selector.principal = Ast.Value.Entity(accountPrincipal, 'tt:contact', principal.display);
                }
                return true;
            });
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
                    return Ast.Value.fromJSON(Type.Location, value);
                else
                    return null;
            }
            default:
                throw new TypeError('Invalid variable ' + variable);
        }
    }

    _processPrimitives(program, primMap, result) {
        let primitives = Array.from(Generate.iteratePrimitives(program));
        return Promise.all(primitives.map(([, prim]) => {
            if (prim.selector.isBuiltin)
                return true;
            const primId = `p_${primMap.size}`;
            result.primitives[primId] = prim.selector.kind + ':' + prim.channel;
            primMap.set(prim, primId);

            if (prim.selector.principal !== null) {
                return this._choosePrincipal(prim, primId, result.slots);
            } else {
                return this._chooseDevice(prim.selector, primId, result.devices).then((ok) => {
                    if (!ok)
                        return false;
                    if (result.icon === null &&
                        prim.selector.kind !== 'org.thingpedia.builtin.thingengine.remote' &&
                        !prim.selector.kind.startsWith('__dyn')
                        && prim.selector.id) {
                        let device = prim.selector.device;
                        result.icon = Config.S3_CLOUDFRONT_HOST + '/icons/' + device.kind + '.png';
                    }
                    return true;
                });
            }
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

    _slotFill(program, primitives, entityValues, result) {
        let slots = Array.from(Generate.iterateSlots(program));
        return Promise.all((slots.map(([schema, slot, prim, scope]) => {
            if (slot instanceof Ast.Selector)
                return;
            const primId = primitives.get(prim);

            const argname = slot.name;
            let type = schema.inReq[argname] || schema.inOpt[argname] || schema.out[argname];
            if (slot instanceof Ast.BooleanExpression && slot.operator === 'contains')
                type = type.elem;
            const index = schema.index[argname];

            if (slot.value.isUndefined && slot.value.local) {
                const slotId = result.slots.length;
                let question = undefined;
                if (slot instanceof Ast.InputParam ||
                    (slot instanceof Ast.BooleanExpression && slot.operator === '=='))
                    question = schema.questions[index];
                slot.value = Ast.Value.VarRef('__const_SLOT_' + slotId);
                result.slots.push({
                    primId: primId,
                    name: argname,
                    display_name: schema.argcanonicals[index] || argname,
                    type: String(type),
                    question: question
                });
            } else if (!slot.value.isConcrete()) {
                if (slot.value.isEntity && slot.value.type === 'tt:contact_name') {
                    const slotId = result.slots.length;
                    const contact = slot.value.value;
                    slot.value = Ast.Value.VarRef('__const_SLOT_' + slotId);
                    result.slots.push({
                        primId: primId,
                        name: argname,
                        display_name: schema.argcanonicals[index] || argname,
                        type: String(type),
                        contact_name: contact
                    });

                    entityValues.push(slot.value);
                } else if (slot.value.isEntity) {
                    entityValues.push(slot.value);
                } else if (slot.value.isLocation && slot.value.value.isRelative) {
                    let value = this._resolveUserContext('$context.location.' + slot.value.value.relativeTag);
                    if (value !== null) {
                        slot.value.value = value;
                        result.locations[slot.value.value.relativeTag] = true;
                    } else {
                        result.locations[slot.value.value.relativeTag] = false;
                    }
                }
            } else if (slot.value.isEntity) {
                entityValues.push(slot.value);
            }
        })));
    }

    _resolveContacts(contacts) {
        if (!this._engine.messaging.isAvailable) {
            return Promise.resolve(contacts.map(([contact, display]) => ({
                contact: contact,
                omletAccount: null,
                omletName: null,
                display: display,
                profileUrl: 'https://openclipart.org/image/2400px/svg_to_png/202776/pawn.png',
            })));
        }
        const messagingType = this._engine.messaging.type + '-account:';
        return Promise.all(contacts.map(([contact, display]) => {
            return Promise.resolve().then(() => {
                if (contact.startsWith(messagingType))
                    return contact.split(':')[1];
                else
                    return this._engine.messaging.getAccountForIdentity(contact);
            }).then((account) => {
                return this._engine.messaging.getUserByAccount(account);
            }).then((user) => {
                return this._engine.messaging.getBlobDownloadLink(user.thumbnail).then((thumbnail) => ({
                    contact: contact,
                    omletAccount: user.account,
                    omletName: user.name,
                    display: display,
                    profileUrl: thumbnail
                })).catch((e) => ({
                    contact: contact,
                    omletAccount: user.account,
                    omletName: user.name,
                    display: display,
                    profileUrl: 'https://openclipart.org/image/2400px/svg_to_png/202776/pawn.png'
                }));
            });
        }));
    }

    _processCandidate(candidate, analyzed) {
        return Intent.parse({ code: candidate.code, entities: analyzed.entities }, this._engine.schemas, null, null, null).catch((e) => {
            console.error('Failed to analyze ' + candidate.code.join(' ') + ' : ' + e.message);
            return null;
        }).then((intent) => {
            if (!intent || !intent.isProgram)
                return null;

            const program = intent.program;

            const gettext = this._engine.platform.getCapability('gettext');
            const description = Describe.describeProgram(gettext, program);

            const primitives = new Map;

            const result = {
                score: candidate.score,
                code: null,
                description: description,
                icon: null,
                commandClass: 'rule',
                primitives: {},
                devices: {},
                slots: [],
                locations: {},
                contacts: []
            };
            const entityValues = [];

            return this._processPrimitives(program, primitives, result).then((ok) => {
                if (!ok)
                    return false;

                return this._slotFill(program, primitives, entityValues, result);
            }).then((ok) => {
                if (!ok)
                    return null;

                let contacts = new Map;
                for (let entity of entityValues) {
                    if (entity.type === 'tt:contact')
                        contacts.set(entity.value, entity.display);
                    else if (entity.type === 'tt:email_address')
                        contacts.set('email:' + entity.value, entity.display);
                    else if (entity.type === 'tt:phone_number')
                        contacts.set('phone:' + entity.value, entity.display);
                }

                return this._resolveContacts(Array.from(contacts.entries()), result).then((contacts) => {
                    result.contacts = contacts;
                    result.code = Ast.prettyprint(program, true);
                    return result;
                });
            });
        });
    }
};
