# BMC Documentation URL Reference

## Important: BMC Documentation Access Patterns

BMC maintains two documentation portals with different access requirements:

### 1. Product Documentation (Requires BMC Support Central Login)
- **Base URL**: `https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/`
- **Access**: Requires BMC Support Central authentication
- **Note**: Links will show 404 or 403 if user is not logged into Support Central
- **Tip**: Users should log into https://www.bmc.com/support first, then click doc links

### 2. Public Documentation Portal (No Login Required)
- **Base URL**: `https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/`
- **Content**: Release notes, patches, technical bulletins, compatibility info
- **Access**: Publicly accessible

### 3. Knowledge Articles (Requires BMC Support Central Login)
- **Base URL**: `https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=`
- **Access**: Requires BMC Support Central authentication

---

## Verified Working URLs (Public — No Login)

| Purpose | URL |
|---------|-----|
| Control-M Documentation Hub | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/workloadautomation/ |
| 9.0.22 Patches Index | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/ |
| EM Patch 9.0.22.026 | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/Control-M-EM-PANFT-9-0-22-026/ |
| Server Patch 9.0.22.025 | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Patches/Control-M-Server-PACTV-9-0-22-025/ |
| 9.0.22 Compatibility | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9022/Control-M-9-0-22-Release-Notes/Control-M-Compatibility/ |
| AIX End of Support | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/Announcements/Deprecation-and-End-of-Support/Control-M-EM-and-Control-M-Server-on-AIX-End-of-Support-Planned-for-the-End-of-2026/ |
| Java 11 End of Support | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9021/Technical-Bulletins/Announcements/Deprecation-and-End-of-Support/Java-11-LTS-on-Control-M-EM-Control-M-Server-Control-M-Agent-Control-M-Plug-ins-and-Control-M-Automation-API-End-of-Support/ |
| ctmldnrs Utility Update | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9021/Technical-Bulletins/Announcements/ctmldnrs-Utility-Update/ |
| PostgreSQL DB Upgrade Bulletin | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/Announcements/BMC-PostgreSQL-Database-Server-Upgrade/ |
| PAC Compatibility Tool | https://docs.bmc.com/xwiki/bin/view/Standalone/BMC-Product-Compatibility/compatibility/ |
| AMIGO Program Overview | https://www.bmc.com/support/resources/amigo_program_overview.html |
| 9.0.21 Patches Index | https://docs.bmc.com/xwiki/bin/view/Control-M-Orchestration/Control-M/ctm9021/Patches/ |

## Authenticated URLs (Require Support Central Login)

These URLs work but require the user to be logged into BMC Support Central first.
When presenting these links, always include the note: "Requires BMC Support Central login"

| Purpose | URL |
|---------|-----|
| 9.0.22 Doc Home | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/home.htm |
| Control-M Upgrade | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_upgrade.htm |
| EM Installation | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_Enterprise_Manager_installation.htm |
| Server Installation | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_Server_Installation.htm |
| Full Installation System Requirements | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_full_installation_system_requirements.htm |
| Full Installation | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_full_installation.htm |
| Java Installation | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Java_Installation.htm |
| Pre-Installation UNIX | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_pre-installation_procedures_on_UNIX.htm |
| Firewall Configuration | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Firewall.htm |
| High Availability | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/High_availability_installation.htm |
| EM Utilities | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/EM_Utils.htm |
| Server Utilities | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Server_Utils.htm |
| ctmsetown Utility | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Utilities/ctmsetown.htm |
| ctmldnrs Utility | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Utilities/ctmldnrs.htm |
| Configuring EM System Params | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Configuring_Control-M_EM_System_Parameters.htm |
| Server-Agent Communication | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Control-M_Server-Agent_Communication.htm |
| Installation Guide | https://documents.bmc.com/supportu/9.0.22/en-US/Documentation/Introduction_to_Control-M_Installation.htm |

## Broken/Moved URLs — DO NOT USE

| Broken URL | Notes |
|-----------|-------|
| Control-M_Server_Upgrade.htm | Returns 404. Server upgrade procedures are WITHIN Control-M_upgrade.htm |
| Control-M_EM_Upgrade.htm | May return 404. EM upgrade procedures are WITHIN Control-M_upgrade.htm |

## Guidance for the Skill

When generating links in the upgrade plan:
1. **Always prefer public docs.bmc.com/xwiki URLs** when they cover the topic (patches, release notes, bulletins, compatibility)
2. **For product documentation** (upgrade guides, utilities, installation), use the documents.bmc.com URLs but ALWAYS add the note: "📋 Log into BMC Support Central first: https://www.bmc.com/support"
3. **For Knowledge Articles**, use the selfservice.bmc.com URL and note login is required
4. **Never link to Control-M_Server_Upgrade.htm or Control-M_EM_Upgrade.htm** — these are subpages within Control-M_upgrade.htm. Link to the main upgrade page instead.
