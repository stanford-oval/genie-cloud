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
	"log"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func gormConfig() *gorm.Config {
	return &gorm.Config{
		Logger:      logger.Default.LogMode(logger.Info),
		QueryFields: true,
	}
}

func NewMySQL(dsn string) (*gorm.DB, error) {
	return gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
}

var db *gorm.DB
var localTable *LocalTable
var syncTable *SyncTable

// InitMySQL opens a connection to mysql database connection pool and initializes tables.
func InitMySQL(dsn string) {
	var err error
	if db, err = NewMySQL(dsn); err != nil {
		log.Fatal(err)
	}
	localTable = NewLocalTable(db)
	syncTable = NewSyncTable(db)
}

// GetLocalTable returns a localTable singleton
func GetLocalTable() *LocalTable {
	return localTable
}

// GetLocalTable returns a localTable singleton
func GetSyncTable() *SyncTable {
	return syncTable
}
