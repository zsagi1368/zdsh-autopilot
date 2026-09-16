export interface FeedbackEntry {
    verdictId: string;
    toolName: string;
    reason: string;
    kind: 'deny' | 'fallback' | 'circuit' | 'never';
    expiresAt: number;
}
export declare class FeedbackLoop {
    private readonly now;
    private readonly entries;
    constructor(now?: () => number);
    record(callId: string, entry: Omit<FeedbackEntry, 'expiresAt'>): void;
    /**
     * Build the model-visible replacement text for a FAILED (isError) tool
     * result. The marker guarantees "model-visible ⟺ recorded" pairing with the
     * corresponding ap/verdict event. Consumes the entry.
     */
    consume(callId: string, isError: boolean): string | undefined;
    get size(): number;
}
