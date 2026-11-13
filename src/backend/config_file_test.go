package magitrickle

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"

	"magitrickle/constant"
	"magitrickle/models"
	"magitrickle/utils/intID"

	"go.yaml.in/yaml/v2"
)

func TestConfigFileVersionDoesNotFollowPackageRelease(t *testing.T) {
	a := &App{}
	if got := a.configSnapshotLocked().ConfigVersion; got != defaultConfigFileVersion {
		t.Fatalf("fresh config version = %q, want %q", got, defaultConfigFileVersion)
	}
	a.configFileVersion = "0.8.2"
	if got := a.configSnapshotLocked().ConfigVersion; got != "0.8.2" {
		t.Fatalf("loaded config version was overwritten by package version: %q", got)
	}
}

// Model an existing installation with seven groups and 1,884 rules. The
// pre-Neo config version, interfaces, rule IDs, subscription state and all
// other supported fields must survive load -> save -> reload unchanged.
func TestLegacyConfigurationSurvivesNeoRoundTrip(t *testing.T) {
	groups := make([]*models.Group, 7)
	for i := range groups {
		groups[i] = &models.Group{
			ID: intID.ID{byte(i + 1)}, Name: fmt.Sprintf("Group %d", i),
			Color: "#112233", Interface: "nwg0", Enable: true,
			FallbackInterfaces: []string{"eth1", "wg0"},
			CheckTarget:        "1.1.1.1:443", CheckInterval: 5, CheckTimeout: 1.5,
		}
	}
	for i := 0; i < 1400; i++ {
		g := groups[i%len(groups)]
		g.Rules = append(g.Rules, &models.Rule{
			ID:   intID.ID{byte(i >> 8), byte(i), 99},
			Name: fmt.Sprintf("Rule %d", i), Type: models.RuleTypeDomain,
			Rule: fmt.Sprintf("host%d.example.com", i), Enable: true,
		})
	}
	sub := &models.Subscription{
		ID: intID.ID{99}, Name: "Existing list", Interface: "wg0", Enable: true,
		URL: "https://example.com/list.txt", Interval: 86400, LastUpdate: 1700000000,
	}
	for i := 0; i < 484; i++ {
		sub.Rules = append(sub.Rules, &models.SubscriptionRule{
			ID:   intID.ID{byte(i >> 8), byte(i), 88},
			Type: models.RuleTypeNamespace, Rule: fmt.Sprintf("sub%d.example.com", i), Enable: true,
		})
	}
	subs := []*models.Subscription{sub}
	defaults := constant.DefaultAppConfig
	before := models.Config{ConfigVersion: "0.8.2", App: &defaults, Groups: &groups, Subscriptions: &subs}
	original, err := yaml.Marshal(before)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, original, 0o600); err != nil {
		t.Fatal(err)
	}

	a := &App{}
	a.config.Store(&defaults)
	if err := a.loadConfigFile(path); err != nil {
		t.Fatalf("Neo cannot load existing config: %v", err)
	}
	a.stateMu.RLock()
	snapshot := a.configSnapshotLocked()
	updated, err := yaml.Marshal(snapshot)
	a.stateMu.RUnlock()
	if err != nil {
		t.Fatal(err)
	}
	var origFields, updatedFields map[interface{}]interface{}
	if err := yaml.Unmarshal(original, &origFields); err != nil {
		t.Fatal(err)
	}
	if err := yaml.Unmarshal(updated, &updatedFields); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(origFields, updatedFields) {
		t.Fatal("Neo changed supported settings, groups, subscription or rules during round-trip")
	}
	if err := os.WriteFile(path, updated, 0o600); err != nil {
		t.Fatal(err)
	}
	after := &App{}
	after.config.Store(&defaults)
	if err := after.loadConfigFile(path); err != nil {
		t.Fatalf("Neo cannot reload saved config: %v", err)
	}
	if len(after.groups) != 7 || len(after.subscriptions) != 1 || len(after.subscriptions[0].Rules) != 484 {
		t.Fatalf("lost groups or subscription rules: groups=%d subs=%d", len(after.groups), len(after.subscriptions))
	}
	count := len(after.subscriptions[0].Rules)
	for _, g := range after.groups {
		count += len(g.Rules)
	}
	if count != 1884 {
		t.Fatalf("rules after reload = %d, want 1884", count)
	}
}

func TestWriteFileAtomicReplacesContentAndLeavesNoTempFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := writeFileAtomic(path, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}

	if got, _ := os.ReadFile(path); string(got) != "new" {
		t.Errorf("content = %q", got)
	}
	assertNoTempFiles(t, path)
	if st, _ := os.Stat(path); st.Mode().Perm() != 0o600 {
		t.Errorf("mode = %v", st.Mode().Perm())
	}
}

// If the new file cannot be put in place, the old one stays untouched and the temporary file is removed.
func TestWriteFileAtomicKeepsTargetWhenRenameFails(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	// A non-empty directory under the target name makes the rename fail.
	if err := os.MkdirAll(filepath.Join(path, "keep"), 0o700); err != nil {
		t.Fatal(err)
	}

	if err := writeFileAtomic(path, []byte("new"), 0o600); err == nil {
		t.Fatal("want an error")
	}

	if _, err := os.Stat(filepath.Join(path, "keep")); err != nil {
		t.Errorf("target was damaged: %v", err)
	}
	assertNoTempFiles(t, path)
}

func assertNoTempFiles(t *testing.T, path string) {
	t.Helper()
	left, _ := filepath.Glob(path + ".*.tmp")
	if len(left) != 0 {
		t.Errorf("temporary files left behind: %v", left)
	}
}

// Saves from the API and from the subscription updater can overlap; none may fail or leave a mix behind.
func TestWriteFileAtomicConcurrentCalls(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	contents := make(map[string]bool)
	for i := 0; i < 32; i++ {
		contents[strings.Repeat(string(rune('a'+i%26)), 1000+i)] = true
	}

	var wg sync.WaitGroup
	errs := make(chan error, len(contents))
	for c := range contents {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- writeFileAtomic(path, []byte(c), 0o600)
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Errorf("writeFileAtomic: %v", err)
		}
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !contents[string(got)] {
		t.Errorf("the file holds none of the written contents (%d bytes)", len(got))
	}
	assertNoTempFiles(t, path)
}

// A reload that fails halfway must not leave part of the file applied.
func TestFailedLoadDoesNotChangeTheRunningConfig(t *testing.T) {
	tests := map[string]string{
		"type error after valid keys": "configVersion: 0.1.0\napp:\n  httpWeb:\n    host:\n      port: 9999\n  dnsProxy:\n    maxConcurrent: not-a-number\n",
		"unsupported version":         "configVersion: 9.9.9\napp:\n  httpWeb:\n    host:\n      port: 9999\n",
		"broken yaml":                 "app: [this is: not valid\n  yaml",
	}
	for name, content := range tests {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.yaml")
			if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
				t.Fatal(err)
			}
			a := &App{}
			defaults := constant.DefaultAppConfig
			a.config.Store(&defaults)

			if err := a.loadConfigFile(path); err == nil {
				t.Fatal("want an error")
			}

			if a.cfg().HTTPWeb.Host.Port != constant.DefaultAppConfig.HTTPWeb.Host.Port {
				t.Errorf("port = %d, the failed load changed the running config", a.cfg().HTTPWeb.Host.Port)
			}
		})
	}
}
