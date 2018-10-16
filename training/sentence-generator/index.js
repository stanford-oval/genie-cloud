// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const stream = require('stream');

const ThingTalk = require('thingtalk');
const Ast = ThingTalk.Ast;
const SchemaRetriever = ThingTalk.SchemaRetriever;

const { splitParams, clean } = require('../../util/tokenize');

const { Placeholder,
        simpleCombine,
        generate } = require('./grammar_lib');
const db = require('../../util/db');


module.exports = class SentenceGenerator extends stream.Readable {
    constructor(options) {
        super({ objectMode: true });
        this._schemas = new SchemaRetriever(options.thingpediaClient, null, !options.debug);

        this._options = options;

        this._allTypes = new Map;
        this._idTypes = new Set;
        this._nonConstantTypes = new Set;
        this._types = {
            all: this._allTypes,
            id: this._idTypes,
            nonConstant: this._nonConstantTypes,
        };
        this._allParams = {
            in: new Map,
            out: new Set,
        };

        this._languageClass = require('./languages/' + options.language);
        this._language = null;
        this._grammar = null;
        this._generator = null;
        this._initialization = null;
        this._i = 0;
    }

    _read() {
        if (this._initialization === null)
            this._initialization = this._initialize();

        this._initialization.then(() => this._minibatch())
            .catch((e) => this.emit('error', e));
    }

    async _initialize() {
        const standardSchemas = {
            say: await this._schemas.getMeta('org.thingpedia.builtin.thingengine.builtin', 'action', 'say'),
            get_gps: await this._schemas.getMeta('org.thingpedia.builtin.thingengine.phone', 'query', 'get_gps'),
            get_time: await this._schemas.getMeta('org.thingpedia.builtin.thingengine.builtin', 'query', 'get_time')
        };
        this._language = new this._languageClass(standardSchemas, this._types, this._allParams, this._options);

        this._grammar = this._language.grammar;
        await this._loadMetadata();
        await this._language.complete();
        this._generator = generate(this._grammar, this._options);
    }

    _minibatch() {
        for (;;) {
            let { value, done } = this._generator.next();
            if (done) {
                this.push(null);
                return;
            }
            const [depth, derivation] = value;
            if (!this._output(depth, derivation))
                return;
        }
    }

    _output(depth, derivation) {
        let utterance = this._language.postprocess(derivation.toString());
        let program = derivation.value;
        let sequence;
        try {
            sequence = ThingTalk.NNSyntax.toNN(program, {});
            //ThingTalk.NNSyntax.fromNN(sequence, {});

            if (sequence.some((t) => t.endsWith(':undefined')))
                throw new TypeError(`Generated undefined type`);
        } catch(e) {
            console.error(utterance);
            console.error(String(program));
            console.error(sequence);

            console.error(program.prettyprint(program).trim());
            this.emit('error', e);
        }

        let id = String(this._i++);
        id = depth + '000000000'.substring(0,9-id.length) + id;
        return this.push({ id, utterance, target_code: sequence.join(' ') });
    }

    _loadTemplateAsDeclaration(ex, decl) {
        decl.name = 'ex_' + ex.id;
        //console.log(program.prettyprint(true));

        // ignore builtin actions:
        // debug_log is not interesting, say is special and we handle differently, configure/discover are not
        // composable
        if (this._options.turkingMode && decl.type === 'action' && decl.value.invocation.selector.kind === 'org.thingpedia.builtin.thingengine.builtin')
            return;
        if (decl.type === 'action' && decl.value.invocation.selector.kind === 'org.thingpedia.builtin.thingengine.builtin' && decl.value.channel === 'say')
            return;
        if (decl.type === 'stream' && (decl.value.isTimer || decl.value.isAtTimer))
            return;

        // HACK HACK HACK
        if (decl.type === 'query' && ex.preprocessed[0] === ',') {
            ex.preprocessed = ex.preprocessed.substring(1).trim();
            decl.type = 'get_command';
        }

        // ignore optional input parameters
        // if you care about optional, write a lambda template
        // that fills in the optionals

        /*for (let pname in decl.value.schema.inReq) {
            let ptype = decl.value.schema.inReq[pname];
            if (!(ptype instanceof Type))
                throw new Error('wtf: ' + decl.value.schema);

            // work around bugs in the typechecker
            if (!pname.startsWith('p_')) {
                decl.value.schema.inReq['p_' + pname] = ptype;
                allInParams.set('p_' + pname + '+' + ptype, ptype);
            } else {
                allInParams.set(pname + '+' + ptype, ptype);
            }
            allTypes.set(String(ptype), ptype);
        }*/

        for (let pname in decl.args) {
            let ptype = decl.args[pname];

            //console.log('pname', pname);
            if (!(pname in decl.value.schema.inReq)) {
                // somewhat of a hack, we declare the argument for the value,
                // because later we will muck with schema only
                decl.value.schema = decl.value.schema.addArguments([new Ast.ArgumentDef(
                    Ast.ArgDirection.IN_REQ,
                    pname,
                    ptype,
                    {canonical: clean(pname)},
                    {}
                )]);
            }
            this._allParams.in.set(pname + '+' + ptype, ptype);
            this._allTypes.set(String(ptype), ptype);
        }
        for (let pname in decl.value.schema.out) {
            let ptype = decl.value.schema.out[pname];
            this._allParams.out.add(pname + '+' + ptype);
            this._allTypes.set(String(ptype), ptype);
        }

        let chunks = splitParams(ex.preprocessed.trim());
        let grammarrule = [];

        for (let chunk of chunks) {
            if (chunk === '')
                continue;
            if (typeof chunk === 'string') {
                grammarrule.push(chunk.toLowerCase());
                continue;
            }

            let [match, param1, param2, opt] = chunk;
            if (match === '$$') {
                grammarrule.push('$');
                continue;
            }
            let param = param1 || param2;
            grammarrule.push(new Placeholder(param, opt));
        }

        this._grammar['thingpedia_' + decl.type].push([grammarrule, simpleCombine(() => decl.value)]);
    }

    async _loadTemplate(row) {
        const datasetCode = `dataset @dummy language "${this._options.language}" { ${row.target_code} }`;

        try {
            const parsed = await ThingTalk.Grammar.parseAndTypecheck(datasetCode, this._schemas, true);

            const ex = parsed.datasets[0].examples[0];
            if (ex.type === 'program') // FIXME
                ; // ignore examples that consist of a rule (they are just dataset)
            else
                this._loadTemplateAsDeclaration(row, ex);
        } catch (e) {
            console.error('Failed to load template ' + row.id + ': ' + e.message);
            console.error(e.stack);
        }
    }

    _loadDevice(device) {
        this._grammar['constant_Entity(tt:device)'].push([device.kind_canonical,
            simpleCombine(() => new Ast.Value.Entity(device.kind, 'tt:device', null))]);
    }

    _loadIdType(idType) {
        let type = `Entity(${idType.id})`;
        if (this._idTypes.has(type))
            return;

        if (idType.id.endsWith(':id')) {
            if (this._options.debug)
                console.log('Loaded type ' + type + ' as id type');
            this._idTypes.add(type);
        } else {
            if (this._options.debug)
                console.log('Loaded type ' + type + ' as non-constant type');
            this._nonConstantTypes.add(type);
        }
    }

    async _loadMetadata() {
        const [examples, devices, idTypes] = await db.withClient((dbClient) => {
            return Promise.all([
                db.selectAll(dbClient, `select * from example_utterances where type = 'thingpedia' and language = ? and is_base = 1 and target_code <> ''`,
                    [this._options.language]),
                db.selectAll(dbClient, `select kind,kind_canonical from device_schema where kind_type in ('primary','other')`, []),
                db.selectAll(dbClient, `select id from entity_names where language='en' and not is_well_known and not has_ner_support`, []),
            ]);
        });
        if (this._options.debug) {
            console.log('Loaded ' + devices.length + ' devices');
            console.log('Loaded ' + examples.length + ' templates');
        }

        idTypes.forEach(this._loadIdType, this);
        return Promise.all([
            Promise.all(devices.map(this._loadDevice, this)),
            Promise.all(examples.map(this._loadTemplate, this))
        ]);
    }
};
