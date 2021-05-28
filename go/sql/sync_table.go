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
	return t.db.Find(rows).Where("userId = ?", userID).Error
}

// GetOne
func (t *SyncTable) GetOne(row SyncModel) error {
	if len(row.GetKey().UniqueID) == 0 || row.GetKey().UserID == 0 {
		return errors.New("invalid key")
	}
	return t.db.First(row).Error
}

// GetRaw
func (t *SyncTable) GetRaw(sm SyncModel, userID int64) (interface{}, error) {
	journalTable := sm.NewSyncRow(0).JournalRow().TableName()
	rows := sm.NewSyncRows()
	fields := strings.Join(mapPrefix("t.", sm.Fields()), ",")
	result := db.Raw("select tj.uniqueId,tj.lastModified,"+fields+
		" from "+journalTable+" as tj left outer join "+
		sm.TableName()+" as t on tj.uniqueId = t.uniqueId and tj.userId = t.userId "+
		"where tj.userId = ?", userID).Find(rows)
	return rows, result.Error
}

// GetChangesAfter
func (t *SyncTable) GetChangesAfter(sm SyncModel, lastModified int64, userID int64) ([]SyncRow, error) {
	return t.getChangesAfter(t.db, sm, lastModified, userID)
}

func (t *SyncTable) getChangesAfter(tx *gorm.DB, sm SyncModel, lastModified int64, userID int64) ([]SyncRow, error) {
	rows := sm.NewSyncRows()
	journalTable := sm.NewSyncRow(0).JournalRow().TableName()
	fields := strings.Join(mapPrefix("t.", sm.Fields()), ",")
	if err := tx.Raw("select tj.uniqueId,tj.lastModified,"+fields+
		" from "+journalTable+" as tj left outer join "+
		sm.TableName()+" as t on tj.uniqueId = t.uniqueId and tj.userId = t.userId "+
		"where tj.lastModified > ? and tj.userId = ?;", lastModified, userID).Find(rows).Error; err != nil {
		return nil, err
	}
	srs, err := ToSyncRowSlice(rows)
	if err != nil {
		return nil, err
	}
	return srs, nil
}

// HandleChanges
func (t *SyncTable) HandleChanges(changes []SyncRow, userID int64) ([]bool, error) {
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

func (t *SyncTable) handleChanges(tx *gorm.DB, changes []SyncRow, userID int64) ([]bool, error) {
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

func (t *SyncTable) insertIfRecent(tx *gorm.DB, sr SyncRow) (bool, error) {
	rows := []struct{ lastModified int64 }{}
	k := sr.JournalRow().GetKey()
	if err := tx.Table(sr.JournalRow().TableName()).Where(
		"uniqueId = ? AND userId = ?", k.UniqueID, k.UserID).Find(rows).Error; err != nil {
		return false, err
	}
	if len(rows) > 0 && rows[0].lastModified >= sr.GetLastModified() {
		return false, nil
	}
	if _, err := t.insert(tx, sr); err != nil {
		return false, err
	}
	return true, nil
}

func (t *SyncTable) insert(tx *gorm.DB, sr SyncRow) (int64, error) {
	if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(sr.Row()).Error; err != nil {
		return 0, err
	}
	if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(sr.JournalRow()).Error; err != nil {
		return 0, err
	}
	return sr.GetLastModified(), nil
}

func (t *SyncTable) deleteIfRecent(tx *gorm.DB, sr SyncRow) (bool, error) {
	rows := []struct{ lastModified int64 }{}
	k := sr.JournalRow().GetKey()
	if err := tx.Table(sr.JournalRow().TableName()).Where(
		"uniqueId = ? AND userId = ?", k.UniqueID, k.UniqueID).Find(rows).Error; err != nil {
		return false, err
	}
	if len(rows) > 0 && rows[0].lastModified >= sr.GetLastModified() {
		return false, nil
	}
	if _, err := t.delete(tx, sr); err != nil {
		return false, err
	}
	return true, nil
}

func (t *SyncTable) delete(tx *gorm.DB, sr SyncRow) (int64, error) {
	if err := tx.Delete(sr.Row()).Error; err != nil {
		return 0, err
	}
	if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(sr.JournalRow()).Error; err != nil {
		return 0, err
	}
	return sr.GetLastModified(), nil
}

// SyncAt
func (t *SyncTable) SyncAt(sr SyncRow, pushedChanges []SyncRow) (int64, []SyncRow, []bool, error) {
	var ourChange []SyncRow
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

func (t *SyncTable) getLastModified(tx *gorm.DB, sr SyncRow) (int64, error) {
	rows := []struct{ maxLastModified int64 }{}
	if err := tx.Raw("select max(lastModified) as maxLastModified from " +
		sr.JournalRow().TableName()).Find(&rows).Error; err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, nil
	}
	return rows[0].maxLastModified, nil
}

// ReplaceAll
func (t *SyncTable) ReplaceAll(rows []SyncRow, userID int64) error {
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
func (t *SyncTable) InsertIfRecent(row SyncModel, lastModified int64) (bool, error) {
	var err error
	var done bool
	if err = t.db.Transaction(func(tx *gorm.DB) error {
		sr := row.NewSyncRow(lastModified)
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
func (t *SyncTable) InsertOne(row SyncModel) (int64, error) {
	var lastModified int64
	var err error
	if err = t.db.Transaction(func(tx *gorm.DB) error {
		nowMillis := time.Now().UnixNano() / 1e6
		sr := row.NewSyncRow(nowMillis)
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
func (t *SyncTable) DeleteIfRecent(row SyncModel, lastModified int64) (bool, error) {
	var done bool
	var err error
	if err = t.db.Transaction(func(tx *gorm.DB) error {
		sr := row.NewSyncRow(lastModified)
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
func (t *SyncTable) DeleteOne(row SyncModel) (int64, error) {
	var lastModified int64
	var err error
	if err = t.db.Transaction(func(tx *gorm.DB) error {
		nowMillis := time.Now().UnixNano() / 1e6
		sr := row.NewSyncRow(nowMillis)
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
