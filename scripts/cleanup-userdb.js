#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 Google LLC
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// Bootstrap an installation of Almond Cloud by creating the
// database schema and adding the requisite initial data

require('thingengine-core/lib/polyfill');
process.on('unhandledRejection', (up) => { throw up; });
require('../util/config_init');

const model = require('../model/user');
const db = require('../util/db');
//const userUtils = require('../util/user');
const SendMail = require('../util/sendmail');

const Config = require('../config');

const EngineManager = require('../almond/enginemanagerclient');

function printUser(user) {
    return {
        id: user.id,
        username: user.username,
        has_password: !!user.password,
        google_id: user.google_id,
        github_id: user.github_id,
        lastlog: user.lastlog_time,
        registered: user.registration_time
    };
}

async function main() {
    const engineManager = new EngineManager;
    await engineManager.start();

    const oneYearAgo = new Date;
    oneYearAgo.setFullYear(oneYearAgo.getFullYear()-1);
    await db.withTransaction(async (dbClient) => {
        const users = await model.getAll(dbClient);

        const emails = new Map;

        for (let user of users) {
            if (user.email === null)
                continue;
            if (emails.has(user.email.toLowerCase()))
                emails.get(user.email.toLowerCase()).push(user);
            else
                emails.set(user.email.toLowerCase(), [user]);
        }

        for (let [email, users] of emails) {
            if (users.length === 1)
                continue;

            console.log();
            console.log(email);

            let mostRecentLogin = users[0];
            for (let user of users) {
                if (user.lastlog_time > mostRecentLogin.lastlog_time)
                    mostRecentLogin = user;
            }

            const update = {};
            let ok = true;
            for (let user of users) {
                if (user.id === mostRecentLogin.id)
                    continue;
                if (user.password) {
                    if (!mostRecentLogin.password && !update.password) {
                        update.username = user.username;
                        update.password = user.password;
                        update.salt = user.salt;
                        console.log(`would set username/password from ${user.id}/${user.username} to ${mostRecentLogin.id}/${mostRecentLogin.username}`);
                    } else {
                        console.log(`conflict for password`);
                        for (let user of users)
                            console.log(printUser(user));
                        ok = false;
                        break;
                    }
                }
                if (user.google_id) {
                    if (!mostRecentLogin.google_id && !update.google_id) {
                        update.google_id = user.google_id;
                        console.log(`would set google_id from ${user.id}/${user.username} to ${mostRecentLogin.id}/${mostRecentLogin.username}`);
                    } else {
                        console.log(`conflict for google_id`);
                        for (let user of users)
                            console.log(printUser(user));
                        ok = false;
                        break;
                    }
                }
                if (user.github_id) {
                    if (!mostRecentLogin.github_id && !update.github_id) {
                        update.github_id = user.github_id;
                        console.log(`would set github_id from ${user.id}/${user.username} to ${mostRecentLogin.id}/${mostRecentLogin.username}`);
                    } else {
                        console.log(`conflict for github_id`);
                        for (let user of users)
                            console.log(printUser(user));
                        ok = false;
                        break;
                    }
                }
            }
            if (ok) {
                for (let user of users) {
                    if (user.id === mostRecentLogin.id)
                        continue;

                    console.log(`would delete ${user.id}`);
                    await engineManager.killUser(user.id);
                    await model.delete(dbClient, user.id);
                }
                console.log(`would update ${mostRecentLogin.id}`, update);
                await model.update(dbClient, mostRecentLogin.id, update);
                if (mostRecentLogin.lastlog_time > oneYearAgo) {
                    console.log(`would email ${email}`);
                    const mailOptions = {
                        from: Config.EMAIL_FROM_USER,
                        to: email,
                        subject: 'Multiple Almond Accounts Detected',
                        text:
`Hi ${update.username || mostRecentLogin.username},

We have detected that you have multiple Almond accounts associated to the same email
address.
This is not allowed by our terms of service, and was previously possible due to a bug
in the system.

Your account information has been automatically merged, and you should be able to access
your account with the same username and password or external login as before.
At the same time, skill configurations on your duplicate accounts might have been deleted.
We apologize for the inconvenience. You can configure new skills from the My Almond page.

Best,

The Almond Team

----
You are receiving this email because this address is associated with one
or more accounts on the Almond service.
`
                    };

                    await SendMail.send(mailOptions);
                }
            } else {
                for (let user of users) {
                    if (user.id === mostRecentLogin.id)
                        continue;
                    console.log(`would set email = null for ${user.id}`);
                    await model.update(dbClient, user.id, { email: null, email_verified: false });
                }
                if (mostRecentLogin.lastlog_time > oneYearAgo) {
                    console.log(`would email ${email}`);
                    const mailOptions = {
                        from: Config.EMAIL_FROM_USER,
                        to: email,
                        subject: 'Multiple Almond Accounts Detected',
                        text:
`Hi ${update.username || mostRecentLogin.username},

We have detected that you have multiple Almond accounts associated to the same email
address.
This is not allowed by our terms of service, and was previously possible due to a bug
in the system.

All but your most-recently-used account now have restricted functionality. You can
log in to them and set a different email, or you can delete them.

Best,

The Almond Team

----
You are receiving this email because this address is associated with one
or more accounts on the Almond service.
`
                    };

                    await SendMail.send(mailOptions);
                }
            }
        }
    });

    await db.tearDown();
    await engineManager.stop();
}
main();
