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
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	logging "log"

	"github.com/go-logr/logr"
	"gorm.io/gorm"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

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
	Scheme                      *runtime.Scheme
	Log                         logr.Logger
	almondConfig                *config.AlmondConfig
	localCache                  map[string]CacheEntry
	developerDeploymentTemplate appsv1.Deployment
	developerServiceTemplate    corev1.Service
}

// UserState constants
type UserState string

const (
	Starting UserState = "starting"
	Running  UserState = "running"
	Idle     UserState = "idle"
	Stopping UserState = "stopping"
)

// PlatformOptions is part of runEngine request
type PlatformOptions struct {
	UserID             int64   `json:"userId"`
	CloudID            string  `json:"cloudId"`
	AuthToken          string  `json:"authToken"`
	DeveloperKey       *string `json:"developerKey"`
	Locale             string  `json:"locale"`
	Timezone           string  `json:"timezone"`
	DBProxyURL         string  `json:"dbProxyUrl"`
	DBProxyAccessToken string  `json:"dbProxyAccessToken"`
	HumanName          *string `json:"humanName"`
	Email              *string `json:"email"`
}

func platformOptions(user *sql.User, developerKey *string, dbProxyURL string, dbProxyToken string) *PlatformOptions {
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

type CacheEntry struct {
	Value      interface{}
	Expiration time.Time
}

const kDefaultCacheDuration = 2 * time.Hour

type dbQueryFunc func(db *gorm.DB, userID int64) (interface{}, error)

const kTrustedDeveloper int = 8

// NewUserReconciler initializes UserReconciler and reads template files from configDir.
func NewUserReconciler(client client.Client, scheme *runtime.Scheme, log logr.Logger, almondConfig *config.AlmondConfig, configDir string) *UserReconciler {
	r := &UserReconciler{
		Client:       client,
		Scheme:       scheme,
		Log:          log,
		almondConfig: almondConfig,
		localCache:   make(map[string]CacheEntry),
	}
	if err := ReadJSONFile(path.Join(configDir, "developer-deployment.json"), &r.developerDeploymentTemplate); err != nil {
		logging.Fatal(err)
	}
	if err := ReadJSONFile(path.Join(configDir, "developer-service.json"), &r.developerServiceTemplate); err != nil {
		logging.Fatal(err)
	}
	return r
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
		err              error
		userID           int64
		trustedDeveloper bool
		user             *backendv1.User
		stop             bool
		result           ctrl.Result
		currentStatus    backendv1.UserStatus
	)

	defer func() {
		if user != nil {
			if len(user.Spec.Mode) == 0 {
				if r.almondConfig.EnableDeveloperBackend && trustedDeveloper {
					user.Spec.Mode = "developer"
				} else {
					user.Spec.Mode = "shared"
				}
				r.Update(ctx, user)
			}
			user.Status = currentStatus
			r.Status().Update(ctx, user)
			r.Log.Info("update status:", "user", user.Spec.ID, "status", user.Status)
		}
		r.Log.Info("--- end ---")
	}()

	userID, trustedDeveloper, err = r.getUserFromName(req.Name)
	if err != nil {
		return ctrl.Result{}, err
	}

	if r.almondConfig.EnableDeveloperBackend && trustedDeveloper {
		user, currentStatus, stop, result, err = r.handleDeveloper(ctx, req, userID)
	} else {
		user, currentStatus, stop, result, err = r.handleSharedUser(ctx, req, userID)
	}
	if err != nil || stop {
		return result, err
	}

	if len(user.Status.Backend) > 0 && user.Status.Backend != currentStatus.Backend {
		// backend url has changed, kill the old backend
		r.Log.Info("backends changed:", "user", user.Spec.ID, "old", user.Status.Backend, "new", currentStatus.Backend)
		if err = r.killEngine(ctx, userID, user.Status.Backend); err != nil {
			r.Log.Error(err, "kill old engine failed")
		}
	}

	if UserState(currentStatus.State) == Running {
		return ctrl.Result{RequeueAfter: 10 * time.Second}, nil
	}

	if UserState(currentStatus.State) == Idle {
		r.Log.Info("delete idle engine:", "user", user.Spec.ID)
		if err = r.killEngine(ctx, userID, currentStatus.Backend); err != nil {
			r.Log.Error(err, "kill idle engine failed")
		}
		return ctrl.Result{}, r.Client.Delete(ctx, user)
	}

	if err = r.runEngine(ctx, user.Spec.ID, currentStatus.Backend); err != nil {
		currentStatus.State = err.Error()
		return ctrl.Result{RequeueAfter: 2 * time.Second}, nil
	}
	currentStatus.State = string(Starting)
	return ctrl.Result{RequeueAfter: 1 * time.Second}, nil
}

