# Engineering notes

Constraints discovered while building this, and the decisions they forced. Most of
these cost real debugging time.

---

## Accurate Online API

**`glaccount/list.do` has no date filter.**
It returns current balances only. Month-to-date movement therefore has to be
derived from balance snapshots stored between runs, which is why the finance branch
runs on every execution and why `Hitung Penjualan MTD` exists as a baseline-free
cross-check built from dated invoices.

**`sales-invoice/list.do` ignores `fields=detailItem`.**
Line-item detail cannot be requested on the list endpoint. Anything needing
per-item granularity has to come from `item/list.do` or per-invoice detail calls.

**`item/list.do` may omit `itemCategory` entirely.**
The `fields` parameter is ignored there too. Two options remain: look up category
IDs via `item-category/list.do`, or recover the category from the product name.
This workflow does the latter in `Filter Item Category`, with longest-match-first
ordering and an explicit variant-word exclusion list, because name-prefix matching
alone is fragile (`JUMBO Ghazwan Panjang` would otherwise match `Ghazwan Panjang`).

**Pagination is uniform.**
Every list endpoint pages via `sp.page`, incremented by `$pageCount + 1`, and
finishes when `d` comes back as an empty array.

**The host is not fixed.**
It comes out of the `open-db.do` response and can appear as `d.host` or as
`response.host` depending on the shape returned. `Siapkan Sesi dan Tanggal` handles
both and throws if neither is present, because every downstream call is meaningless
without it.

**Dates must be `dd/MM/yyyy`.**
Google Sheets tends to produce `yyyy-MM-dd`. Rather than let each node guess, the
date node emits both formats plus ISO variants.

**Cancelled invoices look like revenue.**
`statusName` must be in the query field list, and cancelled rows filtered with
`/batal|void|cancel/i`. Leaving it out inflates revenue with voided invoices.

**One failed endpoint should not kill a report.**
All tenant endpoints run `onError: continueRegularOutput` with `retryOnFail: true`,
`maxTries: 3`.

---

## Accounting logic

**Parent GL balances are not the sum of their children.**
Accurate's parent `6000` balance excluded leaf account `600049` Owner Draw. Totalling on
parents understated operating expense by IDR 256 M, overstated net profit
by the same amount, and left the balance sheet out of balance. Switching all P&L
totals to a sum over **leaf** accounts closed the accounting identity to zero.
`diagnostikNeraca.rekonsiliasiMappingVsLeaf` now reports the gap on every run so the
regression cannot come back unnoticed.

**Unmapped accounts must be visible, not dropped.**
Any account with a balance that is not in the mapping table is reported in
`akunTidakDikenal` with its total. A new account added in Accurate shows up as a
diagnostic rather than as a silent hole in the P&L.

**A short window is not a P&L.**
If the baseline window covers only a few days, or revenue has not moved while
invoices clearly exist, the month is marked `layakDilaporkan: false` and the
dashboard renders no P&L block. Showing journal ripples as a monthly result is
worse than showing nothing.

**Unposted depreciation inflates profit.**
`penyusutanNol` flags that no depreciation has been posted at all, and both the
dashboard and the AI prompt surface it as a caveat. The agents are instructed to
look for delayed expense postings that make a month's margin look better than it is.

---

## n8n

**`$getWorkflowStaticData` only persists on production executions.**
The workflow must be active. Manual test runs read static data but never commit it,
so a baseline built only through testing stays empty forever.

**A Code node cannot ask which trigger fired.**
`Tentukan Mode` probes for the finance schedule node by name inside a `try/catch`.
The name lives in a constant; renaming the node on the canvas without updating the
constant makes every scheduled run resolve as a daily run.

**Code nodes do not evaluate n8n expressions inside strings.**
A chat ID written as an expression in a Code node becomes the literal text of that
expression. It has to be a quoted digit string.

**Duplicate nodes are easy to create and hard to see.**
Two versions of the same node can sit on the canvas with only one wired in. Always
confirm which one is actually on the execution path before debugging its output.

**Merge nodes are how you make execution order deterministic.**
`Gabung Konteks Konsultasi` exists purely so the consultant agent cannot start
before both context branches finish. Without it, whichever branch happens to
complete first wins and the other context arrives empty — with no error.

**MCP access is a per-workflow setting.**
A workflow must have "Available in MCP" enabled before its node contents are
readable through the MCP server. Sequence: find the workflow, enable access,
re-fetch.

---

## Telegram

**The HTML parser is strict and unforgiving.**
A single malformed closing tag (`</b)`) rejects the entire message. Only `<b>`,
`<i>`, `<code>` and `<a href="...">` are safely supported, so both AI system prompts
restrict the model's output to exactly those four tags rather than trusting it to
produce valid HTML.

**4,096 characters is a hard limit.**
`Pecah Pesan Sales` cuts at 3,800 to leave room for part markers, and prefers
paragraph boundaries, then line boundaries, and only hard-cuts a single line that is
genuinely longer than the limit.

**The in-app document viewer does not run JavaScript.**
Both HTML dashboards use radio inputs plus CSS sibling selectors for tab
navigation, with no external libraries and no CDN, so one file renders identically
in Telegram, a browser and a PDF print.

**Group commands carry the bot name.**
Telegram sends `/sales@BotName` in groups, so the parser truncates at `@`.

---

## Google Sheets

**Three side-by-side period blocks per sales sheet.**
Each block is headed `DATA PENJUALAN <MONTH> <YEAR>` with seven metric columns
after it, read by column offset from the header position.

**Each period lives in a different spreadsheet with its own column numbering.**
This is the subtle one: without grouping rows by source sheet first, September rows
are read through July's column map and the numbers are quietly wrong — no error, no
empty cell, just incorrect totals. `Normalisasi Sales` fingerprints each row by the
set of block headers it carries and maps columns per group.

**The ad sheet changes schema mid-sheet.**
A repeated header row partway down signals the new layout. The parser detects it
rather than assuming a single schema.

**Indonesian number formatting.**
`.` is the thousands separator. `6.502` arrives from the Sheets API as the float
`6.502`; since volume metrics cannot be fractional, sub-1000 non-integers are
multiplied back by 1000. Percentages, `Rp` prefixes, `-`, `#DIV/0!` and `#N/A` are
all normalised in the same numeric parser.

**Mixed date formats.**
`DD/MM/YYYY`, `D-Mon`, `M/D/YYYY` and Excel serial numbers all appear in the same
columns and are unified to ISO. Dates are forward-filled within campaign groups
because only the first row of a group carries one.

---

## Design principles that came out of this

1. **One decision point.** Exactly one node decides what runs and what is sent;
   everything else reads flags. No node re-derives schedule logic.
2. **Separate computing from sending.** A branch can run for its data without its
   report going out.
3. **Never render an empty section.** Every output has a fallback that prints the
   reason instead of a blank heading or an unexplained zero.
4. **Put data quality first in the prompt.** The model reads the caveats before the
   numbers, so it hedges where the data is weak instead of asserting confidently.
5. **Tag merged items with `_source`.** Downstream Code nodes select by source type
   rather than by input index, which survives rewiring.
6. **Make extension a canvas operation.** Adding a month is adding a node, not
   editing code.
