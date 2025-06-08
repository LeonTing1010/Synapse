import { Vault, DataAdapter } from 'obsidian';
import { ensureParentDirectory, getFileId } from './StorageUtils';
import { Logger } from '../utils/Logger';

export class EmbeddingManager {
    private vault: Vault;
    private dataPath: string;

    constructor(vault: Vault, dataPath: string) {
        this.vault = vault;
        this.dataPath = dataPath;
    }

    async saveEmbeddingFile(filePath: string, embeddings: Record<number, number[]>) {
        try {
            const fileId = getFileId(filePath);
            const embeddingsPath = `${this.dataPath}/embeddings/${fileId}.json`;
            await ensureParentDirectory(this.vault.adapter, embeddingsPath);
            await this.vault.adapter.write(embeddingsPath, JSON.stringify(embeddings, null, 2));
        } catch (error) {
            Logger.error(`Error saving embeddings for ${filePath}:`, error);
            throw error;
        }
    }

    async getEmbeddingFile(filePath: string): Promise<Record<number, number[]> | null> {
        try {
            const fileId = getFileId(filePath);
            const embeddingsPath = `${this.dataPath}/embeddings/${fileId}.json`;
            const exists = await this.vault.adapter.exists(embeddingsPath);

            if (!exists) {
                return null;
            }

            const data = await this.vault.adapter.read(embeddingsPath);
            return JSON.parse(data) as Record<number, number[]>;
        } catch (error) {
            Logger.error(`Error getting embeddings for ${filePath}:`, error);
            return null;
        }
    }

    async getEmbeddingFileById(fileId: string): Promise<Record<number, number[]> | null> {
        try {
            const embeddingsPath = `${this.dataPath}/embeddings/${fileId}.json`;
            const exists = await this.vault.adapter.exists(embeddingsPath);
            if (!exists) return null;
            const data = await this.vault.adapter.read(embeddingsPath);
            return JSON.parse(data) as Record<number, number[]>;
        } catch (error) {
            Logger.error(`Error getting embeddings for fileId ${fileId}:`, error);
            return null;
        }
    }

    async listEmbeddingFiles(): Promise<string[]> {
        const adapter = this.vault.adapter;
        const embeddingsDir = `${this.dataPath}/embeddings`;
        try {
            const files = (await adapter.list(embeddingsDir)).files.filter(f => f.endsWith('.json'));
             // adapter.list returns paths relative to the vault root if the adapter is Vault.adapter
            // or relative to the specified directory if it's a sub-adapter. Assuming Vault.adapter here.
            // We need to return full paths relative to the dataPath
            return files.map(f => `${embeddingsDir}/${f.substring(f.lastIndexOf('/') + 1)}`);
        } catch (e) {
            Logger.error(`Error listing embeddings directory ${embeddingsDir}:`, e);
            return [];
        }
    }

    async deleteEmbeddingFile(fileId: string): Promise<void> {
        const adapter = this.vault.adapter;
        const embeddingsPath = `${this.dataPath}/embeddings/${fileId}.json`;
        try {
            const exists = await adapter.exists(embeddingsPath);
            if (exists) {
                await adapter.remove(embeddingsPath);
                Logger.log(`Deleted embedding file: ${embeddingsPath}`);
            }
        } catch (e) {
            Logger.error(`Error deleting embedding file ${embeddingsPath}:`, e);
            throw e;
        }
    }

    async deleteAllEmbeddingFiles(): Promise<void> {
        const adapter = this.vault.adapter;
        const embeddingsDir = `${this.dataPath}/embeddings`;
        try {
            const exists = await adapter.exists(embeddingsDir);
            if (exists) {
                // List all files in the directory and delete them
                const files = (await adapter.list(embeddingsDir)).files;
                for (const file of files) {
                    const fullPath = `${embeddingsDir}/${file.substring(file.lastIndexOf('/') + 1)}`;
                    try {
                        await adapter.remove(fullPath);
                        Logger.log(`Deleted embedding file: ${fullPath}`);
                    } catch (e) {
                        Logger.error(`Error deleting embedding file ${fullPath}:`, e);
                        // Continue even if one file fails
                    }
                }
                // Optionally, remove the directory itself if empty
                const remainingFiles = (await adapter.list(embeddingsDir)).files;
                if (remainingFiles.length === 0) {
                    await adapter.rmdir(embeddingsDir, false);
                    Logger.log(`Deleted empty embeddings directory: ${embeddingsDir}`);
                }
            }
        } catch (e) {
            Logger.error(`Error deleting all embedding files in ${embeddingsDir}:`, e);
            throw e;
        }
    }
}
