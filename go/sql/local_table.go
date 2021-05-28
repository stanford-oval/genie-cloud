package sql

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// LocalTable provides a simple access to database tables
type LocalTable struct {
	db *gorm.DB
}

// NewLocalTable instantiates a LocalTable
func NewLocalTable(db *gorm.DB) *LocalTable {
	return &LocalTable{db}
}

// GetAll returns all rows in the table.
func (t *LocalTable) GetAll(rows interface{}) error {
	return t.db.Find(rows).Error
}

// GetOne returns one row in the table. Row key is expected to be set.
func (t *LocalTable) GetOne(row Model) error {
	if len(row.GetKey().UniqueID) == 0 || row.GetKey().UserID == 0 {
		return errors.New("invalid key")
	}
	return t.db.First(row).Error
}

// InsertOne inserts one row. Row key is expected to be set.
func (t *LocalTable) InsertOne(row Model) error {
	if len(row.GetKey().UniqueID) == 0 || row.GetKey().UserID == 0 {
		return errors.New("invalid key")
	}
	return t.db.Clauses(clause.OnConflict{UpdateAll: true}).Create(row).Error
}

// DeleteOne deletes a row. Row key is expected to be set.
func (t *LocalTable) DeleteOne(row Model) error {
	if len(row.GetKey().UniqueID) == 0 || row.GetKey().UserID == 0 {
		return errors.New("invalid key")
	}
	return t.db.Delete(row).Error
}
