//go:build !linux

package magitrickle

import (
	"context"
	"errors"
)

func dialViaInterface(ctx context.Context, iface, addr string) error {
	return errors.New("interface-bound TCP probe is supported on Linux only")
}
