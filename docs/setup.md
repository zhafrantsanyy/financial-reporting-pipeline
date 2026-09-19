# Setup

This export is sanitized: credential IDs, spreadsheet IDs and the Telegram chat ID
are placeholders. Import it, then wire it to your own accounts.

---

## Requirements

- n8n (self-hosted or cloud) with the LangChain nodes available
- An Accurate Online account with API access (OAuth2 client)
- A Google account with the source spreadsheets
- A Telegram bot token
- An OpenAI API key

---

## 1. Import

n8n → **Workflows** → **Import from File** →
`workflow/daily-financial-report.workflow.json`.

Node IDs and webhook IDs were stripped from the export; n8n regenerates them on
import. Every node arrives with its credential slot empty.

---

## 2. Create credentials

| Credential type | Placeholder ID in the export | Used by |
| --- | --- | --- |
| OAuth2 API (generic) | `ACCURATE_OAUTH2_CREDENTIAL_ID` | 6 Accurate HTTP nodes |
| Telegram API | `TELEGRAM_CREDENTIAL_ID` | Telegram trigger + 6 send nodes |
| Google Sheets OAuth2 | `GOOGLE_SHEETS_CREDENTIAL_ID` | 4 Sheets nodes |
| OpenAI API | `OPENAI_CREDENTIAL_ID` | `OpenAI Chat Model` |

### Accurate Online OAuth2

Accurate uses a two-stage flow:

1. OAuth2 with your Client ID / Secret gives an **access token**.
2. `GET https://account.accurate.id/api/open-db.do` with that token opens a session
   and returns the tenant **host** and **session ID**.
3. Every tenant call then goes to `{host}/accurate/api/<endpoint>/list.do` with the
   `X-Session-ID` header.

The workflow performs steps 2–3 itself; the credential only needs to cover step 1.
Scopes must include item, sales invoice and GL account read access.

---

## 3. Replace the placeholders

| Placeholder | Where | Replace with |
| --- | --- | --- |
| `SPREADSHEET_ID_PERIOD_1` | `Sheet VS Juli`, `Meta ads Juli` | Your first spreadsheet ID |
| `SPREADSHEET_ID_PERIOD_2` | `Sheet VS Sept`, `Sheet Meta ads Sept1` | Your second spreadsheet ID |
| `YOUR_TELEGRAM_CHAT_ID` | `Tentukan Mode` (`CHAT_DEFAULT`), `Baca Perintah` (`CHAT_DIIZINKAN`) | The chat or group the scheduled reports go to |

To find a chat ID, message [@get_id_bot](https://t.me/get_id_bot). Write it as a
**quoted string of digits** — the Code node does not evaluate n8n expressions inside
strings, so an expression there silently becomes a literal.

### Sheet structure

The parsers expect the client's sheet conventions:

- **`VS` sheet** — period blocks laid out side by side, each headed
  `DATA PENJUALAN <MONTH> <YEAR>`, with seven metric columns after each header.
- **`META ADS` sheet** — one row per campaign per day, campaign names shaped
  `<Line> | <Date> | <Objective>`, with a mid-sheet schema change signalled by a
  repeated header row.

Different conventions mean rewriting `Normalisasi Sales` / `Normalisasi Ads`; the
rest of the pipeline is agnostic.

### Chart of accounts

`Hitung Laba Rugi & Neraca` maps specific Accurate account numbers to P&L and
balance-sheet lines. Your numbering will differ — edit the mapping objects near the
top of that node. Accounts with balances that are not in the mapping are not lost:
they surface in `diagnostikNeraca.akunTidakDikenal` so you can place them.

---

## 4. Activate

**Activate the workflow before trusting the finance numbers.**
`$getWorkflowStaticData` — which holds the daily balance snapshots the
month-to-date deltas are derived from — only persists on production executions.
Manual test runs read it but never write it, so a workflow that is only ever tested
manually will show an empty baseline forever.

---

## 5. Access control

`Baca Perintah` ships with `BATASI_KE_DAFTAR_IZIN = false`, meaning **anyone** who
finds the bot on Telegram can pull the P&L, balance sheet, cash position and
inventory value, and can trigger billable executions repeatedly.

For any real deployment, set it to `true` and put your chat IDs in
`CHAT_DIIZINKAN` as exact digit strings — the comparison is strict.

---

## 6. Adding a new month

No code change needed:

1. Add a Google Sheets node for the new sheet.
2. Connect it to `Gabung Sheet VS` or `Gabung Sheet Ads`.
3. Increase that merge node's input count.

`Normalisasi Sales` groups rows by source sheet and picks the current month from
today's date, so it adapts on its own.

---

## Working with the extracted source

`src/code-nodes/*.js` and `src/prompts/*.md` are extracted **from** the workflow
JSON for review and diffing. The JSON is the source of truth — editing the extracted
files does not change the workflow. To regenerate them after an export:

```bash
python3 - <<'PY'
import json, re, pathlib
wf = json.load(open("workflow/daily-financial-report.workflow.json"))
slug = lambda s: re.sub(r'-+$', '', re.sub(r'^-', '', re.sub(r'[^a-z0-9]+', '-', s.lower())))
for n in wf["nodes"]:
    p = n.get("parameters", {})
    if "jsCode" in p:
        pathlib.Path(f"src/code-nodes/{slug(n['name'])}.js").write_text(p["jsCode"].rstrip() + "\n")
PY
```
