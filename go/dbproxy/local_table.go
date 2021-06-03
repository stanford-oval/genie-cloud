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
package dbproxy

import (
	"almond-cloud/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func localTableGetAll(c *gin.Context) {
	localTable := sql.GetLocalTable()
	m, ok := sql.NewRow(c.Param("name"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "table name not found"})
		return
	}
	userID, err := parseUserID(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rows := m.NewRows()
	if err := localTable.GetAll(rows, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func localTableGetOne(c *gin.Context) {
	localTable := sql.GetLocalTable()
	row, ok := sql.NewRow(c.Param("name"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "table name not found"})
		return
	}
	key, err := parseKey(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row.SetKey(*key)
	if err := localTable.GetOne(row); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "row not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}
func parseUserID(c *gin.Context) (int64, error) {
	userID, err := strconv.ParseInt(c.Param("userid"), 10, 64)
	if err != nil {
		return 0, err
	}
	if userID == 0 {
		return 0, errors.New("userId must be non-zero")
	}
	return userID, nil
}

func parseKey(c *gin.Context) (*sql.Key, error) {
	userID, err := parseUserID(c)
	if err != nil {
		return nil, err
	}
	uniqueID := c.Param("uniqueid")
	if len(uniqueID) == 0 {
		return nil, errors.New("uniqueid must be set")
	}
	return &sql.Key{UniqueID: uniqueID, UserID: userID}, nil
}

func localTableDeleteOne(c *gin.Context) {
	localTable := sql.GetLocalTable()
	row, ok := sql.NewRow(c.Param("name"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "table name not found"})
		return
	}
	key, err := parseKey(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row.SetKey(*key)
	if err := localTable.DeleteOne(row); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "row not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": true})
}

func localTableInsertOne(c *gin.Context) {
	localTable := sql.GetLocalTable()
	row, ok := sql.NewRow(c.Param("name"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "table name not found"})
		return
	}
	key, err := parseKey(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := c.ShouldBindJSON(row); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row.SetKey(*key)

	if err := localTable.InsertOne(row); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": true})
}
