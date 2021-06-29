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
DATABASE_PROXY_URL: http://testhost:8080
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
	os.Mkdir(path.Join(s.tmpDir, "config.d"), 0o755)

	err = os.WriteFile(path.Join(s.tmpDir, "config.d", "config.json"), []byte(testConfigJSON), 0644)
	require.NoError(s.T(), err)
	os.WriteFile(path.Join(s.tmpDir, "config.d", "secret.yaml"), []byte(testSecretYAML), 0644)
	require.NoError(s.T(), err)
}

func TestAlmondConfig(t *testing.T) {
	suite.Run(t, new(ConfigSuite))
}

func (s *ConfigSuite) TestParseAlmondConfig() {
	err := ParseAlmondConfig(path.Join(s.tmpDir, "config.d"), &s.almondConfig)
	require.NoError(s.T(), err)
	require.Equal(s.T(), "https://nlp.url", s.almondConfig.NLServerURL)
	require.Equal(s.T(), "mysql url", s.almondConfig.DatabaseURL)
	require.Equal(s.T(), "http://testhost:8080", s.almondConfig.DatabaseProxyURL)
}

func (s *ConfigSuite) TestInitAlmondConfig() {
	err := InitAlmondConfig()
	require.NoError(s.T(), err)
	almondConfig := GetAlmondConfig()
	require.Equal(s.T(), "https://nlp.almond.stanford.edu", almondConfig.NLServerURL)
	require.Equal(s.T(), "", almondConfig.DatabaseURL)

	os.Setenv("THINGENGINE_CONFIGDIR", s.tmpDir)
	err = InitAlmondConfig()
	require.NoError(s.T(), err)
	almondConfig = GetAlmondConfig()
	require.Equal(s.T(), "https://nlp.url", almondConfig.NLServerURL)
	require.Equal(s.T(), "mysql url", almondConfig.DatabaseURL)
}
