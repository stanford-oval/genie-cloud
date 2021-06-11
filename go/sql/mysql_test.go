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
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMySQLDSN(t *testing.T) {
	input := "mysql://user:pwd@host.name/database?charset=utf8mb4_bin&ssl=Amazon%20RDS&acquireTimeout=120000&connectTimeout=120000&timezone=Z"
	want := "user:pwd@tcp(host.name)/database?charset=utf8mb4&loc=UTC&tls=aws&timeout=120000ms"
	got, err := MySQLDSN(input)
	require.Nil(t, err)
	require.Equal(t, got, want)
}
