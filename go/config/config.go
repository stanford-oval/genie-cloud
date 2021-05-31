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

	"gopkg.in/yaml.v3"
)

// AlmondConfig with almond-cloud configs and secrets
type AlmondConfig struct {
	Config Config
	Secret Secret
}

// Config file for almond-cloud
type Config struct {
	NLServerURL string `yaml:"NL_SERVER_URL"`
}

// Secret file for almond-cloud
type Secret struct {
	DatabaseURL string `yaml:"DATABASE_URL"`
}

var almondConfig AlmondConfig

func GetAlmondConfig() *AlmondConfig {
	return &almondConfig
}

func InitAlmondConfig() error {
	configDir := os.Getenv("ALMOND_CONFIG_DIR")
	if len(configDir) == 0 {
		configDir = "/etc/almond-cloud/config.d"
	}
	return ParseAlmondConfig(configDir, &almondConfig)
}

// ParseAlmondConfig from a directory. Assumes directory contains onfig.yaml and secret.yaml
func ParseAlmondConfig(dirPath string, almondConfig *AlmondConfig) error {
	var err error
	err = ParseConfig(path.Join(dirPath, "config.yaml"), &almondConfig.Config)
	if err != nil {
		return err
	}
	err = ParseSecret(path.Join(dirPath, "secret.yaml"), &almondConfig.Secret)
	if err != nil {
		return err
	}
	return nil
}

// ParseConfig from a file path
func ParseConfig(path string, config *Config) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := yaml.Unmarshal(data, config); err != nil {
		return err
	}
	return nil
}

// ParseSecret from a file path
func ParseSecret(path string, secret *Secret) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := yaml.Unmarshal(data, secret); err != nil {
		return err
	}
	return nil
}
