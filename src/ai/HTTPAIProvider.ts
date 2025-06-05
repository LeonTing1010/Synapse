// Unified HTTP-based AI model caller, using models.json for all config
import { SynapseSettings } from '../types/Settings';
import { ModelConfig } from './ModelConfigManager';
import { request } from 'obsidian'; // Import Obsidian's request function

export class HTTPAIProvider {
    private config: ModelConfig;
    private settings: SynapseSettings;

    constructor(config: ModelConfig, settings: SynapseSettings) {
        this.config = config;
        this.settings = settings;
    }

    async callAPI(task: string, payload: any): Promise<any> {
        // Use the full endpoint directly from config
        const url = this.config.endpoint;
        if (!url) throw new Error('No endpoint in model config');

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        // Attach API key if needed (from settings, not models.json)
        if (this.config.provider === 'openai' && this.settings.openaiApiKey) {
            headers['Authorization'] = `Bearer ${this.settings.openaiApiKey}`;
        } else if (this.config.provider === 'huggingface' && this.settings.huggingfaceEndpoint) {
            // HuggingFace Inference API may use Bearer token or not
        }
        // ...可扩展其它 provider ...

        try {
            // Debug: print payload for inspection
            console.debug(`[HTTPAIProvider] ${task} Request payload:`, JSON.stringify(payload));
            // Use Obsidian's request function to handle network requests
            const response = await request({
                url: url,
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });
            // Debug: print response for inspection
            console.debug(`[HTTPAIProvider] ${task} Raw response:`, response);
            // Obsidian's request throws on non-2xx status codes, so no need for res.ok check
            // The response is the raw string body, need to parse JSON
            return JSON.parse(response);

        } catch (error) {
            console.error(`[HTTPAIProvider] ${task} Error in callAPI:`, error);
            // Re-throw a more informative error
            throw new Error(`AI API call failed to ${url}: ${error.message || error}`);
        }
    }
}
