# zdsh-autopilot

**zDSH AutoPilot (自动领航)** — a unified automation engine plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Three automation capabilities behind one kernel and one console:

| Module | What it does |
|---|---|
| **Continue 断线自愈** | Detects non-human interruptions (network errors, max-tokens), auto-sends the resume prompt with adaptive backoff, idempotency guardrails, and a loop guard |
| **Guard 沙箱优先权限守卫** | Sandbox-first permission policy: routine work runs without prompts inside the OS sandbox; semantic risks go to an LLM classifier with input redaction; one-shot escalation capabilities for out-of-bounds work |
| **Review 二模型复核** | A read-only second-model reviewer subagent answers approval requests, fail-closed by default, with budgets, circuit breaker, and full session-log audit |

All three share: unified audit vocabulary (`ap/*` events), cross-module coordination (a pending approval pauses auto-resume; review circuit-breaker suppresses it), one settings tab, one `/ap` command surface, and a built-in offline evaluation harness.

> **Status: under active development (v0.1.0-alpha).** Clean-room project — inspired by community ideas, zero community code. See `docs/DESIGN.md` (in progress) and the net-room statement below.

## Install

```bash
dsh plugin --profile web add github:zsagi1368/zdsh-autopilot
# or from a local checkout:
dsh plugin --profile web add link:<path-to-checkout>
```

Requires DSH `>=0.1.0-rc.2` (works on upstream DSH and the zDSH branch).

## Development

```bash
pnpm install
pnpm ci        # lint + typecheck + test + build
pnpm eval      # offline behavior-contract suite (no API key needed)
```

Architecture: `src/kernel/*` (shared facade) + `src/{continue,guard,review}` capability modules + `src/client` console fiber. Module boundaries are CI-enforced (`scripts/check-boundaries.mjs`).

## License

MIT © 2026 zsagi1368. This is an independent clean-room implementation; see `docs/DESIGN.md` for the design-provenance statement.
