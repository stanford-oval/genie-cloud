// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
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
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import * as util from 'util';

import '../types';
import * as db from './db';
import * as model from '../model/user';
import { makeRandom } from './random';
import { ForbiddenError, BadRequestError, InternalError } from './errors';

import * as Config from '../config';

export function hashPassword(salt : string, password : string) : Promise<string> {
    return util.promisify(crypto.pbkdf2)(password, salt, 10000, 32, 'sha1')
        .then((buffer) => buffer.toString('hex'));
}

export const OAuthScopes = new Set([
    'profile', // minimum scope: see the user's profile

    'user-read', // read active commands and devices
    'user-read-results', // read results of active commands
    'user-exec-command', // execute thingtalk (includes web almond access)
    'user-sync', // cloud sync (dump credentials)

    'developer-read', // read unapproved devices (equivalent to a developer key)
    'developer-upload', // upload new devices
    'developer-admin', // modify thingpedia organization settings, add/remove members
] as const);
export type OAuthScopes = Parameters<(typeof OAuthScopes)['has']>[0];

export function isAuthenticated<T extends Request>(req : T) : req is T & { user : Express.User } {
    if (!req.user)
        return false;

    // no need for 2fa when using OAuth tokens
    if (req.authInfo && req.authInfo.authMethod === 'oauth2')
        return true;

    // no need for 2fa when 2fa is not setup
    if (req.user.totp_key === null)
        return true;

    return !!req.session.completed2fa;
}

const INVALID_USERNAMES = new Set('admin,moderator,administrator,mod,sys,system,community,info,you,name,username,user,nickname,discourse,discourseorg,discourseforum,support,hp,account-created,password-reset,admin-login,confirm-admin,account-created,activate-account,confirm-email-token,authorize-email,stanfordalmond,almondstanford,almond,root,noreply,stanford'.split(','));

const MAX_USERNAME_LENGTH = 60;

function validateUsername(username : string) {
    if (username.length > MAX_USERNAME_LENGTH ||
        INVALID_USERNAMES.has(username.toLowerCase()) ||
        /[^\w.-]/.test(username) ||
        /\.(js|json|css|htm|html|xml|jpg|jpeg|png|gif|bmp|ico|tif|tiff|woff)$/i.test(username))
        return false;
    return true;
}

export enum DeveloperStatus {
    USER,
    DEVELOPER,
    ORG_ADMIN,
}

export enum Role {
    ADMIN = 1,             // allows to view and manipulate users
    BLOG_EDITOR = 2,       // allows to edit blogs
    THINGPEDIA_ADMIN = 4,  // allows to view/edit/approve thingpedia entries (devices, datasets, strings, entities, examples, etc)
    TRUSTED_DEVELOPER = 8, // allows to approve their own device
    DISCOURSE_ADMIN = 16,  // admin of the community forum (through SSO)
    NLP_ADMIN = 32,        // admin of datasets, mturk, and training

    // all privileges
    ROOT = 63,

    // all roles that grant access to /admin hierarchy
    ALL_ADMIN = 1+2+4+32,
}

export enum ProfileFlags {
    VISIBLE_ORGANIZATION_PROFILE = 1,
    SHOW_HUMAN_NAME = 2,
    SHOW_EMAIL = 4,
    SHOW_PROFILE_PICTURE = 8,
}

export const GOOGLE_SCOPES = ['openid','profile','email'].join(' ');

export const GITHUB_SCOPES = ['read:user', 'user:email'].join(' ');

export {
    MAX_USERNAME_LENGTH,
    validateUsername,
};

export interface RegisterOptions {
    username : string;
    human_name ?: string;
    email : string;
    email_verified ?: boolean;
    password : string;
    locale : string;
    timezone : string;
    developer_org ?: number;
    developer_status ?: number;
    roles ?: number;
    profile_flags ?: number;
}

interface I18nReq {
    _(x : string) : string;
}

export async function register(dbClient : db.Client, req : I18nReq, options : RegisterOptions) {
    const usernameRows = await model.getByName(dbClient, options.username);
    if (usernameRows.length > 0)
        throw new BadRequestError(req._("A user with this name already exists."));
    const emailRows = await model.getByEmail(dbClient, options.email);
    if (emailRows.length > 0)
        throw new BadRequestError(req._("A user with this email already exists."));

    const salt = makeRandom();
    const cloudId = makeRandom(8);
    const authToken = makeRandom();
    const storageKey = makeRandom();
    const hash = await hashPassword(salt, options.password);
    const created = await model.create(dbClient, {
        username: options.username,
        human_name: options.human_name || null,
        password: hash,
        email: options.email,
        email_verified: options.email_verified || false,
        locale: options.locale,
        timezone: options.timezone,
        salt: salt,
        cloud_id: cloudId,
        auth_token: authToken,
        storage_key: storageKey,
        developer_org: options.developer_org || null,
        developer_status: options.developer_status || 0,
        roles: options.roles || 0,
        profile_flags: options.profile_flags || 0,
    });

    // readback the record from the db to retrieve the full profile
    return model.get(dbClient, created.id);
}

