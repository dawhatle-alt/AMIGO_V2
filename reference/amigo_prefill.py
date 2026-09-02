#!/usr/bin/env python3
"""
amigo_prefill.py — Stage 1 of the AMIGO Pre-Fill pipeline (spec v0.1).

Deterministically extracts environment facts from ctm_data_collector (HCU)
archives and emits environment_facts.json with per-fact provenance/confidence,
plus a gap list with the exact command / console path / reference needed to
close each gap.

Pure Python stdlib. No LLM. No network. Portable to any agent runtime (Hermes).

Usage:
  python amigo_prefill.py --archives em.zip server.tar.gz [...] --report facts.json [--sanitize]

Archives may be .zip (Windows collections) or .tar / .tar.gz / .tgz (UNIX ones);
the container is detected from magic bytes, not the file extension.
"""
import argparse, csv, io, json, re, sys, tarfile, zipfile
from datetime import datetime, timezone

PARSER_VERSION = "0.1.0"


class ArchiveFormatError(Exception):
    """Container could not be recognised as a zip or tar HCU collection."""


def _detect_format(path):
    """Identify the container by MAGIC BYTES, not extension — collections get
    renamed in transit, and a mislabelled archive should still parse."""
    with open(path, "rb") as fh:
        head = fh.read(265)
    if head[:2] == b"PK" and head[2:4] in (b"\x03\x04", b"\x05\x06", b"\x07\x08"):
        return "zip"
    if head[:2] == b"\x1f\x8b":
        return "tar.gz"
    if head[257:262] == b"ustar":
        return "tar"
    raise ArchiveFormatError(
        f"{path}: unrecognised archive format — expected .zip, .tar or .tar.gz")


# ---------------------------------------------------------------- archive ----
class Archive:
    """One HCU collection.

    Windows collections arrive as .zip, UNIX ones as .tar.gz/.tgz/.tar. Both
    are exposed as an ordered member list plus byte/text readers, so every
    extractor is container-agnostic. Member ORDER is preserved in both paths
    (X18 depends on it) and nothing here sorts.
    """

    def __init__(self, path):
        self.path = path
        self.format = _detect_format(path)
        self.zf = None
        self.tf = None
        # Normalised member name -> name as stored in the container.
        self._members = {}

        if self.format == "zip":
            self.zf = zipfile.ZipFile(path)
            raw = [n for n in self.zf.namelist() if not n.endswith("/")]
        else:
            try:
                self.tf = tarfile.open(path, "r:*")
            except tarfile.ReadError as e:
                raise ArchiveFormatError(f"{path}: not a readable tar archive ({e})")
            raw = [m.name for m in self.tf.getmembers() if m.isfile()]

        self.names = []
        for name in raw:
            # `tar czf` commonly writes paths as `./OS/...`; suffix matching makes
            # the prefix harmless, but normalising keeps provenance readable.
            norm = name[2:] if name.startswith("./") else name
            self._members[norm] = name
            self.names.append(norm)

        self.product = self._detect_product()
        self.host = None
        self.collector_ok = self._collector_ok()

    def _detect_product(self):
        joined = "\n".join(self.names)
        if "check_config_results" in joined or re.search(r"(^|/)EM/", joined, re.M):
            return "EM"
        if "CNF_INFO/" in joined:
            return "Server"
        if "AG_CNF/" in joined:
            return "Agent"
        return "Unknown"

    def find(self, suffix):
        """Suffix match — archives may or may not carry a root folder prefix."""
        matches = [n for n in self.names if n.endswith(suffix)]
        return matches[0] if matches else None

    def find_all(self, pattern):
        rx = re.compile(pattern)
        return [n for n in self.names if rx.search(n)]

    def read_bytes(self, member):
        """Raw bytes of a member, whichever container this archive came from."""
        stored = self._members[member]
        if self.zf is not None:
            return self.zf.read(stored)
        fh = self.tf.extractfile(stored)
        if fh is None:
            return b""
        with fh:
            return fh.read()

    def read(self, suffix):
        m = self.find(suffix)
        if m is None:
            return None, None
        return self.read_bytes(m).decode("utf-8", errors="replace"), m

    def _collector_ok(self):
        text, _ = self.read("hcu_logs/collector.log")
        if text is None:
            return None  # log absent — unknown
        return "completed successfully" in text.lower()


