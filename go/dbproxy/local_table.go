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
	"net/http"

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
	c.JSON(http.StatusOK, gin.H{"result": "ok", "data": rows})
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
	c.JSON(http.StatusOK, gin.H{"result": "ok", "data": row})
}

func contains(array []string, el string) bool {
	for _, x := range array {
		if x == el {
			return true
		}
	}
	return false
}

func localTableGetByField(c *gin.Context) {
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

	field := c.Param("field")
	if !contains(m.Fields(), field) {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid field"})
		return
	}

	value := c.Param("value")
	rows := m.NewRows()
	if err := localTable.GetByField(rows, userID, field, value); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"result": "ok", "data": rows})
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
	c.JSON(http.StatusOK, gin.H{"result": "ok", "data": true})
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
	c.JSON(http.StatusOK, gin.H{"result": "ok", "data": true})
}
