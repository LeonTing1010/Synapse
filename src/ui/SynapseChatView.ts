import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import {  Modal, Setting, App } from 'obsidian'; // Import Modal, Setting, App, and TFile
import SynapsePlugin from '../../main';
import { ResponseGenerator } from '../ai/ResponseGenerator';
import { AISuggestionService, Suggestion } from '../ai/AISuggestionService'; // Import AISuggestionService and Suggestion
import { renderMarkdownToContainer, makeNoteReferencesClickable, renderSourcesBlock } from './SynapseChatUtils';
import { ChatMessage } from '../types/SynapseChatTypes';
import { cleanMermaidMindmapOutput } from './SynapseMermaidUtils';
import { SynapseSuggestionHandler } from './SynapseSuggestionHandler';
import { SynapseChatProcessor } from './SynapseChatProcessor';

export const SYNAPSE_CHAT_VIEW_TYPE = 'synapse-chat-view';

// Define a simple Prompt Modal class
class PromptModal extends Modal {
    result: string;
    onSubmit: (result: string) => void;
    message: string;
    placeholder: string;

    constructor(app: App, message: string, placeholder: string, onSubmit: (result: string) => void) {
        super(app);
        this.message = message;
        this.placeholder = placeholder;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.message });

        new Setting(contentEl)
            .addText(text => text
                .setPlaceholder(this.placeholder)
                .onChange(value => {
                    this.result = value;
                }));

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Submit')
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onSubmit(this.result);
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class SynapseChatView extends ItemView {
    private messages: ChatMessage[] = [];
    private messagesContainer: HTMLElement | null = null;
    private inputField: HTMLTextAreaElement | null = null;
    private isLoading: boolean = false;
    private responseGenerator: ResponseGenerator;
    private aiSuggestionService: AISuggestionService; // Add AISSuggestionService property
    private lastRelatedNoteSnippets: Record<string, string> = {};

    // Slash command list for chat input
    private slashCommands = [
        { command: '/tags', label: 'Suggest Tags', insert: 'suggest tags' },
        { command: '/links', label: 'Find Links', insert: 'find links' },
        { command: '/property', label: 'Suggest Property', insert: 'suggest property' },
        { command: '/consistency', label: 'Check Metadata Consistency', insert: 'check metadata consistency' },
        { command: '/insights', label: 'Show Type Insights', insert: 'show type insights' },
        { command: '/summarize', label: 'Summarize Note', insert: 'summarize' },
        { command: '/outline', label: 'Outline Note', insert: 'outline' },
        { command: '/mindmap', label: 'Generate Mindmap', insert: 'mindmap' }
    ];
    private slashMenu: HTMLElement | null = null;
    private slashMenuIndex: number = 0;

    private suggestionHandler: SynapseSuggestionHandler;
    private chatProcessor: SynapseChatProcessor;

    constructor(leaf: WorkspaceLeaf, private plugin: SynapsePlugin, responseGenerator: ResponseGenerator, aiSuggestionService: AISuggestionService) {
        super(leaf);
        this.responseGenerator = responseGenerator;
        this.aiSuggestionService = aiSuggestionService;
        this.icon = 'message-circle';
        this.suggestionHandler = new SynapseSuggestionHandler(this.app, this.aiSuggestionService);
        this.chatProcessor = new SynapseChatProcessor(this.app, this.plugin, this.responseGenerator, this.aiSuggestionService, this.lastRelatedNoteSnippets);
    }

    getViewType(): string {
        // ...existing getViewType code...
        return SYNAPSE_CHAT_VIEW_TYPE;
    }

    getDisplayText(): string {
        // ...existing getDisplayText code...
        return 'Synapse AI Chat';
    }

    getIcon(): string {
        return this.icon || 'message-circle';
    }

    async onOpen() {

        const container = this.containerEl.children[1]; // This is likely the view-content div
        container.empty();
        container.addClass('synapse-chat-view'); // Main view container class

        // Header
        const header = container.createEl('div', { cls: 'synapse-chat-header' });
        // header.createEl('h2', { text: 'Synapse' });

        // Messages Container (takes up space and scrolls)
        this.messagesContainer = container.createDiv('synapse-chat-container');

        // Input Container (fixed at the bottom)
        const inputContainer = container.createDiv('synapse-chat-input-row');
        this.inputField = inputContainer.createEl('textarea');
        this.inputField.placeholder = 'Ask me anything about your notes...';
        this.inputField.addClass('synapse-input-field');

        // 直接用 send 图标作为发送按钮，无需 button 元素
        const sendIcon = inputContainer.createEl('i');
        sendIcon.addClass('lucide');
        sendIcon.addClass('lucide-send');
        sendIcon.addClass('synapse-send-icon');
        sendIcon.setAttr('tabindex', '0'); // 可键盘聚焦
        sendIcon.setAttr('role', 'button');
        sendIcon.setAttr('aria-label', 'Send');
        sendIcon.onclick = () => this.sendMessage();
        sendIcon.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.addMessage({
            id: 'welcome',
            content: 'Hello! I\'m your Synapse AI assistant. I can help you search through your notes, find connections, and answer questions about your knowledge base.',
            sender: 'ai',
            timestamp: Date.now()
        });

        this.inputField.addEventListener('input', (e) => this.handleSlashInput());
        this.inputField.addEventListener('keydown', (e) => this.handleSlashKeydown(e));
    }

    private async sendMessage() {
        if (!this.inputField || !this.messagesContainer || this.isLoading) return;

        const message = this.inputField.value.trim();
        if (!message) return;

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            content: message,
            sender: 'user',
            timestamp: Date.now(),
            type: 'text' // User messages are always text
        };
        this.addMessage(userMessage);

        this.inputField.value = '';
        this.isLoading = true; // Set loading state
        this.showTypingIndicator();

        try {
            // Use chatProcessor to handle AI response
            const response = await this.chatProcessor.processUserQuery(message, this.messages);

            this.hideTypingIndicator();
            this.isLoading = false; // Clear loading state

            const aiMessage: ChatMessage = {
                id: `ai-${Date.now()}`,
                content: response.content || '',
                sender: 'ai',
                timestamp: Date.now(),
                sources: response.sources,
                type: response.type,
                suggestions: response.suggestions
            };
            this.addMessage(aiMessage);

        } catch (error: any) {
            this.hideTypingIndicator();
            this.isLoading = false; // Clear loading state
            let userFriendlyMsg = 'Sorry, there was a problem processing your request.';
            if (error?.message?.includes('401')) {
                userFriendlyMsg = 'OpenAI API Key is invalid or expired. Please check and re-enter it in Settings.';
            } else if (error?.message?.includes('429')) {
                userFriendlyMsg = 'Too many requests or quota exceeded. Please try again later.';
            } else if (error?.message?.toLowerCase().includes('network')) {
                userFriendlyMsg = 'Network connection error. Please check your network.';
            } else if (error?.message?.toLowerCase().includes('timeout')) {
                userFriendlyMsg = 'Request timed out. Please try again later.';
            } else if (error?.message?.toLowerCase().includes('model')) {
                userFriendlyMsg = 'Model unavailable or name error. Please check your model configuration in Settings.';
            }
            // Only log errors in development mode
            if (process.env.NODE_ENV === 'development') {
                console.error('Error getting AI response:', error);
            }
            const errorMessage: ChatMessage = {
                id: `error-${Date.now()}`,
                content: userFriendlyMsg,
                sender: 'ai',
                timestamp: Date.now()
            };
            this.addMessage(errorMessage);
        }
    }

    private async addMessage(message: ChatMessage) {
        if (!this.messagesContainer) return;
        this.messages.push(message);
        const messageEl = this.messagesContainer.createDiv('synapse-chat-message');
        messageEl.addClass(`synapse-message-${message.sender}`);

        // --- Add message actions container (copy & follow-up) ---
        const actionsEl = messageEl.createDiv('synapse-message-actions');
        // Copy button
        const copyBtn = actionsEl.createEl('button', { cls: 'synapse-action-btn synapse-copy-btn', attr: { 'aria-label': 'Copy message', 'title': 'Copy message' } });
        copyBtn.addClass('icon-copy');
        copyBtn.onclick = async () => {
            await navigator.clipboard.writeText(message.content);
            copyBtn.classList.add('copied');
            setTimeout(() => copyBtn.classList.remove('copied'), 1200);
        };
        // Follow-up button
        const followBtn = actionsEl.createEl('button', { cls: 'synapse-action-btn synapse-followup-btn', attr: { 'aria-label': 'Follow up', 'title': 'Follow up' } });
        followBtn.addClass('icon-followup');
        followBtn.onclick = () => {
            if (this.inputField) {
                this.inputField.value = `Follow up: ${message.content}`;
                this.inputField.focus();
            }
        };

        if (message.type === 'suggestion-list' && message.suggestions) {
            const contentEl = messageEl.createDiv('message-content');
            if (message.content) {
                await renderMarkdownToContainer(message.content, contentEl, this.plugin);
                makeNoteReferencesClickable(contentEl, this.app);
            }

            // Filter suggestions into categories
            const batchMergeSuggestions = message.suggestions.filter(s => s.type === 'tag' && s.action === 'merge') as Suggestion[];
            const batchStandardizeSuggestions = message.suggestions.filter(s => s.type === 'property' && s.action === 'standardize') as Suggestion[];
            const typeInsightSuggestions = message.suggestions.filter(s =>
                s.type === 'property' && s.action === 'add' && s.key // Ensure it's a property add suggestion with a key
            ) as Suggestion[];
             // Individual suggestions are anything not handled by batch or type insights
            const individualSuggestions = message.suggestions.filter(s =>
                !(s.type === 'tag' && s.action === 'merge') &&
                !(s.type === 'property' && s.action === 'standardize') &&
                !(s.type === 'property' && s.action === 'add' && s.key) // Exclude type insights here
            ) as Suggestion[];


            if (batchMergeSuggestions.length > 0) {
                const mergeGroup = messageEl.createDiv('synapse-batch-group');
                mergeGroup.createEl('strong', { text: 'Similar tags to merge:' });
                const mergeList = mergeGroup.createEl('ul');
                batchMergeSuggestions.forEach(s => {
                    renderMarkdownToContainer(s.value, mergeList.createEl('li'), this.plugin);
                });
                const mergeActions = mergeGroup.createDiv('synapse-batch-actions');
                const acceptAllBtn = mergeActions.createEl('button', { text: 'Accept All Merges' });
                acceptAllBtn.onclick = () => this.handleBatchMerge(batchMergeSuggestions);
            }
            if (batchStandardizeSuggestions.length > 0) {
                const stdGroup = messageEl.createDiv('synapse-batch-group');
                stdGroup.createEl('strong', { text: 'Properties to standardize:' });
                const stdList = stdGroup.createEl('ul');
                batchStandardizeSuggestions.forEach(s => {
                    renderMarkdownToContainer(s.value, stdList.createEl('li'), this.plugin);
                });
                const stdActions = stdGroup.createDiv('synapse-batch-actions');
                const acceptAllBtn = stdActions.createEl('button', { text: 'Standardize All' });
                acceptAllBtn.onclick = () => this.handleBatchStandardize(batchStandardizeSuggestions);
            }

            // --- Render Type Insight Suggestions ---
            if (typeInsightSuggestions.length > 0) {
                 const insightsListEl = messageEl.createDiv('synapse-suggestion-list-obsidian');
                 insightsListEl.createEl('strong', { text: 'Potential new metadata types detected:' }); // Add a header
                 for (const suggestion of typeInsightSuggestions) {
                     const card = insightsListEl.createDiv('synapse-suggestion-card');
                     card.addClass('synapse-type-insight-card'); // Add a specific class for styling if needed

                     // Icon for property
                     const iconSpan = card.createSpan('synapse-suggestion-icon');
                     iconSpan.classList.add('icon-property');

                     // Suggestion text (display the key and maybe value as description)
                     const suggestionText = card.createDiv('synapse-suggestion-text');
                     suggestionText.createEl('strong', { text: suggestion.key });
                     if (suggestion.value && suggestion.value !== suggestion.key) { // Avoid repeating key if value is just the key
                         suggestionText.createSpan({ text: `: ${suggestion.value}` });
                     }
                     // Add frequency or example notes if available in suggestion object (future)
                     // e.g., if (suggestion.frequency) suggestionText.createDiv({ text: `Frequency: ${suggestion.frequency}` });

                     // Action buttons container
                     const actionButtons = card.createDiv('synapse-suggestion-actions'); // New div for buttons

                     // Accept button
                     const acceptButton = actionButtons.createEl('button', { text: 'Accept', cls: 'synapse-apply-button-obsidian' });
                     // Pass buttons to disable
                     const ignoreButton = actionButtons.createEl('button', { text: 'Ignore', cls: 'synapse-action-btn' }); // Reuse action-btn or create new style
                     acceptButton.onclick = () => this.handleAcceptTypeInsight(suggestion, acceptButton, ignoreButton);

                     // Ignore button
                     // Pass buttons to disable
                     ignoreButton.onclick = () => this.handleIgnoreTypeInsight(suggestion, acceptButton, ignoreButton);
                 }
            }


            // --- Render Other Individual Suggestions (Tags, Links, Property Updates) ---
            if (individualSuggestions.length > 0) {
                // Optional: Add a header for these if needed, or just let them follow
                // const individualHeader = messageEl.createEl('strong', { text: 'Other Suggestions:' });
                const suggestionsListEl = messageEl.createDiv('synapse-suggestion-list-obsidian');
                for (const suggestion of individualSuggestions) {
                    const card = suggestionsListEl.createDiv('synapse-suggestion-card');
                    // Icon for type
                    const iconSpan = card.createSpan('synapse-suggestion-icon');
                    if (suggestion.type === 'tag') {
                        iconSpan.classList.add('icon-tag');
                    } else if (suggestion.type === 'link') {
                        iconSpan.classList.add('icon-link');
                    } else if (suggestion.type === 'property') {
                        iconSpan.classList.add('icon-property');
                    }
                    // Suggestion text
                    const suggestionText = card.createDiv('synapse-suggestion-text');
                    await renderMarkdownToContainer(suggestion.value, suggestionText, this.plugin);
                    // Apply button
                    const applyButton = card.createEl('button', { text: 'Apply', cls: 'synapse-apply-button-obsidian' });
                    // Pass button to disable
                    applyButton.onclick = () => this.handleApplySuggestion(suggestion, applyButton);
                }
            }


            if (message.sources && message.sources.length > 0) {
                renderSourcesBlock(messageEl, message.sources, this.app);
            }
        } else {
            const contentEl = messageEl.createDiv('message-content');
            await renderMarkdownToContainer(message.content, contentEl, this.plugin);
            makeNoteReferencesClickable(contentEl, this.app);
            if (message.sources && message.sources.length > 0) {
                renderSourcesBlock(messageEl, message.sources, this.app);
            }
        }
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private showTypingIndicator() {
        if (!this.messagesContainer) return;
        const typingEl = this.messagesContainer.createDiv('synapse-typing-indicator');
        typingEl.id = 'typing-indicator';
        // typingEl.addClass('synapse-typing-indicator'); // Class added directly in createDiv
        typingEl.addClass('mod-muted'); // Obsidian 次要文本色
        typingEl.textContent = 'Synapse is thinking...';
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private hideTypingIndicator() {
        const typingEl = document.getElementById('typing-indicator');
        if (typingEl) {
            typingEl.remove();
        }
    }

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
    private cleanMermaidMindmapOutput(raw: string): string {
        return cleanMermaidMindmapOutput(raw);
    }

    private handleSlashInput() {
        if (!this.inputField) return;
        const value = this.inputField.value;
        const cursor = this.inputField.selectionStart || 0;
        const slashIndex = value.lastIndexOf('/', cursor - 1);
        if (slashIndex === -1 || (slashIndex > 0 && /\S/.test(value[slashIndex - 1]))) {
            this.closeSlashMenu();
            return;
        }
        const query = value.slice(slashIndex + 1, cursor).toLowerCase();
        const filtered = this.slashCommands.filter(cmd => cmd.command.slice(1).startsWith(query) || cmd.label.toLowerCase().includes(query));
        if (filtered.length === 0) {
            this.closeSlashMenu();
            return;
        }
        this.showSlashMenu(filtered, slashIndex, cursor);
    }

    private handleSlashKeydown(e: KeyboardEvent) {
        if (!this.slashMenu) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.slashMenuIndex = Math.min(this.slashMenuIndex + 1, this.slashMenu!.children.length - 1);
            this.updateSlashMenuActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.slashMenuIndex = Math.max(this.slashMenuIndex - 1, 0);
            this.updateSlashMenuActive();
        } else if (e.key === 'Enter') {
            if (this.slashMenu) {
                e.preventDefault();
                this.selectSlashMenu();
            }
        } else if (e.key === 'Escape') {
            this.closeSlashMenu();
        }
    }

    private showSlashMenu(commands: any[], slashIndex: number, cursor: number) {
        this.closeSlashMenu();
        if (!this.inputField) return;
        this.slashMenu = document.createElement('div');
        this.slashMenu.className = 'synapse-slash-menu';
        this.slashMenuIndex = 0;
        commands.forEach((cmd, i) => {
            const item = document.createElement('div');
            item.className = 'synapse-slash-menu-item';
            item.textContent = `${cmd.command}  —  ${cmd.label}`;
            if (i === 0) item.classList.add('active');
            item.onclick = () => {
                this.slashMenuIndex = i;
                this.selectSlashMenu();
            };
            this.slashMenu!.appendChild(item);
        });
        // Position menu above input using CSS class only
        // Add a wrapper to the input container for relative positioning if needed
        // The menu will be absolutely positioned via CSS
        this.inputField.parentElement?.appendChild(this.slashMenu);
        // Optionally, add a class to the parent for relative positioning
        this.inputField.parentElement?.classList.add('synapse-input-relative');
    }

    private updateSlashMenuActive() {
        if (!this.slashMenu) return;
        Array.from(this.slashMenu.children).forEach((el, i) => {
            el.classList.toggle('active', i === this.slashMenuIndex);
        });
    }

    private selectSlashMenu() {
        if (!this.inputField || !this.slashMenu) return;
        const items = Array.from(this.slashMenu.children);
        const selected = items[this.slashMenuIndex];
        if (!selected) return;
        const cmd = this.slashCommands.find(c => selected.textContent!.startsWith(c.command));
        if (!cmd) return;
        // Replace the slash command in the input with the actual instruction
        const value = this.inputField.value;
        const cursor = this.inputField.selectionStart || 0;
        const slashIndex = value.lastIndexOf('/', cursor - 1);
        if (slashIndex === -1) return;
        this.inputField.value = value.slice(0, slashIndex) + cmd.insert + value.slice(cursor);
        this.inputField.selectionStart = this.inputField.selectionEnd = slashIndex + cmd.insert.length;
        this.closeSlashMenu();
        this.inputField.focus();
    }

    private closeSlashMenu() {
        if (this.slashMenu) {
            this.slashMenu.remove();
            this.slashMenu = null;
        }
    }

    // --- Suggestion Handlers (refactored, now call suggestionHandler or PromptModal) ---
    private async handleApplySuggestion(suggestion: any, applyButton: HTMLButtonElement) {
        await this.suggestionHandler.applySuggestion(suggestion, applyButton);
    }
    private async handleAcceptTypeInsight(suggestion: any, acceptButton: HTMLButtonElement, ignoreButton: HTMLButtonElement) {
        await this.suggestionHandler.acceptTypeInsight(suggestion, acceptButton, ignoreButton);
    }
    private async handleIgnoreTypeInsight(suggestion: any, acceptButton: HTMLButtonElement, ignoreButton: HTMLButtonElement) {
        await this.suggestionHandler.ignoreTypeInsight(suggestion, acceptButton, ignoreButton);
    }
    private async handleBatchMerge(suggestions: any[]) {
        // Example: prompt for target tag, then call aiSuggestionService.applyBatchMerge
        if (suggestions.length === 0) return;
        const suggestionsByTag: Record<string, any[]> = {};
        suggestions.forEach(s => {
            if (s.type === 'tag' && s.action === 'merge' && s.value) {
                if (!suggestionsByTag[s.value]) suggestionsByTag[s.value] = [];
                suggestionsByTag[s.value].push(s);
            }
        });
        for (const tag of Object.keys(suggestionsByTag)) {
            const suggestionsForThisTag = suggestionsByTag[tag];
            new PromptModal(this.app, 'Enter the target tag to merge into:', 'e.g., #project/synapse', async (targetTag) => {
                if (!targetTag || targetTag.trim() === '') return;
                try {
                    await this.aiSuggestionService.applyBatchMerge(suggestionsForThisTag, targetTag.trim());
                } catch (error) {
                    new Notice('An error occurred during merge.');
                }
            }).open();
        }
    }
    private async handleBatchStandardize(suggestions: any[]) {
        if (suggestions.length === 0) return;
        const suggestionsByKey: Record<string, any[]> = {};
        suggestions.forEach(s => {
            if (s.type === 'property' && s.action === 'standardize' && s.key && s.propertyValue !== undefined) {
                if (!suggestionsByKey[s.key]) suggestionsByKey[s.key] = [];
                suggestionsByKey[s.key].push(s);
            }
        });
        for (const key of Object.keys(suggestionsByKey)) {
            const suggestionsForThisKey = suggestionsByKey[key];
            const currentValues = Array.from(new Set(suggestionsForThisKey.map(s => String(s.propertyValue)))).join(', ');
            await new Promise<void>((resolve) => {
                new PromptModal(this.app,
                    `Standardize values for property '${key}'. Current values: ${currentValues}. Enter the target value:`,
                    'e.g., completed',
                    async (targetValue) => {
                        if (!targetValue || targetValue.trim() === '') {
                            resolve();
                            return;
                        }
                        try {
                            await this.aiSuggestionService.applyBatchStandardize(suggestionsForThisKey, targetValue.trim());
                        } catch (error) {
                            new Notice(`An error occurred during batch standardization for property '${key}'.`);
                        } finally {
                            resolve();
                        }
                    }
                ).open();
            });
        }
    }
}