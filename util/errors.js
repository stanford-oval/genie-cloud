// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

class HTTPError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

class BadRequestError extends HTTPError {
    constructor(message) {
        super(400, message);
        this.code = 'EINVAL';
    }
}

class ForbiddenError extends HTTPError {
    constructor(message = "You do not have permission to perform the requested operation.") {
        super(403, message);
        this.code = 'EPERM';
    }
}

class NotFoundError extends Error {
    constructor() {
        super("Not Found");
        this.code = 'ENOENT';
    }
}

class InternalError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

module.exports = {
    HTTPError,
    BadRequestError,
    ForbiddenError,

    NotFoundError,

    InternalError
};