# ------------------------------------------------------------------ facts ----
class Facts:
    def __init__(self):
        self.data = {}

    def add(self, key, value, confidence, source, extractor, raw=None):
        self.data[key] = {
            "value": value, "confidence": confidence,
            "source": source, "extractor": extractor,
        }
        if raw is not None:
            self.data[key]["raw"] = raw.strip()[:300]

    def get(self, key):
        e = self.data.get(key)
        return e["value"] if e else None


def src(ar, member):
    return f"{ar.path.split('/')[-1]}:{member}"


# ------------------------------------------------------------- extractors ----
_MONTHS = {"jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05", "jun": "06",
           "jul": "07", "aug": "08", "sep": "09", "oct": "10", "nov": "11", "dec": "12"}


def _install_date_key(value):
    """Comparable YYYYMMDD key for an installed-versions date, or None.

    Windows collections write ISO dates (2023-07-22); Linux ones write
    Mon-DD-YYYY (Apr-01-2025), which sorts alphabetically by month name and
    made X01 report the wrong latest version. Mirrored in the TS port
    (lib/parser/extractors/identity.ts) — keep both in lockstep.
    """
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", value)
    if m:
        return m.group(1) + m.group(2) + m.group(3)
    m = re.match(r"^([A-Za-z]{3})-(\d{2})-(\d{4})$", value)
    if m and m.group(1).lower() in _MONTHS:
        return m.group(3) + _MONTHS[m.group(1).lower()] + m.group(2)
    return None


def x01_installed_versions(ar, F):
    text, m = ar.read("CNF_INFO/versions/installed-versions.txt")
    if text is None:
        return
    rows = []
    for line in text.splitlines()[1:]:
        parts = re.split(r"\s{2,}", line.strip())
        if len(parts) >= 6:
            rows.append(dict(zip(
                ["package", "platform", "package_date", "install_date", "version", "type"], parts)))
    if not rows:
        return
    # Stable sort by install_date as a real DATE when every row parses; if any
    # row is unrecognised, fall back to the plain string sort rather than
    # guessing a partial order (extractors never invent).
    keys = {id(r): _install_date_key(r["install_date"]) for r in rows}
    if all(k is not None for k in keys.values()):
        rows.sort(key=lambda r: keys[id(r)])
    else:
        rows.sort(key=lambda r: r["install_date"])
    F.add("server.patch_history", rows, "EXACT", src(ar, m), "X01")
    F.add("server.version", rows[-1]["version"], "EXACT", src(ar, m), "X01", raw=str(rows[-1]))
    fps = [r for r in rows if r["type"].lower() in ("fixpack", "patch")]
    if fps:
        F.add("server.fixpack", fps[-1]["package"], "EXACT", src(ar, m), "X01")


def x02_check_config(ar, F):
    reports = sorted(ar.find_all(r"check_config_report_\d+\.json$"))
    if not reports:
        return
    m = reports[-1]  # latest by timestamp in name
    data = json.loads(ar.read_bytes(m))
    s = src(ar, m)
    F.add("em.version", data.get("version"), "EXACT", s, "X02")
    F.add("em.home", data.get("location"), "EXACT", s, "X02")
    ps = data.get("production_size") or {}
    if ps:
        F.add("em.daily_jobs", ps.get("jobs"), "EXACT", s, "X10")
        F.add("em.size_class", ps.get("size"), "EXACT", s, "X10")
        F.add("em.users", ps.get("users"), "EXACT", s, "X10")


