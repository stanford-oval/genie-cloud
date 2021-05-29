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

// UserApp table
type UserApp struct {
	Key
	Code        string `json:"code" gorm:"column:code"`
	State       string `json:"state" gorm:"column:state"`
	Name        string `json:"name" gorm:"column:name"`
	Description string `description:"value" gorm:"column:description"`
}

// TableName overrides table name to `user_channel`
func (*UserApp) TableName() string {
	return "user_app"
}

// NewRow returns a UserApp row
func (*UserApp) NewRow() Row {
	return &UserApp{}
}

// NewRows returns a slice of UserApp row
func (*UserApp) NewRows() interface{} {
	return &[]UserApp{}
}

// SetKey sets the key of UserApp
func (e *UserApp) SetKey(key Key) {
	e.Key = key
}

// GetKey returns the key of UserApp
func (e *UserApp) GetKey() Key {
	return e.Key
}

// Fields returns column names excluding Key
func (e *UserApp) Fields() []string {
	return []string{"code", "state", "name", "description"}
}
