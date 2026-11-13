package magitrickle

import (
	"testing"
	"time"

	"magitrickle/models"
	"magitrickle/utils/intID"
)

func TestGroupProbeTiming(t *testing.T) {
	defaults := &models.Group{Interface: "eth0", CheckTarget: "1.1.1.1:443"}
	if got := groupCheckInterval(defaults); got != 5*time.Second {
		t.Fatalf("default interval = %v, want 5 seconds", got)
	}
	if got := groupCheckTimeout(defaults); got != 1500*time.Millisecond {
		t.Fatalf("default timeout = %v, want 1.5 seconds", got)
	}
	if key := groupCheckKey(defaults, "eth1"); key.timeout != 0 {
		t.Fatalf("legacy check key changed: %+v", key)
	}

	custom := &models.Group{Interface: "eth0", CheckTarget: "1.1.1.1:443", CheckInterval: 8, CheckTimeout: 2.4}
	if got := groupCheckInterval(custom); got != 8*time.Second {
		t.Fatalf("custom interval = %v, want 8 seconds", got)
	}
	if got := groupCheckTimeout(custom); got != 2400*time.Millisecond {
		t.Fatalf("custom timeout = %v, want 2.4 seconds", got)
	}
	if key := groupCheckKey(custom, "eth1"); key.timeout != 2400*time.Millisecond {
		t.Fatalf("custom check key timeout = %v, want 2.4 seconds", key.timeout)
	}

	now := time.Now()
	last := interfaceCheckState{status: models.InterfaceCheck{Checked: true, CheckedAt: now.Add(-7 * time.Second)}}
	if probeIsDue(last, true, 8*time.Second, now) {
		t.Fatal("probe scheduled before its 8-second interval")
	}
	if !probeIsDue(last, true, 5*time.Second, now) {
		t.Fatal("probe not scheduled after its 5-second interval")
	}
	if !probeIsDue(last, false, 8*time.Second, now) {
		t.Fatal("initial probe must run immediately")
	}
}

func statusFor(checks map[interfaceCheckKey]interfaceCheckState, name string, healthy bool) {
	checks[interfaceCheckKey{name: name}] = interfaceCheckState{status: models.InterfaceCheck{Interface: name, Checked: true, Healthy: healthy}}
}

func TestChooseInterfacePriority(t *testing.T) {
	group := &models.Group{Interface: "eth0", FallbackInterfaces: []string{"nwg0", "eth1"}}
	checks := map[interfaceCheckKey]interfaceCheckState{}
	if got, ok := chooseInterface(group, checks); ok || got != "" {
		t.Fatalf("uninitialized checks: got %q, %v", got, ok)
	}
	statusFor(checks, "eth0", true)
	statusFor(checks, "nwg0", true)
	statusFor(checks, "eth1", true)
	tests := []struct {
		name                      string
		primary, backup1, backup2 bool
		want                      string
	}{
		{"primary", true, true, true, "eth0"},
		{"first backup", false, true, true, "nwg0"},
		{"second backup", false, false, true, "eth1"},
		{"no interface", false, false, false, "blackhole"},
		{"return to primary", true, true, false, "eth0"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			statusFor(checks, "eth0", tc.primary)
			statusFor(checks, "nwg0", tc.backup1)
			statusFor(checks, "eth1", tc.backup2)
			got, ok := chooseInterface(group, checks)
			if !ok || got != tc.want {
				t.Fatalf("got %q (complete %v), want %q", got, ok, tc.want)
			}
		})
	}
}

func TestCheckHysteresis(t *testing.T) {
	current := interfaceCheckState{}
	update := func(healthy bool) models.InterfaceCheck {
		current = current.update(models.InterfaceCheck{Interface: "eth0", Healthy: healthy, Checked: true})
		return current.status
	}
	if !update(true).Healthy {
		t.Fatal("first healthy check rejected")
	}
	if !update(false).Healthy {
		t.Fatal("single failed check should not switch interface")
	}
	if update(false).Healthy {
		t.Fatal("two failures should mark interface down")
	}
	if update(true).Healthy {
		t.Fatal("recovery should wait for 3 successes")
	}
	if update(true).Healthy {
		t.Fatal("recovery should wait for 3 successes")
	}
	if !update(true).Healthy {
		t.Fatal("three successes should restore interface")
	}
}

