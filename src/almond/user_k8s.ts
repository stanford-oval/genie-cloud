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
import * as k8s from '@kubernetes/client-node';
import sleep from '../util/sleep';

type User = {
    spec : {id : number, mode : string}
    status : {backend : string, state : string}
}

type UserList = {
    metadata : {continue : string},
    items : User[],
}

/**
 * An api to manage kubernetes User custom resource.
 */
export default class UserK8sApi {
    static Running = "running";

    private api : k8s.CustomObjectsApi;
    private namespace : string;

    constructor(api : k8s.CustomObjectsApi, namespace : string) {
        this.api = api;
        this.namespace = namespace;
    }

    async getUser(id : number) : Promise<User|null> {
        try {
            const resp = await this.api.getNamespacedCustomObject(
                "backend.almond.stanford.edu",
                "v1",
                this.namespace,
                "users",
                `user-${id}`
            );
            return resp.body as User;
        } catch(e) {
            if (e.statusCode !== 404)
                console.error(`Get user failed: ${JSON.stringify(e)}`);
        }
       return null; 
    }

    // poll every half second until user is ready or timedout. Error is thrown if timedout.
    async waitForUser(id : number, millis : number) : Promise<User> {
        const waitms = 500;
        const deadline = Date.now() + millis;
        while (Date.now() < deadline) {
            const user = await this.getUser(id);
            if (user && user.status && user.status.backend && user.status.state === UserK8sApi.Running)
                return user;
            await sleep(waitms);
        }
        throw new Error(`wait for user ${id} timedout`);
    }
    
    async createUser(id : number) : Promise<boolean> {
        try {
            console.info(`creating user ${id}`);
            const body = {
               apiVersion: "backend.almond.stanford.edu/v1",
               kind: "User",
               metadata: {name: `user-${id}`},
               spec: { id: id } 
            };
            await this.api.createNamespacedCustomObject(
                "backend.almond.stanford.edu",
                "v1",
                this.namespace,
                "users",
                body);
            return true;
        } catch(e) {
            // User already exists
            if (e.statusCode === 409) 
                return true;
            console.error(`create user failed: ${JSON.stringify(e)}`);
        }
       return false;
    }
    
    async deleteUser(id : number) : Promise<boolean> {
        try {
            console.info(`deleting user ${id}`);
            await this.api.deleteNamespacedCustomObject(
                "backend.almond.stanford.edu",
                "v1",
                this.namespace,
                "users",
                `user-${id}`);
            return true;
        } catch(e) {
            console.error(`delete user failed: ${JSON.stringify(e)}`);
        }
       return false;
    }

    async deleteAllUsers() : Promise<boolean> {
        try {
            let _continue : string | undefined = undefined;
            while (_continue !== "") {
                const resp = await this.api.listNamespacedCustomObject(
                    "backend.almond.stanford.edu",
                    "v1",
                    this.namespace,
                    "users",
                    undefined,  // pretty
                    _continue);
                const userList = resp.body as UserList;
                for (const u of userList.items)
                    await this.deleteUser(u.spec.id);
                _continue = userList.metadata.continue;
            }
            return true;
        } catch(e) {
            console.info(`delete user failed: ${JSON.stringify(e)}`);
        }
       return false;
    }
}