def x03_hostname(ar, F):
    text, m = ar.read("OS/Network/Hostname.txt")
    if text:
        key = f"{ar.product.lower()}.host"
        F.add(key, text.strip().splitlines()[0], "EXACT", src(ar, m), "X03")
        ar.host = text.strip().splitlines()[0]


def x04_os(ar, F):
    text, m = ar.read("OS/Hardware/HardwareConfig.txt")
    if text is None:
        return
    name = re.search(r"OS Name:\s*(.+)", text)
    ver = re.search(r"OS Version:\s*(.+)", text)
    p = ar.product.lower()
    if name:
        F.add(f"{p}.os_name", name.group(1).strip(), "EXACT", src(ar, m), "X04")
    if ver:
        F.add(f"{p}.os_version", ver.group(1).strip(), "EXACT", src(ar, m), "X04")


def x05_db(ar, F):
    pg = ar.find("pg_settings-table.csv")
    ora = ar.find_all(r"/db/oracle/")
    if pg:
        text = ar.read_bytes(pg).decode("utf-8", "replace")
        vm = re.search(r"server_version\D+([\d.]+)", text)
        F.add("db.type", "PostgreSQL", "EXACT", src(ar, pg), "X05")
        if vm:
            F.add("db.version", vm.group(1), "EXACT", src(ar, pg), "X05")
    elif ora:
        F.add("db.type", "Oracle", "EXACT", src(ar, ora[0]), "X05")
    else:
        F.add("db.type", "MS SQL (by elimination — no PostgreSQL/Oracle sections in archive)",
              "INFERRED", f"{ar.path.split('/')[-1]}:<absence of db/postgresql & db/oracle>", "X05")


def x06_sysprm(ar, F):
    text, m = ar.read("report/SYSPRM.csv")
    if text is None:
        return
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        return
    r, s = rows[0], src(ar, m)
    F.add("server.ha", "Yes" if r.get("MIRRORDB", "N").upper() == "Y" else "No (standalone)", "EXACT", s, "X06", raw=str(r))
    F.add("server.ssl_enabled", r.get("SSL_ENBL"), "EXACT", s, "X06")
    F.add("server.newday_time", r.get("DAYTIME"), "EXACT", s, "X06")
    if r.get("CTM_VERSION"):
        F.add("server.running_version", r.get("CTM_VERSION"), "EXACT", s, "X06")


def x07_em_ha(ar, F):
    m = ar.find("EM/ini/CONFIG_HA.INI") or ar.find("ini/CONFIG_HA.INI")
    if m:
        F.add("em.ha_or_distributed", "Yes — CONFIG_HA.INI present", "EXACT", src(ar, m), "X07")
    elif ar.find("EMSiteConfig.ini"):
        F.add("em.ha_or_distributed", "No (standalone — no CONFIG_HA.INI)", "EXACT",
              f"{ar.path.split('/')[-1]}:<absence of CONFIG_HA.INI>", "X07")


def x11_ajf(ar, F):
    text, m = ar.read("report/jobs_count.csv")
    if text is None:
        return
    counts = [int(r["COUNT"]) for r in csv.DictReader(io.StringIO(text)) if r.get("COUNT", "").isdigit()]
    if counts:
        F.add("server.ajf_peak", max(counts), "DERIVED", src(ar, m), "X11")


def x12_disk(ar, F):
    text, m = ar.read("OS/Disk/partitions.txt")
    if text is None:
        return
    drives = []
    for line in text.splitlines():
        dm = re.search(r"Drive\s+(\w:).*?Free\s+([\d.]+)\s*GB", line)
        if dm:
            drives.append({"drive": dm.group(1), "free_gb": float(dm.group(2))})
        fs = re.search(r"\b(nfs|vxfs)\b", line, re.I)
        if fs:
            F.add(f"{ar.product.lower()}.fs_flag", fs.group(1).upper(), "EXACT", src(ar, m), "X12")
    if drives:
        F.add(f"{ar.product.lower()}.disk_free", drives, "EXACT", src(ar, m), "X12")


