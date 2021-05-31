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
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SyncTable
type SyncTable struct {
	db *gorm.DB
}

// NewSyncTable
func NewSyncTable(db *gorm.DB) *SyncTable {
	return &SyncTable{db}
}

// GetAll
func (t *SyncTable) GetAll(rows interface{}, userID int64) error {
	return t.db.Where("userId = ?", userID).Find(rows).Error
}

// GetOne
func (t *SyncTable) GetOne(row SyncRow) error {
	if len(row.GetKey().UniqueID) == 0 || row.GetKey().UserID == 0 {
		return errors.New("invalid key")
	}
	return t.db.First(row).Error
}

// GetRaw
func (t *SyncTable) GetRaw(sm SyncRow, userID int64) ([]SyncRecord, error) {
	journalTable := sm.NewSyncRecord(0).JournalRow().TableName()
	rows := sm.NewSyncRecords()
	fields := strings.Join(mapPrefix("t.", sm.Fields()), ",")
	result := t.db.Raw("select tj.uniqueId,tj.userId,tj.lastModified,"+fields+
		" from "+journalTable+" as tj left outer join "+
		sm.TableName()+" as t on tj.uniqueId = t.uniqueId and tj.userId = t.userId "+
		"where tj.userId = ?", userID).Find(rows)
	srs, err := ToSyncRecordSlice(rows)
	if err != nil {
		return nil, err
	}
	return srs, result.Error
}

// GetChangesAfter
func (t *SyncTable) GetChangesAfter(sm SyncRow, lastModified int64, userID int64) ([]SyncRecord, error) {
	return t.getChangesAfter(t.db, sm, lastModified, userID)
}

func (t *SyncTable) getChangesAfter(tx *gorm.DB, sm SyncRow, lastModified int64, userID int64) ([]SyncRecord, error) {
	rows := sm.NewSyncRecords()
	journalTable := sm.NewSyncRecord(0).JournalRow().TableName()
	fields := strings.Join(mapPrefix("t.", sm.Fields()), ",")
	if err := tx.Raw("select tj.uniqueId,tj.userId,tj.lastModified,"+fields+
		" from "+journalTable+" as tj left outer join "+
		sm.TableName()+" as t on tj.uniqueId = t.uniqueId and tj.userId = t.userId "+
		"where tj.lastModified > ? and tj.userId = ?;", lastModified, userID).Find(rows).Error; err != nil {
		return nil, err
	}
	srs, err := ToSyncRecordSlice(rows)
	if err != nil {
		return nil, err
	}
	return srs, nil
}

// HandleChanges
func (t *SyncTable) HandleChanges(changes []SyncRecord, userID int64) ([]bool, error) {
	var results []bool
	if err := t.db.Transaction(func(tx *gorm.DB) error {
		res, err := t.handleChanges(tx, changes, userID)
		if err != nil {
			// return any error will rollback
			return err
		}
		results = res
		// return nil will commit the whole transaction
		return nil
	}); err != nil {
		return nil, err
	}
	return results, nil
}

func (t *SyncTable) handleChanges(tx *gorm.DB, changes []SyncRecord, userID int64) ([]bool, error) {
	var results []bool
	for _, sr := range changes {
		var res bool
		var err error
		if sr.HasDiscriminator() {
			if res, err = t.insertIfRecent(tx, sr); err != nil {
				return nil, err
			}
		} else {
			if res, err = t.deleteIfRecent(tx, sr); err != nil {
				return nil, err
			}
		}
		results = append(results, res)
	}
	return results, nil
}

func (t *SyncTable) insertIfRecent(tx *gorm.DB, sr SyncRecord) (bool, error) {
	row := struct {
		LastModified int64 `gorm:"column:lastModified"`
	}{}
	k := sr.JournalRow().GetKey()
	result := tx.Model(sr.JournalRow()).Where(
		"uniqueId = ? AND userId = ?", k.UniqueID, k.UserID).First(&row)
	if result.Error != nil {
		return false, result.Error
	}
	if result.RowsAffected > 0 && row.LastModified >= sr.GetLastModified() {
		return false, nil
	}
	if _, err := t.insert(tx, sr); err != nil {
		return false, err
	}
	return true, nil
}

func (t *SyncTable) insert(tx *gorm.DB, sr SyncRecord) (int64, error) {
	if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(sr.Row()).Error; err != nil {
		return 0, err
	}
	if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(sr.JournalRow()).Error; err != nil {
		return 0, err
	}
	return sr.GetLastModified(), nil
}

