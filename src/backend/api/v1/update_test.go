package v1

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestReleaseCheckerVersionsAndCache(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Header.Get("Accept") != "application/json" {
			t.Error("missing JSON accept header")
		}
		_, _ = w.Write([]byte(`{"tag_name":"1"}`))
	}))
	defer server.Close()

	checker := &releaseChecker{client: server.Client(), endpoint: server.URL}
	status, err := checker.check(context.Background(), "0")
	if err != nil {
		t.Fatal(err)
	}
	if !status.Available || status.CurrentVersion != "0" || status.LatestVersion != "1" || status.ReleaseURL != githubNeoReleaseBase {
		t.Fatalf("wrong update status: %+v", status)
	}
	for _, current := range []string{"1", "2"} {
		status, err := checker.check(context.Background(), current)
		if err != nil || status.Available || status.ReleaseURL != "" {
			t.Fatalf("version %s must not show update: %+v, %v", current, status, err)
		}
	}
	if requests.Load() != 1 {
		t.Fatalf("expected cached request, got %d", requests.Load())
	}
}

func TestReleaseCheckerRejectsInvalidTags(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"tag_name":"1.0.0"}`))
	}))
	defer server.Close()
	checker := &releaseChecker{client: server.Client(), endpoint: server.URL}
	if _, err := checker.check(context.Background(), "0"); err == nil || !strings.Contains(err.Error(), "unexpected Neo release tag") {
		t.Fatalf("expected invalid tag error, got %v", err)
	}
	if !checker.checkedAt.IsZero() {
		t.Fatal("invalid release should not be cached")
	}
}

func TestReleaseCheckerDoesNotRequestOnUnversionedBuild(t *testing.T) {
	checker := &releaseChecker{endpoint: "http://127.0.0.1:1"}
	status, err := checker.check(context.Background(), "unattached")
	if err != nil || status.Available || status.CurrentVersion != "unattached" {
		t.Fatalf("unversioned dev status = %+v, %v", status, err)
	}
}