export function recordLogin(dbClient : db.Client, userId : number) {
    return model.recordLogin(dbClient, userId);
}

export async function update(dbClient : db.Client, user : db.WithID<Partial<model.Row>>, oldpassword : string|undefined, password : string) {
    if (user.salt && user.password) {
        if (!oldpassword || user.password !== await hashPassword(user.salt, oldpassword))
            throw new ForbiddenError('Invalid old password');
    }
    const salt = makeRandom();
    const newhash = await hashPassword(salt, password);
    await model.update(dbClient, user.id, {
        salt: salt,
        password: newhash
    });
    user.salt = salt;
    user.password = newhash;
}

export async function resetPassword(dbClient : db.Client, user : db.WithID<Partial<model.Row>>, password : string) {
    const salt = makeRandom();
    const newhash = await hashPassword(salt, password);
    await model.update(dbClient, user.id, { salt: salt,
                                            password: newhash });
    user.salt = salt;
    user.password = newhash;
}

export async function makeDeveloper(dbClient : db.Client, userId : number, orgId : number|null, status : DeveloperStatus = DeveloperStatus.ORG_ADMIN) {
    if (orgId !== null) {
        await model.update(dbClient, userId, {
            developer_org: orgId,
            developer_status: status,
        });
    } else {
        await model.update(dbClient, userId, {
            developer_org: null,
            developer_status: 0,
        });
    }
}

export function requireLogIn(req : Request, res : Response, next : NextFunction) {
    if (isAuthenticated(req)) {
        next();
        return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
        if (!req.originalUrl.startsWith('/me/api') &&
            !req.originalUrl.startsWith('/me/recording') &&
            !req.originalUrl.startsWith('/me/ws'))
            req.session.redirect_to = req.originalUrl;
        if (req.user)
            res.redirect('/user/2fa/login');
        else
            res.redirect('/user/login');
    } else {
        res.status(401).render('login_required',
                                { page_title: req._("Thingpedia - Error") });
    }
}

export function requireRole(role : Role) {
    if (role === undefined)
        throw new TypeError(`invalid requireRole call`);
    return function(req : Request, res : Response, next : NextFunction) {
        if ((req.user!.roles & role) !== role) {
            res.status(403).render('error', {
                page_title: req._("Thingpedia - Error"),
                message: req._("You do not have permission to perform this operation.")
            });
        } else {
            next();
        }
    };
}

export function requireAnyRole(roleset : number) {
    return function(req : Request, res : Response, next : NextFunction) {
        if ((req.user!.roles & roleset) === 0) {
            res.status(403).render('error', {
                page_title: req._("Thingpedia - Error"),
                message: req._("You do not have permission to perform this operation.")
            });
        } else {
            next();
        }
    };
}

export function requireDeveloper(required ?: DeveloperStatus) {
    if (required === undefined)
        required = 1; // DEVELOPER

    return function(req : Request, res : Response, next : NextFunction) {
        if (req.user!.developer_org === null || req.user!.developer_status < required!) {
            res.status(403).render('error', {
                page_title: req._("Thingpedia - Error"),
                message: req._("You do not have permission to perform this operation.")
            });
        } else {
            next();
        }
    };
}

export function requireScope(scope : OAuthScopes) {
    assert(OAuthScopes.has(scope));
    return function(req : Request, res : Response, next : NextFunction) {
        if (!req.authInfo) {
            next();
            return;
        }

        if (req.authInfo.scope.indexOf(scope) < 0) {
            res.status(403).json({error:'invalid scope'});
            return;
        }

        next();
    };
}

export function getAnonymousUser() {
    return db.withClient((dbClient) => {
        return model.getByName(dbClient, 'anonymous');
    }).then(([user]) => user);
}

export function anonymousLogin(req : Request, res : Response, next : NextFunction) {
    if (req.user) {
        next();
        return;
    }

    if (!Config.ENABLE_ANONYMOUS_USER) {
        res.status(401).render('login_required',
                                { page_title: req._("Thingpedia - Error") });
        return;
    }

    getAnonymousUser().then((user) => {
        if (!user)
            throw new InternalError('E_INVALID_CONFIG', 'Invalid configuration (missing anonymous user)');
        req.login(user, next);
    }).catch((e) => next(e));
}
