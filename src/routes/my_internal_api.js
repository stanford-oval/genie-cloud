// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as user from '../util/user';
import { ForbiddenError } from '../util/errors';
import { isOriginOk } from '../util/origin';
import * as MyConversation from './my_conversation';

let router = express.Router();

// /me/ws is not under Access-Control-Allow-Origin, but we need to check
// this manually because WebSockets are not subject to same-origin policy
// so the browser won't protect us
router.use((req, res, next) => {
    if (isOriginOk(req))
        next();
    else
        next(new ForbiddenError('Forbidden Cross Origin Request'));
});
router.ws('/anonymous', MyConversation.anonymous);
router.use(user.requireLogIn);
router.ws('/results', MyConversation.results);
router.ws('/conversation', MyConversation.conversation);

export default router;
