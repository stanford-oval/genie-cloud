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
package sql

// UserConversation table
type UserConversation struct {
	Key
	ConversationId      string  `json:"conversationId" gorm:"column:value"`
	PreviousId          *string `json:"previousId" gorm:"column:previousId"`
	DialogueId          string  `json:"dialogueId" gorm:"column:dialogueId"`
	Context             *string `json:"context" gorm:"column:context"`
	Agent               *string `json:"agent" gorm:"column:agent"`
	AgentTimestamp      *string `json:"agentTimestamp" gorm:"column:agentTimestamp"`
	AgentTarget         *string `json:"agentTarget" gorm:"column:agentTarget"`
	IntermediateContext *string `json:"intermediateContext" gorm:"column:intermediateContext"`
	User                string  `json:"user" gorm:"column:user"`
	UserTimestamp       *string `json:"userTimestamp" gorm:"column:user"`
	UserTarget          string  `json:"userTarget" gorm:"column:userTarget"`
	Vote                *string `json:"vote" gorm:"column:vote"`
	Comment             *string `json:"comment" gorm:"column:comment"`
}

// TableName overrides table name to `user_conversation`
func (*UserConversation) TableName() string {
	return "user_conversation"
}

// NewRow returns a UserConversation row
func (*UserConversation) NewRow() Row {
	return &UserConversation{}
}

// NewRows returns a slice of UserConversation row
func (*UserConversation) NewRows() interface{} {
	return &[]*UserConversation{}
}

// SetKey sets the key of UserConversation
func (e *UserConversation) SetKey(key Key) {
	e.Key = key
}

// GetKey returns the key of UserConversation
func (e *UserConversation) GetKey() Key {
	return e.Key
}

// Fields returns column names excluding Key
func (e *UserConversation) Fields() []string {
	return []string{
		"conversationId",
		"previousId",
		"dialogueId",
		"context",
		"agent",
		"agentTimestamp",
		"agentTarget",
		"intermediateContext",
		"user",
		"userTimestamp",
		"userTarget",
		"vote",
		"comment",
	}
}
