# Plan: running the pipeline on a VPS without n8n

Status: **plan only, nothing implemented yet.**

Goal: the same three products (daily sales report, weekly financial pack,
`/aiconsult` consultant) delivered to the same Telegram chat, produced by a small
Node.js service on your own VPS instead of an n8n workflow. The numbers must match
what n8n produces today before n8n is switched off.

---

## 1. What n8n is doing for us today

Everything n8n provides has to be replaced by something explicit. This is the full
inventory, taken from `workflow/daily-financial-report.workflow.json`.

| n8n feature | Where it is used | Replacement on the VPS |
| --- | --- | --- |
| Schedule Trigger (cron, `Asia/Jakarta`) | `Jadwal Harian 07:00`, `Jadwal Mingguan Minggu 10:00` | `node-cron` inside the service with `timezone: 'Asia/Jakarta'` |
| Telegram Trigger (webhook) | `Telegram Trigger` | Telegram long polling (`getUpdates`), no public URL or TLS needed |
| Telegram send node (text + document) | 7 `Kirim ...` / `Konfirmasi` / `Balas` nodes | Small `telegram.js` client: `sendMessage`, `sendDocument` with a Buffer |
| OAuth2 credential with auto refresh | 6 Accurate HTTP nodes | Own token store + refresh logic (section 4.1) |
| HTTP Request pagination (`sp.page`, stop when `d` is empty, max 50 pages, 300 ms interval) | 4 Accurate list nodes | `paginate()` helper with the same rules |
| `retryOnFail` (3 tries) + `onError: continueRegularOutput` | 4 Accurate list nodes | `withRetry()` wrapper that returns an empty result instead of throwing |
| Google Sheets node (OAuth2, header row becomes object keys) | 4 Sheets nodes | `googleapis` with a service account + a converter that reproduces n8n's row shape exactly |
| LangChain Agent + OpenAI Chat Model (`gpt-5-mini`) | `AI Analis Finance`, `AI Konsultan` | Direct `openai` SDK call (the agents have no tools, so an agent loop is not needed) |
| Window Buffer Memory (6 turns, keyed on chat ID) | `Memori Konsultasi` | `chat_memory` table in SQLite |
| `$getWorkflowStaticData('global')` | `Hitung Laba Rugi & Neraca` (balance snapshots) | `kv_store` table in SQLite, seeded from the current n8n static data |
| Merge nodes (wait for all inputs) | 6 `Gabung ...` nodes | `await Promise.all([...])` |
| IF / Switch gates | 8 gates | Plain `if` statements driven by the mode flags |
| `$('Node Name')` cross-node reads | 7 Code nodes | Explicit function arguments |
| `$now` (Luxon) | `Siapkan Sesi dan Tanggal` | `luxon` package, same API |
| `$execution.mode` | `Hitung Laba Rugi & Neraca` (diagnostics only) | Constant `'production'` or `'manual'` from the CLI flag |
| Convert to File | 2 nodes | `Buffer.from(html, 'utf8')` |
| Execution log / retry UI | whole workflow | `runs` table in SQLite + structured logs (pino) |

The good news: about 4,000 of the ~4,500 meaningful lines are the Code nodes, and
they are already plain JavaScript. The n8n surface they touch is small:

- `$input.all()` / `$input.first()` in 11 nodes
- `$('Node Name')` in 7 nodes (`Tentukan Mode`, `Hitung Metrik Harian`,
  `Hitung Laba Rugi & Neraca`, `Hitung Penjualan MTD`, `Dashboard Finansial HTML`,
  `Siapkan Payload Konsultasi`, plus the candidate-name lookups in
  `Hitung Metrik Harian`)
- `$json` in `Baca Perintah`
- `$now` in `Siapkan Sesi dan Tanggal`
- `$getWorkflowStaticData` and `$execution` in `Hitung Laba Rugi & Neraca`

So the business logic ports almost unchanged. The real work is the integrations,
state, and proving parity.

---

