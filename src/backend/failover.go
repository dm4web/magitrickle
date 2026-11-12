package magitrickle

import (
	"context"
	"fmt"
	"net"
	"slices"
	"sync"
	"time"

	"magitrickle/models"
	"magitrickle/utils/intID"

	"github.com/rs/zerolog/log"
)

const (
	failoverInterval       = 5 * time.Second
	failoverProbeTimeout   = 1500 * time.Millisecond
	failoverRecoverSamples = 3
	failoverFailureSamples = 2
)

type interfaceCheckKey struct{ name, target string }

type interfaceCheckState struct {
	status    models.InterfaceCheck
	good, bad int
}

// probeInterface never assumes that an UP link implies working connectivity.
// TCP checks bind the socket to the nominated interface on Linux.
func probeInterface(ctx context.Context, key interfaceCheckKey) models.InterfaceCheck {
	status := models.InterfaceCheck{
		Interface: key.name,
		Checked:   true,
		CheckedAt: time.Now(),
		Method:    "link",
	}
	if key.name == "blackhole" {
		status.Healthy, status.Detail = true, "explicit blackhole"
		return status
	}
	nic, err := net.InterfaceByName(key.name)
	if err != nil {
		status.Detail = "interface not found"
		return status
	}
	if nic.Flags&net.FlagUp == 0 {
		status.Detail = "link down"
		return status
	}
	if key.target == "" {
		status.Healthy, status.Detail = true, "link up (connectivity unverified)"
		return status
	}

	status.Method = "tcp"
	start := time.Now()
	if err := dialViaInterface(ctx, key.name, key.target); err != nil {
		status.Detail = fmt.Sprintf("TCP probe failed: %v", err)
		return status
	}
	status.Healthy = true
	status.Detail = "TCP probe passed"
	status.LatencyMS = time.Since(start).Milliseconds()
	return status
}

func (state interfaceCheckState) update(sample models.InterfaceCheck) interfaceCheckState {
	wasChecked := state.status.Checked
	wasHealthy := state.status.Healthy
	if sample.Healthy {
		state.good++
		state.bad = 0
		if !wasChecked || wasHealthy || state.good >= failoverRecoverSamples {
			sample.Healthy = true
		} else {
			sample.Healthy = false
			sample.Detail = fmt.Sprintf("recovering (%d/%d checks)", state.good, failoverRecoverSamples)
		}
	} else {
		state.bad++
		state.good = 0
		if wasChecked && wasHealthy && state.bad < failoverFailureSamples {
			sample.Healthy = true
			sample.Detail = fmt.Sprintf("suspected failure (%d/%d checks)", state.bad, failoverFailureSamples)
		}
	}
	state.status = sample
	return state
}

func chooseInterface(group *models.Group, checks map[interfaceCheckKey]interfaceCheckState) (string, bool) {
	if len(group.FallbackInterfaces) == 0 {
		return group.Interface, true
	}
	candidates := append([]string{group.Interface}, group.FallbackInterfaces...)
	for _, iface := range candidates {
		checked, ok := checks[interfaceCheckKey{name: iface, target: group.CheckTarget}]
		if !ok || !checked.status.Checked {
			return "", false
		}
	}
	for _, iface := range candidates {
		if checks[interfaceCheckKey{name: iface, target: group.CheckTarget}].status.Healthy {
			return iface, true
		}
	}
	return "blackhole", true
}

