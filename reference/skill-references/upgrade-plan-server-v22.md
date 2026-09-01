# Control-M/Server 9.0.22 — Upgrade Plan Template

Use this template to generate the upgrade plan section of the interactive checklist.
Select the appropriate topology section based on the customer's environment.

---

## Pre-Upgrade Phase

### Review & Preparation
- [ ] Review Upgrade Requirements and Considerations
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm
  - Review Upgrade Scenarios
- [ ] Verify Server System Requirements
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_full_installation_system_requirements.htm
- [ ] Ensure machine meets System, OS, and Database requirements
- [ ] Install latest fix pack on existing Server
- [ ] Run ctmsetown -action list and check for NOTIMPL entries
  - If found: KA 000354649
- [ ] Run is_upgrade_ready script
- [ ] Verify Upgrade Readiness

### Finalize Upgrade Details
- [ ] Select cutover date: ___________
- [ ] Determine outage window: ___________
- [ ] Create back-out / fallback plan
- [ ] Open AMIGO Review case at least 2 weeks before cutover date

### Actions Prior to Upgrade
- [ ] Perform backups of existing Server environment
- [ ] Copy new Server installation binary to existing environment
- [ ] Validate at least 10 GB free disk space
- [ ] Implement cutoff time for job definition / calendar / service / workload policy changes
- [ ] Ensure no further changes until in-place upgrade is complete

---

## Upgrade Phase

### Pre-Installation Procedures
- [ ] Set Java Environment Variable
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Java_Installation.htm
  - KA 000401084 for supported Java versions
- [ ] Change JRE Package (if applicable)
- [ ] Set BMC_INST_CTM_APIGTW_PORT environment variable to 8393

---

## Topology-Specific Upgrade Steps

Select ONE of the following based on customer's topology:

### Option A: Standalone Server
1. Upgrade Control-M/Server
   - Upgrade dedicated Server PostgreSQL Database Server to 11.5 (if applicable)
2. Verify Server is running

### Option B: Server with High Availability (Primary → Secondary)
1. Stop Server Configuration Agent on Secondary node
2. Upgrade Primary Server
   - Upgrade dedicated Server PostgreSQL to 11.5 (if applicable)
3. Upgrade Secondary Server
   - Re-do full replication from Primary if PostgreSQL was upgraded on Primary
4. Verify Server is running on Primary node
5. Start Server Configuration Agent on Secondary node
6. Verify Server HA is connected

### Upgrade Procedures (all topologies)
- For UNIX: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm
- For Windows: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm

### PostgreSQL Database Upgrade
- [ ] Upgrade PostgreSQL Database Server
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm#UpgradingthePostgreSQLDatabaseServer
- [ ] For external Oracle or MSSQL:
  - URL: https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm

### Agent Upgrades (after Server)
- [ ] Upgrade Control-M/Agent(s) as necessary
  - For UNIX: Upgrading Control-M/Agent on UNIX
  - For Windows: Upgrading Control-M/Agent on Windows
- [ ] Upgrade Server FIRST, then Agents

---

## Post-Upgrade Verification

- [ ] Verify jobs are running
- [ ] Check Control-M/Agent status — all agents connected to Server
- [ ] Check EM Gateway status
- [ ] Check Agents appear in Control-M Configuration Manager
- [ ] If hostname changed: verify agents have new authorized server
  - KA 000308365

---

## Post-Upgrade Tasks

- [ ] Backup the new Server environment
- [ ] Mark upgrade complete
- [ ] Upgrade PostgreSQL 11.5 → 15.3 (if using BMC-supplied PostgreSQL)
- [ ] Review post-upgrade considerations: KA 000415171
- [ ] If multiple servers on same box: review KA 000406529
