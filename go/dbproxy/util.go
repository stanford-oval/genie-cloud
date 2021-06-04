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
	"fmt"
	"net/http"
	"net/http/httputil"
	"strconv"

	"github.com/gin-gonic/gin"
)

func debugDumpRequest(req *http.Request) {
	if !gin.IsDebugging() {
		return
	}
	fmt.Println("-------- HTTP Request ----------")
	requestDump, err := httputil.DumpRequest(req, true)
	if err != nil {
		fmt.Println(err)
	}
	fmt.Println(string(requestDump))
	fmt.Println("---------------------------------")
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
