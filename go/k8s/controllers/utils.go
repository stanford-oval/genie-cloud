package controllers

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func userName(userID int64) string {
	return fmt.Sprintf("user-%d", userID)
}

// NewDeployment returns a new Deployment cloned from template and set with new name, namespace and label.
func NewDeployment(template *appsv1.Deployment, name string, namespace string) *appsv1.Deployment {
	d := template.DeepCopy()
	d.ObjectMeta.Name = name
	d.ObjectMeta.Namespace = namespace
	if d.ObjectMeta.Labels == nil {
		d.ObjectMeta.Labels = make(map[string]string)
	}
	d.ObjectMeta.Labels["app"] = name
	if d.Spec.Selector == nil {
		d.Spec.Selector = &metav1.LabelSelector{
			MatchLabels: make(map[string]string),
		}
	}
	d.Spec.Selector.MatchLabels["app"] = name
	if d.Spec.Template.ObjectMeta.Labels == nil {
		d.Spec.Template.ObjectMeta.Labels = make(map[string]string)
	}
	d.Spec.Template.ObjectMeta.Labels["app"] = name
	return d
}

// NewDeployment returns a new Service cloned from template and set with new name, namespace, label, and selector.
func NewService(template *corev1.Service, name string, namespace string) *corev1.Service {
	s := template.DeepCopy()
	s.ObjectMeta.Name = name
	s.ObjectMeta.Namespace = namespace
	if s.ObjectMeta.Labels == nil {
		s.ObjectMeta.Labels = make(map[string]string)
	}
	s.ObjectMeta.Labels["app"] = name
	if s.Spec.Selector == nil {
		s.Spec.Selector = make(map[string]string)
	}
	s.Spec.Selector["app"] = name
	return s

}

// ReadJSONFile reads and unmarshals json file
func ReadJSONFile(filePath string, v interface{}) error {
	buf, err := ioutil.ReadFile(filePath)
	if err != nil {
		return err
	}
	err = json.Unmarshal(buf, v)
	if err != nil {
		return err
	}
	return nil
}

func isDialError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "dial tcp")
}
