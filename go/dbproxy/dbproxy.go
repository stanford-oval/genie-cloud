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
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

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

	// gin automatically decodes the URI components in the path by default.
	// We disable it by setting UseRawPath to true.
	r.UseRawPath = true

	r.GET("/metrics", prometheusHandler())

	r.GET("/localtable/:name", localTableGetAll)
	r.GET("/localtable/:name/:uniqueid", localTableGetOne)
	r.GET("/localtable/:name/by-:field/:value", localTableGetByField)
	r.DELETE("/localtable/:name/:uniqueid", localTableDeleteOne)
	r.POST("/localtable/:name/:uniqueid", localTableInsertOne)

	r.GET("/synctable/:name", syncTableGetAll)
	r.GET("/synctable/:name/:uniqueid", syncTableGetOne)
	r.GET("/synctable/raw/:name", syncTableGetRaw)
	r.GET("/synctable/changes/:name/:millis", syncTableGetChangesAfter)
	r.POST("/synctable/changes/:name", syncTableHandleChanges)
	r.POST("/synctable/sync/:name/:millis", syncTableSyncAt)
	r.POST("/synctable/replace/:name", syncTableReplaceAll)
	r.POST("/synctable/:name/:uniqueid/:millis", syncTableInsertIfRecent)
	r.POST("/synctable/:name/:uniqueid", syncTableInsertOne)
	r.DELETE("/synctable/:name/:uniqueid/:millis", syncTableDeleteIfRecent)
	r.DELETE("/synctable/:name/:uniqueid", syncTableDeleteOne)

	server := &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", *port),
		Handler: r,
	}

	go func() {
		log.Printf("Listening at 0.0.0.0:%d\n", *port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server with
	// a timeout of 5 seconds.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting DBproxy server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Fatal("Dbproxy forced to shutdown: ", err)
	}
	log.Println("DBproxy exiting")
}

func prometheusHandler() gin.HandlerFunc {
	h := promhttp.Handler()

	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}
