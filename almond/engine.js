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

    handleCommand(...args) {
        return this._conversation.handleCommand(...args);
    }

    handleParsedCommand(...args) {
        return this._conversation.handleParsedCommand(...args);
    }

    handleThingTalk(...args) {
        return this._conversation.handleThingTalk(...args);
    }
}
ConversationWrapper.prototype.$rpcMethods = ['destroy', 'handleCommand', 'handleParsedCommand', 'handleThingTalk'];

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
        return this._conversation.voteLast(...args);
    }

    commentLast(...args) {
        return this._conversation.commentLast(...args);
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
        return prefs.get('sabrina-store-log') !== 'no';
    }

    async converse(...args) {
        return this.assistant.converse(...args);
    }

    getConversation(id) {
        const conversation = this.assistant.getConversation(id);
        return new RecordingController(conversation);
    }

    async getOrOpenConversation(id, user, delegate, options) {
        // note: default arguments don't work because "undefined" becomes "null" through transparent-rpc
        options = options || {};
        const conversation = await this.assistant.getOrOpenConversation(id, user, options);
        return new ConversationWrapper(conversation, delegate);
    }

    async addNotificationOutput(delegate) {
        return new NotificationWrapper(this.assistant, delegate);
    }

    async createDeviceAndReturnInfo(data) {
        const device = await this.createDevice(data);
        return this.getDeviceInfo(device.uniqueId);
    }
}
Engine.prototype.$rpcMethods = [
    'getConsent',
    'setConsent',

    'getConversation',
    'getOrOpenConversation',
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

    'setCloudId',
    'setServerAddress',
];
module.exports = Engine;