## 2. Key decisions (recommended)

| Decision | Recommendation | Why |
| --- | --- | --- |
| Language | **Node.js 20+, plain JavaScript (ESM)** | The Code nodes are already JS. TypeScript can come later; converting 4,000 lines while also migrating doubles the risk. |
| Process model | **One long-running service** (bot + scheduler) plus a CLI for manual runs | The bot has to listen anyway; cron in the same process keeps one thing to deploy and monitor. |
| Telegram inbound | **Long polling** | No domain, reverse proxy or certificate required. Webhook can be added later if wanted. |
| Google auth | **Service account** (share both spreadsheets with its email) | No browser consent or token refresh on a headless server. |
| Accurate auth | **One-time OAuth2 authorization code flow via a CLI helper, then stored refresh token** | Accurate has no client-credentials flow; this mirrors what the n8n credential does. |
| State store | **SQLite** (`better-sqlite3`), single file | Holds snapshots, chat memory and run history. Easy to back up, no DB server. |
| LLM client | **`openai` SDK directly**, not LangChain | The two agents have no tools; they are a system prompt + user message + memory. |
| Deployment | **Docker Compose** (one container + a volume for `data/`) | Reproducible; systemd is a fine alternative (section 8). |
| Config | `.env` for secrets, `config/*.json` for spreadsheets, chat IDs, schedules | Adding a month becomes a config edit, same spirit as today's "add a node". |

---

## 3. Target project layout

```
app/
  package.json
  .env.example
  config/
    sources.json            spreadsheets + sheet names per period (replaces the 4 Sheets nodes)
    app.json                chat IDs, allow list, schedules, limits
  src/
    index.js                boot: load config, open DB, start bot + scheduler
    cli.js                  `node src/cli.js run sales|finance|consult "q"`, `auth accurate`, `import-static`
    pipeline/
      mode.js               from tentukan-mode.js: resolveMode({ trigger, command }) -> flags
      run.js                orchestrator: the whole workflow graph as one async function
      fetch-accurate.js     session + 4 list endpoints
      fetch-sheets.js       VS + META ADS readers
    logic/                  ported Code nodes, one file each, pure functions
      baca-perintah.js
      siapkan-sesi-dan-tanggal.js
      filter-item-category.js
      normalisasi-sales.js
      normalisasi-ads.js
      laporan-marketing.js
      hitung-metrik-harian.js
      pecah-pesan-sales.js
      dashboard-sales-html.js
      hitung-penjualan-mtd.js
      hitung-laba-rugi-neraca.js
      dashboard-finansial-html.js
      siapkan-payload-finance.js
      siapkan-payload-konsultasi.js
    clients/
      accurate.js           OAuth2 token refresh, open-db, paginate, retry
      sheets.js             googleapis + n8n-compatible row conversion
      openai.js             chat completion with system prompt + memory
      telegram.js           polling, sendMessage, sendDocument
    store/
      db.js                 SQLite schema + migrations
      kv.js                 replaces $getWorkflowStaticData
      memory.js             replaces Memori Konsultasi
    prompts/                copied from src/prompts
  test/
    fixtures/               real n8n execution inputs/outputs per node (git-ignored, see 6.1)
    parity/                 one test per ported node
  Dockerfile
  docker-compose.yml
```

`src/code-nodes/` and `workflow/` stay in the repo untouched until cutover, so the
n8n version can still be imported as a fallback.

---

## 4. Integration details

### 4.1 Accurate Online

1. **Token bootstrap (one time):** `node src/cli.js auth accurate` prints the
   authorize URL (`https://account.accurate.id/oauth/authorize` with client ID,
   scopes for item, sales invoice and GL account read, and a redirect URI). You open it,
   approve, paste back the `code`; the CLI exchanges it at
   `https://account.accurate.id/oauth/token` and saves `access_token`,
   `refresh_token` and expiry in SQLite.
2. **Refresh:** before each run, refresh if the token expires within 24 h; also
   refresh once and retry on a 401.
