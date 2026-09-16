/**
 * Shell lexical decomposition for Bash and PowerShell, written from scratch.
 *
 * Design contract: a parse FAILURE is not a danger verdict. Anything the
 * static layer cannot see through (command substitution, heredocs, process
 * substitution, splatting) becomes an `opaque` segment; the assessment layer
 * then only checks a small set of high-confidence semantic markers and
 * otherwise lets the OS sandbox confine the write boundary.
 */
export type ShellKind = 'bash' | 'pwsh';
export interface Segment {
    kind: 'word' | 'opaque';
    text: string;
    /** Operator that separated this segment (&& || ; | > >> 2>&1). */
    joiner?: string | undefined;
}
export interface Decomposition {
    segments: Segment[];
    /** Set when the whole line could not be statically decomposed. */
    opaqueReason?: string;
}
export type Decision = 'allow' | 'classify' | 'deny';
export interface Assessment {
    decision: Decision;
    reason: string;
}
/** Split on joiners while respecting quotes; $() `` $(()) << heredoc > opaque. */
export declare function decomposeBash(line: string): Decomposition;
export declare function decomposePwsh(line: string): Decomposition;
export declare function decompose(shell: ShellKind, line: string): Decomposition;
