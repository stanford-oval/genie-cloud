// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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


// Cloud platform

import * as fs from 'fs';
import * as util from 'util';
import * as os from 'os';
import * as events from 'events';
import * as child_process from 'child_process';
import { LocalCVC4Solver } from 'smtlib';
import * as Tp from 'thingpedia';
import * as rpc from 'transparent-rpc';

import * as graphics from './graphics';
import * as i18n from '../util/i18n';

const _unzipApi : Tp.Capabilities.UnzipApi = {
    unzip(zipPath, dir) {
        const args = ['-uo', zipPath, '-d', dir];
        return util.promisify(child_process.execFile)('/usr/bin/unzip', args, {
            maxBuffer: 10 * 1024 * 1024 }).then(({ stdout, stderr }) => {
            console.log('stdout', stdout);
            console.log('stderr', stderr);
        });
    }
};

interface WebhookReply {
    contentType ?: string;
    code : number;
    response ?: string;
}

// FIXME the definition in Tp.Capabilities is wrong because it's missing the potential webhook reply
type WebhookCallback = (id : string, method : 'GET' | 'POST', query : URLQuery, headers : URLQuery, payload : unknown) => Promise<WebhookReply|void>;

type URLQuery = { [key : string] : string|string[]|undefined };
export class WebhookApi implements rpc.Stubbable {
    $rpcMethods = ['handleCallback'] as const;
    $free ?: () => void;
    private _userId : string;
    private _hooks : Record<string, WebhookCallback>;

    constructor(userId : string) {
        this._hooks = {};
        this._userId = userId;
    }

    handleCallback(id : string, method : 'GET' | 'POST', query : URLQuery, headers : URLQuery, payload : unknown) : Promise<WebhookReply|void> {
        return Promise.resolve().then(() => {
            if (id in this._hooks)
                return this._hooks[id](id, method, query, headers, payload);
            else
                console.log('Ignored webhook callback with ID ' + id);
            return Promise.resolve();
        }).catch((e) => {
            console.error(e.stack);
            throw e;
        });
    }

    getWebhookBase() {
        return _platform.getOrigin() + '/api/webhook/' + this._userId;
    }

    registerWebhook(id : string, callback : WebhookCallback) {
        if (id in this._hooks)
            throw new Error('Duplicate webhook ' + id + ' registered');

        this._hooks[id] = callback;
    }

    unregisterWebhook(id : string) {
        delete this._hooks[id];
    }
}

interface WebSocket extends events.EventEmitter {
    ping() : void;
    pong() : void;
    terminate() : void;
    send(data : string) : void;
}
class WebSocketWrapper extends events.EventEmitter implements rpc.Stubbable, WebSocket {
    $rpcMethods = ['onPing', 'onPong', 'onMessage', 'onClose'] as const;
    $free ?: () => void;
    private _delegate : rpc.Proxy<WebSocket>;

    constructor(delegate : rpc.Proxy<WebSocket>) {
        super();

        this._delegate = delegate;
    }

    ping() {
        return this._delegate.ping();
    }

    pong() {
        return this._delegate.pong();
    }

    terminate() {
        return this._delegate.terminate();
    }

    send(data : string) {
        return this._delegate.send(data);
    }

    onPing() {
        this.emit('ping');
    }

    onPong() {
        this.emit('pong');
    }

    onMessage(data : string) {
        this.emit('message', data);
    }

    onClose() {
        this.emit('close');
    }
}

export class WebSocketApi extends events.EventEmitter implements Tp.Capabilities.WebSocketApi, rpc.Stubbable {
    $rpcMethods = ['newConnection'] as const;
    $free ?: () => void;

    constructor() {
        super();
    }

    newConnection(delegate : rpc.Proxy<WebSocket>) {
        const wrapper = new WebSocketWrapper(delegate);
        this.emit('connection', wrapper);
        wrapper.on('close', () => {
            delegate.$free();
            if (wrapper.$free)
                wrapper.$free();
        });
        return wrapper;
    }
}