3. **Session:** `db-list.do` then `open-db.do?id=<d[0].id>` gives `host` +
   `session`, exactly as `Ambil Daftar Database` / `Buka Database Accurate` do.
   Throw if no host (same as `Siapkan Sesi dan Tanggal`).
4. **List calls:** port the query strings **verbatim** from the workflow JSON:

   | Call | `fields` | Filter |
   | --- | --- | --- |
   | Stok item | `id,no,name,itemType,quantity,availableToSell,unit1Name` | `itemType EQUAL INVENTORY` |
   | Invoice MTD | `id,number,transDate,totalAmount,statusName` | `transDate BETWEEN tglAwalBulan..tglKemarin` |
   | Invoice 30 hari | `id,transDate,detailItem` | `transDate BETWEEN tglAwalVelocity..tglKemarin` |
   | GL account | `id,no,name,accountType,balance` | none |

   All with `sp.pageSize=100`, `X-Session-ID` header, pagination until `d` is
   empty, max 50 pages, 300 ms between pages, 3 attempts, and on final failure
   return `[]` plus a warning (the `continueRegularOutput` behaviour).
5. **Output shape:** n8n pagination emits one item per page, each `{ s, d: [...] }`.
   The ported nodes read `i.json.d`, so `fetch-accurate.js` returns
   `pages.map(p => ({ json: p }))` for the first iteration to keep code unchanged.

Invoice MTD, 30-day invoices and stock run in parallel; GL runs after
`Hitung Penjualan MTD` only because n8n wired it that way. On the VPS it can run in
parallel too, since it does not depend on that output.

### 4.2 Google Sheets

- Service account JSON in `data/secrets/google-sa.json`, spreadsheets shared with
  its email as Viewer.
- `config/sources.json` lists each tab:
  ```json
  {
    "vs":  [{ "spreadsheetId": "...", "sheet": "VS", "label": "Juli" },
            { "spreadsheetId": "...", "sheet": "VS", "label": "Sept" }],
    "ads": [{ "spreadsheetId": "...", "sheet": "META ADS", "label": "Juli" },
            { "spreadsheetId": "...", "sheet": "META ADS", "label": "Sept" }]
  }
  ```
- **Highest parity risk in the whole migration.** The parsers depend on the exact
  object shape the n8n Sheets node produces: first row as keys, how blank and
  duplicate header cells are named, whether numbers arrive as numbers or formatted
  strings (the `6.502` problem in the engineering notes), empty trailing cells, and
  the `row_number` field. Plan:
  1. Capture raw n8n output of all 4 Sheets nodes from a real execution (6.1).
  2. Write `sheets.js` using `spreadsheets.values.get` with
     `valueRenderOption: 'UNFORMATTED_VALUE'` (or `FORMATTED_VALUE`, whichever
     matches the capture) and a `rowsToN8nItems()` converter.
  3. Unit test: converter output deep-equals the captured n8n output.
- VS tabs and ADS tabs are fetched as two separate arrays and passed to their own
  parser, keeping the "never mix VS and ADS" invariant.

### 4.3 OpenAI

- One `chat.completions.create` per agent: `model: 'gpt-5-mini'`, system prompt
  from `prompts/ai-analis-finance.md` or `prompts/ai-konsultan.md`, user message
  built exactly like the n8n `text` expression.
- **Memory:** before calling, load the last 6 exchanges for the chat ID from
  `chat_memory`, append the new user turn, then save both user and assistant turns.
  Only the consultant uses memory; the finance analyst does not.
- **Telegram HTML safety:** add a `sanitizeTelegramHtml()` step that keeps only
  `<b> <i> <code> <a href>` and closes unbalanced tags, then falls back to plain
  text if Telegram still rejects the message. Today this relies on the prompt alone.

### 4.4 Telegram

- Long polling with `getUpdates` (library: `grammy`, or ~80 lines of `fetch`).
- **Only one consumer per bot token.** While n8n's Telegram Trigger is active it
  holds a webhook, and `getUpdates` will fail with 409. See cutover (section 7).
