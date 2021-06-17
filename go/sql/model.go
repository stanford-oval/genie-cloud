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

// Row defines the row interface to interact with tables
type Row interface {
	TableName() string
	// Database column names excluding Key
	Fields() []string
	NewRow() Row
	NewRows() interface{}
	SetKey(Key)
	GetKey() Key
}

// SyncRow is a Row with SyncRecord
type SyncRow interface {
	Row
	NewSyncRecord(lastModified int64) SyncRecord
	NewSyncRecords() interface{}
}

// SyncRecord joins Row and corresponding JournalRow
type SyncRecord interface {
	Row() SyncRow
	JournalRow() Row
	GetLastModified() int64
	SetLastModified(t int64)
	HasDiscriminator() bool
}

var rows map[string]Row
var syncRows map[string]SyncRow

func init() {
	rows = make(map[string]Row)
	registerRow(&UserApp{})
	registerRow(&UserChannel{})
	registerRow(&UserConversation{})

	syncRows = make(map[string]SyncRow)
	registerSyncRow(&UserDevice{})
}

func registerRow(t Row) {
	rows[t.TableName()] = t
}

func registerSyncRow(t SyncRow) {
	syncRows[t.TableName()] = t
}

// NewRow returns a new registerd row keyed by table name
func NewRow(n string) (Row, bool) {
	m, ok := rows[n]
	if !ok {
		return nil, false
	}
	return m.NewRow(), true
}

// NewSyncRow returns a new registerd syncrow keyed by table name
func NewSyncRow(n string) (SyncRow, bool) {
	m, ok := syncRows[n]
	if !ok {
		return nil, false
	}
	return m.NewRow().(SyncRow), true
}

// ToSyncRecordSlice dynamically casts an empty interface to SyncRecord slice using reflection
func ToSyncRecordSlice(rows interface{}) ([]SyncRecord, error) {
	var srs []SyncRecord
	v := reflect.ValueOf(rows)
	if v.Kind() != reflect.Ptr {
		return nil, errors.New("value not a pointer")
	}
	if v.Elem().Kind() != reflect.Slice {
		return nil, errors.New("value not a slice")
	}
	s := v.Elem()
	for i := 0; i < s.Len(); i++ {
		sr, ok := s.Index(i).Interface().(SyncRecord)
		if !ok {
			return nil, errors.New("failed to cast to SyncRecord")
		}
		srs = append(srs, sr)
	}
	return srs, nil
}
