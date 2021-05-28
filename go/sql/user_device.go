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

// UserDevice table
type UserDevice struct {
	Key
	State string `json:"state" gorm:"column:state"`
}

// TableName overrides table name to `user_device`
func (*UserDevice) TableName() string {
	return "user_device"
}

// NewRow returns a UserDevice row
func (*UserDevice) NewRow() Model {
	return &UserDevice{}
}

// NewRows returns a slice of UserDevice row
func (*UserDevice) NewRows() interface{} {
	return &[]*UserDevice{}
}

// SetKey sets the key of UserDevice
func (e *UserDevice) SetKey(key Key) {
	e.Key = key
}

// GetKey returns the key of UserDevice
func (e *UserDevice) NewSyncRow(lastModified int64) SyncRow {
	return &UserDeviceSyncRow{
		UserDeviceJournal: UserDeviceJournal{
			Key:          e.Key,
			LastModified: lastModified,
		},
		State: e.State,
	}
}

func (e *UserDevice) NewSyncRows() interface{} {
	return &[]*UserDeviceSyncRow{}
}

// GetKey returns the key of UserDevice
func (e *UserDevice) GetKey() Key {
	return e.Key
}

// Fields returns the column names without Key
func (e *UserDevice) Fields() []string {
	return []string{"state"}
}

// -------------------------------
// -------------------------------
// UserDeviceJournal table
type UserDeviceJournal struct {
	Key
	LastModified int64 `json:"lastModified" gorm:"column:lastModified"`
}

// TableName overrides table name to `user_device`
func (*UserDeviceJournal) TableName() string {
	return "user_device_journal"
}

// NewRow returns a UserDevice row
func (*UserDeviceJournal) NewRow() Model {
	return &UserDeviceJournal{}
}

// NewRows returns a slice of UserDevice row
func (*UserDeviceJournal) NewRows() interface{} {
	return &[]UserDeviceJournal{}
}

// SetKey sets the key of UserDevice
func (e *UserDeviceJournal) SetKey(key Key) {
	e.Key = key
}

// GetKey returns the key of UserDevice
func (e *UserDeviceJournal) GetKey() Key {
	return e.Key
}

// Fields returns the column names without Key
func (e *UserDeviceJournal) Fields() []string {
	return []string{"lastModified"}
}

// -------------------------------
// -------------------------------
// UserDeviceSyncRow is the joined row of UserDevice and UserDeviceJournal
type UserDeviceSyncRow struct {
	UserDeviceJournal
	State string `json:"state" gorm:"column:state"`
}

func (r *UserDeviceSyncRow) Row() SyncModel {
	return &UserDevice{
		Key:   r.UserDeviceJournal.Key,
		State: r.State,
	}
}

func (r *UserDeviceSyncRow) JournalRow() Model {
	return &r.UserDeviceJournal
}

func (r *UserDeviceSyncRow) GetLastModified() int64 {
	return r.UserDeviceJournal.LastModified
}

func (r *UserDeviceSyncRow) SetLastModified(t int64) {
	r.UserDeviceJournal.LastModified = t
}

func (r *UserDeviceSyncRow) HasDiscriminator() bool {
	return len(r.State) > 0
}