func (r *UserReconciler) getUserFromName(name string) (uid int64, trustedDeveloper bool, err error) {
	uid, err = strconv.ParseInt(strings.TrimPrefix(name, "user-"), 10, 64)
	if err != nil {
		return
	}
	v, err := r.getDBEntry("user", uid, getUser, true)
	if err != nil {
		return
	}
	user := v.(*sql.User)
	if user.Roles&kTrustedDeveloper != 0 {
		trustedDeveloper = true
	}
	return
}

func (r *UserReconciler) handleDeveloper(ctx context.Context, req ctrl.Request,
	userID int64) (user *backendv1.User, currentStatus backendv1.UserStatus, stop bool, result ctrl.Result, err error) {
	user = &backendv1.User{}
	// for developer users, make sure deployment and service are up before proceeding.
	if err = r.Client.Get(ctx, req.NamespacedName, user); err != nil {
		if apierrors.IsNotFound(err) {
			if err = r.deleteDeploymentService(ctx, req, userID); err != nil {
				r.Log.Error(err, "fail to delete developer deployment or service")
			}
		}
		stop = true
		user = nil
		return
	}
	if !user.ObjectMeta.DeletionTimestamp.IsZero() {
		// user is marked for deletion
		currentStatus.State = string(Stopping)
		if err = r.deleteDeploymentService(ctx, req, userID); err != nil {
			r.Log.Error(err, "fail to delete developer deployment or service marked for deletion")
		}
		stop = true
		return
	}
	deployment := &appsv1.Deployment{}
	if err = r.Client.Get(ctx, req.NamespacedName, deployment); err != nil {
		if apierrors.IsNotFound(err) {
			if err = r.createDeployment(ctx, req.Name, req.Namespace); err != nil {
				return
			}
			stop = true
			result = ctrl.Result{RequeueAfter: 2 * time.Second}
			// setting err to nil so ControllerManager will respect the RequeueAfter time
			err = nil
			return
		}
		return
	}
	if deployment.Status.AvailableReplicas <= 0 {
		currentStatus.State = string(Starting)
		stop = true
		result = ctrl.Result{RequeueAfter: 2 * time.Second}
		return
	}
	service := &corev1.Service{}
	if err = r.Client.Get(ctx, req.NamespacedName, service); err != nil {
		if apierrors.IsNotFound(err) {
			if err = r.createService(ctx, req.Name, req.Namespace); err != nil {
				return
			}
			currentStatus.State = string(Starting)
			stop = true
			result = ctrl.Result{RequeueAfter: 2 * time.Second}
			err = nil
			return
		}
		return
	}
	if len(service.Spec.ClusterIP) == 0 {
		currentStatus.State = string(Starting)
		stop = true
		result = ctrl.Result{RequeueAfter: 2 * time.Second}
		err = nil
		return
	}
	if len(service.Spec.Ports) == 0 {
		err = errors.New("service port not configured")
		return
	}
	currentStatus.Backend = fmt.Sprintf("http://%s:%d", service.Spec.ClusterIP, service.Spec.Ports[0].Port)

	engineStatus, err := r.engineStatus(ctx, userID, currentStatus.Backend)
	if err != nil {
		currentStatus.State = err.Error()
		if isDialError(err) {
			stop = true
			err = nil
			result = ctrl.Result{RequeueAfter: 2 * time.Second}
			return
		}
		return
	}
	currentStatus.State = string(engineStatus)
	return
}

func (r *UserReconciler) handleSharedUser(ctx context.Context, req ctrl.Request,
	userID int64) (user *backendv1.User, currentStatus backendv1.UserStatus, stop bool, result ctrl.Result, err error) {
	currentStatus.Backend, err = r.getSharedBackendURL(ctx, req.Namespace, userID)
	if err != nil {
		currentStatus.State = err.Error()
		result = ctrl.Result{RequeueAfter: 2 * time.Second}
		stop = true
		err = nil
		return
	}

	engineStatus, err := r.engineStatus(ctx, userID, currentStatus.Backend)
	if err != nil {
		currentStatus.State = err.Error()
		if isDialError(err) {
			stop = true
			err = nil
			result = ctrl.Result{RequeueAfter: 2 * time.Second}
			return
		}
		return
	}
	currentStatus.State = string(engineStatus)

	user = &backendv1.User{}
	if err = r.Client.Get(ctx, req.NamespacedName, user); err != nil {
		if apierrors.IsNotFound(err) {
			// User is already deleted, kill engine if it's still running.
			if engineStatus == Running || engineStatus == Idle {
				r.Log.Info("kill engine for already deleted user:", "user", userID)
				err = r.killEngine(ctx, userID, currentStatus.Backend)
				return
			}
			err = nil
			stop = true
		}
		return
	}

	if !user.ObjectMeta.DeletionTimestamp.IsZero() {
		// object is marked for deletion
		if engineStatus == Running || engineStatus == Idle {
			r.Log.Info("kill engine for user marked for deletion:", "user", userID)
			if err = r.killEngine(ctx, userID, currentStatus.Backend); err != nil {
				r.Log.Error(err, "fail to kill engine marked for deletion")
			}
		}
		stop = true
		return
	}
	return
}

