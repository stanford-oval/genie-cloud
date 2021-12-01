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

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SearchParams struct {
	Filter [](struct {
		Key      string      `json:"k"`
		Operator string      `json:"o"`
		Value    interface{} `json:"v"`
	}) `json:"filter"`
	Sort  []string `json:"sort"`
	Limit int      `json:"limit"`
}

// LocalTable provides a simple access to database tables
type LocalTable struct {
	db *gorm.DB
}

// NewLocalTable instantiates a LocalTable
func NewLocalTable(db *gorm.DB) *LocalTable {
	return &LocalTable{db}
}

// GetAll returns all rows in the table.
func (t *LocalTable) GetAll(rows interface{}, userID int64) error {
	return t.db.Where("userId = ?", userID).Find(rows).Error
}

// GetAll returns all rows in the table.
func (t *LocalTable) GetByField(rows interface{}, userID int64, field string, value string) error {
	return t.db.Where(map[string]interface{}{"userId": userID, field: value}).Find(rows).Error
}

// Search returns all rows in the table according to a search expression
func (t *LocalTable) Search(rows interface{}, userID int64, params SearchParams) error {
	db := t.db.Where("userId = ?", userID)

	for i := 0; i < len(params.Filter); i++ {
		db = db.Where(params.Filter[i].Key+" "+params.Filter[i].Operator+" ?", params.Filter[i].Value)
	}

	return db.Order(params.Sort[0] + " " + params.Sort[1]).Limit(params.Limit).Find(rows).Error
}

// GetOne returns one row in the table. Row key is expected to be set.
func (t *LocalTable) GetOne(row Row) error {
	if len(row.GetKey().UniqueID) == 0 || row.GetKey().UserID == 0 {
		return errors.New("invalid key")
	}
	return t.db.First(row).Error
}

// InsertOne inserts one row. Row key is expected to be set.
func (t *LocalTable) InsertOne(row Row) error {
	if len(row.GetKey().UniqueID) == 0 || row.GetKey().UserID == 0 {
		return errors.New("invalid key")
	}
	return t.db.Clauses(clause.OnConflict{UpdateAll: true}).Create(row).Error
}

// DeleteOne deletes a row. Row key is expected to be set.
func (t *LocalTable) DeleteOne(row Row) error {
	if len(row.GetKey().UniqueID) == 0 || row.GetKey().UserID == 0 {
		return errors.New("invalid key")
	}
	return t.db.Delete(row).Error
}
