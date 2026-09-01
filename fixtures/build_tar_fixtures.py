#!/usr/bin/env python3
"""Regenerate the .tar.gz fixtures from the .zip ones.

The tar fixtures hold byte-identical content to their zip twins, in the same
member order (X18 depends on member order), with the leading `./` that
`tar czf .` produces on UNIX. Parsing either container must yield identical
facts apart from the archive filename in each `source` string.

Run from the repo root:  python fixtures/build_tar_fixtures.py
"""
import io
import os
import tarfile
import zipfile

PAIRS = [
    ("fixtures/hcu_SBCMEM31W.zip", "fixtures/hcu_SBCMEM31W.tar.gz"),
    ("fixtures/hcu_SBCMSR01W.zip", "fixtures/hcu_SBCMSR01W.tar.gz"),
]

# Fixed mtime so rebuilds are byte-stable and don't churn the diff.
MTIME = 1755000000


def build(zip_path, tar_path):
    zf = zipfile.ZipFile(zip_path)
    with tarfile.open(tar_path, "w:gz") as tf:
        for name in zf.namelist():
            if name.endswith("/"):
                continue
            data = zf.read(name)
            info = tarfile.TarInfo("./" + name)
            info.size = len(data)
            info.mtime = MTIME
            info.mode = 0o644
            info.uname = "ctmuser"
            info.gname = "ctmgrp"
            tf.addfile(info, io.BytesIO(data))
    print(f"{tar_path}  ({os.path.getsize(tar_path)} bytes)")


if __name__ == "__main__":
    for z, t in PAIRS:
        build(z, t)
