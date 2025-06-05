import { App, Notice, TFile } from 'obsidian';
import { Suggestion } from '../ai/AISuggestionService';

export class SynapseSuggestionHandler {
    constructor(private app: App, private aiSuggestionService: any) {}

    async applySuggestion(suggestion: Suggestion, applyButton: HTMLButtonElement) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file to apply suggestion to.');
            return;
        }
        applyButton.disabled = true;
        const originalButtonText = applyButton.textContent;
        applyButton.textContent = 'Applying...';
        try {
            let success = false;
            if (suggestion.type === 'tag' && (suggestion.action === undefined || suggestion.action === 'add')) {
                success = await this.aiSuggestionService.applyTagSuggestion(activeFile, suggestion.value);
            } else if (suggestion.type === 'link' && (suggestion.action === undefined || suggestion.action === 'add')) {
                success = await this.aiSuggestionService.applyLinkSuggestion(activeFile, suggestion.value, suggestion.notePath);
            } else if (suggestion.type === 'property' && suggestion.key && suggestion.propertyValue !== undefined && (suggestion.action === undefined || suggestion.action === 'add' || suggestion.action === 'update')) {
                success = await this.aiSuggestionService.applyPropertySuggestion(activeFile, suggestion.key, suggestion.propertyValue);
            } else if (suggestion.action === 'merge' || suggestion.action === 'standardize') {
                new Notice(`This suggestion requires a batch action. Please use the batch button.`);
                success = false;
            } else {
                new Notice(`Unsupported suggestion type or action for individual application.`);
                success = false;
            }
            if (success) {
                new Notice(`Applied suggestion: ${suggestion.value}`);
                applyButton.textContent = 'Applied';
            } else {
                new Notice(`Failed to apply suggestion: ${suggestion.value}`);
                applyButton.disabled = false;
                applyButton.textContent = originalButtonText;
            }
        } catch (error) {
            console.error('Error applying suggestion:', error);
            new Notice('An error occurred while applying the suggestion.');
            applyButton.disabled = false;
            applyButton.textContent = originalButtonText;
        }
    }

    async acceptTypeInsight(suggestion: Suggestion, acceptButton: HTMLButtonElement, ignoreButton: HTMLButtonElement) {
        acceptButton.disabled = true;
        ignoreButton.disabled = true;
        const originalAcceptText = acceptButton.textContent;
        acceptButton.textContent = 'Accepting...';
        try {
            const success = await this.aiSuggestionService.acceptMetadataTypeInsight(suggestion);
            if (success) {
                new Notice(`Accepted new metadata type: '${suggestion.key}'`);
                acceptButton.textContent = 'Accepted';
            } else {
                new Notice(`Failed to accept metadata type: '${suggestion.key}'`);
                acceptButton.disabled = false;
                ignoreButton.disabled = false;
                acceptButton.textContent = originalAcceptText;
            }
        } catch (error) {
            console.error('Error accepting type insight:', error);
            new Notice('An error occurred while accepting the suggestion.');
            acceptButton.disabled = false;
            ignoreButton.disabled = false;
            acceptButton.textContent = originalAcceptText;
        }
    }

    async ignoreTypeInsight(suggestion: Suggestion, acceptButton: HTMLButtonElement, ignoreButton: HTMLButtonElement) {
        acceptButton.disabled = true;
        ignoreButton.disabled = true;
        const originalIgnoreText = ignoreButton.textContent;
        ignoreButton.textContent = 'Ignoring...';
        try {
            const success = await this.aiSuggestionService.ignoreMetadataTypeInsight(suggestion);
            if (success) {
                new Notice(`Ignored metadata type: '${suggestion.key}'`);
                ignoreButton.textContent = 'Ignored';
            } else {
                new Notice(`Failed to ignore metadata type: '${suggestion.key}'`);
                acceptButton.disabled = false;
                ignoreButton.disabled = false;
                ignoreButton.textContent = originalIgnoreText;
            }
        } catch (error) {
            console.error('Error ignoring type insight:', error);
            new Notice('An error occurred while ignoring the suggestion.');
            acceptButton.disabled = false;
            ignoreButton.disabled = false;
            ignoreButton.textContent = originalIgnoreText;
        }
    }
}
