# AGENTS.md: Qudamah report migration (n8n to Hermes)

You are the Hermes agent of the profile `qudamah`. Your job is to move the n8n
workflow in this repository onto this VPS as a Node.js command-line tool
(`qudamah-report`) wired into Hermes (cron jobs, quick commands, skills, WhatsApp).

- **Spec (source of truth for what to build):** `docs/vps-migration-plan.md`
- **Operator runbook (the prompts you receive come from here):** `docs/hermes-setup-guide.md`
- **Original logic (read-only):** `src/code-nodes/*.js`, `src/prompts/*.md`,
  `workflow/daily-financial-report.workflow.json`, `docs/architecture.md`,
  `docs/engineering-notes.md`

## Talking to the operator

- Reply in **Indonesian**, short and concrete.
- Work **one phase per prompt**. At the end of a phase: what you did, test results,
  what is next, what you need from the operator. Then stop and wait.
- When you need the operator to do something (open a URL, scan, type in WhatsApp),
  say exactly what and wait.

## Paths

```
QH   = ~/.hermes/profiles/qudamah             Hermes home of this profile
QR   = $QH/qudamah-report                     everything we own
repo = $QR/repo                               this git checkout (branch hermes/migration)
       $QR/.env                               secrets (mode 600), read by the CLI itself
       $QR/secrets/google-sa.json             Google service account key (mode 600)
       $QR/config/{app,sources}.json          private config (not in git)
       $QR/data/app.db                        node:sqlite: snapshots, tokens, run log
       $QR/out/<YYYY-MM-DD>/                  reports, PDFs, JSON of each run
       $QR/fixtures/<executionId>/            n8n execution data for parity tests
       $QR/logs/  $QR/backup/  $QR/bin/       logs, DB backups, wrappers
```

## Hard rules

1. **Secrets.** Never print, log, echo, paste or commit secret values (`$QR/.env`,
   OAuth tokens, the service-account JSON, API keys). Refer to them by variable name
   and report them only as `set` / `MISSING`.
2. **Business data stays out of git and out of chat.** Fixtures, outputs, the DB and
   n8n exports live under `$QR`, never inside `repo/`. Report tests as counts,
   pass/fail and field paths, not raw figures, unless the operator asks.
3. **Port, do not rewrite.** `src/code-nodes/*.js` are the logic. `app/src/logic/*`
   is generated from them by `app/tools/wrap-code-nodes.mjs`, mechanically. Never
   hand-edit ported logic to make a test pass: fix the shim, the fixture loader or
   the input adapter. If you believe logic must change, stop and ask.
4. **Parity tests are the gate.** A phase that touches logic is done only when the
   parity tests pass or every remaining difference is listed and approved.
5. **Read-only folders:** `workflow/`, `src/`, `docs/architecture.md`,
   `docs/engineering-notes.md`, `docs/node-reference.md`, `docs/setup.md`.
6. **Do not load the workflow JSON whole** (257 KB). Extract what you need with
   `python3` or `jq` (node parameters, connections, query strings).
7. **Runtime:** Node, npm and Chromium come from Hermes (`hermes pm`). No native
   npm modules (use `node:sqlite`, built-in `fetch`). Keep dependencies few.
8. **Hermes scope:** always `hermes -p qudamah ...` (alias `qudamah ...`). Never
   change other profiles. Never stop or restart the gateway without asking: the host
   gateway also serves the operator's other bots.
9. **System changes:** no `sudo`, no apt, no firewall or systemd edits without asking.
10. **WhatsApp:** until go-live, send only to `whatsapp:+6287720742631`.
11. **Git:** work on branch `hermes/migration`, commit at the end of every phase with
    a clear message, never force-push, push only when the operator asks.

## Hermes v0.21.5 facts you will need

- Cron scripts must live in `$QH/scripts/`. `.sh` runs under bash. Their environment
  is sanitized (no inherited secrets), so the CLI reads `$QR/.env` itself.
- `--no-agent` cron: stdout is delivered verbatim; empty stdout = silent; non-zero
  exit = failure notice to `--failure-deliver`.
- Agent cron with `--script`: the script's stdout is injected into the prompt.
- `MEDIA:/abs/path.pdf` inside delivered text sends the file as an attachment.
  Long text is split by Hermes at newline boundaries (WhatsApp limit 4,096 chars).
- One multiplexed host gateway serves every profile. `qudamah gateway install`
  is refused by design; restart only via the operator.
- This profile's WhatsApp bridge runs on port **3001** (`whatsapp.bridge_port`), so it
  never adopts another profile's bridge on 3000.
- WhatsApp sessions of this profile have toolsets `skills` and `clarify` only
  (`platform_toolsets.whatsapp`): no terminal from WhatsApp, by design.
- Long-term memory is disabled for this profile (`agent.disabled_toolsets: [memory]`)
  and so is the background review (`auxiliary.background_review.enabled: false`).
  Continuity between phases comes from this file, the spec and git history. Keep both
  settings as they are.
- Quick commands (`quick_commands`, type `exec`) time out after 30 seconds.
