# Node reference

All 61 nodes, grouped by role. Node names are Indonesian, as written for
Qudamah's team; the English column is a gloss, not a rename.

Code nodes link to their extracted JavaScript under [`src/code-nodes/`](../src/code-nodes).

---

## Triggers and routing (7)

| Node | English | Type | Role |
| --- | --- | --- | --- |
| `Jadwal Harian 07:00` | Daily schedule 07:00 | Schedule | Cron `0 0 7 * * *`, Asia/Jakarta. Fires the daily operations report. |
| `Jadwal Mingguan Minggu 10:00` | Weekly schedule Sunday 10:00 | Schedule | Weekly at 10:00. Fires the financial pack. |
| `Telegram Trigger` | — | Telegram Trigger | Listens for `message` updates. |
| [`Baca Perintah`](../src/code-nodes/baca-perintah.js) | Read command | Code | Parses the update into a mode. Strips `@BotName` from group commands, separates commands from plain-text follow-ups, ignores non-text updates. Holds the `BATASI_KE_DAFTAR_IZIN` allow-list switch. |
| `Rute Perintah` | Route command | Switch | Three outputs: `ok` → acknowledge, unknown command → help text, follow-up → straight to mode resolution. |
| `Konfirmasi Terima` | Acknowledge | Telegram | "Working on it, about a minute." Sent before the slow path starts. |
| `Balas Perintah Tidak Dikenal` | Unknown command reply | Telegram | Lists `/sales`, `/finance`, `/aiconsult`. |

---

## Mode resolution and gates (7)

| Node | English | Type | Role |
| --- | --- | --- | --- |
| [`Tentukan Mode`](../src/code-nodes/tentukan-mode.js) | Determine mode | Code | The single decision point. Resolves the mode and emits `tarikData`, `prosesSales`, `kirimSales`, `kirimFinansial`, `kirimKonsultasi`, `chatId`. |
| `Perlu Tarik Data?` | Need to fetch data? | IF | Skips the entire fetch layer for `lanjutan` follow-ups. |
| `Jalur Lanjutan?` | Follow-up path? | IF | Fast path from a plain-text reply to the consultant agent. |
| `Proses Sales?` | Process sales? | IF | Gates **computation** of the sales branch. |
| `Kirim Laporan Sales?` | Send sales report? | IF | Gates **delivery** of the sales text. |
| `Kirim Dashboard Sales?` | Send sales dashboard? | IF | Gates delivery of the sales HTML file. |
| `Kirim Finance?` | Send finance? | IF | Gates delivery of the financial pack. Calculations upstream always run. |

---

## Accurate Online data layer (6)

| Node | Endpoint | Notes |
| --- | --- | --- |
| `Ambil Daftar Database` | `account.accurate.id/api/db-list.do` | Lists company files available to the token. |
| `Buka Database Accurate` | `account.accurate.id/api/open-db.do` | Returns the tenant `host` and `session`. |
| [`Siapkan Sesi dan Tanggal`](../src/code-nodes/siapkan-sesi-dan-tanggal.js) | — | Normalises host, extracts the session, and emits the whole date set in both `dd/MM/yyyy` and `yyyy-MM-dd`, plus `hariBerjalan`, `hariDalamBulan` and Indonesian date labels. Throws if no host. |
| `Accurate Stok Item` | `{host}/accurate/api/item/list.do` | Full item list with stock. Paginated. |
| `Accurate Sales Invoice MTD` | `{host}/accurate/api/sales-invoice/list.do` | Month-to-date invoices. `statusName` is mandatory in the field list. Feeds both the sales and finance branches. |
| `Accurate Invoice 30 Hari Detail` | `{host}/accurate/api/sales-invoice/list.do` | Rolling 30-day window for velocity analysis. |
| `Accurate GL Account List` | `{host}/accurate/api/glaccount/list.do` | Chart of accounts with balances. No date filter — see [engineering notes](engineering-notes.md). |

