/**
 * Shell lexical decomposition for Bash and PowerShell, written from scratch.
 *
 * Design contract: a parse FAILURE is not a danger verdict. Anything the
 * static layer cannot see through (command substitution, heredocs, process
 * substitution, splatting) becomes an `opaque` segment; the assessment layer
 * then only checks a small set of high-confidence semantic markers and
 * otherwise lets the OS sandbox confine the write boundary.
 */
const BASH_JOINERS = ['&&', '||', ';', '|', '>', '>>'];
/** Split on joiners while respecting quotes; $() `` $(()) << heredoc > opaque. */
export function decomposeBash(line) {
    const segments = [];
    let current = '';
    let lastJoiner = '';
    let i = 0;
    const flush = (joiner) => {
        const text = current.trim();
        if (text.length > 0) {
            segments.push({
                kind: /[`$]|\bheredoc\b|<<|\$\(/.test(text) ? 'opaque' : 'word',
                text,
                joiner: lastJoiner || undefined,
            });
        }
        current = '';
        lastJoiner = joiner;
    };
    while (i < line.length) {
        const ch = line[i];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            current += ch;
            i += 1;
            while (i < line.length && line[i] !== quote) {
                if (quote === '"' && line[i] === '\\' && i + 1 < line.length) {
                    current += line.charAt(i) + (line[i + 1] ?? '');
                    i += 2;
                    continue;
                }
                current += line.charAt(i);
                i += 1;
            }
            if (i >= line.length)
                return { segments: [], opaqueReason: 'unbalanced-quote' };
            current += quote;
            i += 1;
            continue;
        }
        const rest = line.slice(i);
        const joiner = BASH_JOINERS.find(j => rest.startsWith(j));
        if (joiner) {
            flush(joiner);
            i += joiner.length;
            continue;
        }
        if (rest.startsWith('2>&1')) {
            current += '2>&1';
            i += 4;
            continue;
        }
        // Command substitution / heredoc intro makes the remainder opaque.
        if (rest.startsWith('$(') || rest.startsWith('`') || rest.startsWith('<<')) {
            segments.push({ kind: 'opaque', text: rest.trim(), joiner: lastJoiner || undefined });
            return { segments };
        }
        current += ch ?? '';
        i += 1;
    }
    flush('');
    return { segments };
}
export function decomposePwsh(line) {
    const segments = [];
    let current = '';
    let lastJoiner = '';
    let i = 0;
    const flush = (joiner) => {
        const text = current.trim();
        if (text.length > 0) {
            const splatting = /(^|\s)@\w/.test(text);
            segments.push({ kind: splatting ? 'opaque' : 'word', text, joiner: lastJoiner || undefined });
        }
        current = '';
        lastJoiner = joiner;
    };
    while (i < line.length) {
        const ch = line[i];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            current += ch;
            i += 1;
            while (i < line.length && line[i] !== quote) {
                current += line.charAt(i);
                i += 1;
            }
            if (i >= line.length)
                return { segments: [], opaqueReason: 'unbalanced-quote' };
            current += quote;
            i += 1;
            continue;
        }
        const rest = line.slice(i);
        const joiner = ['&&', '||', ';', '|', '>', '>>'].find(j => rest.startsWith(j));
        if (joiner) {
            flush(joiner);
            i += joiner.length;
            continue;
        }
        // Subexpressions and splatting stay opaque.
        if (/^\(\s*\(|^\$\(/.test(rest) || /(^|\s)@\w+/.test((ch ?? '') + rest.slice(1, 8)) && ch === '@') {
            segments.push({ kind: 'opaque', text: rest.trim(), joiner: lastJoiner || undefined });
            return { segments };
        }
        current += ch ?? '';
        i += 1;
    }
    flush('');
    return { segments };
}
export function decompose(shell, line) {
    return shell === 'bash' ? decomposeBash(line) : decomposePwsh(line);
}
