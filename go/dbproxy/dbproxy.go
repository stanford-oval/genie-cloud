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
	"almond-cloud/config"
	"almond-cloud/sql"
	"log"

	"flag"
	"fmt"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	flagSet = flag.NewFlagSet("dbproxy", flag.ExitOnError)
	port    = flagSet.Int("port", 8200, "port")
	tlsCert = flagSet.String("aws-tls-cert", "", "path to aws rds tls cert")
)

func Usage() {
	fmt.Printf("Usage of %s dbproxy", os.Args[0])
	flagSet.PrintDefaults()
}

func Run(args []string) {
	flagSet.Parse(args)
	almondConfig := config.GetAlmondConfig()

	if len(*tlsCert) > 0 {
		if err := sql.RegisterTLSCert("aws", *tlsCert); err != nil {
			log.Fatal(err)
		}
	}
	sql.InitMySQL(almondConfig.DatabaseURL)
	r := gin.Default()
	r.Use(func(c *gin.Context) {
		debugDumpRequest(c.Request)
		c.Next()
	})

	r.GET("/metrics", prometheusHandler())

	r.GET("/localtable/:name/:userid", localTableGetAll)
	r.GET("/localtable/:name/:userid/:uniqueid", localTableGetOne)
	r.DELETE("/localtable/:name/:userid/:uniqueid", localTableDeleteOne)
	r.POST("/localtable/:name/:userid/:uniqueid", localTableInsertOne)

	r.GET("/synctable/:name/:userid", syncTableGetAll)
	r.GET("/synctable/:name/:userid/:uniqueid", syncTableGetOne)
	r.GET("/synctable/raw/:name/:userid", syncTableGetRaw)
	r.GET("/synctable/changes/:name/:userid/:millis", syncTableGetChangesAfter)
	r.POST("/synctable/changes/:name/:userid", syncTableHandleChanges)
	r.POST("/synctable/sync/:name/:userid/:millis", syncTableSyncAt)
	r.POST("/synctable/replace/:name/:userid", syncTableReplaceAll)
	r.POST("/synctable/:name/:userid/:uniqueid/:millis", syncTableInsertIfRecent)
	r.POST("/synctable/:name/:userid/:uniqueid", syncTableInsertOne)
	r.DELETE("/synctable/:name/:userid/:uniqueid/:millis", syncTableDeleteIfRecent)
	r.DELETE("/synctable/:name/:userid/:uniqueid", syncTableDeleteOne)
	r.Run(fmt.Sprintf("0.0.0.0:%d", *port))
}

func prometheusHandler() gin.HandlerFunc {
	h := promhttp.Handler()

	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}
