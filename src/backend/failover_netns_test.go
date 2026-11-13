//go:build linux && netns_test

package magitrickle

import (
	"context"
	"net"
	"os"
	"os/exec"
	"testing"
	"time"

	"magitrickle/models"
	"magitrickle/utils/intID"
)

// This test runs ONLY inside the ephemeral namespace created by
// e2e/test-failover-netns.sh. Routing changes go to fakeRouter,
// never to iptables, nftables or the host's actual routing table.
func requireTestNamespace(t *testing.T) {
	t.Helper()
	if os.Getenv("MAGITRICKLE_NETNS_TEST") != "isolated" {
		t.Fatal("refusing to run without isolated namespace marker")
	}
	for _, name := range []string{"lo", "mtpri", "mtbak"} {
		if _, err := net.InterfaceByName(name); err != nil {
			t.Fatalf("missing isolated test interface %q: %v", name, err)
		}
	}
}

func testLink(t *testing.T, iface string, up bool) {
	t.Helper()
	state := "down"
	if up {
		state = "up"
	}
	cmd := exec.Command("ip", "link", "set", "dev", iface, state)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("cannot set isolated interface %s %s: %v: %s", iface, state, err, out)
	}
}

func assertApplied(t *testing.T, a *App, want string) {
	t.Helper()
	statuses := a.RoutingStatuses()
	if len(statuses) != 1 {
		t.Fatalf("expected one group status; got %+v", statuses)
	}
	s := statuses[0]
	if !s.Applied || s.ActiveInterface != want || s.SelectedInterface != want {
		t.Fatalf("expected committed interface %q; got %+v", want, s)
	}
}

// advanceProbeSchedule simulates the elapsed check interval without sleeping.
// The scheduler is tested separately; this test exercises failover hysteresis
// and committed route state against actual link transitions in a private netns.
func advanceProbeSchedule(a *App) {
	a.stateMu.Lock()
	for key, state := range a.interfaceChecks {
		state.status.CheckedAt = time.Now().Add(-failoverDefaultInterval - time.Second)
		a.interfaceChecks[key] = state
	}
	a.stateMu.Unlock()
}

func refreshAfterInterval(a *App, ctx context.Context) {
	advanceProbeSchedule(a)
	a.refreshFailover(ctx)
}

func TestNetnsFailoverLifecycle(t *testing.T) {
	requireTestNamespace(t)
	router := &fakeRouter{}
	a := newRunningApp(t, router)
	group := &models.Group{
		ID:                 intID.ID{1},
		Name:               "isolated-link-failover",
		Interface:          "mtpri",
		FallbackInterfaces: []string{"mtbak"},
		Enable:             true,
	}
	if err := a.AddGroup(group); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	refreshAfterInterval(a, ctx)
	assertApplied(t, a, "mtpri")
	t.Cleanup(func() {
		// Only change the test's private network namespace.
		testLink(t, "mtpri", true)
		testLink(t, "mtbak", true)
	})

	// First failure is held back by the hysteresis window.
	testLink(t, "mtpri", false)
	refreshAfterInterval(a, ctx)
	assertApplied(t, a, "mtpri")
	refreshAfterInterval(a, ctx)
	assertApplied(t, a, "mtbak")

	// Both unavailable: never switch to an unspecified real interface.
	testLink(t, "mtbak", false)
	refreshAfterInterval(a, ctx)
	assertApplied(t, a, "mtbak")
	refreshAfterInterval(a, ctx)
	assertApplied(t, a, "blackhole")

	// Three successful samples required to return to primary.
	testLink(t, "mtpri", true)
	for i := 0; i < failoverRecoverSamples-1; i++ {
		refreshAfterInterval(a, ctx)
		assertApplied(t, a, "blackhole")
	}
	refreshAfterInterval(a, ctx)
	assertApplied(t, a, "mtpri")

	// Auto-selection must not rewrite the saved user preference.
	saved := a.Group(group.ID)
	if saved.Interface != "mtpri" || len(saved.FallbackInterfaces) != 1 || saved.FallbackInterfaces[0] != "mtbak" {
		t.Fatalf("automatic failover changed configuration: %+v", saved)
	}
}

func TestNetnsTCPProbeUsesRequestedInterface(t *testing.T) {
	requireTestNamespace(t)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	address := listener.Addr().String()

	viaLoopback := probeInterface(ctx, interfaceCheckKey{name: "lo", target: address})
	if !viaLoopback.Healthy || viaLoopback.Method != "tcp" || !viaLoopback.Checked {
		t.Fatalf("TCP listener on loopback not reachable via loopback: %+v", viaLoopback)
	}

	// The listener is bound only to loopback. Binding a client to an
	// unrelated dummy device must not pass through the default route.
	viaDummy := probeInterface(ctx, interfaceCheckKey{name: "mtpri", target: address})
	if viaDummy.Healthy || viaDummy.Method != "tcp" || !viaDummy.Checked {
		t.Fatalf("TCP probe unexpectedly crossed the nominated interface: %+v", viaDummy)
	}

	testLink(t, "mtpri", false)
	down := probeInterface(ctx, interfaceCheckKey{name: "mtpri", target: address})
	if down.Healthy || down.Detail != "link down" {
		t.Fatalf("down interface should fail before TCP: %+v", down)
	}
	testLink(t, "mtpri", true)
}