All four tenant endpoints run with `onError: continueRegularOutput`,
`retryOnFail: true`, `maxTries: 3`.

---

## Google Sheets data layer (6)

| Node | Type | Role |
| --- | --- | --- |
| `Sheet VS Juli` | Google Sheets | Sales tracker, period 1. |
| `Sheet VS Sept` | Google Sheets | Sales tracker, period 2 (different spreadsheet, own column numbering). |
| `Meta ads Juli` | Google Sheets | Meta Ads tracker, period 1. |
| `Sheet Meta ads Sept1` | Google Sheets | Meta Ads tracker, period 2. |
| `Gabung Sheet VS` | Merge | Collects all sales-tracker sheets. |
| `Gabung Sheet Ads` | Merge | Collects all ad-tracker sheets. |

---

## Parsing and normalisation (5)

| Node | English | Role |
| --- | --- | --- |
| [`Normalisasi Sales`](../src/code-nodes/normalisasi-sales.js) | Normalise sales | Fingerprints each row by its `DATA PENJUALAN <MONTH> <YEAR>` block headers, groups rows per source sheet, then reads each block by column order. Emits `{_source:'sales', bulanBerjalan, bulanSebelumnya, tahunLalu}`. Current month is picked from today's date, so new blocks need no code change. |
| [`Normalisasi Ads`](../src/code-nodes/normalisasi-ads.js) | Normalise ads | Parses per-campaign daily rows, splits `Ahsan \| 24 Juli \| Instagram` campaign names into product and objective, forward-fills dates within campaign groups, and repairs Indonesian thousands separators misread as decimals. Emits `{_source:'ads', iklan, linktreeHarian, leadsWa}`. |
| [`Filter Item Category`](../src/code-nodes/filter-item-category.js) | — | `item/list.do` ignores the `fields` parameter and omits `itemCategory`, so category is recovered from the product name. Emits two levels: `brandItem` (always the product line) and `kategoriItem` (full category when matched). Longest categories are tested first so `JUMBO Ghazwan Panjang` wins over `Ghazwan Panjang`; variant words (`JUMBO`, `Slimfit`, `Kurta`, `Kemko`) are not line markers; `NAHLA` is aliased onto `SHABRINA` so one line is not split in two. Logs a frequency table of rejected rows. |
| [`Laporan Marketing`](../src/code-nodes/laporan-marketing.js) | Marketing report | Consumes the merged normalised output, selects by `_source`, and builds the marketing section: spend, ROAS, CPM/CPC, WhatsApp leads, follower growth, with month-over-month and year-over-year deltas. |
| `Gabung Normalisasi` | Merge | Feeds `Laporan Marketing` with both normalised streams. |

---

## Sales computation and output (6)

| Node | English | Role |
| --- | --- | --- |
| `Gabung Semua Sumber Sales` | Merge all sales sources | 4 inputs: MTD invoices, 30-day detail, categorised stock, normalised sheets. |
| `Gabung Sheet Ternormalisasi` | Merge normalised sheets | 3 inputs into the merge above. |
| [`Hitung Metrik Harian`](../src/code-nodes/hitung-metrik-harian.js) | Compute daily metrics | ~680 lines. Revenue MTD and comparable period, running rate vs target, day-of-week pattern, invoice-value distribution, per-line SKU availability, and the ad-spend-vs-stock-vacancy cross-check. Resolves inputs from candidate node-name lists. Never emits a bare zero — a missing value carries its reason. |
| [`Pecah Pesan Sales`](../src/code-nodes/pecah-pesan-sales.js) | Split sales message | Chunks the report at 3,800 characters on paragraph → line → hard-cut boundaries and appends `(1/3)` markers. |
| [`Dashboard Sales HTML`](../src/code-nodes/dashboard-sales-html.js) | — | ~760 lines. Self-contained HTML dashboard: radio+CSS tabs (no JavaScript), inline styles, no CDN. |
| `File Dashboard Sales` | Convert to File | Turns the HTML string into a binary attachment. |