func (a *App) refreshFailover(ctx context.Context) {
	a.stateMu.RLock()
	keys := map[interfaceCheckKey]struct{}{}
	for _, group := range a.groups {
		if !group.Enable || len(group.FallbackInterfaces) == 0 {
			continue
		}
		keys[interfaceCheckKey{name: group.Interface, target: group.CheckTarget}] = struct{}{}
		for _, iface := range group.FallbackInterfaces {
			keys[interfaceCheckKey{name: iface, target: group.CheckTarget}] = struct{}{}
		}
	}
	a.stateMu.RUnlock()
	if len(keys) == 0 {
		a.stateMu.Lock()
		clear(a.interfaceChecks)
		clear(a.failoverActive)
		a.stateMu.Unlock()
		return
	}

	samples := make(map[interfaceCheckKey]models.InterfaceCheck, len(keys))
	var samplesMu sync.Mutex
	var workers sync.WaitGroup
	slots := make(chan struct{}, 8)
	for key := range keys {
		workers.Add(1)
		go func(key interfaceCheckKey) {
			defer workers.Done()
			select {
			case slots <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-slots }()
			probeCtx, cancel := context.WithTimeout(ctx, failoverProbeTimeout)
			defer cancel()
			sample := probeInterface(probeCtx, key)
			samplesMu.Lock()
			samples[key] = sample
			samplesMu.Unlock()
		}(key)
	}
	workers.Wait()
	if ctx.Err() != nil {
		return
	}

	a.stateMu.Lock()
	defer a.stateMu.Unlock()
	if a.interfaceChecks == nil {
		a.interfaceChecks = map[interfaceCheckKey]interfaceCheckState{}
	}
	// Only keep observations that are part of the current configuration.
	// A group may have changed while probes were in flight.
	current := make(map[interfaceCheckKey]struct{})
	for _, group := range a.groups {
		if !group.Enable || len(group.FallbackInterfaces) == 0 {
			continue
		}
		current[interfaceCheckKey{name: group.Interface, target: group.CheckTarget}] = struct{}{}
		for _, name := range group.FallbackInterfaces {
			current[interfaceCheckKey{name: name, target: group.CheckTarget}] = struct{}{}
		}
	}
	for key := range a.interfaceChecks {
		if _, ok := current[key]; !ok {
			delete(a.interfaceChecks, key)
		}
	}
	for key, sample := range samples {
		if _, ok := current[key]; ok {
			a.interfaceChecks[key] = a.interfaceChecks[key].update(sample)
		}
	}
	previous := make(map[intID.ID]string, len(a.failoverActive))
	for id, iface := range a.failoverActive {
		previous[id] = iface
	}
	if a.failoverActive == nil {
		a.failoverActive = map[intID.ID]string{}
	}
	changed := false
	for _, group := range a.groups {
		if !group.Enable || len(group.FallbackInterfaces) == 0 {
			delete(a.failoverActive, group.ID)
			continue
		}
		selected, complete := chooseInterface(group, a.interfaceChecks)
		if !complete {
			continue
		}
		old := a.failoverActive[group.ID]
		if old == "" {
			old = group.Interface
		}
		if selected != old {
			a.failoverActive[group.ID] = selected
			changed = true
		}
	}
	if !changed || a.routing.Load() == nil {
		return
	}
	if err := a.commitLocked(nil); err != nil {
		a.failoverActive = previous
		if restoreErr := a.commitLocked(nil); restoreErr != nil {
			log.Error().Err(restoreErr).Msg("failed to restore routes after failover error")
		}
		log.Error().Err(err).Msg("could not apply interface failover")
		return
	}
	for _, group := range a.groups {
		before := previous[group.ID]
		after := a.failoverActive[group.ID]
		if before == "" {
			before = group.Interface
		}
		if after != "" && after != before {
			log.Info().Str("group", group.Name).Str("previous", before).Str("active", after).Msg("interface failover")
		}
	}
}

// RoutingStatuses returns observed runtime state; it does not change configuration.
func (a *App) RoutingStatuses() []models.GroupRoutingStatus {
	a.stateMu.RLock()
	defer a.stateMu.RUnlock()
	statuses := make([]models.GroupRoutingStatus, 0, len(a.groups))
	for _, group := range a.groups {
		selected := group.Interface
		if runtimeSelected := a.failoverActive[group.ID]; runtimeSelected != "" && len(group.FallbackInterfaces) > 0 {
			if runtimeSelected == "blackhole" || runtimeSelected == group.Interface || slices.Contains(group.FallbackInterfaces, runtimeSelected) {
				selected = runtimeSelected
			}
		}
		actual, applied := "", false
		if table := a.routing.Load(); table != nil && group.Enable {
			actual, applied = table.ActiveInterface(group.ID.String())
		}
		item := models.GroupRoutingStatus{
			ID: group.ID, PrimaryInterface: group.Interface, ActiveInterface: actual,
			SelectedInterface: selected, Applied: applied,
			CheckTarget: group.CheckTarget, Failover: len(group.FallbackInterfaces) > 0, Enabled: group.Enable,
			Interfaces: []models.InterfaceCheck{},
		}
		if item.Failover {
			for _, iface := range append([]string{group.Interface}, group.FallbackInterfaces...) {
				key := interfaceCheckKey{name: iface, target: group.CheckTarget}
				if check, ok := a.interfaceChecks[key]; ok {
					item.Interfaces = append(item.Interfaces, check.status)
				} else {
					item.Interfaces = append(item.Interfaces, models.InterfaceCheck{
						Interface: iface, Method: "pending", Detail: "waiting for first check",
					})
				}
			}
		}
		statuses = append(statuses, item)
	}
	return statuses
}
