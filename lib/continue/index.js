import { detectBootScan, detectLive } from './detector.js';
import { LOOP_GUARD_DEFAULTS, LoopGuard } from './loopguard.js';
import { ContinueScheduler } from './scheduler.js';
import { buildResumeText } from './resumetext.js';
export const DEFAULT_TEXTS = {
    continue: 'Continue',
    continueMaxTokens: 'Continue',
    loop: 'You appear stuck in a loop ({tool}). Change approach or ask me.',
    guardPending: 'Note: the previous {tool} call may not have finished — check its result before redoing it.',
    guardDone: 'Note: the previous {tool} call already completed successfully — do NOT redo it, continue from its result.',
};
export function createContinueModule(deps) {
    const { kernel, adapters } = deps;
    const options = deps.options;
    const texts = { ...DEFAULT_TEXTS, ...options.texts };
    const backoff = {
        baseMs: options.cooldownMs,
        factor: options.backoffFactor,
        capMs: options.backoffCapMs,
    };
    const clock = kernel.clock;
    const rng = kernel.rng;
    const guards = new Map();
    const pendingFailure = new Map();
    function guardFor(sessionId) {
        let guard = guards.get(sessionId);
        if (!guard) {
            guard = new LoopGuard({ ...LOOP_GUARD_DEFAULTS, ...options.loopGuard }, () => clock.now());
            guards.set(sessionId, guard);
        }
        return guard;
    }
    const scheduler = new ContinueScheduler(adapters, clock, rng, { session: _id => kernel.ledger.session(_id, backoff) }, backoff, { graceMs: options.graceMs, maxConsecutive: options.maxConsecutive });
    function scheduleResume(sessionId, kind) {
        const info = pendingFailure.get(sessionId);
        const failure = info?.failure;
        scheduler.schedule(sessionId, kind, () => {
            const ctx = {};
            if (failure?.code !== undefined)
                ctx.code = failure.code;
            if (failure?.message !== undefined)
                ctx.message = failure.message;
            if (failure?.status !== undefined)
                ctx.status = String(failure.status);
            if (info)
                ctx.elapsedMs = clock.now() - info.endedAt;
            const guardTexts = {};
            if (texts.guardPending !== undefined)
                guardTexts.pending = texts.guardPending;
            if (texts.guardDone !== undefined)
                guardTexts.done = texts.guardDone;
            return buildResumeText({
                kind,
                texts,
                ctx,
                guards: guardTexts,
            });
        });
    }
    return {
        disposable: true,
        handleTurnStart(sessionId) {
            if (!options.enabled)
                return;
            guardFor(sessionId).beginTurn();
            scheduler.beginTurn(sessionId);
        },
        handleTurnEnd(sessionId, reason, failure) {
            if (!options.enabled)
                return;
            const verdict = detectLive(reason, failure ?? undefined, {
                classifyErrors: options.classifyErrors,
            });
            if (verdict.action === 'skip') {
                if (verdict.skipReason === 'permanent-failure') {
                    adapters.auditSkipped({ sessionId, reason: 'permanent-failure' });
                }
                return;
            }
            pendingFailure.set(sessionId, {
                ...(failure ? { failure } : {}),
                endedAt: clock.now(),
            });
            scheduleResume(sessionId, reason === 'max-tokens' ? 'continue-max-tokens' : 'continue');
        },
        handleUserMessage(sessionId) {
            pendingFailure.delete(sessionId);
            scheduler.noteUserMessage(sessionId);
        },
        handleAssistantMessage(sessionId, text) {
            if (!options.enabled)
                return;
            const guard = guardFor(sessionId);
            guard.feedAssistant(text);
            if (guard.shouldInterrupt()) {
                guard.markFired();
                // Interrupt + restart goes through the same gates as any send.
                scheduler.schedule(sessionId, 'continue', () => buildResumeText({
                    kind: 'loop',
                    texts,
                    ctx: {},
                    guards: {},
                }));
            }
        },
        handleToolCall(sessionId, toolName, argsJson) {
            if (!options.enabled)
                return;
            guardFor(sessionId); // ensure the guard exists for the turn
            void toolName;
            void argsJson;
        },
        handleToolResult(sessionId, toolName, argsJson, resultJson, isError) {
            if (!options.enabled)
                return;
            const guard = guardFor(sessionId);
            if (!isError)
                guard.feedTool(toolName, argsJson, resultJson);
        },
        noteRecoveredTurn(sessionId) {
            scheduler.noteRecoveredTurn(sessionId);
        },
        bootScan() {
            if (!options.enabled || !options.scanOnBoot)
                return;
            const now = clock.now();
            let scanned = 0;
            for (const sessionId of adapters.listActiveSessionIds()) {
                if (scanned >= options.scanLimit)
                    break;
                const last = adapters.getLastTurn(sessionId);
                if (!last)
                    continue;
                scanned += 1;
                if (now - last.endedAt > options.scanWindowMs)
                    continue;
                const verdict = detectBootScan(last.reason, last.failure, {
                    classifyErrors: options.classifyErrors,
                });
                if (verdict.action !== 'skip') {
                    pendingFailure.set(sessionId, {
                        ...(last.failure ? { failure: last.failure } : {}),
                        endedAt: last.endedAt,
                    });
                    scheduleResume(sessionId, 'continue');
                }
            }
        },
        pauseSession(sessionId, durationMs = 3_600_000) {
            scheduler.pauseSession(sessionId, durationMs);
        },
        resumeSession(sessionId) {
            scheduler.resumeSession(sessionId);
        },
        resumeNow(sessionId) {
            // Explicit human action: bypasses cooldowns and limits by definition.
            return scheduler.resumeNow(sessionId, texts.continue);
        },
    };
}
