import { Plugin, Notice, WorkspaceLeaf, TFile } from 'obsidian';
import { SynapseSettings, DEFAULT_SETTINGS } from './src/types/Settings';
// Remove imports for deleted components
// import { AIMetadataExtractor } from './src/ai/AIMetadataExtractor';
import { VectorSearchEngine } from './src/search/VectorSearchEngine'; // Keep VectorSearchEngine
// import { KnowledgeGraphManager } from './src/graph/KnowledgeGraphManager';
import { LocalStorageManager } from './src/storage/LocalStorageManager';
import { AIModelManager } from './src/ai/AIModelManager';
import { SynapseSettingsTab } from './src/ui/SynapseSettingsTab';
// import { SynapseGraphView, SYNAPSE_GRAPH_VIEW_TYPE } from './src/ui/SynapseGraphView';
import { SynapseChatView, SYNAPSE_CHAT_VIEW_TYPE } from './src/ui/SynapseChatView';
// import { SynapseInsightView, SYNAPSE_INSIGHT_VIEW_TYPE } from './src/ui/SynapseInsightView';
// import { SynapseSearchView, SYNAPSE_SEARCH_VIEW_TYPE } from './src/ui/SynapseSearchView';
import { EmbeddingGenerator } from './src/ai/EmbeddingGenerator';
import { ResponseGenerator } from './src/ai/ResponseGenerator';
import { AISuggestionService } from './src/ai/AISuggestionService';
import * as path from 'path';

export default class SynapsePlugin extends Plugin {
    settings: SynapseSettings;
    vectorSearch: VectorSearchEngine;
    storageManager: LocalStorageManager;
    modelManager: AIModelManager;
    embeddingGenerator: EmbeddingGenerator;
    responseGenerator: ResponseGenerator;
    aiSuggestionService: AISuggestionService;
    private processingTimeout: NodeJS.Timeout | null = null;

    async onload() {
        console.debug('Loading Synapse Plugin...');

        await this.loadSettings();
        await this.initializeComponents();
        this.setupUI();
        this.registerCommands();
        this.setupEventListeners();
        this.addSettingTab(new SynapseSettingsTab(this.app, this));
        // Activate the Chat view by default
        this.activateView(SYNAPSE_CHAT_VIEW_TYPE);

        // new Notice('Synapse: AI Knowledge Connector loaded successfully!');
    }

    async initializeComponents() {
        // Initialize AIModelManager first as others depend on it (indirectly via settings/config)
        // Pass the plugin directory to AIModelManager
        // 获取 vault 根目录
        const vaultBase = (this.app.vault.adapter as any).basePath as string;
        // 拼接插件目录
        const pluginDir = path.join(vaultBase, '.obsidian/plugins/synapse');
        this.modelManager = new AIModelManager(this.settings, pluginDir);
        await this.modelManager.initialize();

        // Initialize EmbeddingGenerator and ResponseGenerator, passing the modelManager
        this.embeddingGenerator = new EmbeddingGenerator(this.settings, this.modelManager);
        this.responseGenerator = new ResponseGenerator(this.settings, this.modelManager);

        // Initialize LocalStorageManager, passing the EmbeddingGenerator
        this.storageManager = new LocalStorageManager(this.app.vault, this.settings, this, this.embeddingGenerator);
        await this.storageManager.initialize();

        // Pass the new managers and EmbeddingGenerator to VectorSearchEngine
        this.vectorSearch = new VectorSearchEngine(this.app, this.storageManager.metadataManager, this.storageManager.vectorIndexManager, this.embeddingGenerator);
        await this.vectorSearch.initialize();

        // Initialize AISuggestionService
        this.aiSuggestionService = new AISuggestionService(this);
    }

