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
	"database/sql"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-test/deep"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Suite struct {
	suite.Suite
	DB         *gorm.DB
	mock       sqlmock.Sqlmock
	localTable *LocalTable
	row1       *UserChannel
	row2       *UserChannel
}

func (s *Suite) SetupSuite() {
	var (
		db  *sql.DB
		err error
	)

	db, s.mock, err = sqlmock.New()
	require.NoError(s.T(), err)

	s.DB, err = gorm.Open(mysql.New(
		mysql.Config{Conn: db, SkipInitializeWithVersion: true}),
		&gorm.Config{Logger: logger.Default.LogMode(logger.Info)})

	require.NoError(s.T(), err)
	s.localTable = NewLocalTable(s.DB)
	s.row1 = &UserChannel{
		Key:   Key{UniqueID: "u1", UserID: 1},
		Value: "row1",
	}
	s.row2 = &UserChannel{
		Key:   Key{UniqueID: "u2", UserID: 1},
		Value: "row2",
	}
}

func (s *Suite) AfterTest(_, _ string) {
	require.NoError(s.T(), s.mock.ExpectationsWereMet())
}

func TestInit(t *testing.T) {
	suite.Run(t, new(Suite))
}

func (s *Suite) Test_local_table_InsertOne() {
	row := s.row1
	s.mock.ExpectBegin()
	s.mock.ExpectExec(regexp.QuoteMeta(
		"INSERT INTO `user_channel` (`uniqueId`,`userId`,`value`) VALUES (?,?,?) "+
			"ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)")).
		WithArgs(row.Key.UniqueID, row.Key.UserID, row.Value).
		WillReturnResult(sqlmock.NewResult(1, 1))
	s.mock.ExpectCommit()
	err := s.localTable.InsertOne(row)
	require.NoError(s.T(), err)
}

func (s *Suite) Test_local_table_GetOne() {
	row := &UserChannel{Key: s.row1.Key}
	s.mock.ExpectQuery(regexp.QuoteMeta(
		"SELECT * FROM `user_channel` " +
			"WHERE `user_channel`.`uniqueId` = ? AND `user_channel`.`userId` = ? " +
			"ORDER BY `user_channel`.`uniqueId` LIMIT 1")).
		WillReturnRows(sqlmock.NewRows([]string{"uniqueId", "userId", "value"}).
			AddRow("u1", "1", "row1"))
	err := s.localTable.GetOne(row)
	require.NoError(s.T(), err)
	require.Nil(s.T(), deep.Equal(s.row1, row))
}

func (s *Suite) Test_local_table_GetAll() {
	rows := []*UserChannel{}
	s.mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `user_channel` WHERE userId = ?")).
		WithArgs(s.row1.Key.UserID).
		WillReturnRows(sqlmock.NewRows([]string{"uniqueId", "userId", "value"}).
			AddRow("u1", "1", "row1").AddRow("u2", "1", "row2"))
	err := s.localTable.GetAll(&rows, s.row1.UserID)
	require.NoError(s.T(), err)
	require.Nil(s.T(), deep.Equal([]*UserChannel{s.row1, s.row2}, rows))
}

func (s *Suite) Test_local_table_DeleteOne() {
	row := &UserChannel{Key: s.row1.Key}
	s.mock.ExpectBegin()
	s.mock.ExpectExec(regexp.QuoteMeta(
		"DELETE FROM `user_channel` "+
			"WHERE (`user_channel`.`uniqueId`,`user_channel`.`userId`) IN ((?,?))")).
		WithArgs(row.Key.UniqueID, row.Key.UserID).
		WillReturnResult(sqlmock.NewResult(1, 1))
	s.mock.ExpectCommit()
	err := s.localTable.DeleteOne(row)
	require.NoError(s.T(), err)
}
