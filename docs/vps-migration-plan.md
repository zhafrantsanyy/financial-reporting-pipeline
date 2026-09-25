# Plan: running the pipeline on a VPS with Hermes Agent instead of n8n

Status: **plan only, nothing implemented yet.**

Goal: the same three products (daily sales report, weekly financial pack,
`/aiconsult` consultant) delivered to the same Telegram chat, with n8n switched
off. The VPS already runs [Hermes Agent](https://github.com/NousResearch/hermes-agent)
(Nous Research), so Hermes takes over everything n8n did **around** the logic, and
we only build the part Hermes cannot do: pulling Accurate and Sheets data and
computing the numbers.

---

## 1. The split: what Hermes does, what we build

| Job | Today in n8n | On the VPS |
| --- | --- | --- |
| Telegram bot (inbound commands, replies, allow list) | Telegram Trigger, `Baca Perintah`, `Rute Perintah`, 7 send nodes | **Hermes gateway** (`TELEGRAM_ALLOWED_USERS` replaces `CHAT_DIIZINKAN`) |
| Schedules 07:00 daily and Sunday 10:00 | 2 Schedule Triggers | **Hermes cron** with `timezone: "Asia/Jakarta"` |
| Sending HTML dashboards as files | Convert to File + sendDocument | **`MEDIA:/path/file.html`** in the delivered text, or `hermes send` |
| LLM (finance narrative, consultant) | OpenAI node, `gpt-5-mini`, 2 LangChain agents | **Hermes agent** with whatever model Hermes is configured for, prompts become **skills** |
| Conversation memory for follow-ups | Window Buffer Memory, `lanjutan` mode | **Hermes sessions** (native, the `lanjutan` path disappears) |
| "Working on it" acknowledgement | `Konfirmasi Terima` | Output of the `/sales` and `/finance` quick commands |
| Accurate OAuth2, session, pagination, retry | 6 HTTP nodes | **We build**: `qudamah-report` CLI |
| Google Sheets reads | 4 Sheets nodes + 2 merges | **We build**: `qudamah-report` CLI |
| Metrics, P&L, balance sheet, dashboards, message chunking | 15 Code nodes | **We build**: ported almost unchanged into the CLI |
| Balance snapshots (`$getWorkflowStaticData`) | n8n static data | **We build**: SQLite file owned by the CLI |

Result: one deterministic command-line program that knows nothing about Telegram,
schedules or LLMs, plus a few Hermes config entries, scripts and skills that call it.
Roughly half the work of the earlier "standalone service" version of this plan.

```
                 ┌──────────────────────── Hermes Agent (already on VPS) ────────────────────────┐
 Telegram  ◀──▶  │ gateway ── quick commands /sales /finance ── skill /aiconsult ── cron jobs   │
                 └───────┬───────────────────────┬────────────────────┬──────────────┬───────────┘
                         │ bash script           │ terminal tool      │ pre-run      │ no-agent
                         ▼                       ▼                    ▼ script       ▼ script
                 ┌──────────────────────── qudamah-report (Node.js CLI, we build) ────────────────┐
                 │ fetch Accurate + Sheets → ported Code-node logic → files in ~/qudamah/out/     │
                 │ state: ~/qudamah/data/app.db (snapshots, run log, Accurate token)            │
                 └───────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The `qudamah-report` CLI (what we build)

### 2.1 Commands

| Command | Does | Writes |
| --- | --- | --- |
| `qudamah-report sales` | Fetch everything, compute sales metrics + dashboard | `out/<date>/sales-1.txt, sales-2.txt, ...`, `SalesHarianQudamah.html`, `metrics.json` |
| `qudamah-report finance` | Fetch everything, compute P&L + balance sheet + dashboard | `LaporanFinansialQudamah.html`, `finance-payload.json` (the `Siapkan Payload Finance` output, `dataQuality` first) |
| `qudamah-report context [--max-age 6h]` | Print the consultant context (sales + finance, truncated at 14,000 chars like today). Reuses the latest run if fresh, otherwise refreshes | stdout |
| `qudamah-report deliver sales\|finance` | Run the above and push results with `hermes send` (text chunks in order, then the HTML file) | Telegram |
| `qudamah-report auth accurate` | One-time OAuth2 login, stores refresh token | `data/app.db` |
| `qudamah-report import-static <file>` | Import n8n static data (balance snapshots) | `data/app.db` |
| `--dry` on any command | Never writes snapshots, never sends | |

Every run computes finance too, so the daily balance snapshot keeps accumulating,
exactly like the current "finance always runs, only delivery is gated" rule.

### 2.2 Why Node.js

The 15 Code nodes (about 4,000 lines) are already JavaScript and touch very little
n8n API: `$input` (11 nodes), `$('Node')` (7), `$json`, `$now`, `$execution` and
`$getWorkflowStaticData`. Keeping JS means the logic ports nearly verbatim. Hermes
is Python, but it only calls our CLI through bash, so the languages never mix.
Node 20+ has to be installed on the VPS (check with `node -v`).

### 2.3 Layout (in this repo, under `app/`)

```
app/
  package.json
  bin/qudamah-report.js
  config/
    sources.json          spreadsheets + tabs per period (replaces the 4 Sheets nodes)
    app.json              report chat ID, limits, paths
    coa-mapping.json      chart of accounts mapping (moved out of code, after parity)
  src/
    pipeline/run.js       the old 61-node graph as one async function
    clients/accurate.js   token refresh, db-list/open-db, paginate, retry
    clients/sheets.js     service account + n8n-compatible row shape
    store/db.js           SQLite: kv (snapshots), runs, tokens
    logic/*.js            one file per ported Code node
  test/parity/            per-node tests against captured n8n data
hermes/                   everything that gets copied into ~/.hermes
  scripts/qudamah-sales.sh
  scripts/qudamah-finance-precheck.sh
  scripts/qudamah-launch.sh
  skills/aiconsult/SKILL.md
  skills/qudamah-finance/SKILL.md
  config.snippet.yaml     quick_commands + timezone to merge into config.yaml
  install.sh              copies the above, creates the cron jobs
```

Secrets live in `~/qudamah/.env` (mode 600), read by the CLI itself. This matters:
Hermes **strips credentials from the environment of cron scripts**, so the CLI must
not depend on inherited env vars.

### 2.4 Integrations inside the CLI

**Accurate Online**
- `auth accurate` runs the authorization code flow once (prints the authorize URL,
  you paste back the code), stores `access_token`, `refresh_token`, expiry.
- Refresh before each run if expiring within 24 h, and once on any 401.
- `db-list.do` → `open-db.do?id=<d[0].id>` → `host` + `session`. Throw if no host.
- The four list calls use the query strings from the workflow JSON **verbatim**:

  | Call | `fields` | Filter |
  | --- | --- | --- |
  | Stok item | `id,no,name,itemType,quantity,availableToSell,unit1Name` | `itemType EQUAL INVENTORY` |
  | Invoice MTD | `id,number,transDate,totalAmount,statusName` | `transDate BETWEEN tglAwalBulan..tglKemarin` |
  | Invoice 30 hari | `id,transDate,detailItem` | `transDate BETWEEN tglAwalVelocity..tglKemarin` |
  | GL account | `id,no,name,accountType,balance` | none |

  `sp.pageSize=100`, `X-Session-ID` header, stop when `d` is empty, max 50 pages,
  300 ms between pages, 3 attempts, and on final failure return empty data plus a
  warning (today's `continueRegularOutput`). All four run in parallel.

**Google Sheets**
- Service account, both spreadsheets shared with its email as Viewer.
- Tabs listed in `config/sources.json`; adding a month is one config line.
- **Highest parity risk.** The parsers depend on the exact item shape the n8n Sheets
  node emits (header row as keys, naming of blank or duplicate headers, numbers vs
  formatted strings, the `6.502` issue, `row_number`). The converter is tested
  against captured n8n output before anything else is trusted.

### 2.5 Porting the Code nodes

Same two-step method as before:

1. **Wrap, do not rewrite.** Each node body goes into a function that receives a tiny
   shim (`$input.all()`, `$('Name').first()`, `$now`). Parity tests must pass.
2. **Then clean up** file by file, re-running parity after each change.

Nodes that change meaning or disappear with Hermes:

| Node | Fate |
| --- | --- |
| `Baca Perintah`, `Rute Perintah`, `Tentukan Mode` | **Gone.** Hermes routes commands; each CLI command already knows its mode. |
| `Siapkan Payload Konsultasi` | Becomes the `context` command. |
| `Pecah Pesan Sales` | Kept. Chunks are sent in order by `deliver`, so the 3,800-char split stays exact. |
| `Hitung Laba Rugi & Neraca` | `$getWorkflowStaticData` → SQLite `kv`, written only at the end of a successful non-dry run. |
| `Siapkan Sesi dan Tanggal` | `$now` → Luxon with `Asia/Jakarta`, injectable for tests. |
| All others | Ported unchanged. |

---

## 3. The Hermes side

### 3.1 Settings (`~/.hermes/config.yaml` and `.env`)

```yaml
timezone: "Asia/Jakarta"          # cron schedules and agent clock

quick_commands:
  sales:
    type: exec
    command: bash ~/.hermes/scripts/qudamah-launch.sh sales
  finance:
    type: exec
    command: bash ~/.hermes/scripts/qudamah-launch.sh finance
```

```bash
# ~/.hermes/.env
TELEGRAM_ALLOWED_USERS=<owner user id>,<team user ids>
```

Replaces `BATASI_KE_DAFTAR_IZIN` / `CHAT_DIIZINKAN`, and is on from day one. Today
the n8n bot answers anyone, which leaks the P&L.

### 3.2 Daily sales, 07:00 (no LLM)

A **no-agent** cron job: zero tokens, just our script.

```bash
hermes cron create "0 7 * * *" --no-agent --script qudamah-sales.sh \
  --deliver telegram:<REPORT_CHAT_ID> --name "qudamah-sales-harian"
```

`qudamah-sales.sh` runs `qudamah-report deliver sales`, which sends the text chunks
and then the HTML file via `hermes send` (`MEDIA:~/qudamah/out/<date>/SalesHarianQudamah.html`),
and prints nothing. Empty stdout = no extra message, a non-zero exit = Hermes sends
an error alert, so a broken run can never fail silently.

(Why `hermes send` inside the script instead of printing the report to stdout:
the daily report is often longer than one Telegram message, and sending the chunks
ourselves keeps the `(1/3)` split and the order exactly as today.)

### 3.3 Weekly finance, Sunday 10:00 (LLM)

An **agent** cron job with a pre-run script and a skill:

```bash
hermes cron create "0 10 * * 0" \
  --script qudamah-finance-precheck.sh \
  --skill qudamah-finance \
  --deliver telegram:<REPORT_CHAT_ID> \
  --name "qudamah-finance-mingguan" \
  "Tulis analisis finansial mingguan dari payload yang diberikan."
```

- `qudamah-finance-precheck.sh` runs `qudamah-report finance`, prints
  `finance-payload.json` as the job's context. If the run failed, it prints
  `{"wakeAgent": false}` after sending an error message, so no tokens are spent on
  empty data.
- Skill `qudamah-finance` = today's `src/prompts/ai-analis-finance.md` (system rules:
  read `dataQuality` first, flag `penyusutanNol`, no P&L when `layakDilaporkan` is
  false) plus one line: end the answer with
  `MEDIA:~/qudamah/out/<date>/LaporanFinansialQudamah.html` so the dashboard is
  attached to the same delivery.
- The "only `<b> <i> <code> <a>`" rule in the prompt is dropped: Hermes' Telegram
  adapter does the formatting, so the prompt asks for plain Markdown instead.

### 3.4 `/sales` and `/finance` on demand

Quick commands time out after **30 seconds** and a report takes about a minute, so
`qudamah-launch.sh` starts the job in the background and returns at once:

```bash
#!/usr/bin/env bash
# replies instantly (this text is the old "Konfirmasi Terima"), work continues detached
setsid nohup ~/qudamah/bin/qudamah-report deliver "$1" >>~/qudamah/logs/launch.log 2>&1 &
echo "Siap. Menyiapkan laporan $1, mohon tunggu sekitar satu menit."
```

A lock file in the CLI stops a second `/finance` from starting while one runs.
`/finance` on demand then reuses the same path as the cron job: easiest is
`hermes cron run <finance job id>` from the launcher, so the narrative is written by
the same skill.

Delivery goes to the report chat. If `/sales` must answer whichever chat asked, we
need Hermes to pass the chat ID to the exec command; this is open question 3.

### 3.5 `/aiconsult` (LLM, conversational)

A Hermes **skill named `aiconsult`**, so `/aiconsult <question>` works directly:

- Content = today's `src/prompts/ai-konsultan.md`, plus: "first run
  `qudamah-report context --max-age 6h` with the terminal tool and answer only from
  that data; if data quality flags a caveat, say so".
- Follow-up replies are just the ongoing Hermes conversation, so memory and the old
  `lanjutan` fast path come for free.
- Allow the command `qudamah-report context` in Hermes' command approval list so the
  agent does not stop to ask permission on Telegram.
- Usually answers from the 07:00 run, which is seconds, instead of re-fetching
  everything like n8n did.

---

## 4. Testing and parity

1. **Capture fixtures from n8n first.** Export 3 to 5 real executions (a daily, a
   weekly, an `/aiconsult`) and save each Code node's input and output as JSON under
   `app/test/fixtures/`. These contain real figures, so the folder is **git-ignored
   and never pushed**.
2. **Parity per node:** fixture in, deep-equal fixture out, date frozen.
3. **Sheets converter:** API rows → n8n item shape equal to the captured Sheets output.
4. **Accurate client:** mocked HTTP for pagination stop, 50-page cap, 3 retries,
   graceful empty result.
5. **Dry runs on the VPS:** `qudamah-report sales --dry`, then open the files in
   `out/` and compare to what n8n sent that morning.
6. **Hermes side:** `hermes cron run <id>` for each job, sending to a **test chat**
   first; `hermes cron doctor` clean.

---

## 5. Cutover

The Telegram bot question is simpler than before. Hermes already has its own bot,
separate from the n8n bot, so both can run at the same time with no conflict.

1. **Pick the bot.** Recommended: use the **Hermes bot** for reports and retire the
   n8n bot, so there is one bot to talk to. (Alternative: move the n8n bot token into
   Hermes; only if the team must keep the same bot name.)
2. **Import snapshots.** Get n8n static data (`snapshotAkun`, `snapshotAwal`) via the
   n8n API (`GET /api/v1/workflows/<id>` → `staticData`) or its database, then
   `qudamah-report import-static`. Without this the first month has no finance baseline.
3. **Shadow week.** Hermes cron jobs deliver to a test chat for 7 days including one
   Sunday while n8n keeps serving the owner. Compare text, both HTML files, and
   `diagnostikNeraca` daily.
4. **Switch day.** Deactivate the n8n workflow, re-import static data one last time
   (it kept changing during the shadow week), point the cron jobs at the owner's
   chat, run `/sales` and `/finance` once by hand.
5. **Rollback** in minutes: `hermes cron pause` both jobs, reactivate n8n. Keep n8n
   installed for a month.

---

## 6. Operations

- **Backups:** daily copy of `~/qudamah/data/app.db` off the box. The snapshots cannot
  be rebuilt, because Accurate's GL endpoint has no date filter.
- **Failures:** non-zero exit from any script → Hermes delivers an error alert.
  The CLI also logs every run to the `runs` table and `~/qudamah/logs/`.
- **Accurate login expiry** is the most likely real-world failure; the error message
  names the fix (`qudamah-report auth accurate`).
- **Updates:** `git pull` in the repo, `npm ci` in `app/`, re-run `hermes/install.sh`.
- **Model cost:** daily report now costs zero tokens; only the weekly narrative and
  `/aiconsult` use the model.

---

## 7. Phases and effort

| # | Phase | Output | Estimate |
| --- | --- | --- | --- |
| 0 | Capture fixtures + static data from n8n; check Hermes version, Node, Telegram allow list | Fixtures, `staticData.json` | 0.5 day |
| 1 | CLI skeleton, config, SQLite, logging | `qudamah-report --help` | 0.5 day |
| 2 | Accurate + Sheets clients | Real data fetched with `--dry` | 1.5 days |
| 3 | Port 12 remaining Code nodes behind the shim, parity green | `logic/`, tests | 2 days |
| 4 | `sales`, `finance`, `context`, `deliver` commands | Files in `out/`, Telegram test sends | 0.5 day |
| 5 | Hermes scripts, skills, quick commands, cron jobs, `install.sh` | Everything firing into a test chat | 1 day |
| 6 | Shadow week | Daily comparison | 7 days elapsed, ~1 day work |
| 7 | Cutover + docs update | n8n off | 0.5 day |

About **6 to 7 working days** plus the shadow week.

---

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Sheets row shape differs from n8n | Converter tested against captured n8n output |
| Snapshots lost | Import twice, daily backups |
| Different LLM than `gpt-5-mini` changes the tone or accuracy of the narrative | Compare during shadow week; Hermes can pin a model per cron job if needed |
| Agent in `/aiconsult` runs other commands than intended | Only `qudamah-report context` on the approval allow list; skill says read-only |
| Quick command 30 s timeout | Launcher detaches immediately (3.4) |
| Hermes update changes cron/skill behaviour | Pin the Hermes version during shadow week; `hermes cron doctor` after every update |
| Server clock not Jakarta | `timezone` in Hermes config **and** explicit zone in the CLI |

---

## 9. Open questions

1. Is it **Hermes Agent by Nous Research**? (Plan assumes yes.) Which version
   (`hermes --version`)? Features used: no-agent cron, pre-run scripts, skills,
   quick commands, `hermes send` with `MEDIA:`.
2. Which **model** does your Hermes use? Keep it, or pin `gpt-5-mini` for the
   finance job so the output matches today?
3. Should `/sales` and `/finance` reply in **whichever chat asked**, or always in the
   one report chat? (Always-one-chat is simpler.)
4. **Which bot** should the owner use after cutover: the existing Hermes bot or the
   current n8n bot?
5. Is **Node 20+** on the VPS, and can I get **n8n execution data and static data**
   (API key or DB access) for the parity fixtures?
