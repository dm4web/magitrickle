#!/usr/bin/env python3
"""Read-only structural validation of a Keenetic Entware IPK."""

import argparse
import io
import struct
import tarfile
from pathlib import Path

TARGET_ELF = {
    "aarch64-3.10_kn": (2, 1, 183),
    "mips-3.4_kn": (1, 2, 8),
    "mipsel-3.4_kn": (1, 1, 8),
}
REQUIRED = {
    "./opt/bin/magitrickled",
    "./opt/etc/config/magitrickle.conf",
    "./opt/etc/init.d/S99magitrickle",
    "./opt/etc/ndm/netfilter.d/100-magitrickle",
    "./opt/var/lib/magitrickle/config.yaml",
    "./opt/usr/share/magitrickle/skins/default/index.html",
    "./opt/usr/share/magitrickle/skins/default/manifest.json",
}
CONTROL = {"./control", "./conffiles", "./postinst", "./prerm"}


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def members(tar: tarfile.TarFile):
    result = {}
    for member in tar:
        name = member.name
        ensure(name not in result, f"duplicate member: {name}")
        ensure(name == "." or name.startswith("./"), f"invalid path: {name}")
        ensure(".." not in Path(name).parts, f"traversal: {name}")
        ensure(member.uid == 0 and member.gid == 0, f"non-root ownership: {name}")
        if member.issym() or member.islnk():
            link = member.linkname
            ensure(not link.startswith("/") and ".." not in Path(link).parts,
                   f"unsafe link: {name} -> {link}")
        result[name] = member
    return result


def verify(path: Path, target: str, version: str | None = None) -> None:
    ensure(path.is_file(), f"missing package: {path}")
    ensure(target in TARGET_ELF, f"unknown target: {target}")
    with tarfile.open(path, "r:gz") as package:
        outer = members(package)
        ensure(set(outer) == {"./debian-binary", "./control.tar.gz", "./data.tar.gz"},
               f"invalid IPK structure: {sorted(outer)}")
        ensure(package.extractfile("./debian-binary").read() == b"2.0\n", "not a Debian 2.0 IPK")
        with tarfile.open(
            fileobj=io.BytesIO(package.extractfile("./control.tar.gz").read()), mode="r:gz"
        ) as control, tarfile.open(
            fileobj=io.BytesIO(package.extractfile("./data.tar.gz").read()), mode="r:gz"
        ) as data:
            controls = members(control)
            payload = members(data)
            ensure(CONTROL <= set(controls), f"control missing: {CONTROL - set(controls)}")
            ensure(REQUIRED <= set(payload), f"payload missing: {REQUIRED - set(payload)}")

            config = control.extractfile("./control").read().decode()
            ensure(f"Architecture: {target}\n" in config, "wrong Entware architecture")
            if version is not None:
                ensure(f"Version: {version}\n" in config, f"wrong package version (expected {version})")
            ensure("Depends: libc, iptables, socat\n" in config, "missing Keenetic dependencies")
            for name in control.extractfile("./conffiles").read().decode().splitlines():
                ensure("." + name in payload, f"conffile missing: {name}")
            for name in ("./postinst", "./prerm"):
                ensure(controls[name].mode & 0o111 != 0, f"script not executable: {name}")
            for name in (
                "./opt/bin/magitrickled",
                "./opt/etc/init.d/S99magitrickle",
                "./opt/etc/ndm/netfilter.d/100-magitrickle",
            ):
                ensure(payload[name].mode & 0o111 != 0, f"not executable: {name}")

            init_script = data.extractfile("./opt/etc/init.d/S99magitrickle").read().decode()
            ensure("/opt/sbin/start-stop-daemon" in init_script, "service must use a detached launcher")
            ensure('"$SSD" -S -b -x "$PROG"' in init_script, "service must survive SSH disconnect")
            ensure('"$SSD" -K -x "$PROG"' in init_script, "service must stop only MagiTrickle")

            frontend = "./opt/usr/share/magitrickle/skins/default/_app/"
            assets = [n for n in payload if n.startswith(frontend) and payload[n].isfile()]
            ensure(len(assets) >= 10, f"incomplete SvelteKit assets: {len(assets)}")

            binary = data.extractfile("./opt/bin/magitrickled").read(20)
            ensure(binary[:4] == b"\x7fELF", "daemon is not ELF")
            elf_class, elf_data, machine = TARGET_ELF[target]
            ensure(binary[4] == elf_class and binary[5] == elf_data, "wrong ELF bitness/endianness")
            endian = "<" if elf_data == 1 else ">"
            ensure(struct.unpack(endian + "H", binary[18:20])[0] == machine, "wrong ELF machine")
            print(f"OK {target}: ELF verified, {len(payload)} entries, {len(assets)} frontend assets")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=sorted(TARGET_ELF), required=True)
    parser.add_argument("--version")
    parser.add_argument("package", type=Path)
    args = parser.parse_args()
    verify(args.package, args.target, args.version)
