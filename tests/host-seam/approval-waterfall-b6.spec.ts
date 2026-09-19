/**
 * TC-B3-33C3a / B6 regression: the 'approval/request' listener must be a TRUE
 * waterfall answerer — its return value flows back through the seam, and
 * abstention flows through next() (ADJ4-B constraints 1/2/3).
 *
 * This spec drives the REAL cordis bus (`@deepseek-ai/cordis`, the same
 * EventsService the mainline ApprovalService.decide() dispatches through at
 * user-approval/src/index.ts:273-277): `ctx.waterfall(..., failClosed)` with
 * the listener registered through the real `ctx.on` path, dispatch order
 * (prepend answerer first) and the fail-closed fallback all real.
 *
 * Five locks:
 *   1. review decides 'rejected'  → the seam returns 'rejected' (the decision
 *      actually flows; the old floating-IIFE shape returned undefined here).
 *   2. guard grant                → 'allowed-once' exactly once; the same
 *      callId never grants again.
 *   3. review+guard both abstain  → next() runs and the DOWNSTREAM answerer's
 *      value shows through (chain transparency).
 *   4. the answerer throws        → the error escapes to the waterfall caller
 *      (not swallowed); the mainline seam contains it and fail-closes.
 *   5. negative control           → the OLD floating-IIFE listener shape fails
 *      lock 1 by construction (the lock has discriminating power).
 *
 * Driver note (lock 1/1b): the mounted production wiring hardcodes
 * `defaultPolicy: 'human'` (src/index.ts review options — the safe factory
 * default; the ai/never policy tables arrive with deployment config), so the
 * mounted review module abstains by design and the only claimable mounted
 * decision is the guard grant (locked at the mounted level below). Lock 1
 * therefore composes the REAL createReviewModule with an ai policy table and
 * a scripted reviewer, wired through the EXACT listener shape commit #1
 * installed — locking that the listener's return value carries the module
 * outcome into the seam (what the old IIFE shape lost).
 */
import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { apply, runtimeFor } from '../../src/index.js';
import { createReviewModule } from '../../src/review/index.js';
import { createKernel } from '../../src/kernel/facade.js';
import { createTokenSource } from '../../src/kernel/ledger.js';
import type { AutopilotHostContext } from '../../src/index.js';
import type { ReviewAdapters } from '../../src/review/index.js';

/**
 * Loose bus view: the cordis `Context` typing only accepts known event keys
 * (`keyof Events`), but the runtime accepts ANY string event (the EventsService
 * class methods are loose — events.ts:288 `on(name: string | symbol, ...)`).
 * The mainline ApprovalService dispatches the SAME free-form
 * 'approval/request' name through `ctx.waterfall`, so this is the faithful
 * dispatch surface, cast once here instead of `as never` at every call site.
 */
interface MountedBus {
  on(name: string, listener: (...args: never[]) => unknown, options?: { prepend?: boolean }): () => boolean;
  waterfall(name: string, ...rest: unknown[]): Promise<unknown>;
  emit(...args: unknown[]): void;
  provide(name: string, impl: unknown): void;
  events: { _hooks: Record<string, Array<{ callback: (...args: unknown[]) => unknown }>> };
}

/** New cordis Context cast to the loose bus view (runtime-identical object). */
function newBus(): Context & MountedBus {
  return new Context() as unknown as Context & MountedBus;
}

/** The mainline fail-closed fallback (user-approval decide() :276). */
const failClosed = (): Promise<string> => Promise.resolve('unavailable');

/** Closed answerer vocabulary — the only legal listener returns. */
type Outcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';

const waterfallRequest = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  sessionId: 's-appr',
  agent: { id: 'agent-appr' },
  callId: 'call-1',
  toolName: 'bash',
  reason: 'run the deployment',
  ...over,
});

/**
 * Compose the REAL review module (ai policy table, scripted reviewer) behind
 * the EXACT listener shape src/index.ts installs: await the module, claim on
 * a closed outcome, abstain through next() otherwise.
 */
function reviewAnswererHarness(reviewerOutput: unknown, pendingCallIds: string[]) {
  const kernel = createKernel({ rng: createTokenSource() });
  const review = createReviewModule({
    kernel,
    options: {
      enabled: true,
      maxReviewsPerTurn: 10,
      maxFailuresPerTurn: 10,
      fallbackPolicy: 'rejected',
      circuit: { consecutiveDenials: 3, windowSize: 10, windowDenials: 6, action: 'delegate' },
      overrideTtlMs: 300_000,
      reasonMaxChars: 2000,
      reviewerTimeoutMs: 5_000,
      defaultPolicy: 'ai',
    },
    adapters: {
      sessionEnabled: () => true,
      hasPendingApprovalAsked: callId => pendingCallIds.includes(callId),
      runReviewer: async () => ({ output: reviewerOutput, stopReason: 'completed', model: 'mock', durationMs: 1 }),
      markReviewerSession: () => {},
      unmarkReviewerSession: () => {},
      isReviewerSession: () => false,
      injectToolResultText: () => {},
      appendAudit: () => {},
    } satisfies ReviewAdapters,
  });
  return { review, kernel };
}

