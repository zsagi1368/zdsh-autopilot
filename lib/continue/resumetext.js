export function formatElapsed(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
}
export function fillTemplate(template, ctx) {
    const replacements = {
        code: ctx.code ?? 'unknown',
        message: (ctx.message ?? '').slice(0, 200),
        status: ctx.status ?? '',
        tool: ctx.tool ?? '',
        turn: ctx.turn ?? '',
        elapsed: ctx.elapsedMs === undefined ? '' : formatElapsed(ctx.elapsedMs),
    };
    return template.replace(/\{(\w+)\}/g, (whole, key) => replacements[key] ?? whole);
}
export function buildResumeText(args) {
    const base = args.kind === 'loop'
        ? args.texts.loop
        : args.kind === 'continue-max-tokens'
            ? args.texts.continueMaxTokens
            : args.texts.continue;
    let text = fillTemplate(base, args.ctx);
    if (args.kind !== 'loop' && args.guardState) {
        const suffix = args.guardState === 'pending'
            ? args.guards.pending
            : args.guardState === 'done'
                ? args.guards.done
                : undefined; // failed → no guardrail: retrying IS the intent
        if (suffix)
            text = `${text}\n\n${fillTemplate(suffix, { ...args.ctx })}`;
    }
    return text;
}
