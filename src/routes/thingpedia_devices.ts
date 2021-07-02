// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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

import assert from 'assert';
import express from 'express';
import * as ThingTalk from 'thingtalk';

import * as db from '../util/db';
import * as model from '../model/device';
import * as user from '../util/user';
import * as schemaModel from '../model/schema';
import * as exampleModel from '../model/example';
import * as trainingJobModel from '../model/training_job';
import * as I18n from '../util/i18n';
import * as tokenize from '../util/tokenize';

import * as SchemaUtils from '../util/manifest_to_schema';
import * as DatasetUtils from '../util/dataset';
import * as Importer from '../util/import_device';
import * as codeStorage from '../util/code_storage';
import * as iv from '../util/input_validation';
import { NotFoundError } from '../util/errors';
import { parseOldOrNewSyntax } from '../util/compat';
import * as stringModel from '../model/strings';
import * as entityModel from '../model/entity';

const router = express.Router();

function _(x : string) { return x; }

router.get('/', (req, res, next) => {
    res.redirect(301, '/thingpedia');
});

function getOrgId(req : express.Request) {
    if (!req.user)
        return null;
    if ((req.user.roles & user.Role.THINGPEDIA_ADMIN) !== 0)
        return -1;
    else
        return req.user.developer_org;
}

const MEASURE_NAMES = {
    ms: _("duration"),
    C: _("temperature"),
    m: _("length"),
    mps: _("speed"),
    kg: _("weight"),
    Pa: _("pressure"),
    kcal: _("energy"),
    byte: _("size")
};

async function getHumanReadableType(req : express.Request,
                                    language : string,
                                    dbClient : db.Client,
                                    arg : ThingTalk.Ast.ArgumentDef,
                                    type : ThingTalk.Type) : Promise<string> {
    if (type instanceof ThingTalk.Type.Array)
        return req._("list of %s").format(await getHumanReadableType(req, language, dbClient, arg, type.elem as ThingTalk.Type));

    if (arg.annotations.string_values) {
        let stringType;
        try {
            stringType = await stringModel.getByTypeName(dbClient, arg.getImplementationAnnotation<string>('string_values')!, language);
        } catch(e) {
            if (language === 'en' || !(e instanceof NotFoundError))
                throw e;
            stringType = await stringModel.getByTypeName(dbClient, arg.getImplementationAnnotation<string>('string_values')!, 'en');
        }
        return stringType.name.toLowerCase();
    } else if (type instanceof ThingTalk.Type.Entity) {
        let entityType;
        try {
            entityType = await entityModel.get(dbClient, type.type, language);
        } catch(e) {
            if (language === 'en' || !(e instanceof NotFoundError))
                throw e;
            entityType = await entityModel.get(dbClient, type.type, 'en');
        }
        return entityType.name.toLowerCase();
    } else if (type.isString) {
        return req._("free-form text");
    } else if (type.isNumber) {
        return req._("number");
    } else if (type.isBoolean) {
        return req._("true or false");
    } else if (type.isCurrency) {
        return req._("currency amount");
    } else if (type instanceof ThingTalk.Type.Measure) {
        return req._(MEASURE_NAMES[type.unit as keyof typeof MEASURE_NAMES]);
    } else if (type instanceof ThingTalk.Type.Enum) {
        return req._("one of %s").format(type.entries!.map(tokenize.clean).join(", "));
    } else if (type.isTime) {
        return req._("time of day");
    } else if (type.isDate) {
        return req._("point in time");
    } else if (type.isLocation) {
        return req._("location");
    } else {
        // ignore weird/internal types return nothing
        return String(type);
    }
}

async function loadHumanReadableType(req : express.Request, language : string, dbClient : db.Client, arg : ThingTalk.Ast.ArgumentDef) {
    arg.metadata.human_readable_type = await getHumanReadableType(req, language, dbClient, arg, arg.type);
}

function loadHumanReadableTypes(req : express.Request, language : string, dbClient : db.Client, classDef : ThingTalk.Ast.ClassDef) {
    const promises = [];

    for (const what of ['actions', 'queries'] as const) {
        for (const name in classDef[what]) {
            for (const argname of classDef[what][name].args) {
                const arg = classDef[what][name].getArgument(argname)!;
                promises.push(loadHumanReadableType(req, language, dbClient, arg));
            }
        }
    }

    return promises;
}

function durationToString(_ : (x : string) => string, ngettext : (x : string, x1 : string, n : number) => string, poll_interval : number) {
    if (poll_interval < 1000)
        return _("%d milliseconds").format(poll_interval);

    poll_interval = Math.round(poll_interval / 1000);

    const poll_interval_sec = poll_interval % 60;

    poll_interval = Math.floor(poll_interval / 60);
    const poll_interval_min = poll_interval % 60;

    const poll_interval_h = Math.floor(poll_interval / 60);

    if (poll_interval_sec !== 0) {
        if (poll_interval_min !== 0) {
            if (poll_interval_h !== 0)
                return _("%d hours %d minutes %d seconds").format(poll_interval_h, poll_interval_min, poll_interval_sec);
            else
                return _("%d minutes %d seconds").format(poll_interval_min, poll_interval_sec);
        } else {
            if (poll_interval_h !== 0)
                return _("%d hours %d seconds").format(poll_interval_h, poll_interval_sec);
            else
                return ngettext("second", "%d seconds", poll_interval_sec).format(poll_interval_sec);
        }
    } else {
        if (poll_interval_min !== 0) {
            if (poll_interval_h !== 0)
                return _("%d hours %d minutes").format(poll_interval_h, poll_interval_min);
            else
                return ngettext("minute", "%d minutes", poll_interval_min).format(poll_interval_min);
        } else {
            return ngettext("hour", "%d hours", poll_interval_h).format(poll_interval_h);
        }
    }
}

