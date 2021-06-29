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
	"encoding/json"
	"os"
	"path"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// AlmondConfig with almond-cloud configs and secrets
type AlmondConfig struct {
	NLServerURL      string `yaml:"NL_SERVER_URL"      json:"NL_SERVER_URL"`
	DatabaseURL      string `yaml:"DATABASE_URL"       json:"DATABASE_URL"`
	DatabaseProxyURL string `yaml:"DATABASE_PROXY_URL" json:"DATABASE_PROXY_URL"`
	JWTSigningKey    string `yaml:"JWT_SIGNING_KEY"    json:"JWT_SIGNING_KEY"`
}

var almondConfig *AlmondConfig

func initAlmonConfigWithDefaults() {
	almondConfig = &AlmondConfig{
		NLServerURL:   "https://nlp.almond.stanford.edu",
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		JWTSigningKey: os.Getenv("JWT_SIGNING_KEY"),
	}
}

func init() {
	initAlmonConfigWithDefaults()
}

// GetAlmondConfig returns AlmondConfig singleton
func GetAlmondConfig() *AlmondConfig {
	return almondConfig
}

// InitAlmondConfig initializes config from files
func InitAlmondConfig() error {
	configDir := os.Getenv("THINGENGINE_CONFIGDIR")
	if len(configDir) == 0 {
		configDir = "/etc/almond-cloud"
	}
	return ParseAlmondConfig(filepath.Join(configDir, "config.d"), almondConfig)
}

// ParseAlmondConfig from a directory. Assumes directory contains onfig.yaml and secret.yaml
func ParseAlmondConfig(dirPath string, almondConfig *AlmondConfig) error {
	matches, err := filepath.Glob(path.Join(dirPath, "*.yaml"))
	if err != nil {
		return err
	}
	for _, f := range matches {
		if err := ParseYAML(f, almondConfig); err != nil {
			return err
		}
	}
	matches, err = filepath.Glob(path.Join(dirPath, "*.json"))
	if err != nil {
		return err
	}
	for _, f := range matches {
		if err := ParseJSON(f, almondConfig); err != nil {
			return err
		}
	}
	return nil
}

// ParseYAML from a file path
func ParseYAML(path string, config *AlmondConfig) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := yaml.Unmarshal(data, config); err != nil {
		return err
	}
	return nil
}

// ParseJSON from a file path
func ParseJSON(path string, config *AlmondConfig) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, config); err != nil {
		return err
	}
	return nil
}
