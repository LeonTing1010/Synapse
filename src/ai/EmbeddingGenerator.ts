import * as crypto from 'crypto';
import { TFile, Vault } from 'obsidian';
import { SynapseSettings } from '../types/Settings';
import * as https from 'https'; // Import Node.js https module
import { AIModelManager } from './AIModelManager';

export class EmbeddingGenerator {
    private settings: SynapseSettings;
    private aiModelManager: AIModelManager; // Add AIModelManager property
    private cache: Record<string, number[]> = {};
    private cacheLoaded = false;
    private cachePath = '.synapse/embeddings.json';

    constructor(settings: SynapseSettings, aiModelManager: AIModelManager) { // Add aiModelManager parameter
        this.settings = settings;
        this.aiModelManager = aiModelManager; // Assign aiModelManager
    }

    // Add a method to update settings
    public updateSettings(newSettings: SynapseSettings) {
        this.settings = newSettings;
        // If any internal state depends on settings (like model path), re-initialize here if needed
        // For now, just updating the settings reference is sufficient.
    }

    // Add a method to get the embedding dimension (placeholder)
    public getEmbeddingDimension(): number {
        // TODO: Get actual dimension from model config or API response if possible
        // For now, return a common default dimension
        return this.settings.embeddingDimension || 768; // Use setting or default
    }

    // 加载本地缓存
    private async loadCache(): Promise<void> {
        if (this.cacheLoaded) return;
        try {
            // @ts-ignore
            const vault: Vault = window.app.vault;
            const file = vault.getAbstractFileByPath(this.cachePath) as TFile;
            if (file) {
                const content = await vault.read(file);
                this.cache = JSON.parse(content);
            } else {
                this.cache = {};
            }
        } catch (e) {
            this.cache = {};
        }
        this.cacheLoaded = true;
    }

    // 保存本地缓存
    private async saveCache(): Promise<void> {
        try {
            // @ts-ignore
            const vault: Vault = window.app.vault;
            const folderPath = this.cachePath.split('/').slice(0, -1).join('/');
            await vault.adapter.mkdir(folderPath);
            await vault.adapter.write(this.cachePath, JSON.stringify(this.cache));
        } catch (e) {
            console.error('Failed to save embedding cache:', e);
        }
    }

    // 新增：清理本地 embedding 缓存
    public async clearCache(): Promise<void> {
        this.cache = {};
        this.cacheLoaded = false;
        try {
            // @ts-ignore
            const vault: Vault = window.app.vault;
            const file = vault.getAbstractFileByPath(this.cachePath) as TFile;
            if (file) {
                await vault.adapter.write(this.cachePath, '{}');
            }
        } catch (e) {
            // ignore
        }
    }

    // 生成缓存 key，包含 chunk 序号
    private getCacheKey(filePath: string, chunkIndex: number, text: string): string {
        // Use base64url-encoded file path and chunk index for unified cross-referencing
        const fileId = Buffer.from(filePath).toString('base64url');
        const provider = this.settings.aiProvider;
        const model = this.settings.model || '';
        // Optionally include provider/model for cache separation
        return `${fileId}::${chunkIndex}::${provider}::${model}`;
    }

