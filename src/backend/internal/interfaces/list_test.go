package interfaces

import (
	"net"
	"testing"
)

func TestFilterUp(t *testing.T) {
	input := []net.Interface{
		{Name: "nwg0", Flags: net.FlagUp | net.FlagPointToPoint},
		{Name: "eth1", Flags: net.FlagPointToPoint},
		{Name: "wg0", Flags: net.FlagUp | net.FlagPointToPoint},
	}
	got := filterUp(input)
	if len(got) != 2 || got[0].Name != "nwg0" || got[1].Name != "wg0" {
		t.Fatalf("filterUp = %v, want nwg0 and wg0", got)
	}
}
