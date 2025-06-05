import { App, Notice } from 'obsidian';
import { ResponseGenerator } from '../ai/ResponseGenerator';
import { AISuggestionService, Suggestion } from '../ai/AISuggestionService';
import { ChatMessage } from '../types/SynapseChatTypes';
import SynapsePlugin from '../../main';
import { cleanMermaidMindmapOutput } from './SynapseMermaidUtils';

export class SynapseChatProcessor {
    constructor(
        private app: App,
        private plugin: SynapsePlugin,
        private responseGenerator: ResponseGenerator,
        private aiSuggestionService: AISuggestionService,
        private lastRelatedNoteSnippets: Record<string, string>
    ) {}

    async processUserQuery(query: string, messages: ChatMessage[]): Promise<ChatMessage> {
        const lowerQuery = query.toLowerCase();
        const activeFile = this.app.workspace.getActiveFile();
        let relatedResults: Array<{ path: string; title: string; snippet: string }> = [];
        if (lowerQuery.includes('suggest tags') || lowerQuery.includes('recommend tags')) {
            if (!activeFile) {
                return { id: 'ai-' + Date.now(), content: 'Please open a note to get tag suggestions.', sender: 'ai', timestamp: Date.now(), type: 'text' };
            }
            const fileContent = await this.app.vault.read(activeFile);
            const aiPrompt = `Based on the following note content, generate up to 9 highly relevant tags (do include # at the start of each tag) that best describe the content, including tags that already exist in the note. Only return the tag list, no extra explanation. The reply language must be consistent with the note content language.\n\n${fileContent}`;
            let aiTags: string[] = [];
            try {
                const tagString = await this.responseGenerator.generateResponse(aiPrompt);
                let tags: string[] = [];
                try {
                    const parsed = JSON.parse(tagString);
                    if (Array.isArray(parsed)) {
                        tags = parsed;
                    } else {
                        tags = tagString.split('\n');
                    }
                } catch {
                    tags = tagString.split('\n');
                }
                aiTags = tags
                  .map(line => line.trim())
                  .filter((line, idx, arr) => line.length > 0 && arr.indexOf(line) === idx)
                  .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
                  .slice(0, 9);
            } catch (e) {
                const fallbackTags = await this.aiSuggestionService.suggestTags(fileContent);
                aiTags = fallbackTags.map(t => t.value).filter((v, i, arr) => v && arr.indexOf(v) === i).map(tag => tag.startsWith('#') ? tag : `#${tag}`).slice(0, 9);
            }
            if (aiTags.length === 0) {
                return {
                    id: 'ai-' + Date.now(),
                    content: 'No suitable tags could be generated for this note.',
                    sender: 'ai',
                    timestamp: Date.now(),
                    type: 'text'
                };
            }
            const replyContent = aiTags.join('\n');
            const suggestions: Suggestion[] = aiTags.map(tag => ({ type: 'tag', value: tag, action: undefined }));
            return {
                id: 'ai-' + Date.now(),
                content: replyContent,
                sender: 'ai',
                timestamp: Date.now(),
                type: 'suggestion-list',
                suggestions: suggestions
            };
        }
        if (lowerQuery.includes('find links') || lowerQuery.includes('suggest links')) {
            if (!activeFile) {
                return { id: 'ai-' + Date.now(), content: 'Please open a note to find links.', sender: 'ai', timestamp: Date.now(), type: 'text' };
            }
            const fileContent = await this.app.vault.read(activeFile);
            let suggestionsRaw: Suggestion[] = [];
            try {
                suggestionsRaw = await this.aiSuggestionService.suggestLinks(fileContent);
            } catch (e) {
                suggestionsRaw = await this.aiSuggestionService.suggestLinks(fileContent);
            }
            const suggestions = suggestionsRaw.map(s => ({ ...s, action: s.action || 'add' }));
            return {
                id: 'ai-' + Date.now(),
                content: 'Here are some potential links:',
                sender: 'ai',
                timestamp: Date.now(),
                type: 'suggestion-list',
                suggestions: suggestions
            };
        }
        if (lowerQuery.includes('suggest property') || lowerQuery.includes('recommend property')) {
            if (!activeFile) {
                return { id: 'ai-' + Date.now(), content: 'Please open a note to get property suggestions.', sender: 'ai', timestamp: Date.now(), type: 'text' };
            }
            const fileContent = await this.app.vault.read(activeFile);
            const aiPrompt = `Based on the following note content, suggest up to 9 highly relevant metadata properties (YAML frontmatter or inline) and their values that best describe the content. Only return the property list, no extra explanation. The reply language must be consistent with the note content language.\n\n${fileContent}`;
            let aiProperties: {key: string, value: string}[] = [];
            try {
                const propString = await this.responseGenerator.generateResponse(aiPrompt);
                aiProperties = Array.from((propString.matchAll(/([\w-]+):\s*([^\n]+)/g) || []))
                    .map((m: any) => ({ key: m[1].trim(), value: m[2].trim() }))
                    .slice(0, 9);
            } catch (e) {
                const fallbackProps = await this.aiSuggestionService.suggestProperties(fileContent);
                aiProperties = fallbackProps.map((p: any) => ({ key: p.key || '', value: p.propertyValue || '' })).filter((p: any) => p.key).slice(0, 9);
            }
            if (aiProperties.length === 0) {
                return {
                    id: 'ai-' + Date.now(),
                    content: 'No suitable properties could be generated for this note.',
                    sender: 'ai',
                    timestamp: Date.now(),
                    type: 'text'
                };
            }
            const replyContent = aiProperties.map((p: any) => `${p.key}: ${p.value}`).join('\n');
            const suggestions: Suggestion[] = aiProperties.map((p: any) => ({ type: 'property', value: `${p.key}: ${p.value}`, key: p.key, propertyValue: p.value, action: undefined }));
            return {
                id: 'ai-' + Date.now(),
                content: replyContent,
                sender: 'ai',
                timestamp: Date.now(),
                type: 'suggestion-list',
                suggestions: suggestions
            };
        }
        if (lowerQuery.includes('check metadata consistency')) {
            const suggestionsRaw = await this.aiSuggestionService.checkMetadataConsistency();
            const suggestions = suggestionsRaw.map((s: any) => ({ ...s, action: s.action }));
            if (suggestions.length === 0) {
                return {
                    id: 'ai-' + Date.now(),
                    content: 'No metadata consistency issues found.',
                    sender: 'ai',
                    timestamp: Date.now(),
                    type: 'text'
                };
            }
            return {
                id: 'ai-' + Date.now(),
                content: 'Metadata consistency issues detected:',
                sender: 'ai',
                timestamp: Date.now(),
                type: 'suggestion-list',
                suggestions: suggestions
            };
        }
        if (lowerQuery.includes('show type insights') || lowerQuery.includes('metadata type insight')) {
            const suggestionsRaw = await this.aiSuggestionService.suggestMetadataTypeInsights();
            const suggestions = suggestionsRaw.map((s: any) => ({ ...s, action: s.action }));
            if (suggestions.length === 0) {
                return {
                    id: 'ai-' + Date.now(),
                    content: 'No new metadata type insights found.',
                    sender: 'ai',
                    timestamp: Date.now(),
                    type: 'text'
                };
            }
            return {
                id: 'ai-' + Date.now(),
                content: 'Potential new metadata types detected:',
                sender: 'ai',
                timestamp: Date.now(),
                type: 'suggestion-list',
                suggestions: suggestions
            };
        }
        if (lowerQuery.includes('summarize') && activeFile) {
            const content = await this.app.vault.read(activeFile);
            const summaryPrompt = `Summarize the following note content:\n\n${content}`;
            const summary = await this.responseGenerator.generateResponse(summaryPrompt);
            return {
                id: 'ai-' + Date.now(),
                content: `Here is a summary of the current note:\n\n${summary}`,
                sender: 'ai',
                timestamp: Date.now(),
                type: 'text'
            };
        }
        if (lowerQuery.includes('outline') && activeFile) {
            const content = await this.app.vault.read(activeFile);
            const outlinePrompt = `Create an outline for the following note content:\n\n${content}`;
            const outline = await this.responseGenerator.generateResponse(outlinePrompt);
            return {
                id: 'ai-' + Date.now(),
                content: `Here is an outline for the current note:\n\n${outline}`,
                sender: 'ai',
                timestamp: Date.now(),
                type: 'text'
            };
        }
        if (lowerQuery.includes('mindmap')) {
            if (!activeFile) {
                return { id: 'ai-' + Date.now(), content: 'Please open a note to generate a mindmap.', sender: 'ai', timestamp: Date.now(), type: 'text' };
            }
            const fileContent = await this.app.vault.read(activeFile);
            const aiPrompt = `Based on the following note content, generate a valid Mermaid mindmap code block (use markdown triple backticks and 'mermaid' as the language).\n**Strictly follow Mermaid mindmap syntax. Do NOT include any title, description, explanations, or extra lines outside the code block. Use exactly two spaces for each level of indentation. Ensure there is only one root node directly under 'mindmap'. Do NOT use markdown list symbols (-, +, *) for indentation.**\nExample:\n\u0060\u0060\u0060mermaid\nmindmap\n  root\n    child1\n      grandchild1\n    child2\n\u0060\u0060\u0060\n\n${fileContent}`;
            let mindmapCode = '';
            try {
                mindmapCode = await this.responseGenerator.generateResponse(aiPrompt);
            } catch (e) {
                return {
                    id: 'ai-' + Date.now(),
                    content: 'Failed to generate mindmap for this note.',
                    sender: 'ai',
                    timestamp: Date.now(),
                    type: 'text'
                };
            }
            mindmapCode = cleanMermaidMindmapOutput(mindmapCode);
            return {
                id: 'ai-' + Date.now(),
                content: mindmapCode,
                sender: 'ai',
                timestamp: Date.now(),
                type: 'text'
            };
        }
        // --- Fallback to General Conversational AI (Q&A) ---
        const conversationHistory = messages.slice(-5).map(msg => `${msg.sender}: ${msg.content}`).join('\n');
        const activeNoteContext = await this.buildContext();
        let relatedNotesContext = '';
        this.lastRelatedNoteSnippets = {};
        try {
            relatedResults = await this.plugin.vectorSearch.semanticSearch(query, 5);
            if (relatedResults.length > 0) {
                relatedNotesContext = '\n\nRelated Notes Context:\n';
                relatedResults.forEach(result => {
                    relatedNotesContext += `- [[${result.title}]]\n`;
                    relatedNotesContext += `  Snippet: ${result.snippet}\n`;
                    this.lastRelatedNoteSnippets[result.path] = result.snippet;
                });
            }
        } catch (error) {
            relatedNotesContext = '\n\nCould not fetch related notes context.';
        }
        const systemPrompt = `You are a helpful AI assistant integrated into an Obsidian knowledge base. Your goal is to assist the user by answering questions and providing insights based on their notes.`;
        const userPrompt = `Based on the following context from the user's knowledge base and conversation history:\n\n` +
                           `Knowledge Base Context: ${activeNoteContext}${relatedNotesContext}\n\n` +
                           `Conversation History:\n${conversationHistory}\n\n` +
                           `User Query: ${query}\n\n` +
                           `Provide a helpful response. If your response is based on specific notes, cite them by including a reference like [Source: path/to/note.md] at the end of the relevant sentence or paragraph. Prioritize information from the provided context.`;
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
        const aiResponseContent = await this.responseGenerator.generateResponse(fullPrompt);
        const parsedResponse = this.parseAIResponseForSources(aiResponseContent);
        let sources = parsedResponse.sources;
        if ((!sources || sources.length === 0) && relatedResults && relatedResults.length > 0) {
            sources = relatedResults.map((result) => ({ path: result.path, snippet: result.snippet }));
        }
        return { ...parsedResponse, id: 'ai-' + Date.now(), sender: 'ai', timestamp: Date.now(), type: 'text', sources };
    }

