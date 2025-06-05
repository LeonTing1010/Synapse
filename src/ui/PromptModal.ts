import { Modal, Setting, App } from 'obsidian';

export class PromptModal extends Modal {
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
