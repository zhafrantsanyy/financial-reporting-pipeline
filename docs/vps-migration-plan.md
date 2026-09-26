# Plan: running the pipeline on a VPS with Hermes Agent instead of n8n

Status: **plan only, nothing implemented yet.**

Goal: the same three products (daily sales report, weekly financial pack,
`/aiconsult` consultant) delivered over **WhatsApp from a dedicated bot number**, with n8n
switched off. The VPS already runs [Hermes Agent](https://github.com/NousResearch/hermes-agent)
(Nous Research), so Hermes takes over everything n8n did **around** the logic, and
we only build the part Hermes cannot do: pulling Accurate and Sheets data and
computing the numbers.

**Decisions so far**

| Topic | Decision |
| --- | --- |
| Hermes | Hermes Agent by Nous Research, **v0.21.5** (every feature used here was checked against the `rc.9-v0.21.5` source) |
| Profile | New, blank profile `qudamah`; other profiles untouched |
| Channel | WhatsApp, Baileys bridge, dedicated bot number |
| Model | DeepSeek via OpenCode, configured in the `qudamah` profile only |
| Dashboards | **PDF** (main attachment) **plus** the existing HTML |
| Recipients | Testing: **6287720742631** only. More numbers added later in config |
| Install location | **Everything inside the Hermes profile folder** (section 1.2) |
| Node.js | Not on the VPS yet; installed once as part of the setup (section 1.2) |

---

## 1. The split: what Hermes does, what we build

| Job | Today in n8n | On the VPS |
| --- | --- | --- |
| Chat bot (inbound commands, replies, allow list) | Telegram Trigger, `Baca Perintah`, `Rute Perintah`, 7 send nodes | **Hermes gateway of the new `qudamah` profile**, WhatsApp bot number (`WHATSAPP_ALLOWED_USERS` replaces `CHAT_DIIZINKAN`) |
| Schedules 07:00 daily and Sunday 10:00 | 2 Schedule Triggers | **Hermes cron** with `timezone: "Asia/Jakarta"` |
| Sending HTML dashboards as files | Convert to File + sendDocument | **`MEDIA:/path/file.html`** in the delivered text, or `hermes send` |
| LLM (finance narrative, consultant) | OpenAI node, `gpt-5-mini`, 2 LangChain agents | **Hermes agent** with whatever model Hermes is configured for, prompts become **skills** |
| Conversation memory for follow-ups | Window Buffer Memory, `lanjutan` mode | **Hermes sessions** (native, the `lanjutan` path disappears) |
| "Working on it" acknowledgement | `Konfirmasi Terima` | Output of the `/sales` and `/finance` quick commands |
| Accurate OAuth2, session, pagination, retry | 6 HTTP nodes | **We build**: `qudamah-report` CLI |
| Google Sheets reads | 4 Sheets nodes + 2 merges | **We build**: `qudamah-report` CLI |
| Metrics, P&L, balance sheet, dashboards, message chunking | 15 Code nodes | **We build**: ported almost unchanged into the CLI |
| Balance snapshots (`$getWorkflowStaticData`) | n8n static data | **We build**: SQLite file owned by the CLI |

Result: one deterministic command-line program that knows nothing about WhatsApp,
schedules or LLMs, plus a few Hermes config entries, scripts and skills that call it.
Roughly half the work of the earlier "standalone service" version of this plan.

```
                 ┌──────────────────────── Hermes Agent (already on VPS) ────────────────────────┐
 WhatsApp  ◀──▶  │ gateway ── quick commands /sales /finance ── skill /aiconsult ── cron jobs   │
                 └───────┬───────────────────────┬────────────────────┬──────────────┬───────────┘
                         │ bash script           │ terminal tool      │ pre-run      │ no-agent
                         ▼                       ▼                    ▼ script       ▼ script
                 ┌──────────────────────── qudamah-report (Node.js CLI, we build) ────────────────┐
                 │ fetch Accurate + Sheets → ported Code-node logic → files in $QR/out/     │
                 │ state: $QR/data/app.db (snapshots, run log, Accurate token)            │
                 └───────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 A dedicated Hermes profile: `qudamah`

The automation runs in its **own Hermes profile**, not in your existing one.

```bash
hermes profile create qudamah          # blank: no memory, no bots, no cron copied
qudamah setup                          # model: DeepSeek via OpenCode (opencode-zen or opencode-go)
qudamah whatsapp                       # pair the new bot number (bot mode, scan QR)
qudamah gateway install                # own systemd service (or served by the multiplexed gateway)
```

What a profile isolates (everything lives under `~/.hermes/profiles/qudamah/`):
`config.yaml`, `.env`, `SOUL.md`, memory, sessions, skills, `scripts/`, cron jobs,
logs, WhatsApp session. So:

- The report bot **never reads or writes the memory of your other profiles**, and
  they never see Qudamah's figures. Do **not** use `--clone` / `--clone-all`
  (those copy `MEMORY.md` and `USER.md` from the source profile).
- Exception to check: if your existing profile uses an **external memory provider**
  such as Honcho, a new profile can share the same user workspace. Leave memory on
  the built-in provider for `qudamah`.
- Profiles do **not** sandbox the filesystem. Set `terminal.cwd` to `$QR` so the
  agent starts there, and keep the `/aiconsult` command allow list narrow.
- Skills, scripts, quick commands and cron jobs from section 3 are installed into
  **this profile only** (`hermes/install.sh` targets `-p qudamah`). Every Hermes
  command in this plan is written as `qudamah ...`, which is `hermes -p qudamah ...`.
  Inside scripts, deliveries use `hermes -p qudamah send --to whatsapp:+62...`.
- `hermes update` is shared across profiles, so an update affects both; pin the
  version during the shadow week.

### 1.2 Everything installed inside Hermes

All code, data and output live inside the profile, so "the Qudamah bot" is one
folder. In this plan, `$QR` means:

```
$QR = ~/.hermes/profiles/qudamah/qudamah-report
```

```
~/.hermes/profiles/qudamah/
  config.yaml  .env  SOUL.md  memories/  sessions/  cron/      Hermes' own files
  platforms/whatsapp/session/                                  WhatsApp pairing
  skills/aiconsult/  skills/qudamah-finance/                   our skills
  scripts/qudamah-*.sh                                         our cron + launcher scripts
  qudamah-report/                                              ($QR) our CLI
    app/          code (git checkout of this repo's app/ folder)
    .env          Accurate + Google secrets, mode 600
    data/app.db   balance snapshots, Accurate token, run log
    out/<date>/   text chunks, PDF, HTML, JSON of each run
    logs/
```

Two consequences:

- `hermes profile delete qudamah` would also delete `data/app.db`, which holds balance
  snapshots that cannot be rebuilt. Daily backup of that file to somewhere outside
  the profile is therefore mandatory (section 6).
- Hermes only accepts cron scripts from `<profile>/scripts/`, which this layout
  already satisfies.

**Node.js.** Not installed yet. Install **Node 20 LTS** once (NodeSource apt repo or
`nvm`), **before** `qudamah whatsapp`: Hermes' WhatsApp bridge is itself a Node.js
program (needs Node 18+), so the bridge and our CLI share the same Node.

**Setup order on the VPS** (all of it, start to finish):

1. Install Node 20 LTS; `node -v`.
2. `hermes profile create qudamah` (blank, no `--clone`).
3. `qudamah setup` → provider OpenCode (`opencode-zen` or `opencode-go`), model DeepSeek.
4. `qudamah whatsapp` → bot mode, scan QR with the **bot's** phone.
5. Put `WHATSAPP_ALLOWED_USERS=6287720742631` in the profile `.env`; send "halo" from
   6287720742631 to the bot number.
6. `git clone` this repo into `$QR/app`, `npm ci`, install Chromium for PDF (2.6).
7. `$QR/app/bin/qudamah-report auth accurate` (one-time login) and put the Google
   service account JSON in `$QR/`.
8. `$QR/app/hermes/install.sh` → copies skills and scripts into the profile, merges
   `quick_commands` and `timezone` into `config.yaml`, creates the cron jobs.
9. `qudamah gateway install` (or restart the multiplexed gateway) and run
   `qudamah cron doctor`.

### 1.3 WhatsApp bridge

WhatsApp choice: the **Baileys bridge** (bot mode, QR pairing, no Meta account) fits a
single owner plus a few team members. The official **WhatsApp Cloud API** has no ban
risk but needs a Meta Business account, a public HTTPS webhook, and it cannot send
free-form messages 24 h after the user's last message, which would block the 07:00
report on days nobody chatted. Recommendation: Baileys with a dedicated number.

---

## 2. The `qudamah-report` CLI (what we build)

### 2.1 Commands

| Command | Does | Writes |
| --- | --- | --- |
| `qudamah-report sales` | Fetch everything, compute sales metrics + dashboard | `out/<date>/sales-1.txt, sales-2.txt, ...`, `SalesHarianQudamah.pdf` + `.html`, `metrics.json` |
| `qudamah-report finance` | Fetch everything, compute P&L + balance sheet + dashboard | `LaporanFinansialQudamah.pdf` + `.html`, `finance-payload.json` (the `Siapkan Payload Finance` output, `dataQuality` first) |
| `qudamah-report context [--max-age 6h]` | Print the consultant context (sales + finance, truncated at 14,000 chars like today). Reuses the latest run if fresh, otherwise refreshes | stdout |
| `qudamah-report deliver sales\|finance` | Run the above and push results with `hermes send` (text chunks in order, then the PDF, then the HTML) to every number in `recipients` | WhatsApp |
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
Node is not on the VPS yet; it is installed in setup step 1 (section 1.2) and
is needed anyway by Hermes' WhatsApp bridge.

### 2.3 Layout (in this repo, under `app/`)

```
app/
  package.json
  bin/qudamah-report.js
  config/
    sources.json          spreadsheets + tabs per period (replaces the 4 Sheets nodes)
    app.json              recipients (test / live), limits, paths, attachHtml
    coa-mapping.json      chart of accounts mapping (moved out of code, after parity)
  src/
    pipeline/run.js       the old 61-node graph as one async function
    clients/accurate.js   token refresh, db-list/open-db, paginate, retry
    clients/sheets.js     service account + n8n-compatible row shape
    store/db.js           SQLite: kv (snapshots), runs, tokens
    logic/*.js            one file per ported Code node
  test/parity/            per-node tests against captured n8n data
    render/pdf.js         HTML → PDF with headless Chromium (2.6)
hermes/                   everything that gets copied into ~/.hermes/profiles/qudamah
  scripts/qudamah-sales.sh
  scripts/qudamah-finance-precheck.sh
  scripts/qudamah-launch.sh
  skills/aiconsult/SKILL.md
  skills/qudamah-finance/SKILL.md
  config.snippet.yaml     quick_commands + timezone to merge into config.yaml
  install.sh              copies the above, creates the cron jobs
```

Secrets live in `$QR/.env` (mode 600), read by the CLI itself. This matters:
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

### 2.6 PDF output

Each dashboard is produced twice from the same HTML string: the `.html` as today,
and a `.pdf` for WhatsApp, where PDFs open in the phone's built-in viewer. (The
WhatsApp bridge sends `.pdf` as a proper `application/pdf` document; `.html` goes out
as a generic file.)

- **Renderer:** `puppeteer-core` driving headless **Chromium** (`apt install chromium`
  or Puppeteer's bundled download). Output A4 portrait, `printBackground: true` so
  the card colours survive. Chromium uses about 300 MB RAM for a few seconds per render.
- **Tabs problem:** the dashboards use radio buttons + CSS for tabs, so a naive print
  would show only the first tab. The renderer injects a print stylesheet that shows
  **every tab panel stacked**, hides the tab bar, adds each tab's name as a section
  heading, and puts a page break between sections and `break-inside: avoid` on cards
  and table rows.
- **Header/footer:** "Qudamah · Laporan Sales Harian · <tanggal>" and page `n / N`.
- **Never blocks a report:** if PDF rendering fails, the text and HTML are still
  sent, with a one-line note that the PDF is missing, and the error is logged.
- **Test:** parity tests only cover the HTML; the PDF gets a visual check during the
  shadow week (open on a phone, compare with the HTML).
- `attachHtml` in `config/app.json` (default `true`) lets you drop the HTML later if
  the PDF alone is enough.

### 2.7 Recipients

`config/app.json` holds the numbers, separate from code:

```json
{
  "recipients": {
    "mode": "test",
    "test": ["6287720742631"],
    "live": []
  }
}
```

`deliver` sends to every number of the active list. Going live, or adding team
members, is a config edit plus the same numbers in `WHATSAPP_ALLOWED_USERS` (and each
new person sends one message to the bot first).

---

## 3. The Hermes side

### 3.1 Settings (`~/.hermes/profiles/qudamah/config.yaml` and `.env`)

```yaml
timezone: "Asia/Jakarta"          # cron schedules and agent clock

quick_commands:
  sales:
    type: exec
    command: bash ~/.hermes/profiles/qudamah/scripts/qudamah-launch.sh sales
  finance:
    type: exec
    command: bash ~/.hermes/profiles/qudamah/scripts/qudamah-launch.sh finance
```

```bash
# ~/.hermes/profiles/qudamah/.env
WHATSAPP_ENABLED=true
WHATSAPP_MODE=bot
WHATSAPP_ALLOWED_USERS=6287720742631   # testing; add owner/team later, comma-separated, no +
```

Replaces `BATASI_KE_DAFTAR_IZIN` / `CHAT_DIIZINKAN`, and is on from day one. Today
the n8n bot answers anyone, which leaks the P&L.

### 3.2 Daily sales, 07:00 (no LLM)

A **no-agent** cron job: zero tokens, just our script.

```bash
qudamah cron create "0 7 * * *" --no-agent --script qudamah-sales.sh \
  --deliver local --failure-deliver whatsapp:+6287720742631 \
  --name "qudamah-sales-harian"
```

`qudamah-sales.sh` runs `qudamah-report deliver sales`, which sends the text chunks,
then the PDF, then the HTML to each recipient via `hermes -p qudamah send`
(`MEDIA:$QR/out/<date>/SalesHarianQudamah.pdf`), and prints nothing. Empty stdout = no extra message, a non-zero exit = Hermes sends
an error alert, so a broken run can never fail silently.

(Why `hermes send` inside the script instead of printing the report to stdout:
the daily report is often longer than one WhatsApp message (Hermes splits at 4,096 chars), and sending the chunks
ourselves keeps the `(1/3)` split and the order exactly as today.)

### 3.3 Weekly finance, Sunday 10:00 (LLM)

An **agent** cron job with a pre-run script and a skill:

```bash
qudamah cron create "0 10 * * 0" \
  --script qudamah-finance-precheck.sh \
  --skill qudamah-finance \
  --deliver whatsapp:+6287720742631 \
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
  `MEDIA:$QR/out/<date>/LaporanFinansialQudamah.pdf` and
  `MEDIA:$QR/out/<date>/LaporanFinansialQudamah.html` so both files are attached to
  the same delivery. More recipients later: `--deliver` takes a comma-separated list.
- The "only `<b> <i> <code> <a>`" rule in the prompt is dropped: Hermes' WhatsApp
  adapter converts Markdown to WhatsApp formatting, so the prompt asks for plain
  Markdown instead.

### 3.4 `/sales` and `/finance` on demand

Quick commands time out after **30 seconds** and a report takes about a minute, so
`qudamah-launch.sh` starts the job in the background and returns at once:

```bash
#!/usr/bin/env bash
# replies instantly (this text is the old "Konfirmasi Terima"), work continues detached
setsid nohup $QR/bin/qudamah-report deliver "$1" >>$QR/logs/launch.log 2>&1 &
echo "Siap. Menyiapkan laporan $1, mohon tunggu sekitar satu menit."
```

A lock file in the CLI stops a second `/finance` from starting while one runs.
`/finance` on demand then reuses the same path as the cron job: easiest is
`qudamah cron run <finance job id>` from the launcher, so the narrative is written by
the same skill.

Delivery goes to the `recipients` list (during testing: 6287720742631 only).

### 3.5 `/aiconsult` (LLM, conversational)

A Hermes **skill named `aiconsult`**, so `/aiconsult <question>` works directly:

- Content = today's `src/prompts/ai-konsultan.md`, plus: "first run
  `qudamah-report context --max-age 6h` with the terminal tool and answer only from
  that data; if data quality flags a caveat, say so".
- Follow-up replies are just the ongoing Hermes conversation, so memory and the old
  `lanjutan` fast path come for free.
- Allow the command `qudamah-report context` in Hermes' command approval list so the
  agent does not stop to ask permission on WhatsApp.
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
6. **Hermes side:** `qudamah cron run <id>` for each job, delivering to
   **6287720742631**; `qudamah cron doctor` clean.
7. **PDF check:** open both PDFs on the test phone; every tab present, nothing cut
   between pages, numbers identical to the HTML.

---

## 5. Cutover

The new `qudamah` profile has its own WhatsApp number, separate from both the n8n
Telegram bot and your other Hermes profiles, so everything can run side by side.

1. **Owner messages the bot number first.** The WhatsApp bridge warns against
   automated messages to people who never wrote to the bot; one "halo" from the
   owner and each team member before go-live keeps the number safe.
2. **Import snapshots.** Get n8n static data (`snapshotAkun`, `snapshotAwal`) via the
   n8n API (`GET /api/v1/workflows/<id>` → `staticData`) or its database, then
   `qudamah-report import-static`. Without this the first month has no finance baseline.
3. **Shadow week.** Hermes cron jobs deliver to 6287720742631 for 7 days including one
   Sunday while n8n keeps serving the owner. Compare text, HTML and PDF files, and
   `diagnostikNeraca` daily.
4. **Switch day.** Deactivate the n8n workflow, re-import static data one last time
   (it kept changing during the shadow week), set `recipients.mode` to `live` with the
   owner/team numbers (and the same numbers in `WHATSAPP_ALLOWED_USERS` and the
   finance job's `--deliver`), run `/sales` and `/finance` once by hand.
5. **Rollback** in minutes: `qudamah cron pause` both jobs, reactivate n8n. Keep n8n
   installed for a month.

---

## 6. Operations

- **Backups (mandatory):** daily `sqlite3 app.db ".backup"` of `$QR/data/app.db`
  to a folder **outside the profile** and off the box, because deleting the profile
  deletes the data. The snapshots cannot
  be rebuilt, because Accurate's GL endpoint has no date filter.
- **Failures:** non-zero exit from any script → Hermes delivers an error alert.
  The CLI also logs every run to the `runs` table and `$QR/logs/`.
- **Accurate login expiry** is the most likely real-world failure; the error message
  names the fix (`qudamah-report auth accurate`).
- **Updates:** `git pull` in `$QR/app`, `npm ci`, re-run `hermes/install.sh`.
- **Hermes version:** stay on v0.21.5 until the shadow week is signed off; after any
  `hermes update`, run `qudamah cron doctor` and one `/sales`.
- **Model cost:** daily report now costs zero tokens; only the weekly narrative and
  `/aiconsult` use the model.

---

## 7. Phases and effort

| # | Phase | Output | Estimate |
| --- | --- | --- | --- |
| 0 | Capture fixtures + static data from n8n; install Node 20, create `qudamah` profile, pair WhatsApp number, allow 6287720742631 | Fixtures, `staticData.json`, bot answers "halo" | 0.5 day |
| 1 | CLI skeleton, config, SQLite, logging | `qudamah-report --help` | 0.5 day |
| 2 | Accurate + Sheets clients | Real data fetched with `--dry` | 1.5 days |
| 3 | Port 12 remaining Code nodes behind the shim, parity green | `logic/`, tests | 2 days |
| 4 | `sales`, `finance`, `context`, `deliver` commands | Files in `out/`, WhatsApp test sends | 0.5 day |
| 4b | PDF renderer with print stylesheet for both dashboards | `.pdf` next to each `.html` | 1 day |
| 5 | Hermes scripts, skills, quick commands, cron jobs, `install.sh` | Everything firing into a test chat | 1 day |
| 6 | Shadow week | Daily comparison | 7 days elapsed, ~1 day work |
| 7 | Cutover + docs update | n8n off | 0.5 day |

About **7 to 8 working days** plus the shadow week.

---

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Sheets row shape differs from n8n | Converter tested against captured n8n output |
| Snapshots lost | Import twice, daily backups |
| Different LLM than `gpt-5-mini` changes the tone or accuracy of the narrative | Compare during shadow week; Hermes can pin a model per cron job if needed |
| Agent in `/aiconsult` runs other commands than intended | Only `qudamah-report context` on the approval allow list; skill says read-only |
| Quick command 30 s timeout | Launcher detaches immediately (3.4) |
| Hermes update changes cron/skill behaviour | Pin the Hermes version during shadow week; `qudamah cron doctor` after every update |
| WhatsApp number restricted (unofficial bridge) | Dedicated number, only allow-listed recipients who messaged first, low volume (2 to 3 scheduled messages a day) |
| PDF cuts tables or hides tabs | Print stylesheet shows all tabs; visual check in shadow week; HTML still attached |
| Chromium missing or out of memory | Report still goes out without PDF, with a note; alert logged |
| Profile deleted by mistake | Daily backup of `app.db` outside the profile |
| Report data leaking into other profiles | Separate profile, no clone, built-in memory provider |
| Server clock not Jakarta | `timezone` in Hermes config **and** explicit zone in the CLI |

---

## 9. Open questions

1. **n8n data for parity tests:** can you get an n8n API key or database access to
   export 3 to 5 past executions and the workflow's static data (balance snapshots)?
   Without executions we can still compare during the shadow week, but finance
   needs the static data.
2. Later live recipients: which numbers, and should the **daily sales** and the
   **weekly finance** go to the same people?
3. Keep sending the **HTML next to the PDF**, or PDF only once the PDF looks right?
