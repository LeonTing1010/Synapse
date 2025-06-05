import { SynapseSettings } from '../types/Settings';
import { ModelConfigManager, ModelConfig } from './ModelConfigManager';
import { HTTPAIProvider } from './HTTPAIProvider';

export class AIModelManager {
    private settings: SynapseSettings;
    private modelConfigManager: ModelConfigManager;
    private currentLLMConfig: ModelConfig | undefined;
    private currentEmbeddingConfig: ModelConfig | undefined;
    private llmProvider: HTTPAIProvider | undefined;
    private embeddingProvider: HTTPAIProvider | undefined;

    constructor(settings: SynapseSettings, pluginDir: string) { // Add pluginDir parameter
        this.settings = settings;
        this.modelConfigManager = new ModelConfigManager(pluginDir); // Use pluginDir here
        // Use 'openai-gpt' as the default if no LLM model name is specified in settings
        this.setCurrentLLMConfig(settings.modelConfigName || 'openai-gpt');
        // Use 'openai-embed' as the default if no embedding model name is specified in settings
        this.setCurrentEmbeddingConfig(settings.embeddingModelName || 'openai-embed');
    }

    public setCurrentLLMConfig(name: string) {
        this.currentLLMConfig = this.modelConfigManager.getLLMConfigByName(name);
        if (this.currentLLMConfig) {
            this.llmProvider = new HTTPAIProvider(this.currentLLMConfig, this.settings);
        } else {
            this.llmProvider = undefined;
        }
    }

    public setCurrentEmbeddingConfig(name: string) {
        this.currentEmbeddingConfig = this.modelConfigManager.getEmbeddingConfigByName(name);
        if (this.currentEmbeddingConfig) {
            this.embeddingProvider = new HTTPAIProvider(this.currentEmbeddingConfig, this.settings);
        } else {
            this.embeddingProvider = undefined;
        }
    }

    // LLM请求
    async callLLM(task: string, payload: any): Promise<any> {
        if (!this.llmProvider) throw new Error('No LLM model config selected');
        return this.llmProvider.callAPI(task, payload);
    }

    // Embedding请求
    async callEmbedding(task: string, payload: any): Promise<any> {
        if (!this.embeddingProvider) throw new Error('No embedding model config selected');
        return this.embeddingProvider.callAPI(task, payload);
    }

    async initialize() {
        // Initialize any models or resources
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('Initializing AI Model Manager...');
        }
    }

    // Public getter for settings (read-only)
    public getSettings(): SynapseSettings {
        return this.settings;
    }

    // Public getter for the AI provider instance
    public getLLMProviderInstance(): HTTPAIProvider | undefined {
        return this.llmProvider;
    }

    public getEmbeddingProviderInstance(): HTTPAIProvider | undefined {
        return this.embeddingProvider;
    }

    // Public getter for the current LLM model config
    public getCurrentLLMConfig(): ModelConfig | undefined {
        return this.currentLLMConfig;
    }

    // Public getter for the current embedding model config
    public getCurrentEmbeddingConfig(): ModelConfig | undefined {
        return this.currentEmbeddingConfig;
    }
}