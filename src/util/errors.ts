// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

class HTTPError extends Error {
    status : number;

    constructor(status : number, message : string) {
        super(message);
        this.status = status;
    }
}

class BadRequestError extends HTTPError {
    code : 'EINVAL';

    constructor(message : string) {
        super(400, message);
        this.code = 'EINVAL';
    }
}

class ValidationError extends HTTPError {
    code : 'EINVAL';

    constructor(message : string) {
        super(400, message);
        this.code = 'EINVAL';
    }
}

class ForbiddenError extends HTTPError {
    code : 'EPERM';

    constructor(message = "You do not have permission to perform the requested operation.") {
        super(403, message);
        this.code = 'EPERM';
    }
}

class AuthenticationError extends HTTPError {
    code : 'EACCESS';

    constructor(message = "Authentication required.") {
        super(401, message);
        this.code = 'EACCESS';
    }
}

class NotFoundError extends Error {
    code : 'ENOENT';

    constructor() {
        super("Not Found");
        this.code = 'ENOENT';
    }
}

class InternalError extends Error {
    code : string;

    constructor(code : string, message : string) {
        super(message);
        this.code = code;
    }
}

export {
    HTTPError,
    BadRequestError,
    ForbiddenError,
    AuthenticationError,
    ValidationError,

    NotFoundError,

    InternalError
};