---

## Finance computation and output (6)

| Node | English | Role |
| --- | --- | --- |
| [`Hitung Penjualan MTD`](../src/code-nodes/hitung-penjualan-mtd.js) | Compute MTD sales | Baseline-free month-to-date revenue from dated invoices. Deduplicates by `id`, excludes cancelled invoices, reports both counts and an explicit caveat that the figure is gross. |
| [`Hitung Laba Rugi & Neraca`](../src/code-nodes/hitung-laba-rugi-neraca.js) | Compute P&L and balance sheet | ~740 lines, v9. Leaf-account totals, per-channel revenue / platform fee / affiliate commission / shipping / marketplace wallet mapping across Shopee Afghan, Shopee Qudamah, Tiktok, Lazada and Desty Store, monthly and annual views, liquidity ratios, and a `diagnostikNeraca` block (identity difference, unmapped accounts, leaf-vs-mapping reconciliation, `penyusutanNol`). Marks unreliable windows `layakDilaporkan: false`. |
| [`Siapkan Payload Finance`](../src/code-nodes/siapkan-payload-finance.js) | Prepare finance payload | Serialises the finance structure for the model with `dataQuality` first. |
| [`Dashboard Finansial HTML`](../src/code-nodes/dashboard-finansial-html.js) | — | ~570 lines, v4. Renders the P&L block only when `layakDilaporkan`, separates core sales from other income, splits operating expense into ads and the rest, hides liquidity ratios when meaningless, surfaces unposted depreciation as a warning. |
| `File Dashboard Finansial` | Convert to File | HTML → binary attachment. |
| `AI Analis Finance` | Finance analyst agent | LangChain agent. Prompt: [`src/prompts/ai-analis-finance.md`](../src/prompts/ai-analis-finance.md). |

---

## AI consultant (5)

| Node | English | Role |
| --- | --- | --- |
| `Gabung Konteks Konsultasi` | Merge consultation context | Waits for both sales metrics and P&L so the agent always has both sides. |
| `Konsultasi Diminta?` | Consultation requested? | IF gate on `kirimKonsultasi`. |
| [`Siapkan Payload Konsultasi`](../src/code-nodes/siapkan-payload-konsultasi.js) | Prepare consultation payload | Reads both context nodes in `try/catch` (neither ran on the follow-up path), truncates the sales blob at 14,000 characters and declares the truncation. |
| `AI Konsultan` | Consultant agent | LangChain agent. Prompt: [`src/prompts/ai-konsultan.md`](../src/prompts/ai-konsultan.md). |
| `Memori Konsultasi` | Consultation memory | Window buffer, 6 turns, keyed on Telegram chat ID. |
| `OpenAI Chat Model` | — | `gpt-5-mini`, shared by both agents. |

---

## Telegram delivery (5)

| Node | Sends |
| --- | --- |
| `Kirim Laporan Sales Harian` | Daily sales text (one message per chunk) |
| `Kirim Dashboard Sales Harian` | Sales dashboard HTML document |
| `Kirim Analisis Finance` | Finance narrative, `parse_mode: HTML` |
| `Kirim Dashboard Finansial` | Financial dashboard HTML document |
| `Kirim Jawaban Konsultasi` | Consultant answer, `parse_mode: HTML` |

---

## Canvas documentation (6 sticky notes)

`Catatan 1 Pemicu` (triggers and router), `Catatan 2 Accurate`, `Catatan 3 Sheets`,
`Catatan 4 Sales`, `Catatan 5 Finance`, `Catatan 6 Konsultan`. Each states the
invariant for its section — for example, that the `db-list`/`open-db` chain must not
be duplicated, that the VS and ADS streams must never be re-merged into one parser,
and that removing `Kirim Finance?` would make the financial pack go out on `/sales`.