    parseAIResponseForSources(responseText: string): { content: string; sources?: { path: string; snippet: string }[] } {
        const sources: { path: string; snippet: string }[] = [];
        let content = responseText.trim();
        const citationRegex = /\[Source: (.*?)\]/g;
        let match;
        const foundCitations = new Set<string>();
        while ((match = citationRegex.exec(content)) !== null) {
            foundCitations.add(match[1]);
        }
        foundCitations.forEach(citationPath => {
            const source = Object.entries(this.lastRelatedNoteSnippets).find(([path, snippet]) =>
                path === citationPath
            );
            if (source) {
                sources.push({ path: source[0], snippet: source[1] });
            }
        });
        content = content.replace(citationRegex, '').trim();
        return { content, sources: sources.length > 0 ? sources : undefined };
    }

    async buildContext(): Promise<string> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            return 'No active note.';
        }
        try {
            const metadataCache = this.app.metadataCache.getFileCache(activeFile);
            if (!metadataCache) {
                return 'No metadata available for the active note.';
            }
            let metaInfo = `Path: ${activeFile.path}\n`;
            if (metadataCache.frontmatter) {
                metaInfo += 'Frontmatter:\n';
                for (const [key, value] of Object.entries(metadataCache.frontmatter)) {
                    metaInfo += `  ${key}: ${JSON.stringify(value)}\n`;
                }
            }
            if (metadataCache.tags && metadataCache.tags.length > 0) {
                metaInfo += 'Tags: ' + metadataCache.tags.map((t: any) => t.tag).join(', ') + '\n';
            }
            if (metadataCache.links && metadataCache.links.length > 0) {
                metaInfo += 'Links: ' + metadataCache.links.map((l: any) => l.link).join(', ') + '\n';
            }
            return `Active Note: ${metaInfo}`;
        } catch (error) {
            return `Could not read active note: ${activeFile.path}`;
        }
    }
}