interface DeviceDetails extends model.ByPrimaryKindRow {
    version ?: number|null;
    translated ?: boolean;
    current_jobs ?: Record<string, trainingJobModel.Row[]>;
    download_url ?: string;
}

function getDetails<T, ReqQuery extends { version ?: string }>(fn : (dbClient : db.Client, arg : T) => Promise<model.ByPrimaryKindRow>,
                                                               param : T,
                                                               req : express.Request<any, any, any, ReqQuery>,
                                                               res : express.Response) {
    const language = I18n.localeToLanguage(req.locale);

    return db.withClient(async (client) => {
        const device : DeviceDetails = await fn(client, param);

        let version : number|null;
        if (req.query.version && req.user && (req.user.roles & user.Role.THINGPEDIA_ADMIN) !== 0)
            version = parseInt(req.query.version);
        else if (req.user &&
                 (req.user.developer_org === device.owner || (req.user.roles & user.Role.THINGPEDIA_ADMIN) !== 0))
            version = device.developer_version;
        else
            version = device.approved_version;

        device.version = version;

        const [code, examples, current_jobs] = await Promise.all([
            version !== null ? model.getCodeByVersion(client, device.id, version) : Promise.resolve(`class @${device.primary_kind} {}`),
            exampleModel.getByKinds(client, [device.primary_kind], getOrgId(req), language, true),
            trainingJobModel.getForDevice(client, language, device.primary_kind)
        ]);

        const current_job_queues : Record<string, trainingJobModel.Row[]> = {};
        for (const job of current_jobs) {
            if (current_job_queues[job.job_type])
                current_job_queues[job.job_type].push(job);
            else
                current_job_queues[job.job_type] = [job];
        }

        let parsed;
        try {
            parsed = parseOldOrNewSyntax(code);
        } catch(e) {
            if (e.name !== 'SyntaxError')
                throw e;
            // really obsolete device, likely a JSON manifest
            parsed = parseOldOrNewSyntax(`abstract class @${device.primary_kind} { }`);
        }
        assert(parsed instanceof ThingTalk.Ast.Library && parsed.classes.length > 0);
        const classDef = parsed.classes[0];

        let translated;
        if (language === 'en') {
            translated = true;
        } else {
            const schemas = await schemaModel.getMetasByKinds(client, [req.params.kind], getOrgId(req), language);
            if (schemas.length !== 0)
                translated = SchemaUtils.mergeClassDefAndSchema(classDef, schemas[0]);
            else
                translated = false;
        }

        await Promise.all(loadHumanReadableTypes(req, language, client, classDef));
        device.translated = translated;
        device.current_jobs = current_job_queues;

        const online = false;
        const sortedexamples = DatasetUtils.sortAndChunkExamples(examples);

        let title;
        if (online)
            title = req._("Thingpedia - Account details");
        else
            title = req._("Thingpedia - Device details");

        if (version !== null && Importer.isDownloadable(classDef)) {
            device.download_url = await codeStorage.getDownloadLocation(device.primary_kind, version,
                device.approved_version === null || (version !== null && version > device.approved_version));
        }

        res.render('thingpedia_device_details', { page_title: title,
                                                  device: device,
                                                  classDef: classDef,
                                                  examples: sortedexamples,
                                                  clean: tokenize.clean,
                                                  durationToString });
    }).catch((e) => {
        if (e.code !== 'ENOENT')
            throw e;

        res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                          message: e });
    });
}

router.get('/by-id/:kind', iv.validateGET({ version: '?integer' }), (req, res, next) => {
    getDetails(model.getByPrimaryKind, req.params.kind, req, res).catch(next);
});

router.use(user.requireLogIn);

router.post('/approve', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validatePOST({ kind: 'string' }), (req, res, next) => {
    db.withTransaction((dbClient) => {
        return Promise.all([
            model.approve(dbClient, req.body.kind),
            schemaModel.approveByKind(dbClient, req.body.kind)
        ]);
    }).then(() => {
        res.redirect(303, '/thingpedia/devices/by-id/' + req.body.kind);
    }).catch(next);
});

router.post('/unapprove', user.requireRole(user.Role.THINGPEDIA_ADMIN), iv.validatePOST({ kind: 'string' }), (req, res, next) => {
    db.withTransaction((dbClient) => {
        return Promise.all([
            model.unapprove(dbClient, req.body.kind),
            schemaModel.unapproveByKind(dbClient, req.body.kind)
        ]);
    }).then(() => {
        res.redirect(303, '/thingpedia/devices/by-id/' + req.body.kind);
    }).catch(next);
});

router.use(user.requireDeveloper());

router.post('/delete', iv.validatePOST({ kind: 'string' }), (req, res, next) => {
    db.withTransaction(async (dbClient) => {
        const row = await model.getByPrimaryKind(dbClient, req.body.kind);
        if (row.owner !== req.user!.developer_org &&
            (req.user!.roles & user.Role.THINGPEDIA_ADMIN) === 0) {
            // note that this must be exactly the same error used by util/db.js
            // so that a true not found is indistinguishable from not having permission
            throw new NotFoundError();
        }

        await schemaModel.deleteByKind(dbClient, req.body.kind);
        await model.delete(dbClient, row.id);
    }).then(() => {
        res.redirect(303, '/thingpedia/devices');
    }).catch(next);
});

export default router;
