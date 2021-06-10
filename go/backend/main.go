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
package main

import (
	"almond-cloud/config"
	"almond-cloud/dbproxy"

	"log"
	"os"
)

func main() {

	err := config.InitAlmondConfig()
	if err != nil {
		log.Printf("Warning: failed to initialize almond config: %v", err)
	}

	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "dbproxy":
		dbproxy.Run(os.Args[2:])
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	dbproxy.Usage()
}
