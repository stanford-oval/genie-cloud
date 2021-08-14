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
	"log"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"almond-cloud/config"
	"almond-cloud/dbproxy"
	"almond-cloud/k8s/manager"
)

// TestIntegration runs the backend service in a coverage test.  To generate the
// coverage report, the running backend service will gracefully shutdown upon
// receiving SIGINT.
func TestIntegration(t *testing.T) {
	if os.Getenv("ENABLE_INTEGRATION") != "true" {
		log.Printf("Skipp non-integration test")
		return
	}

	args := strings.Split(os.Getenv("INTEGRATION_ARGS"), " ")

	err := config.InitAlmondConfig()
	require.Nil(t, err)

	require.GreaterOrEqual(t, len(os.Args), 1)
	switch args[0] {
	case "dbproxy":
		dbproxy.Run(args[1:])
	case "manager":
		manager.Run(args[1:])
	default:
		require.Fail(t, "argument error")
	}
}