func (t *SyncTable) deleteIfRecent(tx *gorm.DB, sr SyncRecord) (bool, error) {
	row := struct {
		LastModified int64 `gorm:"column:lastModified"`
	}{}
	k := sr.JournalRow().GetKey()
	result := tx.Model(sr.JournalRow()).Where(
		"uniqueId = ? AND userId = ?", k.UniqueID, k.UserID).First(&row)
	if result.Error != nil {
		return false, result.Error
	}
	if result.RowsAffected > 0 && row.LastModified >= sr.GetLastModified() {
		return false, nil
	}
	if _, err := t.delete(tx, sr); err != nil {
		return false, err
	}
	return true, nil
}

func (t *SyncTable) delete(tx *gorm.DB, sr SyncRecord) (int64, error) {
	if err := tx.Delete(sr.Row()).Error; err != nil {
		return 0, err
	}
	if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(sr.JournalRow()).Error; err != nil {
		return 0, err
	}
	return sr.GetLastModified(), nil
}

// SyncAt
func (t *SyncTable) SyncAt(sr SyncRecord, pushedChanges []SyncRecord) (int64, []SyncRecord, []bool, error) {
	var ourChange []SyncRecord
	var lastModified int64
	var done []bool
	userID := sr.Row().GetKey().UserID
	if err := t.db.Transaction(func(tx *gorm.DB) error {
		var err error
		ourChange, err = syncTable.getChangesAfter(tx, sr.Row(), sr.GetLastModified(), userID)
		if err != nil {
			return err
		}
		lastModified, err = t.getLastModified(tx, sr)
		if err != nil {
			return err
		}
		done, err = t.handleChanges(tx, pushedChanges, userID)
		if err != nil {
			return err
		}
		// return nil commits the transaction
		return nil
	}); err != nil {
		return 0, nil, nil, err
	}
	return lastModified, ourChange, done, nil
}

func (t *SyncTable) getLastModified(tx *gorm.DB, sr SyncRecord) (int64, error) {
	rows := []struct{ MaxLastModified int64 }{}
	tableName := sr.JournalRow().TableName()
	userID := sr.JournalRow().GetKey().UserID
	result := tx.Raw("select max(lastModified) as max_last_modified from "+tableName+
		" where userId = ?", userID).Find(&rows)
	if result.Error != nil {
		return 0, result.Error
	}
	if result.RowsAffected == 0 {
		return 0, nil
	}
	return rows[0].MaxLastModified, nil
}

// ReplaceAll
func (t *SyncTable) ReplaceAll(rows []SyncRecord, userID int64) error {
	if len(rows) == 0 {
		return nil
	}
	sr := rows[0]
	if err := t.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("delete from "+sr.Row().TableName()+
			" where userId = ?", userID).Error; err != nil {
			return err
		}
		if err := tx.Exec("delete from "+sr.JournalRow().TableName()+
			" where userId = ?", userID).Error; err != nil {
			return err
		}
		for _, row := range rows {
			if !row.HasDiscriminator() {
				continue
			}
			if _, err := t.insert(tx, row); err != nil {
				return err
			}
		}
		// return nil commits the transaction
		return nil
	}); err != nil {
		return err
	}
	return nil
}

// InsertIfRecent
func (t *SyncTable) InsertIfRecent(row SyncRow, lastModified int64) (bool, error) {
	var err error
	var done bool
	if err = t.db.Transaction(func(tx *gorm.DB) error {
		sr := row.NewSyncRecord(lastModified)
		if done, err = t.insertIfRecent(tx, sr); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return false, err
	}
	return done, nil
}

// InsertOne
func (t *SyncTable) InsertOne(row SyncRow) (int64, error) {
	var lastModified int64
	var err error
	if err = t.db.Transaction(func(tx *gorm.DB) error {
		nowMillis := time.Now().UnixNano() / 1e6
		sr := row.NewSyncRecord(nowMillis)
		if lastModified, err = t.insert(tx, sr); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return 0, err
	}
	return lastModified, nil
}

// DeleteIfRecent
func (t *SyncTable) DeleteIfRecent(row SyncRow, lastModified int64) (bool, error) {
	var done bool
	var err error
	if err = t.db.Transaction(func(tx *gorm.DB) error {
		sr := row.NewSyncRecord(lastModified)
		if done, err = t.deleteIfRecent(tx, sr); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return false, err
	}
	return done, nil
}

// DeleteOne
func (t *SyncTable) DeleteOne(row SyncRow) (int64, error) {
	var lastModified int64
	var err error
	if err = t.db.Transaction(func(tx *gorm.DB) error {
		nowMillis := time.Now().UnixNano() / 1e6
		sr := row.NewSyncRecord(nowMillis)
		if lastModified, err = t.delete(tx, sr); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return 0, err
	}
	return lastModified, nil
}

func mapPrefix(p string, ss []string) []string {
	var ret []string
	for _, s := range ss {
		ret = append(ret, p+s)
	}
	return ret
}
