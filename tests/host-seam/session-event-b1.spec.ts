/**
 * TC-B3-33B / B1+B1a regression: the `session/event` consumer must speak the
 * mainline TWO-parameter protocol — `(session, event)` with `event.data.reason`
 * as the TurnEndReason OBJECT union.
 *
 * This spec drives the REAL cordis bus (`@deepseek-ai/cordis`, the same
 * EventsService the mainline session firehose dispatches through), not a
 * hand-rolled emitter. Business-branch entry is asserted through synchronous
 * evidence (coordinator dispatches + the plugin audit mirror). The full
 * grace-window resume round trip (agents.followup actually called) lives in
 * the campaign sandbox `sandbox-b3-33/run.mjs` — same real bus, real compiled
 * artifact, plus the mainline vocabulary canary.
 */
import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { apply, memoryAuditMirror, runtimeFor } from '../../src/index.js';
import type { AutopilotHostContext } from '../../src/index.js';
import type { CoordinationEvent } from '../../src/kernel/coordinator.js';

interface MountedBus {
  emit(...args: unknown[]): void;
  provide(name: string, impl: unknown): void;
  events: { _hooks: Record<string, unknown[]> };
}

function mountRealBus() {
  const ctx = new Context() as unknown as AutopilotHostContext & MountedBus;
  ctx.provide?.('agents', { get: () => ({ followup: () => undefined }) });
  apply(ctx);
  const runtime = runtimeFor(ctx as unknown as object);
  if (!runtime) throw new Error('mount failed: runtimeFor returned undefined');
  const coordEvents: CoordinationEvent[] = [];
  // The plugin registers only the 'continue' coordination module; 'guard' is free for observation.
  runtime.kernel.coordinator.registerModule('guard', (event) => {
    coordEvents.push(event);
  });
  let seq = 0;
  const emitSessionEvent = (sessionId: string, type: string, data: Record<string, unknown>) => {
    const session = { id: sessionId, header: { id: sessionId } };
    const event = { type, seq: ++seq, time: Date.now(), data };
    // Exact mainline dispatch shape: [carrier, 'session/event', session, event].
    ctx.emit(Object.freeze({ id: 'probe-carrier' }), 'session/event', session, event);
  };
  return { ctx, coordEvents, emitSessionEvent };
}

describe('session/event real-bus regression (B1 two-param + B1a reason union)', () => {
  it('registers its listener through the real ctx.on path', () => {
    const { ctx } = mountRealBus();
    expect(ctx.events._hooks['session/event']).toHaveLength(1);
  });

  it('two-param turn/end dispatch enters the business branch and reads the reason object (B1+B1a)', () => {
    const { coordEvents, emitSessionEvent } = mountRealBus();
    emitSessionEvent('b1-perm', 'turn/end', {
      turn: 1,
      reason: { kind: 'error', error: { code: 'unauthorized', message: 'invalid api key', status: 401 } },
    });
    // B1: the single-param shape died at `!payload.type` and dispatched nothing.
    const ended = coordEvents.find((e) => e.kind === 'turn-ended' && e.sessionId === 'b1-perm');
    expect(ended).toMatchObject({ reason: 'error' });
    // B1a: reason.kind==='error' with mapped failure facts reaches the classifier and
    // the auth 401 is permanently skipped — impossible under the old string comparison
    // (the object degraded to 'completed' and silently claimed a recovered turn).
    const skipped = memoryAuditMirror.filter((a) => a.name === 'ap/skipped' && a.data['sessionId'] === 'b1-perm');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.data['reason']).toBe('permanent-failure');
  });

  it('every mainline TurnEndReason kind maps through as itself, never as completed (B1a)', () => {
    const { coordEvents, emitSessionEvent } = mountRealBus();
    const kinds = ['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted'] as const;
    for (const kind of kinds) {
      const sessionId = `b1a-${kind}`;
      const error = kind === 'error' ? { code: 'server_error', message: 'network timeout' } : undefined;
      emitSessionEvent(sessionId, 'turn/end', {
        turn: 1,
        reason: error ? { kind, error } : { kind },
      });
    }
    for (const kind of kinds) {
      const ended = coordEvents.find((e) => e.kind === 'turn-ended' && e.sessionId === `b1a-${kind}`);
      expect(ended, `kind ${kind}`).toMatchObject({ reason: kind });
    }
    // The transient 'error' variant must NOT be classified as permanent, and
    // 'completed' must not produce a skip audit — both prove distinct semantics.
    expect(memoryAuditMirror.filter((a) => a.name === 'ap/skipped' && a.data['sessionId'] === 'b1a-error')).toHaveLength(0);
    expect(memoryAuditMirror.filter((a) => a.name === 'ap/skipped' && a.data['sessionId'] === 'b1a-completed')).toHaveLength(0);
  });

  it('approval/asked and approval/decided branches enter on the real bus', () => {
    const { coordEvents, emitSessionEvent } = mountRealBus();
    emitSessionEvent('b1-ask', 'approval/asked', { callId: 'call-1', toolName: 'bash' });
    expect(coordEvents).toContainEqual({
      kind: 'approval-pending',
      sessionId: 'b1-ask',
      callId: 'call-1',
      toolName: 'bash',
    });
    emitSessionEvent('b1-ask', 'approval/decided', { callId: 'call-1' });
    expect(coordEvents).toContainEqual({ kind: 'approval-resolved', sessionId: 'b1-ask', callId: 'call-1' });
  });

  it('legacy single-payload dispatch is inert: no business, no throw', () => {
    const { ctx, coordEvents, emitSessionEvent } = mountRealBus();
    emitSessionEvent('b1-live', 'turn/end', { turn: 1, reason: { kind: 'completed' } });
    const coordCount = coordEvents.length;
    const auditCount = memoryAuditMirror.length;
    // The old wire shape sent the payload as the FIRST argument (no event arg).
    ctx.emit(Object.freeze({ id: 'probe-carrier' }), 'session/event', {
      type: 'turn/end',
      session: 'b1-legacy',
      data: { reason: 'completed' },
    });
    expect(coordEvents).toHaveLength(coordCount);
    expect(memoryAuditMirror).toHaveLength(auditCount);
  });
});
