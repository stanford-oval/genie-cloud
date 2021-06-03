// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as util from 'util';
import * as nodemailer from 'nodemailer';

import { MAILGUN_USER, MAILGUN_PASSWORD } from '../config';

let transporter = null;
function ensureTransporter() {
    // create reusable transporter object using SMTP transport
    if (transporter)
        return transporter;
    transporter = nodemailer.createTransport({
        service: 'Mailgun',
        auth: {
            user: MAILGUN_USER,
            pass: MAILGUN_PASSWORD
        }
    });
    return transporter;
}

export function send(mailOptions) {
    if (MAILGUN_USER === null || MAILGUN_PASSWORD === null) {
        console.error(`Ignored email to ${mailOptions.to} with subject "${mailOptions.subject}"`);
        return Promise.resolve();
    }

    const transporter = ensureTransporter();
    return util.promisify(transporter.sendMail).call(transporter, mailOptions);
}
