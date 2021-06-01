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
package config

import (
	"os"
	"path"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

type ConfigSuite struct {
	suite.Suite
	tmpDir       string
	almondConfig AlmondConfig
}

var testSecretYAML = `
DATABASE_URL: "mysql url"
OTHER_SECRET: "other secret"
`
var testConfigJSON = `{
  "NL_SERVER_URL": "https://nlp.url",
  "OTHER_CONFIG": "other config"
}
`

func (s *ConfigSuite) SetupSuite() {
	var err error
	s.tmpDir = s.T().TempDir()
	err = os.WriteFile(path.Join(s.tmpDir, "config.json"), []byte(testConfigJSON), 0644)
	require.NoError(s.T(), err)
	os.WriteFile(path.Join(s.tmpDir, "secret.yaml"), []byte(testSecretYAML), 0644)
	require.NoError(s.T(), err)
}

func TestAlmondConfig(t *testing.T) {
	suite.Run(t, new(ConfigSuite))
}

func (s *ConfigSuite) TestParseAlmondConfig() {
	err := ParseAlmondConfig(s.tmpDir, &s.almondConfig)
	require.NoError(s.T(), err)
	require.Equal(s.T(), s.almondConfig.NLServerURL, "https://nlp.url")
	require.Equal(s.T(), s.almondConfig.DatabaseURL, "mysql url")
}

func (s *ConfigSuite) TestInitAlmondConfig() {
	err := InitAlmondConfig()
	require.NoError(s.T(), err)
	almondConfig := GetAlmondConfig()
	require.Equal(s.T(), almondConfig.NLServerURL, "https://nlp.almond.stanford.edu")
	require.Equal(s.T(), almondConfig.DatabaseURL, "newuser:password@tcp(127.0.0.1:3306)/dbname?charset=utf8mb4&parseTime=True&loc=Local")

	os.Setenv("ALMOND_CONFIG_DIR", s.tmpDir)
	err = InitAlmondConfig()
	require.NoError(s.T(), err)
	almondConfig = GetAlmondConfig()
	require.Equal(s.T(), almondConfig.NLServerURL, "https://nlp.url")
	require.Equal(s.T(), almondConfig.DatabaseURL, "mysql url")
}
