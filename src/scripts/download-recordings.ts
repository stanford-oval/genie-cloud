// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>

import * as argparse from 'argparse';
import * as fs from 'fs';

import * as Genie from 'genie-toolkit';
import * as Stream from 'stream';

import * as db from '../util/db';
import * as StreamUtils from '../util/stream-utils';

// FIXME should be exported from Genie
interface DialogueTurn {
    context : string|null;
    agent : string|null;
    agent_target : string|null;
    agent_timestamp ?: Date;
    intermediate_context : string|null;
    user : string;
    user_target : string;
    user_timestamp ?: Date;
    vote ?: string;
    comment ?: string;
}

interface DialogueExample {
    id : string;
    comment ?: string;
    turns : DialogueTurn[];
}

interface ConversationRow {
    userCloudId : string;
    uniqueId : string;
    conversationId : string;
    previousId : string|null;
    dialogueId : string;
    context : string|null;
    agent : string|null;
    agentTimestamp : string|null;
    agentTarget : string|null;
    intermediateContext : string|null;
    user : string;
    userTimestamp : string|null;
    userTarget : string;
    vote : string|null;
    comment : string|null;
}

export function initArgparse(subparsers : argparse.SubParser) {
    const parser = subparsers.add_parser('download-recordings', {
        add_help: true,
        description: 'Download detailed conversation logs'
    });
    parser.add_argument('-o', '--output', {
        required: true,
        type: fs.createWriteStream,
        help: 'Output path',
    });
}

function* reorderTurns(rows : ConversationRow[]) : IterableIterator<DialogueTurn> {
    interface TurnWithNext {
        turn : DialogueTurn,
        next : TurnWithNext|null
    }
    const turns = new Map<string, TurnWithNext>();

    for (const row of rows) {
        turns.set(row.uniqueId, {
            turn: {
                context: row.context,
                agent: row.agent,
                agent_target: row.agentTarget,
                agent_timestamp: row.agentTimestamp ? new Date(row.agentTimestamp) : undefined,
                intermediate_context: row.intermediateContext,
                user: row.user,
                user_target: row.userTarget,
                user_timestamp: row.userTimestamp ? new Date(row.userTimestamp) : undefined,
                vote: row.vote ?? undefined,
                comment: row.comment ?? undefined
            },
            next: null
        });
    }

    let first : TurnWithNext|null = null;
    for (const row of rows) {
        if (row.previousId === null) {
            first = turns.get(row.uniqueId)!;
        } else {
            const previousTurn = turns.get(row.previousId);
            if (!previousTurn) {
                console.log(rows);
                console.log(row);
                throw new Error(`malformed dialogue`);
            }
            previousTurn.next = turns.get(row.uniqueId)!;
        }
    }

    let turn = first;
    while (turn !== null) {
        yield turn.turn;
        turn = turn.next;
    }
}

async function* reconstructDialogues(rows : AsyncIterable<ConversationRow>) : AsyncIterableIterator<DialogueExample> {
    let userCloudId : string|undefined, dialogueId : string|undefined, conversationId : string|undefined;

    let dialogueRows : ConversationRow[] = [];
    for await (const row of rows) {
        if (userCloudId !== undefined && conversationId !== undefined && dialogueId !== undefined &&
            (row.userCloudId !== userCloudId || row.conversationId !== conversationId || row.dialogueId !== dialogueId)) {
            yield {
                id : userCloudId + '/' + conversationId + '/' + dialogueId,
                turns: Array.from(reorderTurns(dialogueRows)),
            };
            dialogueRows = [];
        }

        userCloudId = row.userCloudId;
        conversationId = row.conversationId;
        dialogueId = row.dialogueId;
        dialogueRows.push(row);
    }

    if (dialogueRows.length > 0) {
        yield {
            id : userCloudId + '/' + conversationId + '/' + dialogueId,
            turns: Array.from(reorderTurns(dialogueRows)),
        };
    }
}

function toStream(query : db.Query) {
    const stream = new Stream.PassThrough({ objectMode: true });
    query.on('result', (row) => {
        stream.push(row);
    });
    query.on('end', () => {
        stream.push(null);
    });
    query.on('error', (e) => { stream.emit('error', e); });

    return stream;
}

export async function main(argv : any) {
    const output = new Genie.DialogueSerializer();
    output.pipe(argv.output);

    const [dbClient, dbDone] = await db.connect();

    const querystr = `select cloud_id as userCloudId,user_conversation.* from user_conversation, users where users.id = user_conversation.userId
        order by userId, conversationId, dialogueId`;
    const query = dbClient.query(querystr);

    for await (const dlg of reconstructDialogues(toStream(query)))
        output.write(dlg);
    output.end();

    await StreamUtils.waitFinish(argv.output);

    dbDone();
    await db.tearDown();
}
