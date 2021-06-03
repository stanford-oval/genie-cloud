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

import * as fs from 'fs';
import * as rpc from 'transparent-rpc';
import * as Genie from 'genie-toolkit';

import type { Platform } from './platform';

// API wrappers for Genie's classes that expose the $rpcMethods interface
// used by transparent-rpc

// FIXME these need to be exported by Genie
type AssistantDispatcher = Genie.AssistantEngine['assistant'];
type Conversation = NonNullable<ReturnType<AssistantDispatcher['getConversation']>>;
type ConversationDelegate = Parameters<Conversation['addOutput']>[0];
type NotificationDelegate = Parameters<AssistantDispatcher['addNotificationOutput']>[0];

class ConversationWrapper implements rpc.Stubbable {
    $rpcMethods = ['destroy', 'handleCommand', 'handleParsedCommand', 'handleThingTalk'] as const;
    $free ?: () => void;

    private _conversation : Conversation;
    private _delegate : rpc.Proxy<ConversationDelegate>;

    constructor(conversation : Conversation, delegate : rpc.Proxy<ConversationDelegate>) {
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

    handleCommand(...args : Parameters<Conversation['handleCommand']>) {
        return this._conversation.handleCommand(...args).then(() => this._conversation.saveLog());
    }

    handleParsedCommand(...args : Parameters<Conversation['handleParsedCommand']>) {
        return this._conversation.handleParsedCommand(...args).then(() => this._conversation.saveLog());
    }

    handleThingTalk(...args : Parameters<Conversation['handleThingTalk']>) {
        return this._conversation.handleThingTalk(...args).then(() => this._conversation.saveLog());
    }
}

class RecordingController implements rpc.Stubbable {
    $rpcMethods = [
        'log',
        'saveLog',
        'startRecording',
        'endRecording',
        'inRecordingMode',
        'voteLast',
        'commentLast'
    ] as const;
    $free ?: () => void;
    private _conversation : Conversation;

    constructor(conversation : Conversation) {
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

    voteLast(...args : Parameters<Conversation['voteLast']>) {
        this._conversation.voteLast(...args);
        return this._conversation.saveLog();
    }

    commentLast(...args : Parameters<Conversation['commentLast']>) {
        this._conversation.commentLast(...args);
        return this._conversation.saveLog();
    }
}

interface NotificationDelegateProxy {
    send(data : {
        result : Parameters<NotificationDelegate['notify']>[0]
    } | {
        error : Parameters<NotificationDelegate['notifyError']>[0]
    }) : Promise<void>;
}

class NotificationWrapper implements NotificationDelegate {
    $rpcMethods = ['destroy'] as const;
    $free ?: () => void;
    private _dispatcher : AssistantDispatcher;
    private _delegate : rpc.Proxy<NotificationDelegateProxy>;

    constructor(dispatcher : AssistantDispatcher, delegate : rpc.Proxy<NotificationDelegateProxy>) {
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

    async notify(data : Parameters<NotificationDelegate['notify']>[0]) {
        await this._delegate.send({ result: data });
    }

    async notifyError(data : Parameters<NotificationDelegate['notifyError']>[0]) {
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

    async converse(...args : Parameters<AssistantDispatcher['converse']>) {
        return this.assistant.converse(...args);
    }

    getConversation(id : string) {
        const conversation = this.assistant.getConversation(id);
        if (!conversation)
            return null;
        return new RecordingController(conversation);
    }

    async getOrOpenConversation(id : string, delegate : rpc.Proxy<ConversationDelegate>,
                                options : Parameters<AssistantDispatcher['getOrOpenConversation']>[1]) {
        // note: default arguments don't work because "undefined" becomes "null" through transparent-rpc
        options = options || {};
        const conversation = await this.assistant.getOrOpenConversation(id, options);
        return new ConversationWrapper(conversation, delegate);
    }

    async addNotificationOutput(delegate : rpc.Proxy<NotificationDelegateProxy>) {
        return new NotificationWrapper(this.assistant, delegate);
    }

    async createDeviceAndReturnInfo(data : { kind : string }) {
        const device = await this.createDevice(data);
        return this.getDeviceInfo(device.uniqueId!);
    }
}