func (r *UserReconciler) getSharedBackendURL(ctx context.Context, namespace string, uid int64) (urlStr string, err error) {
	endpoints := &corev1.Endpoints{}
	// fetch backend endpoints.
	if err = r.Get(ctx, client.ObjectKey{Namespace: namespace, Name: "shared-backend"}, endpoints); err != nil {
		return
	}
	// StatefulSet endpoints are always ordered by name.
	var backendURLs []string
	for _, subset := range endpoints.Subsets {
		for _, addr := range subset.Addresses {
			u := fmt.Sprintf("http://%s:%d", addr.IP, subset.Ports[0].Port)
			backendURLs = append(backendURLs, u)
		}
	}
	if len(backendURLs) == 0 {
		err = fmt.Errorf("backend endpoints not found")
	} else {
		urlStr = backendURLs[uid%int64(len(backendURLs))]
	}
	return
}

func (r *UserReconciler) createDeployment(ctx context.Context, name, namespace string) error {
	deployment := NewDeployment(&r.developerDeploymentTemplate, name, namespace)
	if err := r.Client.Create(ctx, deployment); err != nil {
		return err
	}
	return nil
}

func (r *UserReconciler) createService(ctx context.Context, name, namespace string) error {
	service := NewService(&r.developerServiceTemplate, name, namespace)
	if err := r.Client.Create(ctx, service); err != nil {
		return err
	}
	return nil
}

func (r *UserReconciler) getDBEntry(keyPrefix string, userID int64, fn dbQueryFunc, useCache bool) (interface{}, error) {
	cacheKey := fmt.Sprintf("%s-%d", keyPrefix, userID)
	cacheEntry, ok := r.localCache[cacheKey]
	if useCache && ok && cacheEntry.Expiration.After(time.Now()) {
		return cacheEntry.Value, nil
	}
	db := sql.GetDB()
	v, err := fn(db, userID)
	if err != nil {
		return nil, err
	}
	r.localCache[cacheKey] = CacheEntry{v, time.Now().Add(kDefaultCacheDuration)}
	return v, nil
}

func getUser(db *gorm.DB, userID int64) (interface{}, error) {
	return sql.GetUser(db, userID)
}

func getDeveloperKey(db *gorm.DB, userID int64) (interface{}, error) {
	return sql.GetDeveloperKey(db, userID)
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
	r.Log.Info("engine status:", "user", userID, "resp", jsonResponse)
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
	v, err := r.getDBEntry("user", userID, getUser, false)
	if err != nil {
		return err
	}
	u := v.(*sql.User)
	v, err = r.getDBEntry("developer-key", userID, getDeveloperKey, false)
	if err != nil {
		return err
	}
	developerKey := v.(*string)

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

func (r *UserReconciler) deleteDeploymentService(ctx context.Context, req ctrl.Request, userID int64) error {
	r.Log.Info("Deleting deployment and service:", "user", userID)
	meta := &metav1.ObjectMeta{Name: req.Name, Namespace: req.Namespace}
	err1 := r.deleteService(ctx, req, userID, meta)
	err2 := r.deleteDeployment(ctx, req, meta)
	if err1 != nil && err2 != nil {
		return fmt.Errorf("Error1:%v\nError2:%v", err1, err2)
	}
	if err1 != nil {
		return err1
	}
	if err2 != nil {
		return err2
	}
	return nil
}

func (r *UserReconciler) deleteDeployment(ctx context.Context, req ctrl.Request, meta *metav1.ObjectMeta) error {
	deployment := &appsv1.Deployment{ObjectMeta: *meta}
	if err := r.Client.Get(ctx, req.NamespacedName, deployment); err != nil {
		if apierrors.IsNotFound(err) {
			return nil
		}
	}
	if err := r.Client.Delete(ctx, deployment); err != nil {
		return err
	}
	return nil
}

func (r *UserReconciler) deleteService(ctx context.Context, req ctrl.Request, userID int64, meta *metav1.ObjectMeta) error {
	service := &corev1.Service{ObjectMeta: *meta}
	if err := r.Client.Get(ctx, req.NamespacedName, service); err != nil {
		if apierrors.IsNotFound(err) {
			return nil
		}
	}
	if len(service.Spec.ClusterIP) > 0 && len(service.Spec.Ports) > 0 {
		backend := fmt.Sprintf("http://%s:%d", service.Spec.ClusterIP, service.Spec.Ports[0].Port)
		if err := r.killEngine(ctx, userID, backend); err != nil {
			r.Log.Error(err, "kill engine failed")
		}
	}
	if err := r.Client.Delete(ctx, service); err != nil {
		return err
	}
	return nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *UserReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&backendv1.User{}).
		Complete(r)
}
