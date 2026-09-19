# Architecture

61 nodes, one workflow, three entry points, two report products and one
conversational agent. This document explains how execution flows and why the
boundaries sit where they do.

---

## 1. Entry points and the mode resolver

| Entry point | Node | Fires |
| --- | --- | --- |
| Daily schedule | `Jadwal Harian 07:00` (`0 0 7 * * *`) | Daily operations report |
| Weekly schedule | `Jadwal Mingguan Minggu 10:00` (weekly, 10:00) | Financial pack |
| Telegram | `Telegram Trigger` → `Baca Perintah` → `Rute Perintah` | Command or follow-up |

All three converge on **`Tentukan Mode`** — the single source of truth. It resolves
one of five modes and emits the flags every downstream gate reads:

| Mode | Set by | `tarikData` | `prosesSales` | `kirimSales` | `kirimFinansial` | `kirimKonsultasi` |
| --- | --- | --- | --- | --- | --- | --- |
| `jadwal-sales` | Daily schedule | ✅ | ✅ | ✅ | — | — |
| `jadwal-finance` | Weekly schedule | ✅ | ✅ | — | ✅ | — |
| `harian` | `/sales` | ✅ | ✅ | ✅ | — | — |
| `finansial` | `/finance` | ✅ | ✅ | — | ✅ | — |
| `konsultasi` | `/aiconsult <q>` | ✅ | ✅ | — | — | ✅ |
| `lanjutan` | Plain text reply | — | — | — | — | ✅ |

Because n8n does not tell a Code node which trigger woke the execution,
`Tentukan Mode` probes for the finance schedule node by name inside a `try/catch`
and falls back to the daily schedule. The node name is held in the constant
`NODE_JADWAL_FINANCE` — renaming the trigger on the canvas without updating that
constant makes every scheduled run look like a daily run.

### Why compute and send are separate flags

`prosesSales` decides whether metrics are **calculated**. `kirimSales` decides
whether they are **delivered**. They are distinct because `/aiconsult` needs the
sales branch to run so the consultant agent has context, but must not spray the
daily report into the chat while doing so. The same applies on the finance side:
the P&L branch runs on every execution so the daily balance snapshot keeps
accumulating, and only `Kirim Finance?` holds delivery back.

### Two early gates

- **`Perlu Tarik Data?`** — false only in `lanjutan` mode. A plain-text follow-up is
  answered from conversation memory, so the entire data-fetch layer is skipped and
  the reply takes seconds instead of a minute.
- **`Jalur Lanjutan?`** — the fast path that routes a follow-up straight to
  `Siapkan Payload Konsultasi` and the agent.

---

## 2. Data sources

### Accurate Online

```
Ambil Daftar Database  (db-list.do)
        ↓
Buka Database Accurate (open-db.do)   → host + session
        ↓
Siapkan Sesi dan Tanggal              → normalised host, session, date set
        ↓
   ┌────────────────┬──────────────────────┬────────────────┐
item/list.do   sales-invoice/list.do   sales-invoice/list.do   glaccount/list.do
 (stock)         (MTD)                  (30-day detail)         (chart of accounts)
```

The session is opened **once** and shared by the sales and finance branches — the
`db-list` / `open-db` chain is never duplicated. `Siapkan Sesi dan Tanggal` emits
both `dd/MM/yyyy` (what Accurate requires) and `yyyy-MM-dd` (what Sheets tends to
produce) plus `hariBerjalan` / `hariDalamBulan`, so no downstream node has to guess
a format or recompute a period.

`Accurate Sales Invoice MTD` feeds two branches — the sales report and the finance
calculation. Its query must include `statusName`; without it, cancelled invoices
are counted as revenue.

### Google Sheets

Two spreadsheets (one per period), two sheet types:

| Sheet | Nodes | Parser |
| --- | --- | --- |
| `VS` — sales tracker | `Sheet VS Juli`, `Sheet VS Sept` → `Gabung Sheet VS` | `Normalisasi Sales` |
| `META ADS` — ad tracker | `Meta ads Juli`, `Sheet Meta ads Sept1` → `Gabung Sheet Ads` | `Normalisasi Ads` |

The two streams stay separate all the way to their parsers. Each parser only ever
receives its own sheet type. `Laporan Marketing` then consumes the **merged
normalised output** (tagged with `_source: 'sales' | 'ads'`), never raw sheet rows.

**Adding a new month is a canvas operation, not a code change:** add a Sheets node,
wire it into the matching merge, increase that merge's input count. `Normalisasi
Sales` fingerprints each row by the set of `DATA PENJUALAN <MONTH> <YEAR>` block
headers it carries and groups rows per source sheet before reading column blocks —
which is what stops September rows from being read through July's column map.

---

## 3. The daily operations report

```
Gabung Semua Sumber Sales (4 inputs: MTD invoices, 30-day detail,
                           categorised stock, normalised sheets)
        ↓
   Proses Sales?
        ├─→ Hitung Metrik Harian ─→ Pecah Pesan Sales ─→ Kirim Laporan Sales?  ─→ Telegram (text)
        │            └─────────────────────────────────→ Gabung Konteks Konsultasi
        └─→ Dashboard Sales HTML ─→ Kirim Dashboard Sales? ─→ File ─→ Telegram (document)
