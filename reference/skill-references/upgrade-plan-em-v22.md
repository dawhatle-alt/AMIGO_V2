# Control-M/Enterprise Manager 9.0.22 — Upgrade Plan Template

Use this template to generate the upgrade plan section of the interactive checklist.
Select the appropriate topology section based on the customer's environment.

---

## Pre-Upgrade Phase

### Review & Preparation
- [ ] Review Upgrade Requirements and Considerations
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm
  - Review Upgrade Scenarios
  - Review Compatibility Mode
- [ ] Verify EM System Requirements
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_Enterprise_Manager_installation.htm#ControlMEMSystemRequirements
- [ ] Ensure machine meets System, OS, and Database requirements
- [ ] Install latest fix pack on existing EM (if applicable)
- [ ] Run ctmsetown -action list and check for NOTIMPL entries
  - If found: KA 000354649
- [ ] Run is_upgrade_ready script (available on DROST.9.0.22.000 install file)

### Finalize Upgrade Details
- [ ] Select cutover date: ___________
- [ ] Determine outage window: ___________
- [ ] For Distributed EM: all EM Servers must be upgraded in same outage window
- [ ] Create back-out / fallback plan
- [ ] Open AMIGO Review case at least 2 weeks before cutover date

### Actions Prior to Upgrade
- [ ] Perform backups of existing EM environment
- [ ] Copy new EM installation binary to existing EM environment
- [ ] Validate at least 10 GB free disk space on EM machine

---

## Upgrade Phase

### Pre-Installation Procedures
- [ ] Set Java Environment Variable
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Java_Installation.htm
  - KA 000401084 for supported Java versions
- [ ] Change JRE Package (if applicable)

### Verify Before Starting
- [ ] Verify all scheduling tables in sync between EM and Server

---

## Topology-Specific Upgrade Steps

Select ONE of the following based on customer's topology:

### Option A: Standalone EM
1. Upgrade Control-M/Enterprise Manager
   - Upgrade dedicated EM PostgreSQL Database Server to 11.5 (if applicable)
2. Verify EM is running

### Option B: EM with High Availability (Primary → Secondary)
1. Stop EM Configuration Agent on Secondary node
2. Upgrade Primary EM
3. Upgrade Secondary EM
4. Verify EM is running on Primary node
5. Start EM Configuration Agent on Secondary node
6. Verify EM HA is connected

### Option C: EM with Distributed (Primary → Distributed)
*Note: If Workload Archiving is installed on Distributed node, it upgrades automatically*
1. Stop EM on Distributed node
2. Verify all EM processes are down on Distributed node
3. Upgrade Primary EM
   - Upgrade dedicated EM PostgreSQL to 11.5 (if applicable)
4. Upgrade Distributed EM
   - Upgrade dedicated EM PostgreSQL to 11.5 (if applicable)
5. Verify EM is running on Primary node
6. Start EM on Distributed node
7. Verify Distributed EM is running and connected to Primary EM

### Option D: EM with Distributed + High Availability (Primary → Distributed → Secondary)
1. Stop EM on Distributed node
2. Verify all EM processes are down on Distributed node
3. Stop EM Configuration Agent on Secondary node
4. Upgrade Primary EM
5. Upgrade Distributed EM
6. Upgrade Secondary EM
7. Verify EM is running on Primary node
8. Start EM on Distributed node
9. Verify Distributed EM is running and connected to Primary EM
10. Start EM Configuration Agent on Secondary node
11. Verify EM HA is connected

### Upgrade Procedures (all topologies)
- For UNIX: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm
- For Windows: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm

### PostgreSQL Database Upgrade
- [ ] Upgrade PostgreSQL Database Server
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#UpgradingthePostgreSQLDatabaseServer
- [ ] For external Oracle or MSSQL:
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm

### Post-Upgrade Configuration
- [ ] Launch CCM and verify all EM components have correct hostname, ports, definitions
- [ ] Upgrade EM Client
  - From Full Installation Package
  - From Client Installation Package
  - From Control-M Welcome Page

---

## Post-Upgrade Verification

- [ ] Verify all EM Components and Gateways are running
- [ ] Start EM GUI Client — verify jobs in Planning and Monitoring domains
- [ ] Order new test table/jobs
- [ ] View job definitions in EM GUI Client
- [ ] Verify different viewpoints
- [ ] Verify all resources refreshed and new ones can be added/deleted
- [ ] Access sysout and log files for a job
- [ ] Perform normal AJF actions: hold, update, free, etc.
- [ ] Verify security: view or add a user
- [ ] Assign all user authorizations to roles (new in 9.0.22)

---

## Post-Upgrade Tasks

- [ ] Backup the new EM environment
- [ ] Mark upgrade complete
- [ ] Disable Compatibility Mode when ALL EM Clients upgraded
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm
  - **WARNING**: Compatibility Mode cannot be re-enabled once turned off
- [ ] Upgrade PostgreSQL 11.5 → 15.3 (if using BMC-supplied PostgreSQL)
- [ ] Review post-upgrade considerations: KA 000415171