def x13_java(ar, F):
    text, m = ar.read("OS/Java/check_java_versions.txt")
    if text is None:
        return
    s = src(ar, m)
    home = re.search(r"JAVA_HOME:\s*(.+)", text)
    hv = re.search(r'JAVA_HOME version:.*?"([\d._]+)"', text)
    sysv = re.search(r'System Java.*?"([\d._]+)"', text)
    if home:
        F.add("em.java_home", home.group(1).strip(), "EXACT", s, "X13")
    if hv:
        F.add("em.java_home_version", hv.group(1), "EXACT", s, "X13")
    if sysv:
        F.add("em.java_system_version", sysv.group(1), "EXACT", s, "X13")


def x14_apigtw(ar, F):
    text, m = ar.read("CNF_INFO/data/api_gateway_url.dat")
    if text is None:
        return
    pm = re.search(r":(\d+)", text)
    if pm:
        F.add("server.apigtw_port", pm.group(1), "EXACT", src(ar, m), "X14", raw=text)


def x15_gd_forward(ar, F):
    text, m = ar.read("CNF_INFO/data/config.dat")
    if text is None:
        return
    gm = re.search(r"^GD_FORWARD\s+(\S+)", text, re.M)
    val = gm.group(1) if gm else "not set (default — forward ordering active per 9.0.21+ behavior)"
    F.add("server.gd_forward", val, "EXACT", src(ar, m), "X15")


def x16_ctmldnrs(ar, F):
    m = ar.find("ctmldnrs.dat")
    F.add("server.ctmldnrs_in_use", "Yes" if m else "No (file not present in data/)",
          "EXACT", src(ar, m) if m else f"{ar.path.split('/')[-1]}:<absence>", "X16")


def x17_ldap(ar, F):
    conf = ar.find("EM/LDAP/ldap.conf") or ar.find("LDAP/ldap.conf")
    if conf:
        t, m2 = ar.read("LDAP/DirectoryServiceType.cfg")
        dtype = t.strip() if t else "type file absent"
        F.add("em.ldap", f"Configured ({dtype})", "EXACT", src(ar, conf), "X17")
    else:
        F.add("em.ldap", "Not configured (no ldap.conf collected)", "EXACT",
              f"{ar.path.split('/')[-1]}:<absence>", "X17")


def x18_ssl_policies(ar, F):
    plcs = [n.split("/")[-1] for n in ar.find_all(r"cert/.*\.plc$")]
    if plcs:
        F.add("server.ssl_policies", plcs, "EXACT", f"{ar.path.split('/')[-1]}:CNF_INFO/cert/*.plc", "X18")


def x20_aapi(ar, F):
    dirs = sorted(set(re.findall(r"AAPI/(ABA\d+)/(v\d+)/", "\n".join(ar.names))))
    if dirs:
        types = {}
        for name, ver in dirs:
            types.setdefault(name, []).append(ver)
        F.add("em.ai_jobtypes", types, "EXACT", f"{ar.path.split('/')[-1]}:EM/AAPI/", "X20")


def x22_agents(ar, F):
    text, m = ar.read("AG_TBL_CTM/AGENT_DISCOVERY.csv")
    if text is None:
        return
    agents = list(csv.DictReader(io.StringIO(text)))
    F.add("agents", agents, "EXACT", src(ar, m), "X22")


def x23_agstat(ar, F):
    text, m = ar.read("FNC_INFO/ctm_agstat.txt")
    if text is None:
        return
    unavail = [l.split()[0] for l in text.splitlines()[1:] if "unavailable" in l.lower()]
    F.add("agents_unavailable", unavail, "EXACT", src(ar, m), "X23")


