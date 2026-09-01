# Control-M Version Matrix & Upgrade Path Rules

## Supported Upgrade Paths

### To 9.0.22
| From Version | Direct Upgrade? | Notes                                         |
|-------------|-----------------|-----------------------------------------------|
| 9.0.21.xxx  | ✅ Yes          | Recommended path                              |
| 9.0.20.xxx  | ✅ Yes          | Supported                                     |
| 9.0.19.xxx  | ✅ Yes          | Minimum version for direct upgrade to 9.0.22  |
| 9.0.18.xxx  | ❌ No           | Must upgrade to 9.0.19+ first                 |
| 9.0.00.xxx  | ❌ No           | Must step through intermediate versions       |
| 8.0.xx      | ❌ No           | Unsupported — contact BMC Account Manager     |

### To 9.0.21
| From Version | Direct Upgrade? | Notes                                         |
|-------------|-----------------|-----------------------------------------------|
| 9.0.20.xxx  | ✅ Yes          | Supported                                     |
| 9.0.19.xxx  | ✅ Yes          | Supported                                     |
| 9.0.18.xxx  | ✅ Yes          | Supported (check specific fix pack)           |
| 9.0.00.xxx  | ⚠️ Check        | Review Upgrade Guide for path                 |

## Compatibility Mode Rules

- **What it does**: Allows upgraded EM to work with older EM Clients and older Servers.
- **When it activates**: Automatically on after EM upgrade if clients/servers are older version.
- **When to turn off**: Only after ALL EM Clients and Servers are upgraded to same version.
- **IRREVERSIBLE**: Once Compatibility Mode is turned OFF, it CANNOT be re-enabled.
- **Version gate for 9.0.22**: Cannot upgrade to 9.0.22 if Compatibility Mode version is 9.0.19 or lower.
- **KA**: 000401828 (FAQ for Compatibility Mode on EM 9.0.21)

## EM Before Server Rule

- **Always recommended**: Upgrade EM before Server.
- **If Server is upgraded first**: Server runs in Compatibility Mode with new features disabled until EM catches up.
- **New features**: Only available after disabling Compatibility Mode.

## PostgreSQL Compatibility

| Control-M Version | Bundled PostgreSQL | Upgrade Required?                    |
|-------------------|--------------------|--------------------------------------|
| 9.0.20            | 11.5               | Yes → 15.3 after upgrade to 9.0.22  |
| 9.0.21            | 11.5               | Yes → 15.3 after upgrade to 9.0.22  |
| 9.0.22            | 15.3 (new installs) | N/A for new installs                |

- PostgreSQL is NOT upgraded during in-place upgrade of EM or Server.
- PostgreSQL 11.5 may not be supported on 9.22.100.
- Must be on PostgreSQL 11+ to upgrade to 9.0.22.

## Java Requirements

- External Java installation required for 9.0.22.
- Supported: Java 1.8 (64-bit) or higher.
- KA 000401084 for supported Java version and vendor list.
- Must set Java Environment Variable before upgrade.

## OS Compatibility Notes

### AAPI CLI — No Longer Supported On:
- Amazon Linux 2
- SUSE Linux 12
- Red Hat 7
- Oracle Linux 7
- CentOS 7
- **Reason**: Requires Node.js v18+
- **KA**: 000419428

### AIX
- End of support planned for end of 2026.
- AIX 7.2: Review Flash document.

### SUSE 12
- Review if CTM-3454 is resolved before upgrade.

## Disk Space Requirements

| Component | Minimum Free Space |
|-----------|-------------------|
| EM        | 12 GB             |
| Server    | 10-12 GB          |

## EM Client Requirements (9.0.22)

- Google Chrome v78+ or Microsoft Edge v80+
- Microsoft .NET Framework 4.7.2
- Java 1.8 (64-bit) or higher

## Key Ports

- BMC_INST_CTM_APIGTW_PORT = 8393 (set before Server upgrade)
- Kafka/Zookeeper: must use different ports if EM and Server on same UNIX/Linux host

## Known Issues by Version Path

| CAR ID    | Issue                                              | Applies When                           | KA        |
|-----------|----------------------------------------------------|----------------------------------------|-----------|
| CTM-7632  | Microservices fail on different Windows drives      | EM+Server on different drives, Windows | 000404872 |
| CTM-7845  | New day doesn't order jobs with multiple servers    | Multiple servers on same box           | 000406529 |
| CTM-7300  | ess_key.txt not created                            | Server upgrade to 9.0.21 on Windows    | 000402260 |
| CTM-5074  | Kafka services fail on HA failover                 | EM+Server same UNIX host, diff users   | 000374213 |
| CTM-3454  | OS compatibility issue                             | SUSE 12                                | Check     |
