# Extracted source

These files are extracted **from** `workflow/daily-financial-report.workflow.json`
so the logic can be read and diffed without opening n8n. The JSON is the source of
truth — editing anything here does not change the workflow.

```
code-nodes/   One .js file per Code node (15 files, ~4,000 lines)
prompts/      System and user prompts for the two LangChain agents
```

Comments are in Indonesian, as written for the client's team.
[`../docs/node-reference.md`](../docs/node-reference.md) glosses every node name
and says what each file does.

## Reading order

| Start here | Why |
| --- | --- |
| `code-nodes/tentukan-mode.js` | The single decision point — everything else reads its flags |
| `code-nodes/siapkan-sesi-dan-tanggal.js` | How the Accurate session and the date set are established |
| `code-nodes/normalisasi-sales.js` | Per-sheet column fingerprinting, the subtlest parsing problem here |
| `code-nodes/hitung-laba-rugi-neraca.js` | The accounting core — leaf-account totals and balance diagnostics |
| `code-nodes/hitung-metrik-harian.js` | The operational core — metrics with fallbacks all the way down |

Regeneration command: see [`../docs/setup.md`](../docs/setup.md).
