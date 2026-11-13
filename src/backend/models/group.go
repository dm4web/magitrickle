package models

import (
	"slices"

	"magitrickle/utils/intID"
)

type Group struct {
	ID                 intID.ID `yaml:"id"`
	Name               string   `yaml:"name"`
	Color              string   `yaml:"color"`
	Interface          string   `yaml:"interface"`
	FallbackInterfaces []string `yaml:"fallback_interfaces,omitempty"`
	CheckTarget        string   `yaml:"check_target,omitempty"`
	CheckInterval      int      `yaml:"check_interval,omitempty"` // seconds; 0 keeps the legacy default
	CheckTimeout       float64  `yaml:"check_timeout,omitempty"`  // seconds; 0 keeps the legacy default
	Enable             bool     `yaml:"enable"`
	Rules              []*Rule  `yaml:"rules"`
}

// Clone возвращает копию группы с собственным срезом правил. Сами правила
// общие, поэтому менять их на месте нельзя — только заменять в срезе.
func (g *Group) Clone() *Group {
	clone := *g
	clone.Rules = slices.Clone(g.Rules)
	clone.FallbackInterfaces = slices.Clone(g.FallbackInterfaces)
	return &clone
}
