// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

const fs = require('fs');
const Genie = require('genie-toolkit');

// API wrappers for Genie's classes that expose the $rpcMethods interface
// used by transparent-rpc

class ConversationWrapper {
    constructor(conversation, delegate) {
        this._conversation = conversation;
        this._delegate = delegate;
        this._conversation.addOutput(delegate);
    }

    destroy() {
        this._conversation.removeOutput(this._delegate);
        this._delegate.$free();
        this.$free();
    }

    getState() {
        return this._conversation.getState();
    }

    handleCommand(...args) {
        return this._conversation.handleCommand(...args).then(() => this._conversation.saveLog());
    }

    handleParsedCommand(...args) {
        return this._conversation.handleParsedCommand(...args).then(() => this._conversation.saveLog());
    }

    handleThingTalk(...args) {
        return this._conversation.handleThingTalk(...args).then(() => this._conversation.saveLog());
    }
}
ConversationWrapper.prototype.$rpcMethods = ['destroy', 'getState', 'handleCommand', 'handleParsedCommand', 'handleThingTalk'];

class RecordingController {
    constructor(conversation) {
        this._conversation = conversation;
    }

    log() {
        const path = this._conversation.log;
        return path ? fs.readFileSync(path, 'utf-8') : null;
    }

    startRecording() {
        return this._conversation.startRecording();
    }

    endRecording() {
        return this._conversation.endRecording();
    }

    inRecordingMode() {
        return this._conversation.inRecordingMode;
    }

    saveLog() {
        return this._conversation.saveLog();
    }

    voteLast(...args) {
        this._conversation.voteLast(...args);
        return this._conversation.saveLog();
    }

    commentLast(...args) {
        this._conversation.commentLast(...args);
        return this._conversation.saveLog();
    }
}
RecordingController.prototype.$rpcMethods = [
    'log',
    'saveLog',
    'startRecording',
    'endRecording',
    'inRecordingMode',
    'voteLast',
    'commentLast'
];

class NotificationWrapper {
    constructor(dispatcher, delegate) {
        this._dispatcher = dispatcher;
        this._delegate = delegate;
        this._dispatcher.addNotificationOutput(this);
    }

    destroy() {
        this._dispatcher.removeNotificationOutput(this);
        this._delegate.$free();
        this.$free();
    }

    async notify(data) {
        await this._delegate.send({ result: data });
    }

    async notifyError(data) {
        await this._delegate.send({ error: data });
    }
}
NotificationWrapper.prototype.$rpcMethods = ['destroy'];

class Engine extends Genie.AssistantEngine {
    constructor(platform, options) {
        super(platform, options);
    }

    setConsent(consent) {
        const prefs = this.platform.getSharedPreferences();
        prefs.set('sabrina-store-log', consent ? 'yes' : 'no');
    }

    getConsent() {
        const prefs = this.platform.getSharedPreferences();
        return prefs.get('sabrina-store-log') === 'yes';
    }

    warnRecording() {
        const prefs = this.platform.getSharedPreferences();
        prefs.set('recording-warning-shown', 'yes');
    }

    recordingWarned() {
        const prefs = this.platform.getSharedPreferences();
        return prefs.get('recording-warning-shown') === 'yes';
    }

    async converse(command, conversationId) {
        return this.assistant.converse(command, conversationId);
    }

    getConversation(id) {
        const conversation = this.assistant.getConversation(id);
        if (!conversation)
            return null;
        return new RecordingController(conversation);
    }

    hasConversation(id) {
        return !!this.assistant.getConversation(id);
    }

    async getOrOpenConversation(id, delegate, options, initialState) {
        // note: default arguments don't work because "undefined" becomes "null" through transparent-rpc
        options = options || {};
        options.debug = true;
        options.dialogueFlags = options.dialogueFlags || {};
        options.dialogueFlags.covid = true;
        const conversation = await this.assistant.getOrOpenConversation(id, options, initialState || undefined);
        if (delegate)
            return new ConversationWrapper(conversation, delegate);
        else
            return undefined;
    }

    async addNotificationOutput(delegate) {
        return new NotificationWrapper(this.assistant, delegate);
    }

    async createDeviceAndReturnInfo(data) {
        const device = await this.createDevice(data);
        return this.getDeviceInfo(device.uniqueId);
    }

    async deleteAllApps(forNotificationBackend, forNotificationConfig) {
        const apps = this.apps.getAllApps();
        for (const app of apps) {
            if (forNotificationBackend) {
                const before = app.notifications.length;
                app.notifications = app.notifications.filter((config) => {
                    if (config.backend !== forNotificationBackend)
                        return true;
                    let found = true;
                    for (let key in forNotificationConfig) {
                        if (forNotificationConfig[key] !== config.config[key]) {
                            found = false;
                            break;
                        }
                    }
                    return !found;
                });

                if (app.notifications.length !== before) {
                    if (app.notifications.length === 0)
                        await this.apps.removeApp(app);
                    else
                        await this.apps.saveApp(app);
                }
            } else {
                await this.apps.removeApp(app);
            }
        }
    }
}
Engine.prototype.$rpcMethods = [
    'getConsent',
    'setConsent',

    'warnRecording',
    'recordingWarned',

    'getConversation',
    'getOrOpenConversation',
    'hasConversation',
    'addNotificationOutput',
    'removeNotificationOutput',
    'converse',

    'startOAuth',
    'completeOAuth',
    'createDeviceAndReturnInfo',
    'deleteDevice',
    'upgradeDevice',

    'getDeviceInfos',
    'getDeviceInfo',
    'checkDeviceAvailable',
    'getCachedDeviceClasses',
    'hasDevice',

    'getAppInfos',
    'getAppInfo',
    'deleteApp',
    'createAppAndReturnResults',
    'deleteAllApps',

    'setCloudId',
    'setServerAddress',
];
module.exports = Engine;
