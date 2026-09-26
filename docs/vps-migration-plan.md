# Spec: Qudamah reporting on Hermes Agent (profile `qudamah`), replacing n8n

Status: **specification, not implemented yet.** It is built on the VPS by the Hermes
agent of the `qudamah` profile, one phase at a time, following the prompts in
[`hermes-setup-guide.md`](hermes-setup-guide.md). Rules for the agent are in
[`../AGENTS.md`](../AGENTS.md).

Goal: the same three products as the n8n workflow (daily sales report, weekly
financial pack, `/aiconsult` consultant), delivered over **WhatsApp from a dedicated
bot number**, produced on the operator's VPS, with n8n switched off at the end.

---

## 0. Decisions

| Topic | Decision |
| --- | --- |
| Host | Existing VPS with **Hermes Agent v0.21.5** (Nous Research) |
| Profile | New blank profile **`qudamah`** (no `--clone`); other profiles untouched |
| Gateway | The existing **multiplexed host gateway** serves `qudamah` too (v0.21.5 refuses a per-profile gateway) |
| Channel | WhatsApp, **Baileys bridge**, dedicated bot number, bridge port **3001** |
| Model | **DeepSeek via OpenCode** (`opencode-go` or `opencode-zen`), set in this profile only |
| Runtime | **Node.js, npm and Chromium managed by Hermes** (`hermes pm`); no system Node needed |
| Dashboards | **PDF only** is sent (the HTML is still generated, as the PDF source and archive) |
| Recipients | Testing: **6287720742631** only. Live: Qudamah owner + team (group recommended, section 8) |
| Secrets | Entered by the operator into `$QR/.env` and `$QR/secrets/`, never through chat |
| Install location | Everything inside the profile folder (section 3) |

---

## 1. Architecture

| Job | In n8n | On the VPS |
| --- | --- | --- |
| Chat bot, allow list | Telegram Trigger, `Baca Perintah`, `Rute Perintah`, send nodes | Hermes gateway, WhatsApp adapter of profile `qudamah`, `WHATSAPP_ALLOWED_USERS` |
| Mode resolution (`Tentukan Mode`) | Code node + IF gates | Gone: each cron job, quick command and skill already knows what it is for |
| Schedules 07:00 daily, Sunday 10:00 | 2 Schedule Triggers | Hermes cron jobs, `timezone: Asia/Jakarta` |
| "Working on it" reply | `Konfirmasi Terima` | Output of the `/sales` and `/finance` quick commands |
| Sending report text + dashboard file | Telegram send nodes | Cron delivery: stdout text + `MEDIA:<pdf>` |
| Finance narrative (LLM) | `AI Analis Finance` + OpenAI | Hermes agent cron job + skill `qudamah-finance` |
| Consultant + memory | `AI Konsultan` + window memory, `lanjutan` path | Skill `aiconsult` + normal Hermes conversation |
| Accurate, Sheets, metrics, P&L, dashboards, snapshots | 6 HTTP + 4 Sheets + 15 Code nodes, static data | **`qudamah-report` CLI (we build)** |

