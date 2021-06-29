// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2021 The Board of Trustees of the Leland Stanford Junior University
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

// Definitions of protocol messages between different processes

export type MasterToWorker = {
    type : 'exit';
} | {
    type : 'direct';
    target : number;
    replyId : string;
} | {
    type : 'rpc';
    data : unknown;
}

export type WorkerToMaster = {
    type : 'ready';
    id : string;
} | {
    type : 'rpc';
    data : unknown;
}

export type FrontendToMaster = {
    control : 'auth';
    token : string;
} | {
    control : 'direct';
    target : number;
    replyId : string;
} | {
    control : 'master'
} | {
    control : 'new-object'
};

export type MasterToFrontend = {
    error : string;
    code ?: string;
} | {
    control : 'ready';
    rpcId : string;
}
