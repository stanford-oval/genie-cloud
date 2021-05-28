package sql

import (
	"log"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func NewMySQL(dsn string) (*gorm.DB, error) {
	return gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
}

var db *gorm.DB
var localTable *LocalTable

// InitMySQL opens a connection to mysql database connection pool and initializes tables.
func InitMySQL(dsn string) {
	var err error
	if db, err = NewMySQL(dsn); err != nil {
		log.Fatal(err)
	}
	localTable = NewLocalTable(db)
}

// GetLocalTable returns a localTable singleton
func GetLocalTable() *LocalTable {
	return localTable
}
