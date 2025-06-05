// Utility for loading and managing model configs from models.json
import * as fs from 'fs';
import * as path from 'path';

export interface ModelConfig {
  name: string;
  provider: string;
  model?: string;
  endpoint?: string;
  // ...other fields as needed
}

interface ModelGroup {
  llm: ModelConfig[];
  embedding: ModelConfig[];
}

export class ModelConfigManager {
  private llmConfigs: ModelConfig[] = [];
  private embeddingConfigs: ModelConfig[] = [];
  private configPath: string;

  constructor(baseDir: string) {
    // 优先 openai.json，没有则用 models.json
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
    // [ModelConfigManager] Remove or comment out all console.log for production cleanliness
    // console.log(`[ModelConfigManager] Attempting to load config from: ${this.configPath}`);
    if (fs.existsSync(this.configPath)) {
      // console.log(`[ModelConfigManager] Found config file: ${this.configPath}`);
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      try {
        const parsed: ModelGroup = JSON.parse(raw);
        this.llmConfigs = parsed.llm || [];
        this.embeddingConfigs = parsed.embedding || [];
        // console.log(`[ModelConfigManager] Successfully loaded ${this.llmConfigs.length} LLM and ${this.embeddingConfigs.length} embedding configs.`);
      } catch (e) {
        console.error('[ModelConfigManager] Failed to parse models.json:', e);
        this.llmConfigs = [];
        this.embeddingConfigs = [];
      }
    } else {
      console.warn(`[ModelConfigManager] models.json not found at: ${this.configPath}`);
    }
  }

  getAllLLMConfigs(): ModelConfig[] {
    return this.llmConfigs;
  }

  getAllEmbeddingConfigs(): ModelConfig[] {
    return this.embeddingConfigs;
  }

  getLLMConfigByName(name: string): ModelConfig | undefined {
    const config = this.llmConfigs.find(cfg => cfg.name === name);
    // console.log(`[ModelConfigManager] getLLMConfigByName(${name}) returned:`, config);
    return config;
  }

  getEmbeddingConfigByName(name: string): ModelConfig | undefined {
    const config = this.embeddingConfigs.find(cfg => cfg.name === name);
    // console.log(`[ModelConfigManager] getEmbeddingConfigByName(${name}) returned:`, config);
    return config;
  }

  getLLMConfigsByProvider(provider: string): ModelConfig[] {
    return this.llmConfigs.filter(cfg => cfg.provider === provider);
  }

  getEmbeddingConfigsByProvider(provider: string): ModelConfig[] {
    return this.embeddingConfigs.filter(cfg => cfg.provider === provider);
  }
}
