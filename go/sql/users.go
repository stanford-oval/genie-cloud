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
	"time"

	"gorm.io/gorm"
)

// User from users table
type User struct {
	ID                  int64     `json:"id"                      gorm:"column:id"`
	Username            string    `json:"username"                gorm:"column:username"`
	HumanName           *string   `json:"human_name"              gorm:"column:human_name"`
	Email               *string   `json:"email"                   gorm:"column:email"`
	EmailVerified       bool      `json:"email_verified"          gorm:"column:email_verified"`
	Phone               *string   `json:"phone"                   gorm:"column:phone"`
	Locale              string    `json:"locale"                  gorm:"column:locale"`
	Timezone            string    `json:"timezone"                gorm:"column:timezone"`
	ModelTag            *string   `json:"model_tag"               gorm:"column:model_tag"`
	GoogleID            *string   `json:"google_id"               gorm:"column:google_id"`
	GithubID            *string   `json:"github_id"               gorm:"column:github_id"`
	FacebookID          *string   `json:"facebook_id"             gorm:"column:facebook_id"`
	OmletID             *string   `json:"omlet_id"                gorm:"column:omlet_id"`
	Password            *string   `json:"password"                gorm:"column:password"`
	Salt                *string   `json:"salt"                    gorm:"column:salt"`
	TotpKey             *string   `json:"totp_key"                gorm:"column:totp_key"`
	CloudID             string    `json:"cloud_id"                gorm:"column:cloud_id"`
	AuthToken           string    `json:"auth_token"              gorm:"column:auth_token"`
	StorageKey          string    `json:"storage_key"             gorm:"column:storage_key"`
	Roles               int       `json:"roles"                   gorm:"column:roles"`
	AssistantFeedId     *string   `json:"assistant_feed_id"       gorm:"column:assistant_feed_id"`
	DeveloperStatus     int       `json:"developer_status"        gorm:"column:developer_status"`
	DeveloperOrg        int       `json:"developer_org"           gorm:"column:developer_org"`
	ForceSparateProcess int       `json:"force_separate_process"  gorm:"column:force_separate_process"`
	RegistrationTime    time.Time `json:"registration_time"       gorm:"column:registration_time"`
	LastlogTime         time.Time `json:"lastlog_time"            gorm:"column:lastlog_time"`
	ProfileFlags        int       `json:"profile_flags"           gorm:"column:profile_flags"`
}

// TableName overrides table name to `user_channel`
func (*User) TableName() string {
	return "users"
}

// GetUser returns a user with matching user id from database
func GetUser(db *gorm.DB, uid int64) (*User, error) {
	user := &User{}
	return user, db.Where("id = ?", uid).First(user).Error
}

// GetDeveloperKey returns the developer key of a given user id from database
func GetDeveloperKey(db *gorm.DB, uid int64) (*string, error) {
	row := struct {
		DeveloperKey *string `gorm:"column:developer_key"`
	}{}
	result := db.Raw("select o.developer_key"+
		" from users u left outer join organizations o on u.developer_org = o.id"+
		" where u.id = ?", uid).First(&row)
	return row.DeveloperKey, result.Error
}
