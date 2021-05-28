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

import (
	"errors"
	"reflect"
)

// Key shared by tables
type Key struct {
	UniqueID string `json:"uniqueId" gorm:"primaryKey;column:uniqueId"`
	UserID   int64  `json:"userId" gorm:"primaryKey;column:userId"`
}

// Model defines the interface for table and row
type Model interface {
	TableName() string
	// Database column names excluding Key
	Fields() []string
	NewRow() Model
	NewRows() interface{}
	SetKey(Key)
	GetKey() Key
}

// SyncModel is a Model with SyncRow
type SyncModel interface {
	Model
	NewSyncRow(lastModified int64) SyncRow
	NewSyncRows() interface{}
}

// SyncRow is a joined model of row and its timestamped journal
type SyncRow interface {
	Row() SyncModel
	JournalRow() Model
	GetLastModified() int64
	SetLastModified(t int64)
	HasDiscriminator() bool
}

var models map[string]Model
var syncModels map[string]SyncModel

func init() {
	models = make(map[string]Model)
	registerModel(&UserApp{})
	registerModel(&UserChannel{})

	syncModels = make(map[string]SyncModel)
	registerSyncModel(&UserDevice{})
}

func registerModel(t Model) {
	models[t.TableName()] = t
}

func registerSyncModel(t SyncModel) {
	syncModels[t.TableName()] = t
}

// GetModel returns registerd model keyed by table name
func GetModel(n string) (Model, bool) {
	m, ok := models[n]
	return m, ok
}

// GetSyncModel returns registerd model keyed by table name
func GetSyncModel(n string) (SyncModel, bool) {
	m, ok := syncModels[n]
	return m, ok
}

// ToSyncRowSlice dynamically casts an empty interface to a SyncRow slice
func ToSyncRowSlice(rows interface{}) ([]SyncRow, error) {
	var srs []SyncRow
	v := reflect.ValueOf(rows)
	if v.Kind() != reflect.Ptr {
		return nil, errors.New("value not a pointer")
	}
	if v.Elem().Kind() != reflect.Slice {
		return nil, errors.New("value not a slice")
	}
	s := v.Elem()
	for i := 0; i < s.Len(); i++ {
		sr, ok := s.Index(i).Interface().(SyncRow)
		if !ok {
			return nil, errors.New("failed to cast to SyncRow")
		}
		srs = append(srs, sr)
	}
	return srs, nil
}
