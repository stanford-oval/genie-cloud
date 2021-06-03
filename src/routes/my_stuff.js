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

import express from 'express';

import * as Config from '../config';

import * as user from '../util/user';
import EngineManager from '../almond/enginemanagerclient';
import * as iv from '../util/input_validation';

let router = express.Router();
router.use(user.requireLogIn);

async function getInfo(req) {
    const isRunning = await EngineManager.get().isRunning(req.user.id);
    if (!isRunning)
        return [false, [],[]];

    const engine = await EngineManager.get().getEngine(req.user.id);
    let [appinfo, devinfo] = await Promise.all([engine.getAppInfos(), engine.getDeviceInfos()]);
    devinfo = devinfo.filter((d) => d.authType !== 'none' && d.authType !== 'builtin' && d.class !== 'system');
    devinfo.sort((d1, d2) => {
        if (d1.name < d2.name)
            return -1;
        else if (d1.name > d2.name)
            return 1;
        else
            return 0;
    });
    return [isRunning, appinfo, devinfo];
}

router.get('/', (req, res, next) => {
    getInfo(req).then(([isRunning, appinfo, devinfo]) => {
        res.render('my_stuff', { page_title: req._("Thingpedia - My Almond"),
                                 messages: req.flash('app-message'),
                                 csrfToken: req.csrfToken(),
                                 isRunning: isRunning,
                                 apps: appinfo,
                                 devices: devinfo,
                                 CDN_HOST: Config.CDN_HOST
                                });
    }).catch(next);
});

router.post('/', iv.validatePOST({ command: 'string' }), (req, res, next) => {
    getInfo(req).then(([isRunning, appinfo, devinfo]) => {
        res.render('my_stuff', { page_title: req._("Thingpedia - My Almond"),
            messages: req.flash('app-message'),
            csrfToken: req.csrfToken(),
            isRunning: isRunning,
            apps: appinfo,
            devices: devinfo,
            CDN_HOST: Config.CDN_HOST,
            command: req.body.command
        });
    }).catch(next);
});

router.post('/apps/delete', iv.validatePOST({ id: 'string' }), (req, res, next) => {
    EngineManager.get().getEngine(req.user.id).then(async (engine) => {
        const removed = await engine.deleteApp(req.body.id);
        if (!removed) {
            res.status(404).render('error', { page_title: req._("Thingpedia - Error"),
                                              message: req._("Not found.") });
            return;
        }
        req.flash('app-message', "Application successfully deleted");
        res.redirect(303, '/me');
    }).catch(next);
});

router.get('/conversation', (req, res, next) => {
    res.render('my_conversation', { page_title: req._("Thingpedia - Web Almond") });
});

router.post('/conversation', iv.validatePOST({ command: 'string' }), (req, res) => {
    res.render('my_conversation', { page_title: req._("Thingpedia - Web Almond"), command: req.body.command });
});

export default router;
