"use strict";

const Q = require('q');
const fs = require('fs');
const csvparse = require('csv-parse');
const Stream = require('stream');

const db = require('./db');
const user = require('./user');
const tokenizer = require('./tokenize');
const I18n = require('./i18n');
const TokenizerService = require('./tokenizer_service');
const { BadRequestError, ForbiddenError } = require('./errors');

const schemaModel = require('../model/schema');
const entityModel = require('../model/entity');
const stringModel = require('../model/strings');

const NAME_REGEX = /([A-Za-z_][A-Za-z0-9_.-]*):([A-Za-z_][A-Za-z0-9_]*)/;

class StreamTokenizer extends Stream.Transform {
    constructor(options) {
        super({ objectMode: true });

        this._language = options.language;
        this._preprocessed = options.preprocessed;
        this._typeId = options.typeId;
    }

    _transform(row, encoding, callback) {
        const value = row[0];
        let weight = parseFloat(row[1]) || 1.0;
        if (!(weight > 0.0))
            weight = 1.0;

        if (this._preprocessed) {
            callback(null, {
                type_id: this._typeId,
                value: value,
                preprocessed: value,
                weight: weight
            });
        } else {
            TokenizerService.tokenize(this._language, value).then((result) => {
                // ignore lines with uppercase (entity) tokens
                if (result.tokens.some((t) => /[A-Z]/.test(t))) {
                    callback(null);
                } else {
                    callback(null, {
                        type_id: this._typeId,
                        value: value,
                        preprocessed: result.tokens.join(' '),
                        weight: weight
                    });
                }
            }, (err) => callback(err));
        }
    }

    _flush(callback) {
        process.nextTick(callback);
    }
}

module.exports = {
    uploadEntities: async function(req) {
        const language = I18n.localeToLanguage(req.locale);

        try {
            await db.withTransaction(async (dbClient) => {
                let match = NAME_REGEX.exec(req.body.entity_id);
                if (match === null)
                    throw new BadRequestError(req._("Invalid entity type ID."));

                let [, prefix, /*suffix*/] = match;

                if ((req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0) {
                    let row;
                    try {
                        row = await schemaModel.getByKind(dbClient, prefix);
                    } catch (e) {
                        if (e.code !== 'ENOENT')
                            throw e;
                    }
                    if (!row || row.owner !== req.user.developer_org)
                        throw new ForbiddenError(req._("The prefix of the entity ID must correspond to the ID of a Thingpedia device owned by your organization."));
                }

                await entityModel.create(dbClient, {
                    name: req.body.entity_name,
                    id: req.body.entity_id,
                    is_well_known: false,
                    has_ner_support: !req.body.no_ner_support
                });

                if (req.body.no_ner_support)
                    return;

                if (!req.files.upload || !req.files.upload.length)
                    throw new BadRequestError(req._("You must upload a CSV file with the entity values."));

                const parser = csvparse({delimiter: ','});
                fs.createReadStream(req.files.upload[0].path).pipe(parser);

                const transformer = Stream.Transform({
                    objectMode: true,

                    transform(row, encoding, callback) {
                        if (row.length !== 2) {
                            callback();
                            return;
                        }

                        const value = row[0].trim();
                        const name = row[1];

                        const tokens = tokenizer.tokenize(name);
                        const canonical = tokens.join(' ');
                        callback(null, {
                            language,
                            entity_id: req.body.entity_id,
                            entity_value: value,
                            entity_canonical: canonical,
                            entity_name: name
                        });
                    },

                    flush(callback) {
                        process.nextTick(callback);
                    }
                });

                const writer = entityModel.insertValueStream(dbClient);
                parser.pipe(transformer).pipe(writer);

                // we need to do a somewhat complex error handling dance to ensure
                // that we don't have any inflight requests by the time we terminate
                // the transaction, otherwise we might run SQL queries on the wrong
                // connection/transaction and that would be bad
                await new Promise((resolve, reject) => {
                    let error;
                    parser.on('error', (e) => {
                        error = new BadRequestError(e.message);
                        transformer.end();
                    });
                    transformer.on('error', (e) => {
                        error = e;
                        writer.end();
                    });
                    writer.on('error', reject);
                    writer.on('finish', () => {
                        if (error)
                            reject(error);
                        else
                            resolve();
                    });
                });
            });
        } finally {
            if (req.files.upload && req.files.upload.length)
                await Q.nfcall(fs.unlink, req.files.upload[0].path);
        }
    },

    uploadStringDataset: async function(req) {
        const language = I18n.localeToLanguage(req.locale);

        try {
            await db.withTransaction(async (dbClient) => {
                const match = NAME_REGEX.exec(req.body.type_name);
                if (match === null)
                    throw new BadRequestError(req._("Invalid string type ID."));
                if (['public-domain', 'free-permissive', 'free-copyleft', 'non-commercial', 'proprietary'].indexOf(req.body.license) < 0)
                    throw new BadRequestError(req._("Invalid license."));

                let [, prefix, /*suffix*/] = match;

                if ((req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0) {
                    let row;
                    try {
                        row = await schemaModel.getByKind(dbClient, prefix);
                    } catch(e) {
                        if (e.code !== 'ENOENT')
                            throw e;
                    }
                    if (!row || row.owner !== req.user.developer_org)
                        throw new ForbiddenError(req._("The prefix of the dataset ID must correspond to the ID of a Thingpedia device owned by your organization."));
                }

                if (!req.files.upload || !req.files.upload.length)
                    throw new BadRequestError(req._("You must upload a TSV file with the string values."));

                const stringType = await stringModel.create(dbClient, {
                    language: language,
                    type_name: req.body.type_name,
                    name: req.body.name,
                    license: req.body.license,
                    attribution: req.body.attribution || '',
                });

                const file = fs.createReadStream(req.files.upload[0].path);
                file.setEncoding('utf8');
                const parser = file.pipe(csvparse({ delimiter: '\t', relax: true }));
                const transformer = new StreamTokenizer({
                    preprocessed: !!req.body.preprocessed,
                    language,
                    typeId: stringType.id,
                });
                const writer = stringModel.insertValueStream(dbClient);
                parser.pipe(transformer).pipe(writer);

                // we need to do a somewhat complex error handling dance to ensure
                // that we don't have any inflight requests by the time we terminate
                // the transaction, otherwise we might run SQL queries on the wrong
                // connection/transaction and that would be bad
                await new Promise((resolve, reject) => {
                    let error;
                    parser.on('error', (e) => {
                        error = new BadRequestError(e.message);
                        transformer.end();
                    });
                    transformer.on('error', (e) => {
                        error = e;
                        writer.end();
                    });
                    writer.on('error', reject);
                    writer.on('finish', () => {
                        if (error)
                            reject(error);
                        else
                            resolve();
                    });
                });
            });
        } finally {
            if (req.files.upload && req.files.upload.length)
                await Q.nfcall(fs.unlink, req.files.upload[0].path);
        }
    }
};
