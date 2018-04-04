// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const nodemailer = require('nodemailer');

const { MAILGUN_USER, MAILGUN_PASSWORD }  = require('../config');

var transporter = null;
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

module.exports = {
   send(mailOptions) {
       return Q.ninvoke(ensureTransporter(), 'sendMail', mailOptions);
   }
};