```
            ┌──────────────── Hermes host gateway (already running) ────────────────┐
 WhatsApp ◀▶│ profile qudamah: cron jobs · /sales /finance · /aiconsult skill        │
            └──────┬──────────────────────┬───────────────────────┬─────────────────┘
                   │ no-agent script      │ pre-run script        │ skill_view
                   ▼                      ▼                       ▼ (read-only)
            ┌──────────────── qudamah-report (Node CLI, we build) ───────────────────┐
            │ Accurate + Sheets → ported Code-node logic → text, HTML, PDF, JSON     │
            │ writes $QR/out/<date>/ and skills/aiconsult/references/konteks-terbaru │
            │ state: $QR/data/app.db (snapshots, tokens, run log)                    │
            └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Hermes setup

### 2.1 Profile

`hermes profile create qudamah` (blank). A profile has its own `config.yaml`, `.env`,
`SOUL.md`, memory, sessions, skills, scripts, cron jobs, logs and WhatsApp session,
so nothing leaks to or from the operator's other profiles. Not using `--clone`
matters: clones copy `MEMORY.md` and `USER.md`.

Profiles do not sandbox the filesystem. That is handled by toolsets (2.4).

### 2.2 Gateway

In v0.21.5 one **multiplexed host gateway** (started from the default profile)
serves every profile. `qudamah gateway install/start` is refused by design. After
WhatsApp pairing the operator runs `hermes gateway restart` (brief restart of the
other bots too) and checks `hermes gateway status`. Isolation per profile is kept
by the gateway: keys, allowlists, sessions, approvals, cron and logs are resolved
from the profile's own files.

### 2.3 WhatsApp

- Baileys bridge, bot mode, dedicated number, paired with `qudamah whatsapp`.
  The pairing wizard installs Hermes' Node if missing.
- **`whatsapp.bridge_port: 3001`**, set before pairing. The bridge defaults to 3000,
  and an adapter that finds a healthy bridge on its port adopts it: without this,
  `qudamah` could end up talking through another profile's WhatsApp number.
- `whatsapp.reply_prefix: ""` (no "☤ Hermes Agent" header on reports).
- `whatsapp.unauthorized_dm_behavior: ignore` (strangers get silence, not a pairing code).
- `WHATSAPP_ALLOWED_USERS=6287720742631` during testing.
- Go-live options in section 8 (group recommended).

### 2.4 Toolsets per platform

| Surface | Toolsets | Why |
| --- | --- | --- |
| WhatsApp (`platform_toolsets.whatsapp`) | `skills`, `clarify` | Owner and team chat here. No terminal, file, code, browser, web, cron or delegation, so nobody can make the bot run commands on the VPS or read `.env`. `/aiconsult` reads its data with `skill_view` |
| Cron (`platform_toolsets.cron`) | minimal (`skills`) | The finance job gets its data from the pre-run script |
| CLI (`qudamah chat` over SSH) | default | Used by the operator to build and maintain |
| Everywhere (`agent.disabled_toolsets`) | `memory` off | Build-session notes never reach WhatsApp chats, and one team member's chat never shows up in another's. Follow-ups still work: they use the session history |
| Everywhere (`auxiliary.background_review.enabled: false`) | no background review | The post-turn review could otherwise save memory and create or edit skills (including `aiconsult`) from WhatsApp conversations; also saves tokens |

### 2.5 Model

DeepSeek via OpenCode, configured with `qudamah model`. The OpenCode API key goes
into this profile's `.env` (same key as another profile is fine).

---

## 3. Folder layout

```
~/.hermes/profiles/qudamah/                    ($QH)
  config.yaml  .env  SOUL.md  memories/  sessions/  cron/  logs/     Hermes' own files
  whatsapp/session/                                                 WhatsApp pairing
  scripts/qudamah-*.sh                                              copied by install.sh
  skills/aiconsult/  skills/qudamah-finance/                        copied by install.sh
  qudamah-report/                              ($QR)
    repo/            git checkout of this repository, branch hermes/migration
      app/           the CLI (package.json, bin/, src/, tools/, test/, config/*.example.json)
      hermes/        scripts/, skills/, SOUL.md, install.sh
    bin/             wrappers: node, npm, qudamah-report (+ cached pm env)
    .env             secrets, mode 600
    secrets/         google-sa.json, mode 700/600
    config/          app.json, sources.json (private: spreadsheet IDs, recipients)
    data/            app.db, n8n-staticData.json
    out/<date>/      outputs of each run
    fixtures/<id>/   n8n executions for parity tests (real figures, never in git)
    backup/          daily DB backups
    logs/
```

- Private data never enters `repo/`, so it cannot be committed by accident.
- `hermes profile delete qudamah` would delete `data/app.db`. The balance snapshots
  in it cannot be rebuilt (Accurate's GL endpoint has no date filter), hence the
  daily backup job and the advice to copy `backup/` off the box.
- `$QR/out` is added to `gateway.media_delivery_allow_dirs` so PDF attachments are
  accepted even if the operator turns on strict media delivery later.

---

## 4. Runtime

- `hermes pm install node npm chromium`. The v0.21.5 lock pins Node 26.7.0, npm
  12.0.2 and Chromium 145 (Playwright layout, revision 1208). Do not hardcode versions.
- `hermes pm env node npm chromium` prints JSON with `PATH` and
  `PLAYWRIGHT_BROWSERS_PATH`. `$QR/bin/node`, `$QR/bin/npm` and
  `$QR/bin/qudamah-report` read it (cached in `$QR/bin/.pm-env`, re-resolved when a
  path disappears after `hermes update`), falling back to `node` on `PATH`.
- `TZ` in the wrappers is set to whatever the parity tests show the n8n server used
  (UTC or Asia/Jakarta). Business dates are always computed in Asia/Jakarta.
- Dependencies (pure JS only): `luxon`, `playwright-core`, `google-auth-library`
  (or `googleapis`). Storage uses built-in `node:sqlite`; HTTP uses built-in `fetch`.
- Chromium needs system libraries. If they are missing, the agent reports the apt
  packages and the operator installs them.

---

## 5. The `qudamah-report` CLI

### 5.1 Commands

| Command | Does |
| --- | --- |
| `doctor` | Node version, Chromium found, `.env` keys set/MISSING, SA file, DB writable, config valid, Accurate token age |
| `auth accurate` | One-time OAuth2 login (5.3), stores tokens in the DB |
| `export-n8n` | Downloads n8n executions and static data (5.5) |
| `import-static [file]` | Loads n8n static data (`snapshotAkun`, `snapshotAwal`) into the DB |
| `sales [--dry] [--print]` | Full run; writes outputs; `--print` for the daily cron (5.8) |
| `finance [--dry] [--print]` | Full run; writes outputs; `--print` for the weekly cron pre-run (5.8) |
| `context` | Prints the consultant context of the latest run (debug) |
| `compare-n8n [--print]` | Shadow-week check of today's numbers against n8n's latest execution |
| `backup` | `VACUUM INTO $QR/backup/app-YYYYMMDD.db`, keep 30; silent on success |

Every run (`sales` or `finance`) fetches everything and computes both sales and
finance, exactly like n8n: finance runs every time so the daily balance snapshot
keeps accumulating. Snapshots are written only by a successful non-`--dry` run.
A lock file prevents two runs at once. Exit codes: `0` ok (possibly degraded, with
warnings in the report), `1` fatal, `2` configuration error.
The file `$QR/data/FORCE_FAIL` (or `QUDAMAH_FORCE_FAIL=1` in a shell) makes a run fail
on purpose to test failure alerts; a file is needed because cron scripts do not
inherit the caller's environment.

### 5.2 Secrets and config

`$QR/.env` (names only, the operator fills values):

```
ACCURATE_CLIENT_ID=
ACCURATE_CLIENT_SECRET=
ACCURATE_SCOPE=                 # copied from the n8n Accurate credential
ACCURATE_REDIRECT_URI=http://localhost:8765/callback
ACCURATE_AUTH_URL=https://account.accurate.id/oauth/authorize
ACCURATE_TOKEN_URL=https://account.accurate.id/oauth/token
GOOGLE_SA_PATH=<absolute path of $QR/secrets/google-sa.json>
N8N_BASE_URL=                   # e.g. https://n8n.example.com
N8N_API_KEY=
N8N_WORKFLOW_ID=
```

`$QR/config/app.json`:

```json
{
  "recipients": {
    "mode": "test",
    "test": ["whatsapp:+6287720742631"],
    "live": [],
    "failure": "whatsapp:+6287720742631"
  },
  "pdf": { "enabled": true, "format": "A4" }
}
```

`$QR/config/sources.json`: the VS and META ADS tabs per period (spreadsheet ID,
sheet name, gid, label). Tab names and gids come from the workflow JSON; IDs from
the operator. Adding a month = adding an entry. Templates live in
`app/config/*.example.json`.

### 5.3 Accurate Online

- `auth accurate`: prints the authorize URL (client id, `ACCURATE_REDIRECT_URI`,
  `ACCURATE_SCOPE`, a random `state`). The operator opens it on a laptop, logs in,
  lands on `http://localhost:8765/callback?code=...` (the page fails to load, that is
  expected) and pastes the full URL back. The CLI checks `state`, exchanges the code
  at `ACCURATE_TOKEN_URL` and stores access token, refresh token and expiry. The
  redirect URI must be registered on the Accurate OAuth app beforehand. Token
  endpoint details (Basic auth, body fields) must match what the n8n credential used.
- Refresh before each run when the token expires within 24 h, and once on a 401.
  A dead refresh token produces a clear error naming `auth accurate`.
- Session: `db-list.do`, then `open-db.do?id=<d[0].id>` gives `host` + `session`.
  Throw if there is no host (same as `Siapkan Sesi dan Tanggal`).
- Four list calls with query parameters copied **verbatim** from the workflow JSON
  (`Accurate Stok Item`, `Accurate Sales Invoice MTD`, `Accurate Invoice 30 Hari
  Detail`, `Accurate GL Account List`): `sp.pageSize=100`, `X-Session-ID` header,
  stop when `d` is empty, at most 50 pages, 300 ms between pages, 3 attempts, and on
  final failure an empty result plus a warning (n8n's `continueRegularOutput`).
- Output shape identical to n8n: one item per page, `{ json: { s, d: [...] } }`.

### 5.4 Google Sheets

- Service account (read-only scope), both spreadsheets shared with its email as Viewer.
- The four tabs are read and converted by `rowsToN8nItems()` into exactly the item
  shape the n8n Google Sheets node produced. The rules (header naming, `row_number`,
  blank cells, number vs string, value render option) are derived from the fixtures
  of `Sheet VS Juli`, `Sheet VS Sept`, `Meta ads Juli`, `Sheet Meta ads Sept1`.
  **Highest parity risk**: wrong shapes give wrong totals without errors.
- VS tabs and META ADS tabs stay two separate streams, each to its own parser.

### 5.5 n8n export

- `GET {N8N_BASE_URL}/api/v1/workflows/{id}` with `X-N8N-API-KEY`: save `staticData`
  to `$QR/data/n8n-staticData.json`. If the API does not return it, stop and report
  (fallbacks: n8n CLI export or the n8n database).
- `GET /api/v1/executions?workflowId=...&status=success&includeData=true` (paged):
  keep the 3 latest daily-schedule runs, 2 latest weekly-schedule runs, and 1
  `/finance` and 1 `/aiconsult` run when present. The run type comes from the
  trigger node present in `runData`.
- Store per execution: `$QR/fixtures/<executionId>/runData.json` (the whole
  `data.resultData.runData`) and `meta.json` (startedAt, mode, run type, nodes run).

### 5.6 Porting the Code nodes

1. `app/tools/wrap-code-nodes.mjs` generates `app/src/logic/<slug>.js` from every
   `src/code-nodes/<slug>.js`, **unchanged**, as:
   `export default function run({ $input, $, $json, $now, $execution, $getWorkflowStaticData }) { <original body> }`
   (the bodies end with `return [...]`, which works inside a function).
2. `app/src/n8n-shim.js` provides those arguments: `$input.all()/first()` from given
   items, `$('Node Name').all()/first()` from a map of named node outputs (throws
   like n8n when a node did not run, since the originals rely on `try/catch`),
   `$now` as a Luxon DateTime in Asia/Jakarta, `$execution.mode`, and
   `$getWorkflowStaticData('global')` backed by the DB (tests: an in-memory copy).
3. Nodes whose job disappears with Hermes (`Baca Perintah`, `Tentukan Mode`,
   `Pecah Pesan Sales`) are still wrapped and parity-tested, but not used by the
   pipeline. `Tentukan Mode`'s output is supplied by the shim where other nodes read
   it (`Siapkan Payload Konsultasi` gets `{ mode: 'konsultasi', pertanyaan: '' }`).
4. Clean-ups are allowed only after parity is green, one file at a time, with parity
   re-run after each.

### 5.7 Pipeline (`app/src/pipeline/run.js`)

```js
async function run({ now, dry, kv }) {
  const sesi = await accurate.openSession();                       // db-list, open-db
  const tgl  = logic.siapkanSesiDanTanggal({ input: sesi, now });
  const [invMtd, inv30, stokRaw, glRaw, vsRows, adsRows] = await Promise.all([
    accurate.list('sales-invoice', mtdQuery(tgl)),
    accurate.list('sales-invoice', velocityQuery(tgl)),
    accurate.list('item', stokQuery),
    accurate.list('glaccount', glQuery),
    sheets.read(sources.vs),
    sheets.read(sources.ads),
  ]);
  const stok      = logic.filterItemCategory(stokRaw);
  const sales     = logic.normalisasiSales(vsRows);
  const ads       = logic.normalisasiAds(adsRows);
  const marketing = logic.laporanMarketing([sales, ads]);
  const mtd       = logic.hitungPenjualanMtd(invMtd, { tgl });
  const fin       = logic.hitungLabaRugiNeraca(glRaw, { tgl, mtd, staticData: kv });
  const metrik    = logic.hitungMetrikHarian({ tgl, invMtd, inv30, stok, sales, ads, marketing });
  const htmlSales = logic.dashboardSalesHtml({ ...same inputs as in n8n });
  const htmlFin   = logic.dashboardFinansialHtml(fin);
  const payloadFin = logic.siapkanPayloadFinance(fin);
  const context   = logic.siapkanPayloadKonsultasi({ metrik, fin });
  if (!dry) kv.saveSnapshots();
  return { metrik, fin, htmlSales, htmlFin, payloadFin, context };
}
```

Every node receives exactly the inputs and named-node outputs it had in n8n
(connections in the workflow JSON), through the shim. The merges disappear.

### 5.8 Output contract

Files per run in `$QR/out/<YYYY-MM-DD>/`: `sales.txt` (the `pesan` field of
`Hitung Metrik Harian`), `SalesHarianQudamah.html/.pdf`,
`LaporanFinansialQudamah.html/.pdf`, `metrics.json`, `finance.json`,
`finance-payload.json`, `context.json`, `run.json` (timings, warnings).

Every run also rewrites `$QH/skills/aiconsult/references/konteks-terbaru.md`:
a header with the data timestamp (WIB) and the run type, then the
`Siapkan Payload Konsultasi` payload as a JSON block.

`sales --print` (stdout of the daily no-agent cron job, delivered verbatim):

```
<sales report text>

MEDIA:/home/.../qudamah-report/out/2026-09-28/SalesHarianQudamah.pdf
```

If the PDF failed: the text, then `(PDF tidak tersedia hari ini: <alasan singkat>)`,
no `MEDIA:` line, exit 0.

`finance --print` (stdout of the weekly pre-run script, injected into the prompt):

```
TANGGAL_HARI_INI: 28 September 2026
DATA_DIAMBIL: 2026-09-28T10:00:41+07:00
PDF_PATH: /home/.../qudamah-report/out/2026-09-28/LaporanFinansialQudamah.pdf
PAYLOAD_JSON:
{"dataQuality": ..., "periode": ..., ...}
```

(`PDF_PATH: TIDAK_ADA` when the PDF failed.)

### 5.9 PDF

- `playwright-core` driving Hermes' Chromium (`executablePath` under
  `PLAYWRIGHT_BROWSERS_PATH`), `--no-sandbox` only when running as root.
- A4 portrait, `printBackground: true`, header `Qudamah · <judul> · <tanggal>`,
  footer `halaman n / N`.
- The dashboards use radio inputs + CSS for tabs, so a plain print shows only the
  first tab. A print stylesheet is **injected at render time** (the HTML generators
  stay untouched): every tab panel visible and stacked, each preceded by its tab
  name as a heading, the tab bar hidden, a page break between panels,
  `break-inside: avoid` on cards and table rows.
- A render failure never blocks the report (5.8).

### 5.10 Shadow-week comparison

`compare-n8n --print`: fetch n8n's latest successful daily execution, compare the key
figures of `Hitung Metrik Harian` and `Hitung Laba Rugi & Neraca` with today's
`metrics.json` / `finance.json`, print a short list of equal / different fields
(with both values, this goes only to the operator's test number).

---

## 6. Hermes wiring (`hermes/install.sh`, idempotent)

### 6.1 Cron jobs (targets read from `$QR/config/app.json`)

| Name | Schedule | Kind | Script / skill | Delivers |
| --- | --- | --- | --- | --- |
| `qudamah-sales-harian` | `0 7 * * *` | `--no-agent` | `qudamah-sales.sh` | recipients; failures to `failure` |
| `qudamah-finance-mingguan` | `0 10 * * 0` | agent | `--script qudamah-finance-context.sh`, `--skill qudamah-finance` | recipients; failures to `failure` |
| `qudamah-backup` | `30 23 * * *` | `--no-agent` | `qudamah-backup.sh` | `local`; failures to `failure` |
| `qudamah-bandingkan-n8n` | `30 7 * * *` | `--no-agent` | `qudamah-compare.sh` | `failure` target only; removed at go-live |

Finance job prompt: `Tulis analisis finansial mingguan Qudamah dari data di atas,
ikuti skill qudamah-finance.` The weekday of the n8n weekly trigger is confirmed from
the workflow JSON before creating the job (the README says Sunday).

### 6.2 Scripts (`hermes/scripts/`, copied to `$QH/scripts/`)

- `qudamah-sales.sh`: `exec $QR/bin/qudamah-report sales --print`
- `qudamah-finance-context.sh`: `exec $QR/bin/qudamah-report finance --print`
  (non-zero exit on failure, so the LLM never runs on missing data)
- `qudamah-launch.sh sales|finance`: for quick commands. Starts
  `hermes -p qudamah cron run <job id>` detached (`setsid nohup ... &`), prints
  `Siap. Laporan <sales|finance> sedang disiapkan, sekitar 1 menit. Hasilnya dikirim ke penerima laporan.`
  and exits within a second (quick commands time out at 30 s).
- `qudamah-backup.sh`, `qudamah-compare.sh`
- Absolute paths only (resolved by `install.sh`): `hermes`, `$QR/bin/qudamah-report`.

### 6.3 Quick commands

`quick_commands.sales` and `quick_commands.finance`, type `exec`, running
`bash $QH/scripts/qudamah-launch.sh sales|finance`. Reports go to the cron job's
recipients, not necessarily to whoever typed the command.

### 6.4 Skills (`hermes/skills/`, copied to `$QH/skills/`)

- **`aiconsult`** (so `/aiconsult <pertanyaan>` works): the content rules of
  `src/prompts/ai-konsultan.md` (read availability first, never invent figures,
  say what is missing and why). First step: load
  `references/konteks-terbaru.md` with `skill_view`, state the data timestamp, and
  if it is older than 24 h say so and suggest `/sales` to refresh. Follow-up replies
  are plain conversation. Format: WhatsApp (`*tebal*`, `_miring_`, short lists, no
  tables, no headings), replacing the old Telegram HTML rule.
- **`qudamah-finance`**: the content rules of `src/prompts/ai-analis-finance.md`
  (`dataQuality` first, `penyusutanNol`, no P&L when `layakDilaporkan` is false,
  max 400 words, the four sections), WhatsApp format, and: the **last line** of the
  answer must be exactly `MEDIA:<PDF_PATH>` from the injected data (omit it when
  `PDF_PATH: TIDAK_ADA`).

### 6.5 `SOUL.md` of the profile

Qudamah's report assistant: Indonesian, concise, answers only from report data,
never reveals secrets, file paths, server or configuration details, declines
requests unrelated to Qudamah's business reports.

### 6.6 Config keys set by `install.sh` (`hermes -p qudamah config set ...`)

`timezone`, `quick_commands.*`, `platform_toolsets.whatsapp`,
`platform_toolsets.cron`, `gateway.media_delivery_allow_dirs`, `whatsapp.bridge_port`,
`whatsapp.reply_prefix`, `whatsapp.unauthorized_dm_behavior`. WhatsApp access
variables (`WHATSAPP_*`) are set in the profile `.env` through `config set` too.
Changes that need a gateway restart are reported to the operator, never applied by
restarting on its own.

### 6.7 `install.sh`

Copies scripts (chmod +x) and skills, writes `SOUL.md`, sets config keys, creates
the cron jobs when missing and updates their schedule/targets when present
(looked up by name), prints `qudamah cron list`. Safe to run again after every
config change (for example switching `recipients.mode` to `live`).

---

## 7. Tests

1. **Parity per Code node** against every fixture execution: input = the parent
   node's output in `runData`, `$()` = that execution's `runData`, `$now` and `Date`
   frozen to `startedAt` (`node:test` mock timers), deep-equal to the node's output.
   Process `TZ` tried as UTC and Asia/Jakarta; the matching one is locked in.
   `Hitung Laba Rugi & Neraca` uses the exported static data on the latest
   execution; on older ones only baseline fields may differ, listed per field.
2. **Sheets converter** against the Sheets fixtures (keys, types, unchanged rows).
3. **Accurate client** with mocked HTTP (stop on empty, 50-page cap, 3 tries,
   degrade to empty).
4. **Dry runs** on live data, compared with n8n's output of the same morning.
5. **PDF**: both files opened on the test phone; every tab present, nothing cut.
6. **Hermes**: `qudamah cron run` for each job, forced failure reaches the failure
   target (via `$QR/data/FORCE_FAIL`), `/sales`, `/finance`, `/aiconsult` + a
   follow-up from the test phone,
   and "jalankan ls /" from WhatsApp is refused (no terminal there).
7. **Shadow week**: 7 days including a Sunday, daily `compare-n8n` report.

---

## 8. Go-live and rollback

Recipients: **recommended** a WhatsApp group "Laporan Qudamah" with the owner, the
team and the bot number (one message per report instead of one per person, lower
ban risk). Group JID from `qudamah send --list whatsapp`. Settings:
`WHATSAPP_GROUP_POLICY=allowlist`, `WHATSAPP_GROUP_ALLOWED_USERS=<jid>@g.us`,
`WHATSAPP_REQUIRE_MENTION=true`, and every member who may use commands in
`WHATSAPP_ALLOWED_USERS`. Alternative: individual numbers, each of whom sends the
bot one message before the first report.

Switch day:
1. Re-run `export-n8n` + `import-static` (n8n kept updating snapshots).
2. `recipients.mode = live`, re-run `install.sh`, remove `qudamah-bandingkan-n8n`.
3. Operator deactivates the n8n workflow before the next 07:00.
4. Run `qudamah-sales-harian` once by hand and check delivery.

Rollback in minutes: `qudamah cron pause` the two report jobs, reactivate the n8n
workflow. Keep n8n installed for a month.

---

## 9. Operations

- Failures reach the `failure` number through Hermes; runs are logged in the
  `runs` table and `$QR/logs/`.
- Most likely real-world failure: Accurate refresh token expired. Fix:
  `qudamah-report auth accurate`.
- Copy `$QR/backup/` off the VPS regularly (rclone, scp, or the provider's snapshots).
- After `hermes update`: `qudamah cron doctor`, `$QR/bin/qudamah-report doctor`,
  one `/sales`.
- Adding a month of sheets: one entry in `$QR/config/sources.json`.
- Long-term memory is off for this profile (2.4). Follow-up questions work within a
  conversation; the bot does not remember anything across conversations.

---

## 10. Phases (one Hermes prompt each)

| # | Phase | Done when |
| --- | --- | --- |
| 1 | Orientation, no code | Agent summarises the target and the phases |
| 2 | Runtime: Node, npm, Chromium via `hermes pm`, folders, wrappers | Versions shown, Chromium prints a test PDF |
| 3 | CLI skeleton, config, DB, `doctor` | `qudamah-report doctor` runs |
| 4 | `export-n8n` | Fixtures and static data saved |
| 5 | Accurate client + `auth accurate` | Login done, dry fetch counts shown |
| 6 | Sheets client + converter | Converter matches the Sheets fixtures |
| 7 | Wrap 15 Code nodes + parity tests | Parity green or differences approved |
| 8 | Pipeline, `sales` / `finance` / `context`, `import-static` | Dry run matches n8n's morning output |
| 9 | PDF | Both PDFs approved on the phone |
| 10 | Hermes wiring (`install.sh`) | Cron jobs listed, doctor clean |
| 11 | End-to-end tests | Section 7 items 6 pass |
| 12 | Shadow week | 7 clean comparison days |
| 13 | Go-live | n8n off, reports reach owner and team |

---

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Sheets item shape differs from n8n | Converter derived from and tested against fixtures |
| Snapshots lost | Imported twice, daily backups, copy off the box |
| DeepSeek changes the narrative's tone or accuracy | Same content rules as before; judged during the shadow week |
| Bot used to run commands on the VPS | No terminal/file tools on WhatsApp; allowlist; `SOUL.md` |
| Two WhatsApp bridges on one port | `whatsapp.bridge_port: 3001` before pairing |
| WhatsApp number restricted (unofficial bridge) | Dedicated number, allow-listed recipients who wrote first, group delivery, low volume |
| PDF cuts tables or hides tabs | Injected print stylesheet, phone check, report still sent without PDF |
| Chromium missing libraries | Detected in phase 2, operator installs apt packages |
| Quick command 30 s timeout | Launcher detaches and returns at once |
| Hermes update changes behaviour | Checks after every update (section 9) |
| Server clock not Jakarta | Hermes `timezone` + explicit zone in the CLI |
