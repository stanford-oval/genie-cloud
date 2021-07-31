// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

import * as rpc from 'transparent-rpc';
import * as Genie from 'genie-toolkit';

import type { Platform } from './platform';
import PlatformModule from './platform';

// API wrappers for Genie's classes that expose the $rpcMethods interface
// used by transparent-rpc

export class ConversationWrapper implements rpc.Stubbable {
    $rpcMethods = ['destroy', 'getState', 'handleCommand', 'handleParsedCommand', 'handleThingTalk', 'handlePing'] as const;
    $free ?: () => void;

    private _conversation : Genie.DialogueAgent.Conversation;
    private _delegate : rpc.Proxy<Genie.DialogueAgent.ConversationDelegate>;

    constructor(conversation : Genie.DialogueAgent.Conversation, delegate : rpc.Proxy<Genie.DialogueAgent.ConversationDelegate>) {
        this._conversation = conversation;
        this._delegate = delegate;
        this._conversation.addOutput(delegate);
    }

    destroy() {
        this._conversation.removeOutput(this._delegate);
        this._delegate.$free();
        if (this.$free)
            this.$free();
    }

    getState() {
        return this._conversation.getState();
    }

    handleCommand(...args : Parameters<Genie.DialogueAgent.Conversation['handleCommand']>) {
        return this._conversation.handleCommand(...args);
    }

    handleParsedCommand(...args : Parameters<Genie.DialogueAgent.Conversation['handleParsedCommand']>) {
        return this._conversation.handleParsedCommand(...args);
    }

    handleThingTalk(...args : Parameters<Genie.DialogueAgent.Conversation['handleThingTalk']>) {
        return this._conversation.handleThingTalk(...args);
    }

    handlePing(...args : Parameters<Genie.DialogueAgent.Conversation['handlePing']>) {
        return this._conversation.handlePing(...args);
    }
}

class RecordingController implements rpc.Stubbable {
    $rpcMethods = [
        'readLog',
        'startRecording',
        'endRecording',
        'inRecordingMode',
        'voteLast',
        'commentLast'
    ] as const;
    $free ?: () => void;
    private _conversation : Genie.DialogueAgent.Conversation;

    constructor(conversation : Genie.DialogueAgent.Conversation) {
        this._conversation = conversation;
    }

    async readLog() {
        // TODO: make this streaming
        const logstream = this._conversation.readLog();
        let log = '';
        logstream.on('data', (data) => {
            log += data;
        });
        await Genie.StreamUtils.waitFinish(logstream);
        return log;
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

    voteLast(vote : 'up'|'down') {
        return this._conversation.voteLast(vote);
    }

    commentLast(comment : string) {
        return this._conversation.commentLast(comment);
    }
}

interface NotificationDelegateProxy {
    send(data : {
        result : Parameters<Genie.DialogueAgent.NotificationDelegate['notify']>[0]
    } | {
        error : Parameters<Genie.DialogueAgent.NotificationDelegate['notifyError']>[0]
    }) : Promise<void>;
}

export class NotificationWrapper implements Genie.DialogueAgent.NotificationDelegate {
    $rpcMethods = ['destroy'] as const;
    $free ?: () => void;
    private _dispatcher : Genie.DialogueAgent.AssistantDispatcher;
    private _delegate : rpc.Proxy<NotificationDelegateProxy>;

    constructor(dispatcher : Genie.DialogueAgent.AssistantDispatcher, delegate : rpc.Proxy<NotificationDelegateProxy>) {
        this._dispatcher = dispatcher;
        this._delegate = delegate;
        this._dispatcher.addNotificationOutput(this);
    }

    destroy() {
        this._dispatcher.removeNotificationOutput(this);
        this._delegate.$free();
        if (this.$free)
            this.$free();
    }

    async notify(data : Parameters<Genie.DialogueAgent.NotificationDelegate['notify']>[0]) {
        await this._delegate.send({ result: data });
    }

    async notifyError(data : Parameters<Genie.DialogueAgent.NotificationDelegate['notifyError']>[0]) {
        await this._delegate.send({ error: data });
    }
}

export default class Engine extends Genie.AssistantEngine implements rpc.Stubbable {
    $rpcMethods = [
        'getConsent',
        'setConsent',

        'warnRecording',
        'recordingWarned',

        'getConversation',
        'ensureConversation',
        'getOrOpenConversation',
        'addNotificationOutput',
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
        'addServerAddress',
    ] as const;
    $free ?: () => void;

    constructor(platform : Platform, options : ConstructorParameters<typeof Genie.AssistantEngine>[1]) {
        super(platform, options);
    }

    setConsent(consent : boolean) {
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

    async converse(...args : Parameters<Genie.DialogueAgent.AssistantDispatcher['converse']>) {
        return this.assistant.converse(...args);
    }

    getConversation(id : string) {
        const conversation = this.assistant.getConversation(id);
        if (!conversation)
            return null;
        return new RecordingController(conversation);
    }

    async ensureConversation(id : string, options : Genie.DialogueAgent.ConversationOptions,
        initialState ?: Genie.DialogueAgent.ConversationState) : Promise<void> {
        options.faqModels = PlatformModule.faqModels;
        await this.assistant.getOrOpenConversation(id, options, initialState || undefined);
    }

    async getOrOpenConversation(id : string, delegate : rpc.Proxy<Genie.DialogueAgent.ConversationDelegate>,
                                options : Genie.DialogueAgent.ConversationOptions,
                                initialState ?: Genie.DialogueAgent.ConversationState) {
        options.faqModels = PlatformModule.faqModels;
        if (options.anonymous)
            options.log = true;
        const conversation = await this.assistant.getOrOpenConversation(id, options, initialState || undefined);
        return new ConversationWrapper(conversation, delegate);
    }

    async addNotificationOutput(delegate : rpc.Proxy<NotificationDelegateProxy>) {
        return new NotificationWrapper(this.assistant, delegate);
    }

    async createDeviceAndReturnInfo(data : { kind : string }) {
        const device = await this.createDevice(data);
        return this.getDeviceInfo(device.uniqueId!);
    }

    async deleteAllApps(forNotificationBackend ?: keyof Genie.DialogueAgent.NotificationConfig, forNotificationConfig ?: Record<string, unknown>) {
        const apps = this.apps.getAllApps();
        for (const app of apps) {
            if (forNotificationBackend) {
                if (!app.notifications)
                    continue;
                if (app.notifications.backend !== forNotificationBackend)
                    continue;
                let good = true;
                for (const key in forNotificationConfig) {
                    if (forNotificationConfig[key] !== app.notifications.config[key]) {
                        good = false;
                        break;
                    }
                }
                if (!good)
                    continue;
            }

            await this.apps.removeApp(app);
        }
    }
}
