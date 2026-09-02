#!/usr/bin/env python3
"""Regenerate fixtures/hcu_SBCMSR02L.zip — a Linux Server collection whose
installed-versions.txt uses the real-world Mon-DD-YYYY date format.

Windows collections write ISO dates, where string order equals date order, so
the original fixtures never exercised date parsing. A real Linux archive
(seen 2026-09-01) writes Apr-01-2025-style dates, which sort alphabetically by
month name and made X01 report the wrong latest version. This fixture locks the
fix in both runtimes.

Expected outputs (both parsers):
  server.version = 9.0.21.300   (PAAFT.9.0.21.300, installed Aug-20-2025 — last by date)
  server.fixpack = PACTV.9.0.21.302  (last Patch/Fixpack-type row by date)
A plain string sort instead yields May-18-2023 last -> 9.0.20.207. That gap is
what the tests assert against.

Run from the repo root:  python fixtures/build_realdate_fixture.py
"""
import zipfile

OUT = "fixtures/hcu_SBCMSR02L.zip"

# (package, platform, package_date, install_date, version, type) — shaped like
# the real archive: Linux platform, Mon-DD-YYYY dates, INSTALLATION/UPGRADE/PATCH
# types, rows NOT pre-sorted by install date.
ROWS = [
    ("PACTV.9.0.21.302", "Linux-x86_64", "Dec-04-2024", "Apr-01-2025", "9.0.21.302", "PATCH"),
    ("PACTV.9.0.21.200", "Linux-x86_64", "Dec-26-2023", "Apr-15-2024", "9.0.21.200", "UPGRADE"),
    ("PAAFT.9.0.21.300", "Linux-x86_64", "Jun-26-2024", "Aug-20-2025", "9.0.21.300", "UPGRADE"),
    ("DROST.9.0.20.000_linux", "Linux-x86_64", "Jan-20-2020", "Jul-03-2020", "9.0.20.000", "INSTALLATION"),
    ("PACTV.9.0.20.200", "Linux-x86_64", "Nov-24-2021", "Feb-07-2023", "9.0.20.200", "UPGRADE"),
    ("PACTV.9.0.20.207", "Linux-x86_64", "Nov-03-2022", "May-18-2023", "9.0.20.207", "PATCH"),
    ("PACTV.9.0.21.300", "Linux-x86_64", "Jul-12-2024", "Feb-05-2025", "9.0.21.300", "UPGRADE"),
]

HEADER = "Package                          Platform      PackageDate  InstallDate  Version     Type"

FILES = {
    "CNF_INFO/versions/installed-versions.txt":
        "\n".join([HEADER] + ["%-32s %-13s %-12s %-12s %-11s %s" % r for r in ROWS]) + "\n",
    "OS/Network/Hostname.txt": "SBCMSR02L\n",
    "hcu_logs/collector.log": (
        "2026-08-20 12:56:34 INFO  ctm_data_collector started (product=Server)\n"
        "2026-08-20 12:56:38 INFO  section CNF_INFO ... OK\n"
        "2026-08-20 12:56:41 INFO  section OS ... OK\n"
        "2026-08-20 12:56:42 INFO  Collection completed successfully\n"
    ),
}

# Fixed timestamp so rebuilds are byte-stable.
STAMP = (2026, 8, 20, 12, 56, 34)

if __name__ == "__main__":
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, text in FILES.items():
            info = zipfile.ZipInfo(name, date_time=STAMP)
            info.external_attr = 0o644 << 16
            zf.writestr(info, text)
    print(f"{OUT} written ({len(ROWS)} patch rows, Mon-DD-YYYY dates)")