    setupUI() {
        // 注册视图并指定 icon
        // this.registerView(
        //     SYNAPSE_GRAPH_VIEW_TYPE,
        //     (leaf) => new SynapseGraphView(leaf, this)
        // );

        // Register SynapseChatView, passing ResponseGenerator and AISuggestionService
        this.registerView(
            SYNAPSE_CHAT_VIEW_TYPE,
            (leaf) => new SynapseChatView(leaf, this, this.responseGenerator, this.aiSuggestionService)
        );

        // ribbon 按钮已全部移除，功能入口只在侧边栏
    }

    registerCommands() {
        // Remove commands for deleted views and features
        // this.addCommand({
        //     id: 'open-synapse-search',
        //     name: 'Open Synapse Search',
        //     callback: () => {
        //         this.activateView(SYNAPSE_SEARCH_VIEW_TYPE);
        //     }
        // });

        // this.addCommand({
        //     id: 'open-synapse-graph',
        //     name: 'Open Knowledge Graph',
        //     callback: () => {
        //         this.activateView(SYNAPSE_GRAPH_VIEW_TYPE);
        //     }
        // });

        this.addCommand({
            id: 'open-synapse-chat',
            name: 'Open AI Chat',
            callback: () => {
                this.activateView(SYNAPSE_CHAT_VIEW_TYPE);
            }
        });

        // this.addCommand({
        //     id: 'toggle-insight-panel',
        //     name: 'Toggle Insight Panel',
        //     callback: () => {
        //         this.activateView(SYNAPSE_INSIGHT_VIEW_TYPE);
        //     }
        // });

        this.addCommand({
            id: 'reprocess-current-file',
            name: 'Reprocess Current File',
            callback: () => {
                this.reprocessCurrentFile();
            }
        });

        // Remove database rebuild command from user-facing command palette
        // this.addCommand({
        //     id: 'rebuild-synapse-database',
        //     name: 'Rebuild Synapse Database (Full Indexing)',
        //     callback: async () => {
        //         new Notice('Starting full Synapse database rebuild...');
        //         const success = await this.storageManager.rebuildDatabase();
        //         if (success) {
        //             new Notice('Synapse database rebuild complete.');
        //         } else {
        //             new Notice('Synapse database rebuild failed. Check console for details.');
        //         }
        //     }
        // });

        // Remove or hide consistency check commands from user-facing command palette
        // (Only keep for internal/maintenance use if needed)
        // this.addCommand({
        //     id: 'check-synapse-consistency',
        //     name: 'Check Synapse Database Consistency',
        //     callback: async () => {
        //         new Notice('Checking Synapse database consistency...');
        //         const result = await this.storageManager.checkAndRepairConsistency(false); // Check only, no auto-fix
        //         if (result.errors.length > 0) {
        //             console.warn('Synapse Consistency Check Errors:', result.errors);
        //             new Notice(`Synapse consistency check found ${result.errors.length} errors. See console.`);
        //         } else {
        //             new Notice('Synapse database consistency check passed.');
        //         }
        //     }
        // });

        // this.addCommand({
        //     id: 'check-and-repair-synapse-consistency',
        //     name: 'Check and Repair Synapse Database Consistency',
        //     callback: async () => {
        //         new Notice('Checking and repairing Synapse database consistency...');
        //         const result = await this.storageManager.checkAndRepairConsistency(true); // Check and auto-fix
        //         if (result.errors.length > 0 || result.fixed.length > 0) {
        //             console.warn('Synapse Consistency Check & Repair Report:', result);
        //             new Notice(`Synapse consistency check and repair complete. Found ${result.errors.length} errors, fixed ${result.fixed.length} issues. See console.`);
        //         } else {
        //             new Notice('Synapse database consistency check and repair found no issues.');
        //         }
        //     }
        // });

        // Add command for metadata consistency check (user-facing, via AISuggestionService)
        this.addCommand({
            id: 'check-metadata-consistency',
            name: 'Check Metadata Consistency (Tags/Properties)',
            callback: async () => {
                new Notice('Checking metadata consistency...');
                const suggestions = await this.aiSuggestionService.checkMetadataConsistency();
                if (suggestions.length > 0) {
                    console.warn('Metadata Consistency Suggestions:', suggestions);
                    new Notice(`Found ${suggestions.length} metadata consistency issues. See console for details.`);
                } else {
                    new Notice('No metadata consistency issues found.');
                }
            }
        });
    }

