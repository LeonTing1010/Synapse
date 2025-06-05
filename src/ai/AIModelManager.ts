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

    constructor(settings: SynapseSettings, pluginDir: string) {
        this.settings = settings;
        this.modelConfigManager = new ModelConfigManager(pluginDir);
        this.setCurrentLLMConfig();
        this.setCurrentEmbeddingConfig();
    }

    public setCurrentLLMConfig() {
        this.currentLLMConfig = this.modelConfigManager.getLLMConfig();
        if (this.currentLLMConfig) {
            this.llmProvider = new HTTPAIProvider(this.currentLLMConfig, this.settings);
        } else {
            this.llmProvider = undefined;
        }
    }

    public setCurrentEmbeddingConfig() {
        this.currentEmbeddingConfig = this.modelConfigManager.getEmbeddingConfig();
        if (this.currentEmbeddingConfig) {
            this.embeddingProvider = new HTTPAIProvider(this.currentEmbeddingConfig, this.settings);
        } else {
            this.embeddingProvider = undefined;
        }
    }

    // LLM请求
    async callLLM(task: string, payload: any): Promise<any> {
        if (!this.llmProvider || !this.currentLLMConfig) throw new Error('No LLM model config selected');
        const endpoint = this.modelConfigManager.getChatEndpoint(this.currentLLMConfig);
        return this.llmProvider.callAPI(task, payload, endpoint);
    }

    // Embedding请求
    async callEmbedding(task: string, payload: any): Promise<any> {
        if (!this.embeddingProvider || !this.currentEmbeddingConfig) throw new Error('No embedding model config selected');
        const endpoint = this.modelConfigManager.getEmbeddingEndpoint(this.currentEmbeddingConfig);
        return this.embeddingProvider.callAPI(task, payload, endpoint);
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

    // 验证API Key有效性（通用，自动用当前模型验证endpoint）
    public async validateApiKey(key: string): Promise<'valid' | 'invalid' | 'network-error'> {
        const config = this.getCurrentLLMConfig();
        if (!config) return 'invalid';
        const endpoint = this.modelConfigManager.getValidationEndpoint(config);
        if (!endpoint) return 'invalid';
        let headers: Record<string, string> = {};
        if (config.provider === 'openai') {
            headers = { 'Authorization': `Bearer ${key}` };
        } else if (config.provider === 'azure') {
            headers = { 'api-key': key };
        }
        try {
            const resp = await fetch(endpoint, { headers });
            if (resp.ok) return 'valid';
            return 'invalid';
        } catch (e) {
            return 'network-error';
        }
    }
}