func TestLegacyGroupAlwaysKeepsInterface(t *testing.T) {
	group := &models.Group{Interface: "wg0"}
	got, complete := chooseInterface(group, nil)
	if !complete || got != "wg0" {
		t.Fatalf("legacy group switched unexpectedly: %q %t", got, complete)
	}
}

func TestValidateGroupFailover(t *testing.T) {
	tests := []struct {
		name    string
		group   models.Group
		invalid bool
	}{
		{"valid TCP", models.Group{Interface: "eth0", FallbackInterfaces: []string{"eth1"}, CheckTarget: "1.1.1.1:443"}, false},
		{"valid IPv6", models.Group{Interface: "eth0", FallbackInterfaces: []string{"eth1"}, CheckTarget: "[2606:4700:4700::1111]:443"}, false},
		{"valid custom timing", models.Group{Interface: "eth0", CheckInterval: 7, CheckTimeout: 2.5}, false},
		{"legacy timing defaults", models.Group{Interface: "eth0", CheckInterval: 0, CheckTimeout: 0}, false},
		{"invalid interval negative", models.Group{Interface: "eth0", CheckInterval: -1}, true},
		{"invalid interval too long", models.Group{Interface: "eth0", CheckInterval: 301}, true},
		{"invalid timeout negative", models.Group{Interface: "eth0", CheckTimeout: -1}, true},
		{"invalid timeout too short", models.Group{Interface: "eth0", CheckTimeout: 0.05}, true},
		{"invalid timeout too long", models.Group{Interface: "eth0", CheckTimeout: 31}, true},
		{"duplicate primary", models.Group{Interface: "eth0", FallbackInterfaces: []string{"eth0"}}, true},
		{"duplicate backup", models.Group{Interface: "eth0", FallbackInterfaces: []string{"eth1", "eth1"}}, true},
		{"missing primary", models.Group{FallbackInterfaces: []string{"eth1"}}, true},
		{"invalid target hostname", models.Group{Interface: "eth0", CheckTarget: "example.org:443"}, true},
		{"port overflow", models.Group{Interface: "eth0", CheckTarget: "1.1.1.1:70000"}, true},
		{"port zero", models.Group{Interface: "eth0", CheckTarget: "1.1.1.1:0"}, true},
		{"legacy", models.Group{Interface: "eth0"}, false},
	}
	for i, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.group.ID = intID.ID{byte(i + 1)}
			err := validateGroups([]*models.Group{&tc.group}, nil)
			if (err != nil) != tc.invalid {
				t.Fatalf("unexpected error: %v (want invalid=%v)", err, tc.invalid)
			}
		})
	}
}

func TestRoutingStatusShowsCommittedInterfaceAfterFailedSwitch(t *testing.T) {
	router := &fakeRouter{broken: map[string]bool{"nwg0": true}}
	a := newRunningApp(t, router)
	group := &models.Group{
		ID:                 intID.ID{55},
		Name:               "test",
		Interface:          "eth0",
		FallbackInterfaces: []string{"nwg0"},
		Enable:             true,
	}
	if err := a.AddGroup(group); err != nil {
		t.Fatal(err)
	}
	before := a.RoutingStatuses()
	if len(before) != 1 || before[0].ActiveInterface != "eth0" || !before[0].Applied {
		t.Fatalf("unexpected initial routing state: %+v", before)
	}
	a.stateMu.Lock()
	a.failoverActive = map[intID.ID]string{group.ID: "nwg0"}
	err := a.commitLocked(nil)
	a.stateMu.Unlock()
	if err == nil {
		t.Fatal("routing to broken backup succeeded")
	}
	after := a.RoutingStatuses()
	if after[0].ActiveInterface != "eth0" || after[0].SelectedInterface != "nwg0" || !after[0].Applied {
		t.Fatalf("status misrepresents failed switch: %+v", after[0])
	}
}
