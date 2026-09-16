/**
 * Structure-aware redaction pipeline.
 *
 * Everything that crosses a model boundary (classifier payloads, reviewer
 * prompts) passes through here first. Two profiles:
 *  - `standard`: same-provider targets. Token-shaped secrets and secret-named
 *    keys are replaced; bulk content keys collapse to length placeholders.
 *  - `strict`: cross-provider targets. Additionally strips credential blocks,
 *    connection strings, and cloud key ids from free text.
 *
 * Caps: recursion depth 3, arrays 25 items, objects 50 keys, scalar strings
 * truncated to 1000 chars AFTER text-form redaction.
 */
export type RedactProfile = 'standard' | 'strict';
export declare const REDACT_CAPS: {
    readonly depth: 3;
    readonly arrayItems: 25;
    readonly objectKeys: 50;
    readonly scalarChars: 1000;
};
/** Key substrings (lowercased) whose presence marks the whole field a secret. */
export declare const SECRET_KEY_MARKERS: readonly string[];
/** Keys whose VALUES are bulk content: replaced by a length placeholder only. */
export declare const BULK_KEY_NAMES: readonly string[];
export declare const REDACTED_SECRET = "[redacted-secret]";
export declare function redactedBulkPlaceholder(key: string, length: number): string;
export declare function redactString(text: string, profile: RedactProfile): string;
export declare function redact(value: unknown, profile?: RedactProfile): unknown;
