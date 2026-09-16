/**
 * Guard module assembly — the four-level monotonic decision stack.
 *
 * Layer order and override rules (frozen):
 *   fuse (sync, cannot be overridden by anything below)
 *   → deterministic rules (shell lexer / tool policy)
 *   → LLM classifier over redacted inputs with a failure ladder
 *   → official human approval (single popup; one-shot grants bridge it)
 */
import { SessionArtifacts } from './artifacts.js';
import { FailureLadder, buildClassifierInput, parseClassifierOutput } from './classify.js';
import { EscalationGrants } from './escalate.js';
import { hardDeny, assessTool } from './policy.js';
import { assessCommandLine } from './shelllex/assess.js';
import { buildGuidanceText } from './guidance.js';
export function createGuardModule(deps) {
    const { kernel, options, adapters } = deps;
    const roots = () => ({
        workspaceRoot: adapters.workspaceRoot(),
        homePath: adapters.homePath(),
        dshHomePath: adapters.dshHomePath(),
    });
    const artifacts = new SessionArtifacts(adapters.fsProbe(), adapters.workspaceRoot(), options.snapshotPathLimit);
    const ladder = new FailureLadder(options.classifyFailDenyStreak);
    const grants = new EscalationGrants(kernel.rng, () => kernel.clock.now());
    /** Paths that did not exist when a write/shell call started. */
    const existedBeforeByCall = new Map();
    async function classifyWithTimeout(exec, riskReason) {
        const transport = adapters.classifierTransport();
        if (!transport) {
            ladder.recordFailure('unavailable');
            return { decision: ladder.nextAction(), reason: `classifier unavailable: ${riskReason}` };
        }
        try {
            const input = buildClassifierInput({
                sessionId: exec.sessionId,
                toolName: exec.toolName,
                args: safeParse(exec.argsJson),
                facts: existedBeforeByCall.get(exec.callId)?.length
                    ? { existedBefore: true, targets: existedBeforeByCall.get(exec.callId)?.join(', ') ?? '' }
                    : { existedBefore: false },
                directHumanMessages: adapters.provideDirectUserMessages(exec.sessionId),
            });
            const raw = await Promise.race([
                transport(input),
                new Promise((_, reject) => setTimeout(() => { reject(new Error('classifier-timeout')); }, Math.max(100, options.classifierTimeoutMs))),
            ]);
            const verdict = parseClassifierOutput(raw);
            ladder.recordSuccess();
            return verdict;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const kind = message === 'classifier-timeout' ? 'timeout' : 'schema';
            ladder.recordFailure(kind);
            return { decision: ladder.nextAction(), reason: `classifier failed (${kind}): ${message}` };
        }
    }
    async function handlePreToolUse(exec) {
        // Snapshot existence facts BEFORE anything runs.
        const targetPaths = extractTargets(exec.argsJson);
        const existedBefore = targetPaths.filter((p) => {
            const stat = adapters.fsProbe().lstat(p);
            return stat !== undefined;
        });
        existedBeforeByCall.set(exec.callId, existedBefore);
        // Non-Auto sessions are entirely the host's business.
        if (!adapters.isAutoSession(exec.sessionId)) {
            return { decision: 'allow', reason: 'auto policy not active for this session' };
        }
        // Layer 1 — synchronous monotonic fuse.
        const fuseVerdict = hardDeny(exec.toolName, exec.argsJson, roots());
        if (fuseVerdict) {
            audit(exec, 'fuse', 'deny', fuseVerdict.reason);
            return { decision: 'deny', reason: fuseVerdict.reason };
        }
        // Layer 1.5 — full-access escalation requests are inherently semantic
        // risk: they bypass the layer-2 convenience allow and go straight to the
        // classifier, preserving the monotonic stack.
        const sandboxRequest = extractSandboxRequest(exec.argsJson);
        if (sandboxRequest?.level === 'danger-full-access') {
            if (sandboxRequest.justification.trim().length === 0) {
                audit(exec, 'classifier', 'deny', 'empty justification for full-access request');
                return { decision: 'deny', reason: 'full-access requests require a non-empty justification' };
            }
            const verdict = await classifyWithTimeout(exec, 'full-access escalation request');
            if (verdict.decision === 'allow') {
                const grantId = grants.issue({
                    sessionId: exec.sessionId,
                    toolName: exec.toolName,
                    callId: exec.callId,
                    level: sandboxRequest.level,
                    justification: sandboxRequest.justification,
                });
                audit(exec, 'classifier', 'allow', `one-shot escalation granted (${grantId})`);
                // Single-popup principle: the official tool body raises the request;
                // our prepend listener answers it exactly once via the grant.
                return { decision: 'delegate-to-official', reason: 'one-shot escalation bridged to official approval' };
            }
            audit(exec, 'classifier', verdict.decision === 'deny' ? 'deny' : 'ask', verdict.reason);
            return {
                decision: verdict.decision === 'deny' ? 'deny' : 'ask',
                reason: verdict.reason,
            };
        }
        // Layer 2 — deterministic assessment. For shell calls the command line
        // lives inside the arguments envelope; extract it before lexing.
        const assessment = exec.shell !== undefined
            ? assessCommandLine(exec.shell, extractShellCommand(exec.argsJson), artifacts, roots())
            : assessTool(exec.toolName, exec.argsJson, roots(), p => artifacts.has(p));
        if (assessment.decision === 'deny') {
            audit(exec, 'rules', 'deny', assessment.reason);
            return { decision: 'deny', reason: assessment.reason };
        }
        if (assessment.decision === 'allow') {
            audit(exec, 'rules', 'allow', assessment.reason);
            return { decision: 'allow', reason: assessment.reason };
        }
        // Layer 3 — semantic review of the recognized risk.
        const verdict = await classifyWithTimeout(exec, assessment.reason);
        if (verdict.decision === 'allow') {
            audit(exec, 'classifier', 'allow', verdict.reason);
            return { decision: 'allow', reason: verdict.reason };
        }
        if (verdict.decision === 'deny') {
            audit(exec, 'classifier', 'deny', verdict.reason);
            return { decision: 'deny', reason: verdict.reason };
        }
        audit(exec, 'classifier', 'ask', verdict.reason);
        return { decision: 'ask', reason: verdict.reason };
    }
    /** Official approval seam bridge: answer exactly once when a grant matches. */
    const handleApprovalRequest = (request) => grants.decide(request.callId, request.toolName);
    /** Unconditional reclamation at settlement. */
    const handleToolResult = (exec, ok, createdPaths) => {
        grants.settle(exec.callId);
        if (ok) {
            for (const p of createdPaths)
                artifacts.settleCreate(p, false, true);
        }
        existedBeforeByCall.delete(exec.callId);
    };
    function audit(exec, layer, outcome, reason) {
        adapters.appendAudit({
            name: 'ap/decision',
            data: {
                sessionId: exec.sessionId,
                toolName: exec.toolName,
                layer,
                outcome,
                reasonDigest: reason.slice(0, 200),
            },
        });
    }
    return {
        disposable: true,
        artifacts,
        guidanceText: buildGuidanceText,
        handlePreToolUse,
        handleApprovalRequest,
        handleToolResult,
    };
}
function safeParse(json) {
    try {
        return JSON.parse(json);
    }
    catch {
        return json;
    }
}
/** Shell tool arguments envelope → the actual command line to lex. */
function extractShellCommand(argsJson) {
    const parsed = safeParse(argsJson);
    if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed;
        for (const key of ['command', 'cmd', 'script']) {
            const value = record[key];
            if (typeof value === 'string')
                return value;
        }
    }
    if (typeof parsed === 'string')
        return parsed;
    return argsJson;
}
function extractTargets(argsJson) {
    const parsed = safeParse(argsJson);
    const out = [];
    walk(parsed);
    function walk(node) {
        if (typeof node === 'string') {
            if (/^[A-Za-z]:[\\/]|^\//.test(node))
                out.push(node);
        }
        else if (Array.isArray(node))
            node.forEach(walk);
        else if (typeof node === 'object' && node !== null)
            Object.values(node).forEach(walk);
    }
    return out;
}
function extractSandboxRequest(argsJson) {
    const parsed = safeParse(argsJson);
    if (typeof parsed !== 'object' || parsed === null)
        return undefined;
    const candidate = parsed['sandbox_permissions'];
    if (typeof candidate !== 'string' || candidate.length === 0)
        return undefined;
    const justification = typeof parsed['justification'] === 'string'
        ? parsed['justification']
        : '';
    return { level: candidate, justification };
}
