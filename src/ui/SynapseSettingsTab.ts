import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import SynapsePlugin from '../../main';


export const SYNAPSE_SEARCH_VIEW_TYPE = 'synapse-search-view';

export class SynapseSettingsTab extends PluginSettingTab {
    plugin: SynapsePlugin;
    statusBarEl: HTMLElement | null = null;


    constructor(app: App, plugin: SynapsePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Synapse Settings' });

        this.addAISettings(containerEl);
        this.addAdvancedSettings(containerEl);
    }


    private addAISettings(containerEl: HTMLElement) {
        const setting = new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Your OpenAI API key');
        setting.addText(text =>
            text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.openaiApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettings();
                    // 自动验证API Key有效性
                    await this.validateOpenAIKey(value, setting.settingEl);
                })
        );
        // 验证信息初始挂载在 setting.settingEl 下方
        this.validateOpenAIKey(this.plugin.settings.openaiApiKey, setting.settingEl);
    }

    private async validateOpenAIKey(key: string, parentEl: HTMLElement) {
        // 清除之前的验证提示
        const prev = parentEl.querySelector('.openai-key-status');
        if (prev) prev.remove();
        if (!key || !key.startsWith('sk-')) return;
        const statusEl = parentEl.createDiv({ cls: 'openai-key-status synapse-key-status' });
        statusEl.setText('Validating OpenAI API Key...');
        // 直接调用AIModelManager的验证方法
        const result = await this.plugin.modelManager.validateApiKey(key);
        if (result === 'valid') {
            statusEl.setText('✅ OpenAI API Key is valid.');
            statusEl.classList.remove('synapse-key-error', 'synapse-key-warn');
            statusEl.classList.add('synapse-key-success');
        } else if (result === 'invalid') {
            statusEl.setText('❌ Invalid OpenAI API Key.');
            statusEl.classList.remove('synapse-key-success', 'synapse-key-warn');
            statusEl.classList.add('synapse-key-error');
        } else {
            statusEl.setText('⚠️ Network error, unable to verify key.');
            statusEl.classList.remove('synapse-key-success', 'synapse-key-error');
            statusEl.classList.add('synapse-key-warn');
        }
    }

    private addAdvancedSettings(containerEl: HTMLElement): void {
        // 保留 Rebuild Database 按钮
        new Setting(containerEl)
            .setName('Rebuild Database')
            .setDesc('Reprocess all markdown files to rebuild the metadata, embeddings, and vector index. This may take a while.')
            .addButton(button => {
                button.setButtonText('Rebuild').onClick(async () => {
                    new Notice('Synapse: Rebuilding database...');
                    await this.plugin.storageManager.rebuildDatabase();
                    new Notice('Synapse: Database rebuild complete.');
                    this.display();
                });
            });
    }

    async onOpen() {
        await this.updateStatusBar();
    }

    async updateStatusBar() {
        if (!this.statusBarEl) {
            this.statusBarEl = this.plugin.addStatusBarItem();
        }
        const processedNotesCount = await this.plugin.storageManager.getProcessedNotesCount();
        if (this.statusBarEl) {
            this.statusBarEl.setText(`Synapse:${processedNotesCount}`);
        }
    }

    onClose() {
        if (this.statusBarEl) {
            this.statusBarEl.remove();
            this.statusBarEl = null;
        }
    }
}