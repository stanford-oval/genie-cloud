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

// UserConversationState table
type UserConversationState struct {
	Key
	History string `json:"history" gorm:"column:history"`
	DialogueState string `json:"dialogueState" gorm:"column:dialogueState"`
	LastMessageId int `json:"lastMessageId" gorm:"column:lastMessageId"`
}

// TableName overrides table name to `user_conversation_state`
func (*UserConversationState) TableName() string {
	return "user_conversation_state"
}

// NewRow returns a UserPreference row
func (*UserConversationState) NewRow() Row {
	return &UserConversationState{}
}

// NewRows returns a slice of UserConversationState row
func (*UserConversationState) NewRows() interface{} {
	return &[]*UserConversationState{}
}

// SetKey sets the key of UserConversationState
func (e *UserConversationState) SetKey(key Key) {
	e.Key = key
}

// GetKey returns the key of UserConversationState
func (e *UserConversationState) GetKey() Key {
	return e.Key
}

// Fields returns column names excluding Key
func (e *UserConversationState) Fields() []string {
	return []string{"history", "dialogueState", "lastMessageId"}
}