```

`Hitung Metrik Harian` (~680 lines) is the operational core: month-to-date and
comparable-period revenue, running rate against target, day-of-week patterns,
invoice-value distribution, per-line SKU availability, and the cross-check that
flags product lines carrying ad spend while most of their SKUs are out of stock.
It resolves its inputs by trying a list of candidate node names, so upstream
renames degrade quietly instead of throwing.

`Dashboard Sales HTML` renders a single self-contained HTML file — tabs built from
radio inputs and CSS only, because Telegram's built-in document viewer does not run
JavaScript.

---

## 4. The weekly financial pack

```
Accurate Sales Invoice MTD ─→ Hitung Penjualan MTD ─→ Accurate GL Account List
                                                             ↓
                                              Hitung Laba Rugi & Neraca
                                                             ↓
                                                     Kirim Finance?
                                     ┌───────────────────────┴───────────────────┐
                          Dashboard Finansial HTML                   Siapkan Payload Finance
                                     ↓                                           ↓
                            File ─→ Telegram (document)              AI Analis Finance ─→ Telegram (text)
```

`Hitung Penjualan MTD` exists because `glaccount/list.do` has **no date filter**.
It derives current-month volume straight from dated invoices, deduplicating by `id`
and excluding anything matching `/batal|void|cancel/i` on `statusName`, giving the
finance node a month-to-date figure that does not depend on a prior-month baseline.

`Hitung Laba Rugi & Neraca` (~740 lines) builds the P&L and balance sheet by summing
**leaf** GL accounts rather than parent balances, maps revenue, platform fees,
commissions, shipping and marketplace wallets per sales channel, and emits a
`diagnostikNeraca` block: balance-sheet identity difference, unmapped accounts with
balances, a leaf-vs-mapping reconciliation, and a `penyusutanNol` flag for when no
depreciation has been posted at all. A month whose window is too short, or whose
revenue has not moved while invoices clearly exist, is marked
`layakDilaporkan: false` and simply is not rendered as a P&L.

`Siapkan Payload Finance` serialises that structure with `dataQuality` placed
**first**, so the model reads the caveats before the numbers.

---

## 5. The AI consultant

```
Hitung Metrik Harian ─┐
                      ├─→ Gabung Konteks Konsultasi ─→ Konsultasi Diminta? ─┐
Hitung Laba Rugi ─────┘                                                     ├─→ Siapkan Payload Konsultasi
Jalur Lanjutan? ────────────────────────────────────────────────────────────┘             ↓
                                                                              AI Konsultan (+ memory) ─→ Telegram
```

`Gabung Konteks Konsultasi` waits for **both** the sales metrics and the P&L before
the agent runs. Without that merge, n8n's execution order decides which context
exists, and the sales side can arrive empty with no error.

`Siapkan Payload Konsultasi` reads both upstream nodes inside `try/catch`, because
on the `lanjutan` path neither of them executed. It also truncates the sales blob at
14,000 characters and says so in the payload rather than silently dropping data.

`Memori Konsultasi` is a window-buffer memory keyed on the Telegram chat ID with a
6-turn window, so follow-ups stay scoped per chat.

Both agents share one `OpenAI Chat Model` node (`gpt-5-mini`).

---

## 6. Delivery

| Node | Kind |
| --- | --- |
| `Kirim Laporan Sales Harian` | Text, chunked by `Pecah Pesan Sales` |
| `Kirim Dashboard Sales Harian` | HTML document |
| `Kirim Analisis Finance` | Text, AI narrative, `parse_mode: HTML` |
| `Kirim Dashboard Finansial` | HTML document |
| `Kirim Jawaban Konsultasi` | Text, AI answer, `parse_mode: HTML` |
| `Konfirmasi Terima` | Immediate "working on it" acknowledgement |
| `Balas Perintah Tidak Dikenal` | Command help |

Scheduled runs deliver to the default chat ID constant; command-triggered runs
reply to whichever chat sent the command.

---

## 7. Resilience

- Accurate HTTP nodes: `onError: continueRegularOutput`, `retryOnFail: true`,
  `maxTries: 3` — one dead endpoint degrades a section instead of killing the run.
- Every report section has a fallback branch that prints *why* a value is missing.
- `Siapkan Sesi dan Tanggal` throws loudly if `open-db.do` returns no host, since
  everything downstream is meaningless without it.
- `Baca Perintah` ignores non-text updates (stickers, photos, locations) outright.
