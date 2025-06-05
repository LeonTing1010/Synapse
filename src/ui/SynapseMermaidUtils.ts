/**
 * Cleans AI-generated Mermaid mindmap code blocks to ensure valid Mermaid syntax.
 * - Extracts the code block content.
 * - Removes title/description lines.
 * - Removes markdown list symbols (-, +, *) and any following whitespace at the start of lines.
 * - Removes empty lines after cleaning.
 * - Ensures 'mindmap' is the first non-empty line and is not duplicated.
 * - Enforces a single root node structure by treating the first non-mindmap line as the root
 *   and indenting all subsequent non-empty lines as its children.
 * - Wraps the output in a ```mermaid code block.
 * This simplified version prioritizes valid structure over preserving complex AI indentation.
 */
export function cleanMermaidMindmapOutput(raw: string): string {
    let code = raw;
    const codeBlockMatch = raw.match(/```mermaid([\s\S]*?)```/i);
    if (codeBlockMatch) {
        code = codeBlockMatch[1];
    }
    code = code.replace(/^[ \t]*(title|description) .*$\n?/gim, '');
    const lines = code.split('\n');
    const processedLines: string[] = [];
    let rootContent: string | null = null;
    for (const line of lines) {
        let processedLine = line;
        processedLine = processedLine.replace(/^[ \t]*[-+*][ \t]*/, '');
        processedLine = processedLine.trim();
        if (processedLine.length === 0 || processedLine === 'mindmap') {
            continue;
        }
        if (rootContent === null) {
            rootContent = processedLine;
        } else {
            processedLines.push(processedLine);
        }
    }
    const finalLines: string[] = [];
    finalLines.push('mindmap');
    if (rootContent !== null) {
        finalLines.push('  ' + rootContent);
        for (const line of processedLines) {
            if (line.length > 0) {
                finalLines.push('    ' + line);
            }
        }
    }
    let cleanedCode = finalLines.join('\n');
    return '```mermaid\n' + cleanedCode.trim() + '\n```';
}
