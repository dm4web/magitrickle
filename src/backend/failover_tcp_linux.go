//go:build linux

package magitrickle

import (
	"context"
	"net"
	"syscall"

	"golang.org/x/sys/unix"
)

func dialViaInterface(ctx context.Context, iface, addr string) error {
	dialer := net.Dialer{}
	dialer.Control = func(_, _ string, raw syscall.RawConn) error {
		var bindErr error
		if err := raw.Control(func(fd uintptr) {
			bindErr = unix.SetsockoptString(int(fd), unix.SOL_SOCKET, unix.SO_BINDTODEVICE, iface)
		}); err != nil {
			return err
		}
		return bindErr
	}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return err
	}
	return conn.Close()
}