AV_SIGNATURES = {
    "whatsupgold": "WhatsUp Gold (monitoring)", "msmpeng": "Microsoft Defender (antivirus)",
    "csfalcon": "CrowdStrike Falcon (EDR)", "mcafee": "McAfee (antivirus)",
    "solarwinds": "SolarWinds (monitoring)", "sentinelone": "SentinelOne (EDR)",
    "nessus": "Nessus (scanner)", "zabbix": "Zabbix (monitoring)",
}

def x27_av(ar, F):
    text, m = ar.read("OS/Processes/Processes.txt")
    if text is None:
        return
    found = sorted({label for sig, label in AV_SIGNATURES.items() if sig in text.lower()})
    if found:
        F.add(f"{ar.product.lower()}.av_monitoring", found, "INFERRED", src(ar, m), "X27")


SERVER_EXTRACTORS = [x01_installed_versions, x03_hostname, x04_os, x05_db, x06_sysprm,
                     x11_ajf, x12_disk, x14_apigtw, x15_gd_forward, x16_ctmldnrs,
                     x18_ssl_policies, x22_agents, x23_agstat, x27_av]
EM_EXTRACTORS = [x02_check_config, x03_hostname, x04_os, x07_em_ha, x12_disk,
                 x13_java, x17_ldap, x20_aapi, x27_av]


# ------------------------------------------------------------- derivations ---
def derive(F):
    em_h, sv_h = F.get("em.host"), F.get("server.host")
    if em_h and sv_h:
        F.add("topology.em_server_same_host",
              "Yes" if em_h.lower() == sv_h.lower() else f"No — EM on {em_h}, Server on {sv_h}",
              "DERIVED", "join(em.host, server.host)", "X08")
    # KA 000419757: RHEL >= 8.5 agents in SSL mode
    agents = F.get("agents") or []
    hits = []
    for a in agents:
        osname = a.get("OS", "")
        mm = re.search(r"Red Hat.*?(\d+)\.(\d+)", osname)
        if mm and (int(mm.group(1)), int(mm.group(2))) >= (8, 5) and a.get("SSL", "N").upper() == "Y":
            hits.append(a.get("NODEID"))
    if hits:
        F.add("flags.ka_000419757", {"triggered": True, "agents": hits},
              "DERIVED", "join(agents.OS, agents.SSL)", "X25")


