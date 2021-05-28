package main

import (
	"almond-cloud/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func main() {
	dsn := "newuser:password@tcp(127.0.0.1:3306)/dbname?charset=utf8mb4&parseTime=True&loc=Local"
	sql.InitMySQL(dsn)
	r := gin.Default()

	r.GET("/localtable/:name", localTableGetAll)
	r.GET("/localtable/:name/:uniqueid/:userid", localTableGetOne)
	r.DELETE("/localtable/:name/:uniqueid/:userid", localTableDeleteOne)
	r.POST("/localtable/:name", localTableInsertOne)

	r.Run() // listen and serve on 0.0.0.0:8080
}

func localTableGetAll(c *gin.Context) {
	localTable := sql.GetLocalTable()
	m, ok := sql.GetModel(c.Param("name"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "table name not found"})
		return
	}
	rows := m.NewRows()
	if err := localTable.GetAll(rows); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})

}

func localTableGetOne(c *gin.Context) {
	localTable := sql.GetLocalTable()
	m, ok := sql.GetModel(c.Param("name"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "table name not found"})
		return
	}
	key, err := parseKey(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row := m.NewRow()
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

func parseKey(c *gin.Context) (*sql.Key, error) {
	userID, err := strconv.ParseUint(c.Param("userid"), 10, 64)
	if err != nil {
		return nil, err
	}
	if userID == 0 {
		return nil, errors.New("userId must be non-zero")
	}
	uniqueID := c.Param("uniqueid")
	if len(uniqueID) == 0 {
		return nil, errors.New("uniqueid must be set")
	}
	return &sql.Key{UniqueID: uniqueID, UserID: uint(userID)}, nil
}

func localTableDeleteOne(c *gin.Context) {
	localTable := sql.GetLocalTable()
	m, ok := sql.GetModel(c.Param("name"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "table name not found"})
		return
	}
	key, err := parseKey(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row := m.NewRow()
	row.SetKey(*key)
	if err := localTable.DeleteOne(row); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "row not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "ok"})
}

func localTableInsertOne(c *gin.Context) {
	localTable := sql.GetLocalTable()
	m, ok := sql.GetModel(c.Param("name"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "table name not found"})
		return
	}

	row := m.NewRow()
	if err := c.ShouldBindJSON(row); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(row.GetKey().UniqueID) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "uniqueId must be set"})
		return
	}

	if row.GetKey().UserID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "userId must be non-zero"})
		return
	}

	if err := localTable.InsertOne(row); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "row not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}