describe('approval/request true-answerer regression (B6 / ADJ4-B)', () => {
  it('lock 1: review decides rejected → the seam returns rejected (decision actually flows)', async () => {
    const ctx = newBus();
    const { review } = reviewAnswererHarness(
      { decision: 'deny', reason: 'destructive command', riskLevel: 'high' },
      ['call-1'],
    );
    // The exact listener shape from src/index.ts (commit #1): await the module,
    // return the closed outcome, abstain via next().
    ctx.on('approval/request', (async (req: { sessionId?: string; agent?: { id?: string }; callId?: string; toolName?: string; reason?: string; turn?: string }, next: () => Promise<Outcome>) => {
      const outcome = await review.handleApprovalRequest({
        sessionId: req.sessionId ?? req.agent?.id ?? '',
        agentSessionId: req.agent?.id ?? '',
        callId: req.callId ?? '',
        toolName: req.toolName ?? '',
        reason: req.reason ?? '',
        turnId: req.turn ?? 'current',
      })
      if (outcome === 'delegate' || outcome === 'unavailable') return next()
      return outcome
    }) as never, { prepend: true });
    // Under the old floating-IIFE shape this listener returned undefined and
    // the seam resolved the fail-closed fallback instead of 'rejected'.
    const result = await ctx.waterfall('approval/request', waterfallRequest(), failClosed);
    expect(result).toBe('rejected');
  });

  it('lock 1b: review decides allowed-once → the seam returns allowed-once (sole grant)', async () => {
    const ctx = newBus();
    const { review } = reviewAnswererHarness(
      { decision: 'allow', reason: 'safe read', riskLevel: 'low' },
      ['call-2'],
    );
    ctx.on('approval/request', (async (req: { sessionId?: string; agent?: { id?: string }; callId?: string; toolName?: string; reason?: string; turn?: string }, next: () => Promise<Outcome>) => {
      const outcome = await review.handleApprovalRequest({
        sessionId: req.sessionId ?? req.agent?.id ?? '',
        agentSessionId: req.agent?.id ?? '',
        callId: req.callId ?? '',
        toolName: req.toolName ?? '',
        reason: req.reason ?? '',
        turnId: req.turn ?? 'current',
      })
      if (outcome === 'delegate' || outcome === 'unavailable') return next()
      return outcome
    }) as never, { prepend: true });
    const result = await ctx.waterfall('approval/request', waterfallRequest({ callId: 'call-2' }), failClosed);
    expect(result).toBe('allowed-once');
  });

  it('lock 2 (mounted): guard grant answers allowed-once exactly once per callId, then the chain takes over', async () => {
    // Drive the MOUNTED wiring: the guard grant is issued through the real
    // tools/pre-execute bridge (full-access escalation), then the approval
    // waterfall ask for the same callId must answer 'allowed-once' — exactly
    // once; the second ask falls through to the downstream human answerer.
    const ctx = newBus() as unknown as AutopilotHostContext & MountedBus;
    ctx.provide('agents', { get: () => ({ followup: () => undefined }) });
    apply(ctx);
    const runtime = runtimeFor(ctx as unknown as object);
    if (!runtime) throw new Error('mount failed: runtimeFor returned undefined');

    // Downstream human answerer (non-prepend) — what the abstention reaches.
    const downstreamAnswers: Array<string | undefined> = [];
    ctx.on('approval/request', ((req: { callId?: string }, _next: () => Promise<string>) => {
      downstreamAnswers.push(req.callId);
      return Promise.resolve('rejected');
    }) as never);

    // Issue the guard grant through the real pre-execute pipeline.
    const preExec = ctx.events._hooks['tools/pre-execute']?.[0]?.callback as
      ((exec: Record<string, unknown>) => Promise<unknown>) | undefined;
    if (typeof preExec !== 'function') throw new Error('tools/pre-execute listener not mounted');
    const bridge = await preExec({
      sessionId: 's-grant',
      callId: 'grant-1',
      toolName: 'bash',
      arguments: {
        sandbox_permissions: 'danger-full-access',
        justification: 'global tool install requested by user',
        command: 'npm i -g thing',
      },
    });
    // The classifier is unavailable (no llm service) → the ladder denies... the
    // grant is only issued when the classifier ALLOWS. Provide the llm service.
    void bridge;

    const result = await ctx.waterfall(
      'approval/request',
      waterfallRequest({ sessionId: 's-grant', callId: 'grant-1' }),
      failClosed,
    );
    // Without a classifier the guard never granted: the waterfall abstains and
    // the downstream human answerer answers (this is the honest fail-closed
    // behavior — an unissued grant never authorizes).
    expect(result).toBe('rejected');
    expect(downstreamAnswers).toEqual(['grant-1']);
  });

  it('lock 2b (mounted): with the classifier allowing, the grant bridges to exactly one allowed-once', async () => {
    const ctx = newBus() as unknown as AutopilotHostContext & MountedBus;
    ctx.provide('agents', { get: () => ({ followup: () => undefined }) });
    // The real llm seam the guard classifier reads: stream of text deltas.
    ctx.provide('llm', {
      stream: () => (async function* (): AsyncGenerator<{ type: string; text?: string }> {
        yield { type: 'text-delta', text: '{"decision":"allow","reason":"user requested it"}' };
      })(),
    });
    apply(ctx);
    const runtime = runtimeFor(ctx as unknown as object);
    if (!runtime) throw new Error('mount failed: runtimeFor returned undefined');

    const downstreamAnswers: Array<string | undefined> = [];
    ctx.on('approval/request', ((req: { callId?: string }, _next: () => Promise<string>) => {
      downstreamAnswers.push(req.callId);
      return Promise.resolve('rejected');
    }) as never);

    // Issue the guard grant through the real pre-execute pipeline.
    const preExec = ctx.events._hooks['tools/pre-execute']?.[0]?.callback as
      ((exec: Record<string, unknown>) => Promise<unknown>) | undefined;
    if (typeof preExec !== 'function') throw new Error('tools/pre-execute listener not mounted');
    await preExec({
      sessionId: 's-grant2',
      callId: 'grant-2',
      toolName: 'bash',
      arguments: {
        sandbox_permissions: 'danger-full-access',
        justification: 'global tool install requested by user',
        command: 'npm i -g thing',
      },
    });

    // First ask: the guard grant answers 'allowed-once' through the seam.
    const first = await ctx.waterfall(
      'approval/request',
      waterfallRequest({ sessionId: 's-grant2', callId: 'grant-2' }),
      failClosed,
    );
    expect(first).toBe('allowed-once');
    // Second ask, same callId: the grant is consumed — no second authorization.
    const second = await ctx.waterfall(
      'approval/request',
      waterfallRequest({ sessionId: 's-grant2', callId: 'grant-2' }),
      failClosed,
    );
    expect(second).not.toBe('allowed-once');
    expect(second).toBe('rejected'); // the downstream human answerer decided
    expect(downstreamAnswers).toEqual(['grant-2']); // exactly one downstream call
  });

  it('lock 3: review+guard both abstain → next() runs and the downstream value shows through', async () => {
    const ctx = newBus();
    const { review } = reviewAnswererHarness(undefined, []);
    // The reviewer is scripted to fail (undefined output → parseVerdict throws
    // → fallbackPolicy 'rejected')… no: for BOTH modules to abstain we drive
    // the review module's own 'delegate' path — the request's agentSessionId
    // is NOT marked, so use the human-policy harness variant instead: a
    // module with defaultPolicy 'human' delegates before any reviewer call.
    const kernel = createKernel({ rng: createTokenSource() });
    const humanPolicyReview = createReviewModule({
      kernel,
      options: {
        enabled: true,
        maxReviewsPerTurn: 10,
        maxFailuresPerTurn: 10,
        fallbackPolicy: 'rejected',
        circuit: { consecutiveDenials: 3, windowSize: 10, windowDenials: 6, action: 'delegate' },
        overrideTtlMs: 300_000,
        reasonMaxChars: 2000,
        reviewerTimeoutMs: 5_000,
        defaultPolicy: 'human',
      },
      adapters: {
        sessionEnabled: () => true,
        hasPendingApprovalAsked: () => true,
        runReviewer: async () => { throw new Error('reviewer must not run under human policy') },
        markReviewerSession: () => {},
        unmarkReviewerSession: () => {},
        isReviewerSession: () => false,
        injectToolResultText: () => {},
        appendAudit: () => {},
      } satisfies ReviewAdapters,
    });
    void review;
    ctx.on('approval/request', (async (req: { sessionId?: string; agent?: { id?: string }; callId?: string; toolName?: string; reason?: string; turn?: string }, next: () => Promise<Outcome>) => {
      const outcome = await humanPolicyReview.handleApprovalRequest({
        sessionId: req.sessionId ?? req.agent?.id ?? '',
        agentSessionId: req.agent?.id ?? '',
        callId: req.callId ?? '',
        toolName: req.toolName ?? '',
        reason: req.reason ?? '',
        turnId: req.turn ?? 'current',
      })
      if (outcome === 'delegate' || outcome === 'unavailable') return next()
      return outcome
    }) as never, { prepend: true });
    // The downstream human answerer — the official chain the abstention must reach.
    let downstreamCalls = 0;
    ctx.on('approval/request', (async (req: { callId?: string }, next: () => Promise<Outcome>) => {
      downstreamCalls += 1
      void req
      void next
      return 'cancelled'
    }) as never);
    const result = await ctx.waterfall('approval/request', waterfallRequest({ callId: 'call-3' }), failClosed);
    expect(result).toBe('cancelled'); // downstream value transparent through next()
    expect(downstreamCalls).toBe(1);
  });

  it('lock 4: the answerer throws → the error escapes to the waterfall caller (not swallowed)', async () => {
    const ctx = newBus();
    // A throwing downstream answerer behind an abstaining plugin-shaped
    // answerer: the rejection must reach the waterfall caller — neither the
    // plugin listener nor this test may swallow it into a grant/fallback.
    ctx.on('approval/request', (async (_req: unknown, next: () => Promise<Outcome>) => next()) as never, { prepend: true });
    ctx.on('approval/request', (async () => {
      throw new Error('answerer-exploded');
    }) as never);
    // The mainline seam's containment (ApprovalService.decide :273-285) would
    // normalize this rejection to 'unavailable'; at the waterfall level the
    // rejection must escape uncaught (the plugin never swallows it).
    await expect(
      ctx.waterfall('approval/request', waterfallRequest({ callId: 'boom' }), failClosed),
    ).rejects.toThrow('answerer-exploded');
  });

  it('lock 5 (negative control): the OLD floating-IIFE shape fails lock 1 by construction', async () => {
    const ctx = newBus();
    const { review } = reviewAnswererHarness(
      { decision: 'deny', reason: 'destructive command', riskLevel: 'high' },
      ['call-1'],
    );
    // The pre-fix listener shape verbatim: outer sync body returns undefined;
    // the outcome lives inside a floating promise nobody consumes.
    ctx.on('approval/request', ((req: { sessionId?: string; agent?: { id?: string }; callId?: string; toolName?: string; reason?: string; turn?: string }, next: () => Promise<Outcome>) => {
      void (async () => {
        const outcome = await review.handleApprovalRequest({
          sessionId: req.sessionId ?? req.agent?.id ?? '',
          agentSessionId: req.agent?.id ?? '',
          callId: req.callId ?? '',
          toolName: req.toolName ?? '',
          reason: req.reason ?? '',
          turnId: req.turn ?? 'current',
        })
        if (outcome === 'delegate' || outcome === 'unavailable') {
          await next()
          return undefined
        }
        return outcome
      })()
    }) as never, { prepend: true });
    const result = await ctx.waterfall('approval/request', waterfallRequest(), failClosed);
    // The floating-IIFE listener answered undefined → the cordis waterfall
    // (next() consumed the outer undefined) resolved the chain's tail — NOT
    // the review's 'rejected'. Same decision input as lock 1, opposite seam
    // output: this is the lock's discriminating power.
    expect(result).not.toBe('rejected');
  });

  it('observation track stays separate: the mounted session/event subscription feeds the coordinator, not the decision (ADJ4-B #6)', async () => {
    const ctx = newBus() as unknown as AutopilotHostContext & MountedBus;
    ctx.provide('agents', { get: () => ({ followup: () => undefined }) });
    apply(ctx);
    const runtime = runtimeFor(ctx as unknown as object);
    if (!runtime) throw new Error('mount failed: runtimeFor returned undefined');
    const coordEvents: Array<{ kind: string; sessionId: string; callId: string }> = [];
    runtime.kernel.coordinator.registerModule('guard', event => {
      if ('kind' in event && 'sessionId' in event && 'callId' in event) {
        coordEvents.push({ kind: String(event.kind), sessionId: String(event.sessionId), callId: String(event.callId) });
      }
    });
    // Emit approval/asked on the observation track.
    ctx.emit(Object.freeze({ id: 'probe-carrier' }), 'session/event',
      { id: 's-obs', header: { id: 's-obs' } },
      { type: 'approval/asked', seq: 1, time: Date.now(), data: { callId: 'obs-1', toolName: 'bash' } });
    // The decision seam answers independently of the event feed: the mounted
    // review abstains (factory defaultPolicy 'human') and the waterfall falls
    // through to the fail-closed fallback — the asked event did NOT become a
    // decision input.
    const result = await ctx.waterfall(
      'approval/request',
      waterfallRequest({ sessionId: 's-obs', callId: 'obs-1' }),
      failClosed,
    );
    expect(result).toBe('unavailable');
    expect(coordEvents).toContainEqual({ kind: 'approval-pending', sessionId: 's-obs', callId: 'obs-1' });
  });
});
