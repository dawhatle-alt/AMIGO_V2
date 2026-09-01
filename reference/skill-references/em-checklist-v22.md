# AMIGO EM Checklist V22 — Full Reference

This file contains every question from the AMIGO Starter Checklist for Control-M/Enterprise Manager
9.0.22, organized by section. Each item includes the question, recommended action, conditional logic,
and TSA discussion recommendations.

## Table of Contents
1. [Existing EM Environment](#existing-em-environment)
2. [Upgrading EM Environment](#upgrading-em-environment)
3. [EM Technical Concerns](#em-technical-concerns)
4. [EM Add-on Components](#em-add-on-components)
5. [Important EM Reminders](#important-em-reminders)
6. [Call Closure](#call-closure)

---

## Existing EM Environment

### Q: What version is the EM being upgraded FROM?
- **Options**: 9.0.19, 9.0.20, 9.0.21, 9.0.22 (fix pack only)
- **Rule**: AMIGO only covers upgrades between supported versions. If unsupported version, work with customer accordingly.
- **TSA Rec**: If unsupported version is selected, advise customer to contact BMC Account Manager.

### Q: What fix pack is the EM being upgraded FROM?
- **Rule**: Recommend installing latest fix pack of existing EM before upgrading.
- **TSA Rec**: Advise customer to upgrade to the latest fix pack available.

### Q: What Database Server is connected to the existing EM?
- **Options**: PostgreSQL, Oracle, MSSQL
- **Rule**: Record version number. This determines PostgreSQL upgrade path later.

### Q: What Operating System is the existing EM running on?
- **Options**: RHEL, SUSE, Windows, AIX, Oracle Linux, CentOS, Amazon Linux
- **Rule**: Record version. Check compatibility with target version via PAC tool.
- **URL**: https://docs.bmc.com/xwiki/bin/view/Standalone/BMC-Product-Compatibility/compatibility/

---

## Upgrading EM Environment

### Q: What version is the EM being upgraded TO?
- **Recommend**: 9.0.22.000 (latest)
- **Rule**: AMIGO only covers upgrades between supported versions.
- **Version Gate**: EM must be at least 9.0.19 to upgrade directly to 9.0.22.

### Q: What fix pack is the EM being upgraded TO?
- **Recommend**: Latest available fix pack.

### Q: Are you aware of the latest EM patch available?
- **Current**: 9.0.22.026
- **URL**: https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/Control-M-EM-PANFT-9-0-22-026/
- **TSA Rec**: Recommend installing latest patch.
- **Patches index**: https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/

### Q: Have you verified the EM client requirements?
- **Requirements**:
  - Google Chrome v78+ or Microsoft Edge v80+
  - Microsoft .NET Framework 4.7.2
  - Java 1.8 (64-bit) or higher
- **KA**: 000401084 (supported Java version and vendor)

### Q: Will the EM clients be upgraded as well?
- **Rule**: EM Server runs in Compatibility Mode until all EM Clients are upgraded.
- **TSA Rec**: Discuss Compatibility Mode implications with customer.

### Q: Has the machine been verified to meet minimum requirements?
- **Action**: Run check_req script to check OS and kernel requirements.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Introduction_to_Control-M_Installation.htm
- **Conditional**: For SUSE 12 — review if CTM-3454 is resolved.
- **TSA Rec**: It is customer responsibility to ensure machine meets minimum requirements.

### Q: Do you plan to implement LDAP, IdP, or SSL?
- **Rule**: All configuration should be implemented AFTER upgrade completion.
- **Exception**: No need to disable existing LDAP/IdP/SSL before upgrade unless stated in upgrade doc.
- **TSA Rec**: Advise customer to open new case AFTER AMIGO Review completion if needed.

### Q: What is the estimated total daily jobs in EM Active Environment?
- **Rule**: Review installation guide for minimum sizing.
- **Conditional**: If medium to large environment, provide PSR document.
- **KA**: 000308729 (PSR sizing document)

---

## EM Technical Concerns

### Q: Are you upgrading EM to same or different machine?
- **Rule**: Migration to different machine is NOT covered under AMIGO.
- **Action**: Open a regular case to discuss migration.
- **TSA Rec**: Advise customer to open regular case for machine migration.

### Q: Do you have sufficient free disk space?
- **Requirement**: Additional 12 GB of disk space available.
- **URL**: Control-M Full Installation System Requirements.

### Q: Do you have the latest fix pack installed on existing EM?
- **Rule**: Recommend installing latest fix pack before upgrading.
- **TSA Rec**: Advise on latest fix pack or patches available for existing version.

### Q: Are you upgrading Control-M for z/OS?
- **Rule**: Open SEPARATE AMIGO case with Mainframe support team.
- **KA**: 000318316 (INCONTROL for z/OS AMIGO Program)
- **TSA Rec**: Provide KA and remind customer to open AMIGO case with mainframe team.

### Q: Are there additional EM Add-on components?
- **Conditional**: Ask about each component only if customer has it.

### Q: PostgreSQL database server — is it upgraded during in-place upgrade?
- **CRITICAL**: PostgreSQL is NOT upgraded during in-place EM upgrade.
- **Action**: Recommend PostgreSQL upgrade after EM upgrade.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm

### Q: Can all EM components be stopped/started successfully?
- **Action**: Validate EM Web Server starts correctly.
- **KA**: 000286154 (verify web server startup)

---

## EM Add-on Components

Ask about each only if customer indicates they have them:

| Component                        | KA / Notes                                           |
|----------------------------------|------------------------------------------------------|
| Batch Impact Manager             | Review for known issues                              |
| Forecast                         | Review for known issues                              |
| Workflow Insights                | KA 000425199 — FAQ for Workflow Insights              |
| Workload Archiving Server        | KA 000208315 — FAQ for Workload Archiving             |
| Automation API (AAPI)            | If upgrading AAPI, CTM CLI must be updated too        |
| Self Service                     | Review for known issues                              |
| Workload Change Manager          | Review for known issues                              |
| Application Integrator           | Review for known issues                              |
| Managed File Transfer            | Review for known issues                              |

---

## Important EM Reminders

### Compatibility Mode cannot be re-enabled once turned off
- **CRITICAL WARNING**: This is irreversible.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#CompatibilityMode

### EM must be at least 9.0.19 for direct upgrade to 9.0.22
- **Version Gate**: If below 9.0.19, customer needs intermediate upgrade steps.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm

### Automation API jobs on Control-M/Agent
- **AAPI CLI no longer supported on**: Amazon Linux 2, SUSE 12, RHEL 7, Oracle Linux 7, CentOS 7
- **KA**: 000419428
- **Action**: Migrate AAPI jobs to agents running OSes that support Node.js v18+.

### HA or Distributed configuration?
- **KA**: 000386814 (recommended upgrade steps for HA)
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/High_availability_installation.htm
- **TSA Rec**: Discuss upgrade steps for HA Secondary and Distributed EM.

### PostgreSQL 11.5 → 15.3 upgrade
- **Rule**: PostgreSQL 11.5 may not be supported on 9.22.100.
- **Action**: Upgrade PostgreSQL 11.5 to 15.3 soon after EM upgrade.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#UpgradingthePostgreSQLDatabaseServer

### EM and Server on different Windows drives
- **KA**: 000404872 (CTM-7632 — microservices may not function correctly)

### Assign all user authorizations to roles after upgrading to 9.0.22
- **Rule**: Authorizations are assigned to roles only; user access set when user is associated to a role.
- **URL**: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#UpgradeRequirementsandConsiderations

---

## Call Closure

- Open a new case if technical help needed after AMIGO call.
- **CRITICAL**: DO NOT RAISE THE AMIGO CASE TO SEVERITY 1.
- **TSA Rec**: Remind customer to open a new issue if technical assistance is required.
