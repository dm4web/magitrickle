#!/usr/bin/env python3
"""Create public Entware feeds from verified release IPKs; no source files."""

import argparse
import gzip
import hashlib
import html
import io
import json
import re
import shutil
import tarfile
from pathlib import Path


BASE_URL = "https://dm4web.github.io/magitrickle"
REQUIRED_ARCHES = {
    "aarch64-3.10",
    "aarch64-3.10_kn",
    "mips-3.4_kn",
    "mipsel-3.4_kn",
}
ALLOWED_ARCHES = REQUIRED_ARCHES | {"armv7-3.2", "mips-3.4", "mipsel-3.4"}
FIELDS = ("Package", "Version", "Architecture", "Maintainer", "Section", "Priority", "Depends", "Description")


def ipk_control(ipk_path: Path) -> dict[str, str]:
    with tarfile.open(ipk_path, "r:gz") as outer:
        member = next((m for m in outer if m.name.lstrip("./") == "control.tar.gz"), None)
        if member is None:
            raise ValueError(f"missing control archive: {ipk_path.name}")
        control_archive = outer.extractfile(member)
        if control_archive is None:
            raise ValueError(f"cannot read control archive: {ipk_path.name}")
        with tarfile.open(fileobj=io.BytesIO(control_archive.read()), mode="r:gz") as inner:
            control = next((m for m in inner if m.name.lstrip("./") == "control"), None)
            if control is None:
                raise ValueError(f"missing control: {ipk_path.name}")
            stream = inner.extractfile(control)
            if stream is None:
                raise ValueError(f"cannot read control: {ipk_path.name}")
            lines = stream.read().decode("utf-8").splitlines()

    fields: dict[str, str] = {}
    last = None
    for line in lines:
        if line.startswith(" ") and last:
            fields[last] += "\n" + line
        elif ": " in line:
            last, value = line.split(": ", 1)
            fields[last] = value
        else:
            raise ValueError(f"malformed control field in {ipk_path.name}")
    return fields


def build(source: Path, output: Path, version: str) -> None:
    if not re.fullmatch(r"0|[1-9][0-9]*", version):
        raise ValueError(f"Neo version must be a single integer: {version}")
    if output.exists() and any(output.iterdir()):
        raise ValueError("output directory must be empty")
    output.mkdir(parents=True, exist_ok=True)

    actual_arches: set[str] = set()
    downloads: list[tuple[str, str]] = []
    for path in sorted(source.glob("*.ipk")):
        metadata = ipk_control(path)
        arch = metadata.get("Architecture", "")
        if arch not in ALLOWED_ARCHES or arch in actual_arches:
            raise ValueError(f"unexpected or repeated architecture {arch!r}")
        if metadata.get("Package") != "magitrickle" or metadata.get("Version") != version:
            raise ValueError(f"wrong package/version in {path.name}")
        if not path.name.startswith(f"magitrickle_{version}_entware_{arch}.ipk"):
            raise ValueError(f"unexpected IPK filename {path.name}")
        actual_arches.add(arch)

        dest = output / "entware" / arch
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, dest / path.name)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        fields = [f"{key}: {metadata[key]}" for key in FIELDS if key in metadata]
        fields.extend((f"Filename: {path.name}", f"Size: {path.stat().st_size}", f"SHA256sum: {digest}"))
        entry = "\n".join(fields) + "\n\n"
        (dest / "Packages").write_text(entry, encoding="utf-8")
        with (dest / "Packages.gz").open("wb") as stream:
            with gzip.GzipFile(filename="", fileobj=stream, mode="wb", mtime=0) as packed:
                packed.write(entry.encode("utf-8"))
        (dest / "SHA256SUMS").write_text(f"{digest}  {path.name}\n", encoding="utf-8")
        downloads.append((arch, f"entware/{arch}/{path.name}"))

    if not REQUIRED_ARCHES.issubset(actual_arches):
        raise ValueError(f"missing Entware targets: {sorted(REQUIRED_ARCHES - actual_arches)}")

    (output / ".nojekyll").touch()
    (output / "latest.json").write_text(json.dumps({"tag_name": version}) + "\n", encoding="utf-8")
    items = "\n".join(
        f'<li><a href="{html.escape(href, quote=True)}">{html.escape(arch)}</a></li>'
        for arch, href in downloads
    )
    (output / "index.html").write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>MagiTrickle Neo {version}</title><main>'
        f'<h1>MagiTrickle Neo {version}</h1><p>Entware packages for Keenetic</p>'
        f'<ul>{items}</ul><p>Package index: <code>entware/&lt;architecture&gt;/Packages.gz</code></p>'
        '</main></html>\n',
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.source, args.output, args.version)
