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
	"errors"
	"fmt"
	"regexp"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt"
)

var bearerTokenRegexp *regexp.Regexp

func init() {
	bearerTokenRegexp = regexp.MustCompile(`^[bB]earer\s+(.+)$`)
}

type accessTokenClaims struct {
	jwt.StandardClaims
}

func (token *accessTokenClaims) Valid() error {
	if err := token.StandardClaims.Valid(); err != nil {
		return err
	}

	if !token.VerifyAudience("dbproxy", true) {
		return errors.New("invalid audience")
	}

	if len(token.Subject) == 0 {
		return errors.New("missing subject")
	}

	return nil
}

func parseAccessToken(c *gin.Context) (*jwt.Token, error) {
	header := c.Request.Header.Get("Authorization")
	if len(header) == 0 {
		return nil, errors.New("missing authorization header")
	}

	match := bearerTokenRegexp.FindStringSubmatch(header)
	if match == nil || len(match) < 2 {
		return nil, errors.New("malformed authorization header")
	}
	accessToken := match[1]

	parsedJWT, err := jwt.ParseWithClaims(accessToken, &accessTokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != "HS256" {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Method.Alg())
		}

		almondConfig := config.GetAlmondConfig()
		return []byte(almondConfig.JWTSigningKey), nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid authorization header: %s", err)
	}
	if !parsedJWT.Valid {
		return nil, errors.New("invalid authorization header: invalid access token")
	}

	return parsedJWT, nil
}