    setupEventListeners() {
        // Automatic embedding on file modify/create is DISABLED per requirements.
        // If you want to re-enable, uncomment the following lines:
        /*
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.storageManager.processSingleFile(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.storageManager.processSingleFile(file);
                }
            })
        );
        */

        // Delete event: Remove data associated with the deleted file
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.storageManager.deleteFileData(file);
                }
            })
        );
    }

    // Refactored processFile to use LocalStorageManager's method
    private async processFile(file: TFile) {
        console.debug(`Processing file via main.ts processFile: ${file.path}`);
        try {
            await this.storageManager.processSingleFile(file);
            console.debug(`Finished processing file via main.ts processFile: ${file.path}`);
        } catch (error) {
            console.error(`Error processing file ${file.path} via main.ts processFile:`, error);
        }
    }

    private async reprocessCurrentFile() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file to reprocess');
            return;
        }

        try {
            // Call the updated processFile method
            await this.processFile(activeFile);
            new Notice(`Reprocessed: ${activeFile.basename}`);
        } catch (error) {
            console.error('Error reprocessing file:', error);
            new Notice('Error reprocessing file');
        }
    }

    /**
     * 获取指定路径的笔记内容（用于 AI 洞察/摘要等功能）
     * @param path Obsidian vault 内的相对路径
     * @returns Promise<string> 笔记内容
     */
    async getNoteContent(path: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        } else {
            throw new Error(`File not found: ${path}`);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        console.log('[main.ts] Saving settings. Current AI Provider setting:', this.settings.aiProvider);
        await this.saveData(this.settings);
        // Update the AIModelManager and other AI-related components with the new settings
        if (this.modelManager) {
            // Update the model config in AIModelManager if the name changed
            // AIModelManager needs to update its internal provider based on the new settings
            this.modelManager.setCurrentLLMConfig(this.settings.modelConfigName || '');
            this.modelManager.setCurrentEmbeddingConfig(this.settings.embeddingModelName || '');

            // Update settings in EmbeddingGenerator and ResponseGenerator
            // These instances need the new settings to potentially change behavior (e.g., model name, dimension)
            if (this.embeddingGenerator) {
                this.embeddingGenerator.updateSettings(this.settings);
            }
            if (this.responseGenerator) {
                // ResponseGenerator's updateSettings takes both settings and modelManager
                this.responseGenerator.updateSettings(this.settings, this.modelManager);
            }
            // AIMetadataExtractor gets settings via modelManager.getSettings()
            // No direct updateSettings needed if it always reads from modelManager
        }
        console.debug('[main.ts] Settings saved and AI components updated.');
    }

    onunload() {
        console.debug('Unloading Synapse Plugin...');
        if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
        }
        // Consistency check and repair on plugin unload (Obsidian close)
        if (this.storageManager) {
            this.storageManager.checkAndRepairConsistency(true).then((result) => {
                if (result.errors.length || result.fixed.length) {
                    // Optionally log or notify, but keep silent for implicit intelligence
                    console.debug('Synapse consistency check on unload:', result);
                }
            });
        }
    }

    // Method to activate a specific view
    async activateView(viewType: string) {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(viewType);
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // Try to get an existing right leaf first (will return null if none exists)
            leaf = workspace.getRightLeaf(false);
            // If no existing right leaf, create a new one
            if (!leaf) {
                 leaf = workspace.getRightLeaf(true); // Pass true to create if it doesn't exist
            }

            // If a leaf was found or created, set its view state
            if (leaf) {
                await leaf.setViewState({ type: viewType, active: true });
            }
        } // Removed the 'else' block that was causing the TypeError

        // Reveal the leaf if it exists
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }
}
