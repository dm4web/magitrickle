#!/bin/sh
# Run a Linux-only test binary in a private network namespace.
# Does not change host services, routes, firewall or physical interfaces.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run only as root inside an ephemeral Linux CI runner." >&2
  exit 1
fi
if [ "$#" -ne 1 ] || [ ! -x "$1" ]; then
  echo "Usage: $0 /absolute/path/to/magitrickle-netns.test" >&2
  exit 1
fi

command -v unshare >/dev/null
command -v ip >/dev/null

unshare --net -- sh -eu -c '
  ip link set dev lo up
  ip link add mtpri type dummy
  ip link add mtbak type dummy
  ip link set dev mtpri up
  ip link set dev mtbak up
  MAGITRICKLE_NETNS_TEST=isolated exec "$1" -test.v -test.run "^TestNetns"
' sh "$1"
