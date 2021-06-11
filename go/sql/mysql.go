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
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io/ioutil"
	"log"
	"net/url"
	"strings"

	mysqldriver "github.com/go-sql-driver/mysql"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var db *gorm.DB
var localTable *LocalTable
var syncTable *SyncTable

func gormConfig() *gorm.Config {
	return &gorm.Config{
		Logger:      logger.Default.LogMode(logger.Info),
		QueryFields: true,
	}
}

// RegisterTLSCert with mysql driver using given name. This name
// can then be referenced in the DNS tls=<name>
func RegisterTLSCert(name string, certPath string) error {
	log.Printf("Registering %s tls cert.", name)
	rootCertPool := x509.NewCertPool()
	pem, err := ioutil.ReadFile(certPath)
	if err != nil {
		return err
	}
	if ok := rootCertPool.AppendCertsFromPEM(pem); !ok {
		return fmt.Errorf("Failed to append PEM.")
	}
	mysqldriver.RegisterTLSConfig(name, &tls.Config{
		RootCAs: rootCertPool,
	})
	return nil
}

// MYSQLDSN converts a config database url format to the mysql DSN format.
func MySQLDSN(rawUrl string) (string, error) {
	u, err := url.Parse(rawUrl)
	if err != nil {
		return "", err
	}
	if u.Scheme != "mysql" {
		return "", fmt.Errorf("scheme must be mysql")
	}
	userName := u.User.Username()
	if len(userName) == 0 {
		return "", fmt.Errorf("username must be set")
	}
	password, hasPassword := u.User.Password()
	if hasPassword {
		password = ":" + password
	}
	if len(u.Host) == 0 {
		return "", fmt.Errorf("host must be set")
	}
	database := strings.TrimLeft(u.Path, "/")
	if len(database) == 0 {
		return "", fmt.Errorf("database must be set")
	}

	values, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return "", err
	}

	charset := values.Get("charset")
	if len(charset) == 0 || strings.HasPrefix(charset, "utf8") {
		// gorm did not recognize utf8mb4_bin
		charset = "utf8mb4"
	}
	if len(charset) == 0 || strings.HasPrefix(charset, "utf8") {
		// gorm did not recognize utf8mb4_bin
		charset = "utf8mb4"
	}

	// default timezone is utc
	loc := values.Get("timezone")
	if len(loc) == 0 || loc == "Z" {
		loc = "UTC"
	}

	tls := values.Get("ssl")
	if len(tls) > 0 {
		if strings.HasPrefix(tls, "Amazon") {
			tls = "aws"
		}
	} else {
		tls = "false"
	}

	timeout := values.Get("connectTimeout")
	if len(timeout) > 0 {
		timeout = fmt.Sprintf("&timeout=%sms", timeout)
	}

	return fmt.Sprintf("%s%s@tcp(%s)/%s?charset=%s&loc=%s&tls=%s%s",
		userName, password, u.Host, database, charset, loc, tls, timeout), nil

}

// NewMySQL returns an mysql grom DB
func NewMySQL(rawUrl string) (*gorm.DB, error) {
	dsn, err := MySQLDSN(rawUrl)
	if err != nil {
		return nil, err
	}
	return gorm.Open(mysql.Open(dsn), gormConfig())
}

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
