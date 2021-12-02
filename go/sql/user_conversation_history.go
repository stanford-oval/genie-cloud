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

// UserConversationHistory table
type UserConversationHistory struct {
	Key
	ConversationId string `json:"conversationId" gorm:"column:conversationId"`
	MessageId      int    `json:"messageId" gorm:"column:messageId"`
	Message        string `json:"message" gorm:"column:message"`
}

// TableName overrides table name to `user_conversation_history`
func (*UserConversationHistory) TableName() string {
	return "user_conversation_history"
}

// NewRow returns a UserPreference row
func (*UserConversationHistory) NewRow() Row {
	return &UserConversationHistory{}
}

// NewRows returns a slice of UserConversationState row
func (*UserConversationHistory) NewRows() interface{} {
	return &[]*UserConversationHistory{}
}

// SetKey sets the key of UserConversationState
func (e *UserConversationHistory) SetKey(key Key) {
	e.Key = key
}

// GetKey returns the key of UserConversationState
func (e *UserConversationHistory) GetKey() Key {
	return e.Key
}

// Fields returns column names excluding Key
func (e *UserConversationHistory) Fields() []string {
	return []string{"conversationId", "messageId", "message"}
}
