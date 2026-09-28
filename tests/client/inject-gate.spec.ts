/**
 * SYNC-P4b — client fiber inject-gate locks (0.1.7 settings adaptation).
 *
 * Root cause locked here: `src/client/index.ts` used to export
 * `inject = ['slots', 'locale', 'settingsScope']`, but the 0.1.7 official
 * client surface DELETED the `settingsScope` service (P4-settings-adaptation
 * §1.3). Under the cordis fiber gate a plugin only loads while ALL injected
 * services are available, so the whole client fiber (locale dictionary +
 * session-header pause/approve panel + initial-status effect) stayed PENDING
 * forever on a 0.1.7 host — a silent hang, invisible to the 161 direct-apply
 * tests that bypass the fiber gate (P4-settings-adaptation §2.1).
 *
 * Locks (design §2.3 acceptance form):
 * 1. static lock — the inject export is exactly ['slots', 'locale']
 *    (official same-shape precedent: locale apply.client.spec.ts:120);
 * 2. dynamic lock — cordis harness: provide ONLY the minimal 0.1.7 client
 *    roster (slots + locale doubles, NO settingsScope) → load the fiber with
 *    the module-level inject export as the gate → `fiber.await()` settles and
 *    `fiber.state === FiberState.ACTIVE`. This is cordis' own lifecycle
 *    semantics, not a mock-interaction assertion;
 * 3. hang probe — the pre-P4b gate verbatim (['slots','locale',
 *    'settingsScope']) loaded through the SAME harness settles in PENDING and
 *    its apply NEVER runs: the permanent red-face record (the old
 *    declaration's runtime shape) and the proof that lock 2's 'active'
 *    verdict is discriminative.
 *
 * Empirical hang shape on cordis 4.0.1 (recorded from the red run): a fiber
 * waiting on an unavailable service settles `await()` in the STABLE PENDING
 * state — it never activates and never rejects (design §2.3-2 criterion:
 * "未 settle 或 state!==2"; this version lands on the state!==2 face). The
 * settle window below therefore guards against a never-settling await on any
 * cordis version, while the verdicts distinguish PENDING-hang from ACTIVE.
 *
 * Red/green discipline (design §6 constraint 5): this spec was first run
 * against the OLD declaration — locks 1+2 failed (array mismatch; fiber
 * settled in PENDING, never ACTIVE), the probe passed by documenting the hang
 * — then the src fix turned the suite green. Both runs are recorded in the
 * P4b ledger.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { createConsoleFiber, inject as clientInject, name as clientName } from '../../src/client/index.js'
import { NS } from '../../src/shared-client/locales.js'

// cordis declares FiberState as a `const enum` (fiber.d.ts) — erased at
// runtime and not value-importable under isolatedModules, so the harness pins
// the numeric codes: FiberState.PENDING = 0, FiberState.ACTIVE = 2.
const FIBER_PENDING = 0
const FIBER_ACTIVE = 2

// Settle window: generous for a LOADING→ACTIVE fiber (apply is synchronous
// plus one stubbed fetch), short enough to keep a never-settling await from
// stalling the suite.
const SETTLE_WINDOW_MS = 500

/** The narrow structural ctx view the console fiber's apply consumes. */
type ConsoleApplyCtx = Parameters<ReturnType<typeof createConsoleFiber>['apply']>[0]

/**
 * Outcome vocabulary of the settle race:
 * - 'active'        — await() settled and the fiber reached FiberState.ACTIVE;
 * - 'pending'       — await() settled in stable PENDING (the inject-gate hang:
 *                     a required service never arrives, apply never runs);
 * - 'settled-other' — settled in another non-active state (FAILED/DISPOSED/…);
 * - 'rejected'      — await() rethrew a config/startup error;
 * - 'timeout'       — await() did not settle within the window.
 */
type SettleVerdict = 'active' | 'pending' | 'settled-other' | 'rejected' | 'timeout'

