// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as userModel from './model/user';

declare global {
    namespace Express {
        // These open interfaces may be extended in an application-specific manner via declaration merging.
        // See for example method-override.d.ts (https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/method-override/index.d.ts)
        interface Request {
            locale : string;
            gettext : (x : string) => string;
            _ : (x : string) => string;
            pgettext : (c : string, x : string) => string;
            ngettext : (x : string, x1 : string, n : number) => string;
        }

        interface User extends userModel.RowWithOrg {
            newly_created ?: boolean;
        }

        interface AuthInfo {
            scope : string[];
            authMethod ?: 'oauth2';
        }
    }
}

declare module 'express-session' {
    interface SessionData {
        completed2fa : boolean;
        // redirect after login
        redirect_to : string;

        // redirect after configuring a device
        'device-redirect-to' : string;

        // redirect for OAuth proxy
        redirect : string;
        kind : string;

        [key : string] : unknown;
    }
}

export {};
