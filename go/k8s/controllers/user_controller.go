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

package controllers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-logr/logr"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"almond-cloud/config"
	"almond-cloud/dbproxy"
	backendv1 "almond-cloud/k8s/api/v1"
	"almond-cloud/sql"
)

// UserReconciler reconciles a User object
type UserReconciler struct {
	client.Client
	Scheme *runtime.Scheme
	Log    logr.Logger
}

// UserState constants
type UserState string

const (
	Starting UserState = "starting"
	Running  UserState = "running"
	Stopped  UserState = "stopped"
)

// PlatformOptions is part of runEngine request
type PlatformOptions struct {
	UserID             int64  `json:"userId"`
	CloudID            string `json:"cloudId"`
	AuthToken          string `json:"authToken"`
	DeveloperKey       string `json:"developerKey"`
	Locale             string `json:"locale"`
	Timezone           string `json:"timezone"`
	DBProxyURL         string `json:"dbProxyUrl"`
	DBProxyAccessToken string `json:"dbProxyAccessToken"`
	HumanName          string `json:"humanName"`
	Email              string `json:"email"`
}

func platformOptions(user *sql.User, developerKey string, dbProxyURL string, dbProxyToken string) *PlatformOptions {
	return &PlatformOptions{
		UserID:             user.ID,
		CloudID:            user.CloudID,
		AuthToken:          user.AuthToken,
		DeveloperKey:       developerKey,
		Locale:             user.Locale,
		Timezone:           user.Timezone,
		DBProxyURL:         dbProxyURL,
		DBProxyAccessToken: dbProxyToken,
		HumanName:          user.HumanName,
		Email:              user.Email,
	}
}

// JSONResposne from http service
type JSONResponse struct {
	Result string      `json:"result"`
	Data   interface{} `json:"data"`
}

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.8.3/pkg/reconcile
func (r *UserReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	_ = r.Log.WithValues("user-controller", req.NamespacedName)
	r.Log.Info("--- start ---")
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var (
		err           error
		backendURL    string
		userID        int64
		userState     UserState
		userStatus    backendv1.UserStatus
		retrievedUser *backendv1.User
	)

	defer func() {
		if err != nil {
			userStatus.State = err.Error()
		}
		if retrievedUser != nil {
			retrievedUser.Status = userStatus
			r.Status().Update(ctx, retrievedUser)
			r.Log.Info(req.NamespacedName.Name, "status", retrievedUser.Status)
		}
		r.Log.Info("--- end ---")
	}()

	backendURL, userID, err = r.getBackendURL(ctx, req.NamespacedName.Name, req)
	if err != nil {
		return ctrl.Result{RequeueAfter: 2 * time.Second}, err
	}
	userStatus.Backend = backendURL

	userState, err = r.engineStatus(ctx, userID, backendURL)
	if err != nil {
		return ctrl.Result{}, err
	}
	userStatus.State = string(userState)

	user := &backendv1.User{}
	if err = r.Client.Get(ctx, req.NamespacedName, user); err != nil {
		if apierrors.IsNotFound(err) {
			// User is already deleted, kill engine if it's still running.
			if userState == Running {
				err = r.killEngine(ctx, userID, backendURL)
				return ctrl.Result{}, err
			}
			err = nil
		}
		return ctrl.Result{}, err
	}
	retrievedUser = user

	if !user.ObjectMeta.DeletionTimestamp.IsZero() {
		// object is marked for deletion
		if userState == Running {
			err = r.killEngine(ctx, userID, backendURL)
		}
		return ctrl.Result{}, err
	}

	if userState == Running {
		userStatus.State = string(Running)
		return ctrl.Result{RequeueAfter: 20 * time.Second}, nil
	}

	if err = r.runEngine(ctx, user.Spec.ID, backendURL); err != nil {
		return ctrl.Result{RequeueAfter: 2 * time.Second}, nil
	}

	userStatus.State = string(Starting)
	return ctrl.Result{RequeueAfter: 1 * time.Second}, nil
}

func (r *UserReconciler) getBackendURL(ctx context.Context, name string, req ctrl.Request) (string, int64, error) {
	uid, err := strconv.ParseInt(strings.TrimPrefix(name, "user-"), 10, 64)
	if err != nil {
		return "", 0, err
	}
	endpoints := &corev1.Endpoints{}
	// fetch backend endpoints.
	if err := r.Get(ctx, client.ObjectKey{Namespace: req.Namespace, Name: "shared-backend"}, endpoints); err != nil {
		return "", 0, err
	}
	// StatefulSet endpoints they are always ordered by name.
	var backendURLs []string
	for _, subset := range endpoints.Subsets {
		for _, addr := range subset.Addresses {
			urlStr := fmt.Sprintf("http://%s:%d", addr.IP, subset.Ports[0].Port)
			backendURLs = append(backendURLs, urlStr)
		}
	}
	if len(backendURLs) == 0 {
		return "", 0, fmt.Errorf("backend endpoints not found")
	}
	return backendURLs[uid%int64(len(backendURLs))], uid, nil
}

func (r *UserReconciler) httpWithContext(ctx context.Context, method, url string, body io.Reader) (*http.Response, error) {
	r.Log.Info(fmt.Sprintf("HTTP %v url:%v", method, url))
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	return resp, err
}

func (r *UserReconciler) engineStatus(ctx context.Context, userID int64, userURL string) (UserState, error) {
	resp, err := r.httpWithContext(ctx, "GET", fmt.Sprintf("%s/engine-status?userid=%d", userURL, userID), nil)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Failed to get engine status: %+v", resp)
	}
	jsonResponse := &JSONResponse{Data: ""}
	if err := json.NewDecoder(resp.Body).Decode(jsonResponse); err != nil {
		return "", err
	}
	r.Log.Info("engine status", "user:", userID, "resp:", jsonResponse)
	return UserState(jsonResponse.Data.(string)), nil
}

func (r *UserReconciler) killEngine(ctx context.Context, userID int64, backendURL string) error {
	resp, err := r.httpWithContext(ctx, "GET", fmt.Sprintf("%s/kill-engine?userid=%d", backendURL, userID), nil)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Failed killEngine http status: %+v", resp)
	}
	return nil
}

func (r *UserReconciler) runEngine(ctx context.Context, userID int64, userURL string) error {
	db := sql.GetDB()
	u, err := sql.GetUser(db, userID)
	if err != nil {
		return err
	}
	developerKey, err := sql.GetDeveloperKey(db, userID)
	if err != nil {
		return err
	}

	token, err := dbproxy.SignToken(u.ID)
	if err != nil {
		return err
	}

	options := platformOptions(u, developerKey, config.GetAlmondConfig().DatabaseProxyURL, token)

	b, err := json.Marshal(options)
	if err != nil {
		return err
	}
	resp, err := r.httpWithContext(ctx, "POST", fmt.Sprintf("%s/run-engine", userURL), bytes.NewReader(b))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Failed runEngine http status: %+v", resp)
	}
	return nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *UserReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&backendv1.User{}).
		Complete(r)
}