# ------------------------------------------------------------------- gaps ----
def build_gaps(F):
    """Items the archive cannot answer — each with the exact action to close it."""
    gaps = []
    def gap(gid, q, why, how):
        gaps.append({"id": gid, "question": q, "why": why, **how})

    # run-command
    gap("ctmsetown", "Run ctmsetown -action list on EM and Server — any NOTIMPL entries?",
        "NOTIMPL entries block the upgrade and must be resolved first.",
        {"state": "run-command",
         "command": "ctmsetown -action list\nREM Run once as EM admin, once as Server admin.\nREM Paste FULL output. Zero NOTIMPL lines required.",
         "refs": [{"label": "KA 000354649 — NOTIMPL resolution 🔒",
                   "url": "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pA8DCAU"}]})
    gap("compat_mode", "Compatibility Mode status and version",
        "Hard gate: cannot upgrade to 9.0.22 if compatibility version is 9.0.19 or lower. Irreversible once off. (Not yet captured by the collector — spec X19.)",
        {"state": "console",
         "console": "CCM → Manage → Compatibility Mode — record On/Off and the compatibility version shown.",
         "refs": [{"label": "KA 000401828 — Compatibility Mode FAQ 🔒",
                   "url": "https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=kA114000000pDZpCAM"}]})
    gap("is_upgrade_ready", "Run is_upgrade_ready near the upgrade window",
        "Point-in-time readiness validation from the target install media.",
        {"state": "run-command",
         "command": "cd <install_media>\\UpgradeReady\\upgrade_ready\nis_upgrade_ready.bat -p em\nis_upgrade_ready.bat -p ctm",
         "refs": [{"label": "Verifying Upgrade Readiness 🔒",
                   "url": "https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm"}]})
    gap("cm_inventory", "Control Modules installed on the Server's local agent",
        "CMs are NOT upgraded in-place — each needs a separate migration case.",
        {"state": "console",
         "console": "CCM → Agents → <local agent> → installed plug-ins; or list <agent_home>\\cm\\ on disk."})
    gap("em_clients", "How many EM clients exist, and where?",
        "Determines Compatibility Mode duration — EM stays in compat mode until ALL clients are upgraded.",
        {"state": "interview"})
    # decisions
    for gid, q, why in [
        ("target_version", "Target version and fix pack (9.0.22 recommended)", "Defines the upgrade path and applicable rules."),
        ("upgrade_date", "Planned upgrade date (DD/MMM/YYYY)", "AMIGO Review requires 2 weeks lead time."),
        ("downtime_window", "Downtime window (start, duration)", "Both components share the outage if co-hosted; runbook timers are built from this."),
        ("fallback_plan", "Documented and tested fallback plan?", "Required before cutover — includes DB restore procedure."),
        ("change_freeze", "Change cutoff for job definitions/calendars/services", "Prevents drift between EM and Server during upgrade."),
        ("test_plan", "Post-upgrade functional test plan", "Verification phase of the runbook is built from this."),
        ("same_machine", "In-place on the same machine (not a migration)?", "Migration to a new machine is not covered under AMIGO."),
        ("cloud", "Is the environment cloud-hosted?", "KA 000223209 applies if yes."),
        ("av_exclusions", "Confirm Control-M exclusions are configured in the detected AV/monitoring tools", "Scanning interference can corrupt the upgrade."),
        ("firewall", "Confirm firewall rules verified for the new version", "EM↔Server and Server↔Agent ports."),
    ]:
        gap(gid, q, why, {"state": "interview"})
    return gaps


# -------------------------------------------------------------------- main ---
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archives", nargs="+", required=True,
                    help="HCU archives: .zip, .tar, .tar.gz or .tgz")
    ap.add_argument("--report", default="environment_facts.json")
    ap.add_argument("--sanitize", action="store_true")
    args = ap.parse_args()

    F = Facts()
    meta_archives = []
    for path in args.archives:
        ar = Archive(path)
        extractors = SERVER_EXTRACTORS if ar.product == "Server" else EM_EXTRACTORS if ar.product == "EM" else []
        for ex in extractors:
            try:
                ex(ar, F)
            except Exception as e:
                print(f"[warn] {ex.__name__} on {path}: {e}", file=sys.stderr)
        meta_archives.append({"file": path.split("/")[-1], "product": ar.product,
                              "host": ar.host, "collector_log_ok": ar.collector_ok})

    derive(F)
    gaps = build_gaps(F)

    out = {
        "meta": {"parser_version": PARSER_VERSION,
                 "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "archives": meta_archives},
        "facts": F.data,
        "gaps": gaps,
        "summary": {
            "facts_total": len(F.data),
            "exact": sum(1 for v in F.data.values() if v["confidence"] == "EXACT"),
            "derived": sum(1 for v in F.data.values() if v["confidence"] == "DERIVED"),
            "inferred_confirm": sum(1 for v in F.data.values() if v["confidence"] == "INFERRED"),
            "gaps_total": len(gaps),
        },
    }
    if args.sanitize:
        text = json.dumps(out, indent=2)
        for h in [a["host"] for a in meta_archives if a["host"]]:
            text = text.replace(h, "<hostname>")
        out = json.loads(text)

    with open(args.report, "w") as f:
        json.dump(out, f, indent=2)
    s = out["summary"]
    print(f"Facts: {s['facts_total']} ({s['exact']} exact, {s['derived']} derived, "
          f"{s['inferred_confirm']} to confirm) | Gaps: {s['gaps_total']} -> {args.report}")


if __name__ == "__main__":
    main()
