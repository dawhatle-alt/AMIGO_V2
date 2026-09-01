# AMIGO Server Checklist V22 — Full Reference

This file contains every question from the AMIGO Starter Checklist for Control-M/Server 9.0.22,
organized by section. Each item includes the question, recommended action, conditional logic,
and TSA discussion recommendations.

## Table of Contents
1. [Existing Server Environment](#existing-server-environment)
2. [Upgrading Server Environment](#upgrading-server-environment)
3. [Server Upgrade Plan Reminders](#server-upgrade-plan-reminders)
4. [Server Technical Concerns](#server-technical-concerns)
5. [Important Server Reminders](#important-server-reminders)
6. [Call Closure](#call-closure)

---

## Existing Server Environment

### Q: What version is the Server being upgraded FROM?
- **Options**: 9.0.19, 9.0.20, 9.0.21, 9.0.22 (fix pack only)
- **Rule**: AMIGO only covers upgrades between supported versions.
- **TSA Rec**: If unsupported version, work with customer accordingly.

### Q: What fix pack is the Server being upgraded FROM?
- **Rule**: Recommend installing latest fix pack of existing Server.
- **TSA Rec**: Advise customer to upgrade to the latest fix pack available.

### Q: What Database Server is connected to the existing Server?
- **Options**: PostgreSQL, Oracle, MSSQL
- **Rule**: Record version number. PostgreSQL must be v11+ for 9.0.22.

### Q: What Operating System is the existing Server running on?
- **Options**: RHEL, SUSE, Windows, AIX, Oracle Linux, CentOS, Amazon Linux
- **Rule**: Record version.
- **AIX Warning**: End of support planned for end of 2026.
  - URL: https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9021/Technical-Bulletins/Announcements/Deprecation-and-End-of-Support/Control-M-EM-and-Control-M-Server-on-AIX-End-of-Support-Planned-for-the-End-of-2026/
  - For AIX 7.2: https://documents.bmc.com/supportu/documents/61/48/526148/526148.pdf

---

## Upgrading Server Environment

### Q: What version is the Server being upgraded TO?
- **Recommend**: 9.0.22.000 (latest)
- **Conditional (Windows + 9.0.21)**: Review KA 000402260 for CTM-7300 (ess_key.txt not created).

### Q: What fix pack is the Server being upgraded TO?
- **Recommend**: Latest available fix pack.

### Q: Are you aware of the latest Server patch available?
- **Current**: 9.0.22.025
- **URL**: https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/Control-M-Server-PACTV-9-0-22-025/
- **Patches index**: https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/

### Q: Has the machine been verified to meet minimum requirements?
- **Action**: Run check_req script. Review PAC tool.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_full_installation.htm
- **Conditional**: For SUSE 12 — review if CTM-3454 is resolved.

### Q: What is the estimated daily jobs in Server Active Environment (AJF)?
- **Action**: Review installation guide for minimum hardware requirements.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_full_installation_system_requirements.htm
- **Conditional**: If medium/large environment, provide PSR document from KA 000308729.

### Q: Is the EM the same or higher version than the upgrading Server?
- **Rule**: If EM version is lower, Server will run in Compatibility Mode with new features disabled.
- **TSA Rec**: Explain that new features available only after disabling compatibility mode.

### Q: Are there Control Modules for the Server's local agent that need installing?
- **CRITICAL**: Control Modules are NOT part of the in-place upgrade.
- **Action**: Open a case for Control-M/Agent migration (copy accounts to new agent).
- **TSA Rec**: Explain that CMs are not upgraded during in-place upgrade. Advise new case.

### Q: Is there at least 12 GB of disk space available?
- **Requirement**: 12 GB free disk space for in-place upgrade.

### Q: Run ctmsetown -action list — any NOTIMPL entries?
- **CRITICAL**: If NOTIMPL entries exist, must resolve before upgrade.
- **KA**: 000354649
- **Example output**: `&ctmagent@FIELD  &bh3jbolpv05@FIELD  &P@FIELD  &NOTIMPL@LINE`

---

## Server Upgrade Plan Reminders

### Q: Are you upgrading the Control-M/Agent concurrently?
- **Rule**: Upgrade the Server FIRST, then agents.

### Q: No further changes to job definitions/calendars/services/workload policy?
- **Rule**: Implement a cutoff time for changes before upgrade.

---

## Server Technical Concerns

### Q: PostgreSQL is NOT upgraded during in-place Server upgrade
- **CRITICAL**: PostgreSQL must be on version 11+ for 9.0.22.
- **Action**: Recommend PostgreSQL upgrade after Server upgrade.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#UpgradingthePostgreSQLDatabaseServer

### Q: Is the Server installed on NFS or VXFS file system?
- **Rule**: Control-M Modules NOT supported on NFS/VXFS for local agent.
- **TSA Rec**: Remind customer to open new case for Control Module questions.

### Q: Will there be any changes to the Server hostname?
- **Action**: Update "Authorized Server Host" in Agent config.
- **KA**: 000308365
- **TSA Rec**: Remind customer to answer "Y" to add new Server as authorized server on agents.

### Q: Is there a change or rename of the Data Center Name?
- **Action**: Review Upgrade Guide for renaming procedure.
- **TSA Rec**: Explain the procedure if there is a change.

### Q: Do you have sufficient free disk space?
- **Requirement**: Additional 10 GB available.

### Q: Are Agents only connected to one active Server at a time?
- **Rule**: Agent connected to two Servers simultaneously is NOT supported.

### Q: Is Server exe/script directory in system PATH?
- **Rule**: Must be in PATH. Server admin must be able to run SQL to access DB.
- **KA**: 000358019

### Q: Are you using ctmldnrs.dat file?
- **Rule**: On upgrade to 9.0.21.100+, ctmldnrs.dat files move to `<Server_home>/data`.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Utilities/ctmldnrs.htm

### Q: Are you running timezone jobs with CTM_GD_FORWARD changed?
- **CRITICAL**: From 9.0.21, forward ordering cannot be disabled when Folder Timezone is specified.
- **KA**: 000267902
- **Action**: If GD_FORWARD=N on earlier version, remove timezone selection from job definition.
- **TSA Rec**: GD_FORWARD is deprecated in 9.0.21. Advise customer accordingly.

### Q: Are EM and Server using different user accounts on UNIX/Linux?
- **Conditional**: If EM and Server on same UNIX/Linux host (not one-installation):
  - **KA**: 000374213 (CTM-5074 — Kafka/zookeeper ports must be different)

### Q: Are Agents connecting to Server on RHEL 8.5+ in SSL mode?
- **Conditional**: If YES, review KA 000419757 before upgrading to 9.0.21+.

---

## Important Server Reminders

### More than one Server on same box?
- **KA**: 000406529 (CTM-7845 — new day does not order jobs with multiple servers)

### PostgreSQL 11.5 → 15.3 upgrade
- **Rule**: PostgreSQL 11.5 may not be supported on 9.22.100.
- **Action**: Upgrade to 15.3 soon after Server upgrade.

### HA configuration?
- **KA**: 000386814 (recommended upgrade steps for HA)
- **TSA Rec**: Discuss upgrade steps for Server Secondary installation.

---

## Call Closure

- Open a NEW Severity 1 ticket if facing issues during **production** environment upgrade.
- Open a High or Medium severity ticket for **non-production** issues.
- **CRITICAL**: DO NOT RAISE THE AMIGO CASE TO SEVERITY 1.
- **TSA Rec**: Remind customer to open a NEW SEV1 case if problem occurs during upgrade.
