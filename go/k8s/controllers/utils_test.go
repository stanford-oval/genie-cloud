package controllers

import (
	"testing"

	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestNewDeployment(t *testing.T) {
	var three int32 = 3
	template := appsv1.Deployment{
		ObjectMeta: v1.ObjectMeta{Name: "template-user"},
		Spec:       appsv1.DeploymentSpec{Replicas: &three},
	}
	want := &appsv1.Deployment{
		ObjectMeta: v1.ObjectMeta{Name: "user1", Namespace: "namespace1", Labels: map[string]string{"app": "user1"}},
		Spec: appsv1.DeploymentSpec{
			Replicas: &three,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": "user1"},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: v1.ObjectMeta{
					Labels: map[string]string{"app": "user1"},
				},
			},
		},
	}
	got := NewDeployment(&template, "user1", "namespace1")
	require.Equal(t, want, got)
	require.Equal(t, template.ObjectMeta.Name, "template-user")
}

func TestNewService(t *testing.T) {
	template := corev1.Service{
		ObjectMeta: v1.ObjectMeta{Name: "template-user"},
		Spec: corev1.ServiceSpec{
			Ports: []corev1.ServicePort{{Port: 8000}},
		},
	}
	want := &corev1.Service{
		ObjectMeta: v1.ObjectMeta{Name: "user1", Namespace: "namespace1", Labels: map[string]string{"app": "user1"}},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "user1"},
			Ports:    []corev1.ServicePort{{Port: 8000}},
		},
	}
	got := NewService(&template, "user1", "namespace1")
	require.Equal(t, want, got)
	require.Equal(t, template.ObjectMeta.Name, "template-user")
}
