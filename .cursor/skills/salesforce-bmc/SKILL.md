---
name: salesforce-bmc
description: Query BMC Salesforce Knowledge Articles (Knowledge__kav) and Cases via the salesforce-bmc MCP run_soql_query tool. Use when the user asks about KAs, knowledge articles, Support Central articles, Salesforce cases, SOQL, or Control-M product knowledge without providing a full query string.
---

# BMC Salesforce Query (Cursor)

Query the BMC Salesforce org through the **salesforce-bmc** MCP server. Prefer the MCP `run_soql_query` tool over shell `sf data query`.

This skill is for **Cursor developer queries**. It does not change the AMIGO in-app Upgrade Advisor (`/api/chat`).

## Setup (local machine)

Auth is the Salesforce CLI session for alias `bmc` — not `.env.local` secrets.

```bash
sf org display --target-org bmc
sf data query --target-org bmc --query "SELECT Id FROM Knowledge__kav WHERE PublishStatus = 'Online' LIMIT 1"
```

If auth fails, tell the user to run `sf org login --alias bmc` (or `sf org login web --alias bmc`) and retry.

Enable the MCP server in Cursor Settings → MCP. Config lives in [`.cursor/mcp.json`](../../mcp.json) (`--orgs bmc`, data toolset, `run_soql_query` only).

## Which object

| Intent | Object | Notes |
|--------|--------|-------|
| Knowledge Articles | `Knowledge__kav` | SOQL **requires** `PublishStatus` or `Id` in the WHERE clause |
| Support Cases | `Case` | Standard Case object; BMC custom fields use `__c` |

Object field references:

- [Knowledge__kav](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_knowledge__kav.htm)
- [Case](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_case.htm)

## Knowledge articles

Always include unless the user overrides:

```sql
PublishStatus = 'Online'
AND sc_Service_Product_Family__c = 'CONTROL-M'
```

Typical SELECT fields: `Id`, `ArticleNumber`, `Title`, `Summary`, `LastPublishedDate`, `FirstPublishedDate`, `UrlName`, `KnowledgeArticleId`, `Language`.

- **KA number:** user says `KA 000354649` → `ArticleNumber = '000354649'` (9-digit string, keep leading zeros).
- **Title search:** `Title LIKE '%keyword%'`. SOQL has no `ILIKE`.
- **Language:** include `Language = 'en_US'` when the query errors asking for language, or when the user wants a specific locale.

Support Central URL when you have the Salesforce record `Id` (the `sfdcid`):

`https://selfservice.bmc.com/casemgmt/sc_KnowledgeArticle?sfdcid=<Id>`

When the work is about AMIGO citations, cross-check [`lib/agent/kaTable.ts`](../../../lib/agent/kaTable.ts) for known KA numbers and URLs. Never invent KA numbers or `sfdcid` values.

## Cases

Typical SELECT fields: `Id`, `CaseNumber`, `Subject`, `Status`, `Priority`, `Origin`, `Type`, `CreatedDate`, `ClosedDate`, `IsClosed`, `AccountId`.

- Open cases: `IsClosed = false` (or `Status != 'Closed'` if the user names a specific status).
- Keyword search: `Subject LIKE '%Control-M%'` (and/or `Description LIKE` only when needed — Description is a long textarea).
- BMC custom `__c` fields: if unknown, query only standard fields first. If the query fails with an invalid-field error, drop that field and retry. Do not invent custom field API names.

## Agent rules

1. Call MCP `run_soql_query` (username/alias `bmc`). Do not shell out to `sf` unless MCP is unavailable.
2. Always include `LIMIT` (default **10**, max **50** unless the user asks for more).
3. Date-sorted lists: `ORDER BY LastPublishedDate DESC` (KAs) or `ORDER BY CreatedDate DESC` (Cases).
4. Show the SOQL you ran, then a compact table (ArticleNumber/CaseNumber, Title/Subject, dates).
5. Cite only rows returned by the query.
6. Read-only: never create, update, or delete Salesforce records.
7. On auth errors: ask the user to re-run `sf org login --alias bmc`.

## Natural language → SOQL

**KAs about New Day**

```sql
SELECT ArticleNumber, Title, LastPublishedDate
FROM Knowledge__kav
WHERE PublishStatus = 'Online'
  AND sc_Service_Product_Family__c = 'CONTROL-M'
  AND Title LIKE '%New Day%'
ORDER BY LastPublishedDate DESC
LIMIT 10
```

**Details for KA 000354649**

```sql
SELECT ArticleNumber, Title, Summary, LastPublishedDate, UrlName, Id
FROM Knowledge__kav
WHERE PublishStatus = 'Online'
  AND ArticleNumber = '000354649'
LIMIT 1
```

**Recent open Control-M cases**

```sql
SELECT CaseNumber, Subject, Status, CreatedDate
FROM Case
WHERE IsClosed = false
  AND Subject LIKE '%Control-M%'
ORDER BY CreatedDate DESC
LIMIT 10
```

**Cases about SSL** (ambiguous — default to recent Cases, mention the SOQL)

```sql
SELECT CaseNumber, Subject, Status, Priority, CreatedDate
FROM Case
WHERE Subject LIKE '%SSL%'
ORDER BY CreatedDate DESC
LIMIT 10
```