export interface PlatformOptions {
    userId : number;
    cloudId : string;
    authToken : string;
    developerKey : string|null;
    locale : string;
    timezone : string;
    storageKey : string;
    modelTag : string|null;
}

export class Platform extends Tp.BasePlatform {
    private _cloudId : string;
    private _authToken : string;
    private _developerKey : string|null;
    private _thingpediaClient : rpc.Proxy<Tp.BaseClient>|null;
    private _locale : string;
    private _timezone : string;
    private _sqliteKey : string;
    // TODO
    private _gettext : ReturnType<(typeof i18n)['get']>;
    private _writabledir : string;
    private _prefs : Tp.Helpers.FilePreferences;
    private _webhookApi : WebhookApi;
    private _websocketApi : WebSocketApi;

    constructor(thingpediaClient : rpc.Proxy<Tp.BaseClient>|null, options : PlatformOptions) {
        super();
        this._cloudId = options.cloudId;
        this._authToken = options.authToken;
        this._developerKey = options.developerKey;
        this._thingpediaClient = thingpediaClient;
        this._locale = options.locale;
        this._timezone = options.timezone;
        this._sqliteKey = options.storageKey;

        this._gettext = i18n.get(this._locale);

        this._writabledir = _shared ? (process.cwd() + '/' + options.cloudId) : process.cwd();
        try {
            fs.mkdirSync(this._writabledir + '/cache');
        } catch(e) {
            if (e.code !== 'EEXIST')
                throw e;
        }
        this._prefs = new Tp.Helpers.FilePreferences(this._writabledir + '/prefs.db');

        this._webhookApi = new WebhookApi(this._cloudId);
        this._websocketApi = new WebSocketApi();
    }

    get type() {
        return 'cloud';
    }

    get locale() {
        return this._locale;
    }

    get timezone() {
        return this._timezone;
    }

    // Return the platform device for this platform, accessing platform-specific
    // functionality from natural language.
    //
    // Cloud has no platform device.
    getPlatformDevice() {
        return null;
    }

    // Obtain a shared preference store
    // Preferences are simple key/value store which is shared across all apps
    // but private to this instance (tier) of the platform
    // Preferences should be normally used only by the engine code, and a persistent
    // shared store such as DataVault should be used by regular apps
    getSharedPreferences() {
        return this._prefs;
    }

    // Check if we need to load and run the given thingengine-module on
    // this platform
    // (eg we don't need discovery on the cloud, and we don't need graphdb,
    // messaging or the apps on the phone client)
    hasFeature(feature : string) {
        switch (feature) {
        case 'discovery':
            return false;

        case 'permissions':
            return LocalCVC4Solver !== null;

        default:
            return true;
        }
    }

    // Check if this platform has the required capability
    // (eg. long running, big storage, reliable connectivity, server
    // connectivity, stable IP, local device discovery, bluetooth, etc.)
    //
    // Which capabilities are available affects which apps are allowed to run
    hasCapability(cap : keyof Tp.Capabilities.CapabilityMap) {
        switch (cap) {
        case 'code-download':
            // If downloading code from the thingpedia server is allowed on
            // this platform
            return true;

        case 'thingpedia-client':
            return _platform.thingpediaUrl === '/thingpedia';

        case 'graphics-api':
        case 'webhook-api':
        case 'websocket-api':
            return true;

        case 'gettext':
            return true;

        case 'smt-solver':
            return LocalCVC4Solver !== null;

        default:
            return false;
        }
    }

