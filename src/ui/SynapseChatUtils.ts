import { App, MarkdownRenderer } from 'obsidian';
import SynapsePlugin from '../../main';

/**
 * 渲染 markdown 到容器
 */
export async function renderMarkdownToContainer(content: string, container: HTMLElement, plugin: SynapsePlugin) {
    container.empty();
    await MarkdownRenderer.renderMarkdown(content, container, '', plugin);
}

/**
 * 过滤非法字符，仅保留 Obsidian 支持的 note 名称部分
 */
export function sanitizeNoteLink(pathOrTitle: string): string {
    // 去除路径，只保留文件名（不带扩展名），并去除非法字符
    let name = pathOrTitle.replace(/.*\/(.+)\..+$/, '$1');
    // Obsidian 不允许 : ? * " < > | 等
    name = name.replace(/[\\/:*?"<>|]/g, '_');
    return name.trim();
}

/**
 * 使 markdown 渲染后的 wiki-link ([[Note]]) 和 [Source: ...] 链接可点击并打开笔记
 */
export function makeNoteReferencesClickable(container: HTMLElement, app: App) {
    // 处理 Obsidian 的 internal-link ([[Note]])
    const internalLinks = container.querySelectorAll<HTMLAnchorElement>('a.internal-link');
    internalLinks.forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-href') || link.textContent || '';
            if (target) {
                app.workspace.openLinkText(sanitizeNoteLink(target), '');
            }
        };
        link.style.cursor = 'pointer';
    });
    // 处理 [Source: ...] 链接（假设格式为 <a class="synapse-source-link">path/to/note.md</a>）
    const sourceLinks = container.querySelectorAll<HTMLAnchorElement>('a.synapse-source-link');
    sourceLinks.forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            const path = link.textContent || '';
            if (path) {
                app.workspace.openLinkText(sanitizeNoteLink(path), '');
            }
        };
        link.style.cursor = 'pointer';
    });
}

/**
 * 渲染引用文档 block（Obsidian 风格）
 */
export function renderSourcesBlock(parent: HTMLElement, sources: { path: string }[], app: App) {
    const uniqueSources = Array.from(new Map(sources.map(s => [s.path, s])).values());
    // Use the same class as chat message block for consistent width
    const sourcesEl = parent.createDiv('message-sources synapse-obsidian-quote synapse-chat-message');
    // Add 'message-content' class to blockquote for width match
    const quoteBlock = sourcesEl.createEl('blockquote', { cls: 'synapse-source-block message-content' });
    quoteBlock.createSpan({ text: 'Refs:', cls: 'synapse-source-label' });
    uniqueSources.forEach((source, idx) => {
        if (idx > 0) {
            quoteBlock.createSpan({ text: '·', cls: 'synapse-source-sep' });
        }
        const link = quoteBlock.createEl('a', { href: '#' });
        link.addClass('internal-link');
        link.setAttr('data-href', source.path);
        const title = sanitizeNoteLink(source.path);
        link.setText(title);
        link.onclick = (e) => {
            e.preventDefault();
            app.workspace.openLinkText(title, '');
        };
    });
}