- `Baca Perintah` logic runs on each update; allow list (`BATASI_KE_DAFTAR_IZIN`,
  `CHAT_DIIZINKAN`) moves to `config/app.json` and is **on by default**.
- Acknowledge (`Konfirmasi Terima`) is sent immediately, the pipeline runs in the
  background, and a per-chat lock prevents a second `/finance` from starting while
  one is running (new protection n8n did not have).
- Send order stays the same: chunked text messages sequentially, then the HTML
  document named `SalesHarianQudamah.html` / `LaporanFinansialQudamah.html`.
- Handle Telegram 429 (`retry_after`) and 400 parse errors (resend as plain text).

---

## 5. Porting the logic

### 5.1 Mode resolution becomes explicit

`Tentukan Mode` currently guesses which trigger fired by probing for a node name.
On the VPS the caller already knows:

```js
resolveMode({ trigger: 'schedule-daily' })          // -> jadwal-sales
resolveMode({ trigger: 'schedule-weekly' })         // -> jadwal-finance
resolveMode({ trigger: 'telegram', parsed })        // -> harian | finansial | konsultasi | lanjutan
```

The flag table in `docs/architecture.md` (`tarikData`, `prosesSales`, `kirimSales`,
`kirimFinansial`, `kirimKonsultasi`) is kept as is and becomes a unit test.

### 5.2 The orchestrator (`run.js`)

The 61-node graph collapses to roughly this:

```js
async function run(flags, ctx) {
  if (!flags.tarikData) return answerFollowUp(flags, ctx);        // lanjutan fast path

  const sesi = await accurate.openSession();
  const tgl  = siapkanSesiDanTanggal(sesi, ctx.now);

  const [invMtd, inv30, stokRaw, glRaw, vsRows, adsRows] = await Promise.all([
    accurate.list('sales-invoice', mtdQuery(tgl)),
    accurate.list('sales-invoice', velocityQuery(tgl)),
    accurate.list('item', stokQuery),
    accurate.list('glaccount', glQuery),
    sheets.read(sources.vs),
    sheets.read(sources.ads),
  ]);

  const stok      = filterItemCategory(stokRaw);
  const sales     = normalisasiSales(vsRows, ctx.now);
  const ads       = normalisasiAds(adsRows);
  const marketing = laporanMarketing([sales, ads]);

  // finance always computed (keeps the daily snapshot alive)
  const mtd = hitungPenjualanMtd(invMtd, tgl);
  const fin = hitungLabaRugiNeraca(glRaw, { tgl, mtd, kv: ctx.kv, mode: ctx.execMode });

  let metrik = null;
  if (flags.prosesSales) {
    metrik = hitungMetrikHarian({ tgl, invMtd, inv30, stok, sales, ads, marketing });
    const html = dashboardSalesHtml({ ...same inputs });
    if (flags.kirimSales) await sendSales(flags.chatId, pecahPesanSales(metrik), html);
  }
  if (flags.kirimFinansial) await sendFinance(flags.chatId, fin, ctx);
  if (flags.kirimKonsultasi) await answerConsult(flags, { metrik, fin }, ctx);
}
```

The merges and IF gates disappear; the "wait for both sales and P&L" guarantee of
`Gabung Konteks Konsultasi` becomes simple sequential code.

### 5.3 Porting each Code node

Two-step approach so behaviour is proven before anything is refactored:

1. **Wrap, do not rewrite.** Each `src/code-nodes/*.js` body goes into a function
   that receives a tiny shim:
   ```js
   export function hitungPenjualanMtd({ $input, $ }) { /* original body, unchanged */ }
   ```
   where `$input.all()` returns `[{ json }]` and `$('Name').all()/first()` looks up
   named results passed in by `run.js`. Parity tests (6.1) must pass at this stage.