async function settleProbe(fiber: Fiber, windowMs: number): Promise<SettleVerdict> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fiber.await().then(
        (): SettleVerdict => {
          if (fiber.state === FIBER_ACTIVE) return 'active'
          return fiber.state === FIBER_PENDING ? 'pending' : 'settled-other'
        },
        (): SettleVerdict => 'rejected',
      ),
      new Promise<SettleVerdict>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), windowMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Minimal 0.1.7 client roster subset: slots + locale doubles only.
 * settingsScope is deliberately NOT provided — the service no longer exists
 * on the 0.1.7 client surface, which is exactly what made the old inject
 * entry a permanent hang.
 */
function createRoster() {
  const slotNames: string[] = []
  const localeNames: string[] = []
  const slots = {
    inject(slot: string): void {
      slotNames.push(slot)
    },
  }
  const locale = {
    register(ns: string): void {
      localeNames.push(ns)
    },
    bind(ns: string): (key: string, params?: Record<string, string>) => string {
      return (key) => `${ns}:${key}`
    },
  }
  return { slots, locale, slotNames, localeNames }
}

function mountRoster(root: Context) {
  const roster = createRoster()
  root.provide('slots', roster.slots)
  root.provide('locale', roster.locale)
  return roster
}

/**
 * Faithful fiber assembly: the module-level `inject` export (the cordis gate
 * under test) + `createConsoleFiber().apply` (the fiber body) — the same pair
 * the host client runtime composes from the bundle exports (dist/client.cjs).
 */
function loadClientFiber(root: Context): Fiber {
  const consoleFiber = createConsoleFiber({
    fetchText: async () => '{}',
    actionToken: () => undefined,
  })
  return root.plugin({
    name: clientName,
    inject: clientInject,
    apply: (ctx: Context) => consoleFiber.apply(ctx as unknown as ConsoleApplyCtx),
  })
}

describe('SYNC-P4b — client fiber inject gate (0.1.7 settingsScope hang removal)', () => {
  it("static lock — inject export is exactly ['slots', 'locale']", () => {
    expect(clientInject).toEqual(['slots', 'locale'])
  })

  it('dynamic lock — fiber settles ACTIVE on the minimal 0.1.7 roster (no settingsScope provider)', async () => {
    const root = new Context()
    const roster = mountRoster(root)
    const fiber = loadClientFiber(root)

    // Cordis' own lifecycle semantics as the criterion (design §2.3-2).
    expect(await settleProbe(fiber, SETTLE_WINDOW_MS)).toBe('active')
    expect(fiber.state).toBe(FIBER_ACTIVE)

    // Functional-revival evidence: the registrations that were dead while the
    // fiber hung — locale dictionary + settings card + session-header panel.
    expect(roster.localeNames).toEqual([NS])
    expect(roster.slotNames).toEqual(['settings.plugin.item', 'conversation.session.header.actions'])
  })

  it('hang probe — the pre-P4b gate settles in PENDING and its apply never runs (red-face record, harness discriminability)', async () => {
    const root = new Context()
    mountRoster(root)

    // The pre-P4b gate verbatim; the apply body must never execute while
    // settingsScope is unprovided — the flag records that guarantee.
    let probeApplyRan = false
    const probe = root.plugin({
      name: `${clientName}-legacy-gate-probe`,
      inject: ['slots', 'locale', 'settingsScope'],
      apply: () => {
        probeApplyRan = true
      },
    })

    // Empirical hang shape (cordis 4.0.1): await() settles in stable PENDING,
    // the fiber never activates, the body never runs. This is the exact
    // runtime shape the old declaration produced on a 0.1.7 host, and it
    // proves the dynamic lock above cannot pass vacuously on this harness.
    expect(await settleProbe(probe, SETTLE_WINDOW_MS)).toBe('pending')
    expect(probe.state).toBe(FIBER_PENDING)
    expect(probeApplyRan).toBe(false)
  })
})
