package models

import (
	"magitrickle/utils/intID"
	"time"
)

// InterfaceCheck describes one interface as observed by the failover monitor.
// With no check target, "healthy" only means that the link is administratively up.
type InterfaceCheck struct {
	Interface string    `json:"interface"`
	Healthy   bool      `json:"healthy"`
	Checked   bool      `json:"checked"`
	Method    string    `json:"method"`
	Detail    string    `json:"detail"`
	LatencyMS int64     `json:"latency_ms,omitempty"`
	CheckedAt time.Time `json:"checked_at,omitzero"`
}

type GroupRoutingStatus struct {
	ID                intID.ID         `json:"id"`
	PrimaryInterface  string           `json:"primary_interface"`
	ActiveInterface   string           `json:"active_interface"`
	SelectedInterface string           `json:"selected_interface"`
	Applied           bool             `json:"applied"`
	CheckTarget       string           `json:"check_target,omitempty"`
	Failover          bool             `json:"failover"`
	Enabled           bool             `json:"enabled"`
	Interfaces        []InterfaceCheck `json:"interfaces"`
}
