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

// UserPreference table
type UserPreference struct {
	Key
	Value string `json:"value" gorm:"column:value"`
}

// TableName overrides table name to `user_preference`
func (*UserPreference) TableName() string {
	return "user_preference"
}

// NewRow returns a UserPreference row
func (*UserPreference) NewRow() Row {
	return &UserPreference{}
}

// NewRows returns a slice of UserPreference row
func (*UserPreference) NewRows() interface{} {
	return &[]*UserPreference{}
}

// SetKey sets the key of UserPreference
func (e *UserPreference) SetKey(key Key) {
	e.Key = key
}

// GetKey returns the key of UserPreference
func (e *UserPreference) GetKey() Key {
	return e.Key
}

// Fields returns column names excluding Key
func (e *UserPreference) Fields() []string {
	return []string{"value"}
}