    // Retrieve an interface to an optional functionality provided by the
    // platform
    //
    // This will return null if hasCapability(cap) is false
    getCapability(cap : keyof Tp.Capabilities.CapabilityMap) {
        switch (cap) {
        case 'code-download':
            // We have the support to download code
            return _unzipApi;

        case 'graphics-api':
            return graphics;

        case 'thingpedia-client':
            return this._thingpediaClient;

        case 'webhook-api':
            return this._webhookApi;

        case 'websocket-api':
            return this._websocketApi;

        case 'gettext':
            return this._gettext;

        case 'smt-solver':
            return LocalCVC4Solver;

        default:
            return null;
        }
    }

    // Get the root of the application
    // (In android, this is the virtual root of the APK)
    getRoot() {
        return process.cwd();
    }

    // Get a directory that is guaranteed to be writable
    // (in the private data space for Android, in the current directory for server)
    getWritableDir() {
        return this._writabledir;
    }

    // Get a directory good for long term caching of code
    // and metadata
    getCacheDir() {
        return this._writabledir + '/cache';
    }

    // Get a temporary directory
    // Also guaranteed to be writable, but not guaranteed
    // to persist across reboots or for long times
    // (ie, it could be periodically cleaned by the system)
    getTmpDir() {
        return os.tmpdir();
    }

    // Get the filename of the sqlite database
    getSqliteDB() {
        return this._writabledir + '/sqlite.db';
    }

    // Get the encryption key of the sqlite database
    getSqliteKey() {
        return this._sqliteKey;
    }

    // Get the Thingpedia developer key, if one is configured
    getDeveloperKey() {
        return this._developerKey;
    }

    // Change the Thingpedia developer key, if possible
    // Returns true if the change actually happened
    setDeveloperKey() {
        return false;
    }

    // Return a server/port URL that can be used to refer to this
    // installation. This is primarily used for OAuth redirects, and
    // so must match what the upstream services accept.
    getOrigin() {
        return _platform.getOrigin();
    }

    getCloudId() {
        return this._cloudId;
    }

    getAuthToken() {
        return this._authToken;
    }

    // Change the auth token
    // Returns true if a change actually occurred, false if the change
    // was rejected
    setAuthToken(authToken : string) {
        // the auth token is stored outside in the mysql db, we can never
        // change it
        return false;
    }
}

let _shared : boolean;
class PlatformModule {
    private _thingpediaUrl ! : string;
    private _nlServerUrl ! : string;
    private _oauthRedirectOrigin ! : string;

    // Initialize the platform code
    // Will be called before instantiating the engine
    init(options : {
        shared : boolean;
        thingpedia_url : string;
        nl_server_url : string;
        oauth_redirect_origin : string;
    }) {
        _shared = options.shared;
        this._thingpediaUrl = options.thingpedia_url;
        this._nlServerUrl = options.nl_server_url;
        this._oauthRedirectOrigin = options.oauth_redirect_origin;
    }

    get thingpediaUrl() {
        return this._thingpediaUrl;
    }
    get nlServerUrl() {
        return this._nlServerUrl;
    }

    get shared() {
        return _shared;
    }

    newInstance(thingpediaClient : rpc.Proxy<Tp.BaseClient>|null, options : PlatformOptions) {
        return new Platform(thingpediaClient, options);
    }

    // for compat with existing code that does platform.getOrigin()
    getOrigin() {
        return this._oauthRedirectOrigin;
    }

    // Check if this platform has the required capability
    // This is only for compat with existing code
    hasCapability(cap : keyof Tp.Capabilities.CapabilityMap) {
        switch (cap) {
        case 'graphics-api':
            return true;
        default:
            return false;
        }
    }

    // Check if this platform has the required capability
    // This is only about caps that don't consider the current context
    // for compat with existing code
    getCapability(cap : keyof Tp.Capabilities.CapabilityMap) {
        switch (cap) {
        case 'graphics-api':
            return graphics;
        default:
            return null;
        }
    }

    // Stop the main loop and exit
    // (In Android, this only stops the node.js thread)
    // This function should be called by the platform integration
    // code, after stopping the engine
    exit() {
        return process.exit();
    }
}
const _platform = new PlatformModule();
export default _platform;