2. **Then clean up** node by node: replace the shim with real parameters, delete
   the candidate-name lookups in `Hitung Metrik Harian` (no longer needed), delete
   the trigger-name probe in `Tentukan Mode`. Re-run parity after each file.

Specific notes:

| Node | Change needed |
| --- | --- |
| `siapkan-sesi-dan-tanggal` | `$now` becomes `DateTime.now()` from `luxon`; inject `now` so tests can freeze the date. |
| `hitung-laba-rugi-neraca` | `$getWorkflowStaticData('global')` becomes `kv.get('global')`, and the object is written back with `kv.set` **only at the end of a successful production run** (same as n8n's "persist only on production"). Manual CLI runs use `--dry-state` and do not write. |
| `hitung-metrik-harian` | The multi-name `$(n)` lookups become explicit arguments. |
| `baca-perintah` | `$json` becomes the Telegram `update` argument. |
| `siapkan-payload-konsultasi` | The `try/catch` around missing upstream nodes becomes `metrik ?? null`, `fin ?? null`. Keep the 14,000-character truncation note. |
| Dashboards | No change; output a string, wrap in Buffer. |
| Chart of accounts mapping | Move the account-number tables from `hitung-laba-rugi-neraca` into `config/coa-mapping.json` so a new company file needs no code edit (optional, after parity). |

---

## 6. Testing and parity

### 6.1 Capture real fixtures from n8n (do this first)

Before writing code, export 3 to 5 real production executions from n8n (one daily,
one weekly, one `/aiconsult`) with "Save execution data" on. From each execution
extract, per node, the input items and output items into
`app/test/fixtures/<date>/<node>.json`. These contain real revenue and balances, so:
**`test/fixtures/` is git-ignored and never pushed**, matching the repository's
"pipeline, not data" rule.

### 6.2 Test layers

| Layer | What it proves |
| --- | --- |
| Parity per node | For every ported function: fixture input in, deep-equal to fixture output (with `now` frozen to the execution date). |
| Mode table | All 6 modes produce the documented flags. |
| Sheets converter | API rows converted to n8n item shape equal the captured Sheets node output. |
| Accurate pagination | Mocked HTTP: stops on empty `d`, respects 50-page cap, retries 3 times, degrades to `[]`. |
| Telegram chunking | Messages over 3,800 chars split exactly as `Pecah Pesan Sales` does. |
| End to end (dry run) | `node src/cli.js run sales --dry` fetches live data and writes the message + HTML to `data/out/` instead of Telegram. |

### 6.3 Shadow run

Point the VPS at a **separate test bot and test chat** and let the schedules run
alongside n8n for 7 days, including one Sunday. Compare each day:
the text report, both HTML files (diff), and the `diagnostikNeraca` block.

---

## 7. State migration and cutover

1. **Export snapshots.** The balance snapshots in n8n static data
   (`snapshotAkun`, `snapshotAwal`, up to 14 months each) are what make month-to-date
   finance numbers work. Fetch them with the n8n public API
   (`GET /api/v1/workflows/<id>`, field `staticData`) or from the n8n database
   (`workflow_entity.staticData`) and import with
   `node src/cli.js import-static staticData.json`. Without this step the first month
   on the VPS has no baseline and the P&L is marked `layakDilaporkan: false`.
2. **Chat memory** is not migrated (6-turn window; losing it is harmless).
3. **Shadow week** as in 6.3.
4. **Switch day:**
   1. Deactivate the n8n workflow (removes its Telegram webhook and schedules).
   2. Call `deleteWebhook` on the production bot to be sure.
   3. Re-export n8n static data one last time and re-import it (it kept updating
      during the shadow week).
   4. Change `.env` to the production bot token and chat ID, restart.
   5. Send `/sales` and `/finance` manually and check the output.
5. **Rollback:** stop the container, re-activate the n8n workflow. Nothing on the
   n8n side was deleted, so rollback takes under 5 minutes. Keep n8n installed for
   at least one month.

---

## 8. VPS deployment

- **Sizing:** 1 vCPU, 1 GB RAM is plenty (the heaviest job is a few thousand
  invoices in memory).
- **Runtime:** Docker Compose, `restart: unless-stopped`, one volume `./data`
  holding `app.db`, `secrets/`, `out/`, `logs/`. Container `TZ=Asia/Jakarta`.
  Alternative without Docker: Node 20 + a systemd unit with `Restart=always`.
- **Secrets (`.env`, mode 600, never committed):** `ACCURATE_CLIENT_ID`,
  `ACCURATE_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`,
  `GOOGLE_SA_PATH`, `DEFAULT_CHAT_ID`, `ALLOWED_CHAT_IDS`.
- **No inbound ports** needed thanks to long polling. Firewall: allow SSH only.
- **Backups:** daily `sqlite3 app.db ".backup"` to a second location (the snapshots
  in it cannot be recreated because the GL endpoint has no date filter).
- **Monitoring:**
  - Every run writes a row to `runs` (mode, trigger, start, end, status, warnings).
  - Any failed run, or a scheduled run that did not happen by 07:15 / Sunday 10:15,
    sends an alert to an admin Telegram chat.
  - Optional: a healthchecks.io ping after each successful scheduled run.
- **Updates:** `git pull && docker compose up -d --build`.

---

## 9. Phases and effort

| # | Phase | Output | Estimate |
| --- | --- | --- | --- |
| 0 | Capture fixtures + static data from n8n | `test/fixtures/`, `staticData.json` | 0.5 day |
| 1 | Skeleton: project, config, SQLite, logging, CLI | `app/` runs `--help` | 0.5 day |
| 2 | Clients: Accurate (auth, session, paginate), Sheets, Telegram, OpenAI | Each callable from the CLI | 2 days |
| 3 | Port the 15 Code nodes behind the shim + parity tests green | `logic/`, `test/parity/` | 2 days |
| 4 | Orchestrator, mode resolution, memory, locks | `run.js` works in `--dry` mode | 1 day |
| 5 | Deploy to VPS, alerts, backups | Service running on test bot | 0.5 day |
| 6 | Shadow week | Daily diff log, fixes | 7 days elapsed, ~1 day work |
| 7 | Cutover | n8n off, VPS live | 0.5 day |
| 8 | Cleanup (remove shim, COA mapping to config, update README/docs) | Final docs | 1 day |

Roughly **8 to 9 working days** of effort plus the shadow week.

---

## 10. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Sheets row shape differs from n8n (header naming, number formatting) | Silent wrong totals | Converter tested against captured n8n output (4.2) |
| Losing the GL balance snapshots | No MTD P&L for a month | Import static data twice (7.1, 7.4.3), daily DB backups |
| Accurate refresh token expires or is revoked | All reports empty | Alert on auth failure with the exact `cli auth accurate` fix |
| Bot token used by n8n and VPS at once | 409 errors, missed commands | Separate test bot during shadow; `deleteWebhook` at cutover |
| Timezone drift (server in UTC) | Report for the wrong day | `TZ=Asia/Jakarta` in container **and** explicit zone in cron and Luxon |
| Behavioural drift while cleaning up the shim | Subtle number changes | Parity tests re-run after every cleanup commit |
| Weekly schedule day | Finance pack on the wrong day | The n8n node uses the weekly default (Sunday); confirm in the n8n UI before hardcoding `0 10 * * 0` |

---

## 11. Open questions for you

1. **Docker or plain systemd** on the VPS? (Plan assumes Docker.)
2. **Which OS / provider** is the VPS? Affects the setup script only.
3. Do you have access to the **n8n executions and static data** for fixture capture
   (n8n API key or database access)?
4. Keep **`gpt-5-mini`**, or switch model while migrating? (Recommendation: keep it
   until parity is signed off, change afterwards.)
5. Should the new code live in **this repo under `app/`** (recommended) or a new repo?
6. Any extras you want once it is off n8n, e.g. a small web page to view past
   dashboards, or storing each day's metrics for history?
