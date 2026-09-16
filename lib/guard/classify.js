/**
 * LLM classifier client with a strict output protocol and a failure ladder.
 *
 * Authorization-source discipline: the ONLY authoritative inputs are
 * (a) redacted direct-human messages and (b) pre-execution facts supplied by
 * the caller. Repository text, tool output, assistant text, plugin text —
 * none of it is authorization, all of it is data.
 */
import { redact } from '../kernel/redact.js';
const MAX_MESSAGES = 4;
const MAX_TOTAL_CHARS = 4000;
export function buildClassifierInput(raw) {
    const messages = [];
    let total = 0;
    for (const message of raw.directHumanMessages.slice(0, MAX_MESSAGES)) {
        const piece = redact(message, 'standard');
        if (total + piece.length > MAX_TOTAL_CHARS)
            break;
        messages.push(piece);
        total += piece.length;
    }
    return {
        sessionId: raw.sessionId,
        toolName: raw.toolName,
        argsRedacted: redact(raw.args, 'standard'),
        facts: raw.facts,
        directHumanMessages: messages,
        ...(raw.sandboxRequest ? { sandboxRequest: raw.sandboxRequest } : {}),
    };
}
/**
 * Strict output protocol: exactly two keys, decision in the closed enum,
 * non-empty reason ≤1000 chars. Anything else throws → caller fail-closes.
 */
export function parseClassifierOutput(raw) {
    if (typeof raw !== 'object' || raw === null)
        throw new Error('classifier output is not an object');
    const record = raw;
    const keys = Object.keys(record);
    if (keys.length !== 2 || !('decision' in record) || !('reason' in record)) {
        throw new Error('classifier output must contain exactly decision and reason');
    }
    const decision = record['decision'];
    if (decision !== 'allow' && decision !== 'ask' && decision !== 'deny') {
        throw new Error(`classifier decision out of vocabulary: ${String(decision)}`);
    }
    const reason = record['reason'];
    if (typeof reason !== 'string' || reason.length === 0 || reason.length > 1000) {
        throw new Error('classifier reason must be a non-empty string within 1000 chars');
    }
    return { decision, reason };
}
/**
 * deny×(N-1) then ask on the Nth consecutive failure; success resets; user
 * cancellation never advances the ladder.
 */
export class FailureLadder {
    denyStreak;
    streak = 0;
    constructor(denyStreak) {
        this.denyStreak = denyStreak;
    }
    recordFailure(kind) {
        if (kind === 'cancelled')
            return;
        this.streak += 1;
    }
    recordSuccess() {
        this.streak = 0;
    }
    nextAction() {
        // After `denyStreak` consecutive failures, stop auto-denying and hand the
        // decision to a human instead of nagging forever.
        return this.streak >= this.denyStreak ? 'ask' : 'deny';
    }
    get currentStreak() {
        return this.streak;
    }
}
