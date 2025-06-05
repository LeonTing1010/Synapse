// Utility for loading and managing model configs from models.json
import * as fs from 'fs';
import * as path from 'path';

export interface ModelConfig {
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  type: 'llm' | 'embedding';
}

export class ModelConfigManager {
  private llmConfigs: ModelConfig[] = [];
  private embeddingConfigs: ModelConfig[] = [];
  private configPath: string;
  private provider: string = '';
  private baseUrl: string = '';

  constructor(baseDir: string) {
    const openaiPath = path.join(baseDir, 'openai.json');
    const modelsPath = path.join(baseDir, 'models.json');
    if (fs.existsSync(openaiPath)) {
      this.configPath = openaiPath;
    } else {
      this.configPath = modelsPath;
    }
    this.loadConfigs();
  }

  private loadConfigs() {
    if (fs.existsSync(this.configPath)) {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        this.provider = parsed.provider;
        this.baseUrl = parsed.baseUrl;
        this.llmConfigs = [];
        this.embeddingConfigs = [];
        if (parsed.models.llm) {
          this.llmConfigs.push({
            name: 'llm',
            provider: parsed.provider,
            model: parsed.models.llm,
            baseUrl: parsed.baseUrl,
            type: 'llm'
          });
        }
        if (parsed.models.embedding) {
          this.embeddingConfigs.push({
            name: 'embedding',
            provider: parsed.provider,
            model: parsed.models.embedding,
            baseUrl: parsed.baseUrl,
            type: 'embedding'
          });
        }
      } catch (e) {
        console.error('[ModelConfigManager] Failed to parse config:', e);
        this.llmConfigs = [];
        this.embeddingConfigs = [];
      }
    } else {
      console.warn(`[ModelConfigManager] config not found at: ${this.configPath}`);
    }
  }

  getAllLLMConfigs(): ModelConfig[] {
    return this.llmConfigs;
  }

  getAllEmbeddingConfigs(): ModelConfig[] {
    return this.embeddingConfigs;
  }

  getLLMConfig(): ModelConfig | undefined {
    return this.llmConfigs[0];
  }

  getEmbeddingConfig(): ModelConfig | undefined {
    return this.embeddingConfigs[0];
  }

  getValidationEndpoint(config: ModelConfig): string {
    return config.baseUrl.replace(/\/$/, '') + '/models';
  }
  getChatEndpoint(config: ModelConfig): string {
    return config.baseUrl.replace(/\/$/, '') + '/chat/completions';
  }
  getEmbeddingEndpoint(config: ModelConfig): string {
    return config.baseUrl.replace(/\/$/, '') + '/embeddings';
  }
}
