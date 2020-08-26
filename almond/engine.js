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

const Genie = require('genie-toolkit');
const ThingTalk = require('thingtalk');

const PlatformModule = require('./platform');

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

class NotificationWrapper {
    constructor(dispatcher, delegate, formatter) {
        this._dispatcher = dispatcher;
        this._delegate = delegate;
        this._formatter = formatter;
        this._dispatcher.addNotificationOutput(this);
    }

    destroy() {
        this._dispatcher.removeNotificationOutput(this);
        this._delegate.$free();
        this.$free();
    }

    async notify(appId, icon, outputType, outputValue) {
        const messages = await this._formatter.formatForType(outputType, outputValue, 'messages');
        await this._delegate.send({
            result: {
                appId: appId,
                icon: icon ? PlatformModule.cdnHost + '/icons/' + icon + '.png' : null,
                raw: outputValue,
                type: outputType,
                formatted: messages
            }
        });
    }

    async notifyError(appId, icon, error) {
        await this._delegate.send({
            error: {
                appId: appId,
                icon: icon ? PlatformModule.cdnHost + '/icons/' + icon + '.png' : null,
                error: error
            }
        });
    }
}
NotificationWrapper.prototype.$rpcMethods = ['destroy'];

class Engine extends Genie.AssistantEngine {
    constructor(platform, options) {
        super(platform, options);

        // used by the web API
        this._formatter = new ThingTalk.Formatter(platform.locale, platform.timezone, this.schemas);
    }

    async converse(...args) {
        return this.assistant.converse(...args);
    }

    async getOrOpenConversation(id, user, delegate, options) {
        // note: default arguments don't work because "undefined" becomes "null" through transparent-rpc
        options = options || {};
        const conversation = await this.assistant.getOrOpenConversation(id, user, options);
        return new ConversationWrapper(conversation, delegate);
    }

    async addNotificationOutput(delegate) {
        return new NotificationWrapper(this.assistant, delegate, this._formatter);
    }

    async createDeviceAndReturnInfo(data) {
        const device = await this.createDevice(data);
        return this.getDeviceInfo(device.uniqueId);
    }

    async createAppAndReturnResults(data) {
        const app = await this.createApp(data.code);
        const results = [];
        const errors = [];

        for await (const value of app.mainOutput) {
            if (value instanceof Error) {
                errors.push(value);
            } else {
                const messages = await this._formatter.formatForType(value.outputType, value.outputValue, 'messages');
                results.push({ raw: value.outputValue, type: value.outputType, formatted: messages });
            }
        }

        return {
            uniqueId: app.uniqueId,
            description: app.description,
            code: app.code,
            icon: app.icon ? PlatformModule.cdnHost + '/icons/' + app.icon + '.png' : app.icon,
            results, errors
        };
    }
}
Engine.prototype.$rpcMethods = [
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