    // 将文本切片
    private chunkText(text: string, chunkSize: number): string[] {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substring(i, i + chunkSize));
        }
        return chunks;
    }

    // 生成单个 chunk 的 embedding
    private async generateEmbeddingForChunk(text: string): Promise<number[]> {
        console.log(`[EmbeddingGenerator] generateEmbeddingForChunk - Current AI Provider setting: ${this.settings.aiProvider}`);
        try {
            const cleanedText = this.prepareText(text);
            let embedding: number[] | undefined;

            // Get the embedding model from the current embedding config
            const embeddingModel = this.aiModelManager.getCurrentEmbeddingConfig()?.model || this.settings.model;

            // Use the unified AIModelManager.callAI for embedding task
            const data = await this.aiModelManager.callEmbedding('embeddings', {
                input: cleanedText,
                model: embeddingModel // Use the embedding model from config
            });

            // TODO: Adapt parsing based on actual API response format for embeddings
            // Assuming the response structure is similar to OpenAI's embedding API: { data: [{ embedding: [...] }] }
            if (data && data.data && data.data[0]?.embedding) {
                embedding = data.data[0].embedding;
            } else {
                throw new Error('Embedding API: No embedding returned or unexpected format.');
            }

            if (embedding) {
                return embedding;
            }
            throw new Error('Failed to generate embedding.');
        } catch (error) {
            console.error('Error generating embedding for chunk:', error);
            const fallbackDimension = this.settings.embeddingDimension || 768;
            return new Array(fallbackDimension).fill(0);
        }
    }

    // Generate embeddings for all chunks of a file
    async generateEmbeddingsForFile(filePath: string, text: string): Promise<Record<number, number[]>> {
        await this.loadCache();
        const chunkSize = 768; // Fixed chunk size
        const chunks = this.chunkText(text, chunkSize);
        const embeddings: Record<number, number[]> = {};

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const key = this.getCacheKey(filePath, i, chunk);
            if (this.cache[key]) {
                embeddings[i] = this.cache[key];
            } else {
                const embedding = await this.generateEmbeddingForChunk(chunk);
                embeddings[i] = embedding;
                this.cache[key] = embedding; // Cache the new embedding
            }
        }

        await this.saveCache(); // Save cache after processing all chunks for the file
        return embeddings;
    }


    // This method is no longer used for file embeddings, kept for potential other uses
    async generateEmbedding(text: string): Promise<number[]> {
         try {
            await this.loadCache();
            const cleanedText = this.prepareText(text);
            const key = this.getCacheKey("single_text", 0, cleanedText);
            if (this.cache[key]) {
                return this.cache[key];
            }
            let embedding: number[] | undefined;

            // Get the embedding model from the current embedding config
            const embeddingModel = this.aiModelManager.getCurrentEmbeddingConfig()?.model || this.settings.model;

            // Use the unified AIModelManager.callAI for embedding task
             const data = await this.aiModelManager.callEmbedding('embeddings', {
                input: cleanedText,
                model: embeddingModel // Use the embedding model from config
            });

            // TODO: Adapt parsing based on actual API response format for embeddings
            // Assuming the response structure is similar to OpenAI's embedding API: { data: [{ embedding: [...] }] }
            if (data && data.data && data.data[0]?.embedding) {
                embedding = data.data[0].embedding;
            } else {
                throw new Error('Embedding API: No embedding returned or unexpected format.');
            }

            if (embedding) {
                this.cache[key] = embedding;
                await this.saveCache();
                return embedding;
            }
            throw new Error('Failed to generate embedding.');
        } catch (error) {
            console.error('Error generating embedding:', error);
            // Return a zero vector as fallback
            return new Array(this.getEmbeddingDimension()).fill(0); // Use getEmbeddingDimension
        }
    }


    /**
     * Incremental embedding: only re-embed changed chunks.
     * @param filePath File path
     * @param text File content
     * @param prevChunkHashes Previous chunk hashes (index -> hash)
     * @returns { embeddings: Record<number, number[]> , chunkHashes: Record<number, string> }
     */
    async generateIncrementalEmbeddingsForFile(
        filePath: string,
        text: string,
        prevChunkHashes: Record<number, string> = {}
    ): Promise<{ embeddings: Record<number, number[]>; chunkHashes: Record<number, string> }> {
        await this.loadCache();
        const chunkSize = 768;
        const chunks = this.chunkText(text, chunkSize);
        const embeddings: Record<number, number[]> = {};
        const chunkHashes: Record<number, string> = {};

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const hash = crypto.createHash('sha256').update(chunk).digest('hex');
            chunkHashes[i] = hash;
            // If hash matches previous, try to reuse embedding from cache
            if (prevChunkHashes[i] && prevChunkHashes[i] === hash) {
                // Try cache by key (hash is not in key, but chunk text is)
                const key = this.getCacheKey(filePath, i, chunk);
                if (this.cache[key]) {
                    embeddings[i] = this.cache[key];
                    continue;
                }
            }
            // Otherwise, generate new embedding
            const embedding = await this.generateEmbeddingForChunk(chunk);
            embeddings[i] = embedding;
            const key = this.getCacheKey(filePath, i, chunk);
            this.cache[key] = embedding;
        }
        await this.saveCache();
        return { embeddings, chunkHashes };
    }

    private prepareText(text: string): string {
        // Clean and normalize text
        // Removed slicing here as chunking handles length
        return text
            .replace(/\\s+/g, ' ')
            .trim();
    }
}