import { Vault, DataAdapter, TAbstractFile, App } from 'obsidian';
import { ExtractedMetadata } from '../types/AITypes';
import { ensureParentDirectory, getFileId } from './StorageUtils';
import { Logger } from '../utils/Logger';

export class MetadataManager {
    private vault: Vault;
    private dataPath: string;
    private app: App;

    constructor(vault: Vault, dataPath: string, app: App) {
        this.vault = vault;
        this.dataPath = dataPath;
        this.app = app;
    }

    async saveFileMetadata(filePath: string, metadata: ExtractedMetadata, embeddingChunkSize: number) {
        try {
            const fileId = getFileId(filePath);
            const metadataPath = `.synapse/metadata/${fileId}.json`;
            await ensureParentDirectory(this.vault.adapter, metadataPath);

            // Ensure global metadata and chunk-level metadata are always present and well-formed
            const safeMetadata: ExtractedMetadata = {
                ...metadata,
                metadata: (metadata && typeof metadata.metadata === 'object' && metadata.metadata !== null) ? metadata.metadata : {},
                chunks: Array.isArray(metadata.chunks)
                    ? metadata.chunks.map(chunk => ({
                        ...chunk,
                        metadata: (chunk && typeof chunk.metadata === 'object' && chunk.metadata !== null) ? chunk.metadata : {}
                    }))
                    : [],
                fileId,
                chunkSize: embeddingChunkSize
            };

            await this.vault.adapter.write(metadataPath, JSON.stringify(safeMetadata, null, 2));
        } catch (error) {
            Logger.error(`Error saving metadata for ${filePath}:`, error);
            throw error;
        }
    }

    async getFileMetadata(filePath: string): Promise<ExtractedMetadata | null> {
        try {
            const fileId = getFileId(filePath);
            const metadataPath = `.synapse/metadata/${fileId}.json`;
            const exists = await this.vault.adapter.exists(metadataPath);
            if (!exists) {
                return null;
            }
            const data = await this.vault.adapter.read(metadataPath);
            return JSON.parse(data) as ExtractedMetadata;
        } catch (error) {
            Logger.error(`Error getting metadata for ${filePath}:`, error);
            return null;
        }
    }

    async getFileMetadataById(fileId: string): Promise<ExtractedMetadata | null> {
        try {
            const metadataPath = `.synapse/metadata/${fileId}.json`;
            const exists = await this.vault.adapter.exists(metadataPath);
            if (!exists) return null;
            const data = await this.vault.adapter.read(metadataPath);
            return JSON.parse(data) as ExtractedMetadata;
        } catch (error) {
            Logger.error(`Error getting metadata for fileId ${fileId}:`, error);
            return null;
        }
    }

    async listMetadataFiles(): Promise<string[]> {
        const adapter = this.vault.adapter;
        const metadataDir = `.synapse/metadata`;
        try {
            const exists = await adapter.exists(metadataDir);
            if (!exists) {
                await adapter.mkdir(metadataDir);
            }
            const files = (await adapter.list(metadataDir)).files.filter(f => f.endsWith('.json'));
            return files.map(f => `${metadataDir}/${f.substring(f.lastIndexOf('/') + 1)}`);
        } catch (e) {
            Logger.error(`Error listing metadata directory ${metadataDir}:`, e);
            return [];
        }
    }

    async deleteMetadataFile(fileId: string): Promise<void> {
        const adapter = this.vault.adapter;
        const metadataPath = `.synapse/metadata/${fileId}.json`;
        try {
            const exists = await adapter.exists(metadataPath);
            if (exists) {
                const abstractFile = this.vault.getAbstractFileByPath(metadataPath);
                if (abstractFile) {
                    await this.app.fileManager.trashFile(abstractFile);
                } else {
                    // Fallback to direct removal if file not found in vault
                    await adapter.remove(metadataPath);
                }
                Logger.debug(`[MetadataManager] Trashed metadata file: ${metadataPath}`);
            }
        } catch (e) {
            Logger.error(`Error trashing metadata file ${metadataPath}:`, e);
            throw e;
        }
    }

    async deleteAllMetadataFiles(): Promise<void> {
        const adapter = this.vault.adapter;
        const metadataDir = `.synapse/metadata`;
        try {
            const exists = await adapter.exists(metadataDir);
            if (exists) {
                const files = (await adapter.list(metadataDir)).files;
                for (const file of files) {
                    const fullPath = `${metadataDir}/${file.substring(file.lastIndexOf('/') + 1)}`;
                    try {
                        const abstractFile = this.vault.getAbstractFileByPath(fullPath);
                        if (abstractFile) {
                            await this.app.fileManager.trashFile(abstractFile);
                        } else {
                            // Fallback to direct removal if file not found in vault
                            await adapter.remove(fullPath);
                        }
                        Logger.debug(`[MetadataManager] Trashed metadata file: ${fullPath}`);
                    } catch (e) {
                        Logger.error(`Error trashing metadata file ${fullPath}:`, e);
                    }
                }
                const remainingFiles = (await adapter.list(metadataDir)).files;
                if (remainingFiles.length === 0) {
                    await adapter.rmdir(metadataDir, false);
                    Logger.debug(`[MetadataManager] Deleted empty metadata directory: ${metadataDir}`);
                }
            }
        } catch (e) {
            Logger.error(`Error trashing all metadata files in ${metadataDir}:`, e);
            throw e;
        }
    }

    /**
     * Scans all metadata files and returns a deduplicated array of all property keys found in the metadata field (global and chunk-level), including nested keys.
     */
    async getAllPropertyKeys(): Promise<string[]> {
        const propertyKeys = new Set<string>();
        function extractKeys(obj: any, prefix = '') {
            if (typeof obj !== 'object' || obj === null) return;
            for (const key of Object.keys(obj)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                propertyKeys.add(fullKey);
                if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                    extractKeys(obj[key], fullKey);
                }
                // tags: also add each tag value as 'tags:<tag>'
                if (key === 'tags' && Array.isArray(obj[key])) {
                    for (const tag of obj[key]) {
                        propertyKeys.add('tags:' + tag);
                    }
                }
            }
        }
        try {
            const metadataFiles = await this.listMetadataFiles();
            for (const file of metadataFiles) {
                try {
                    const data = await this.vault.adapter.read(file);
                    const parsed = JSON.parse(data);
                    // Extract global metadata keys (including nested)
                    if (parsed && parsed.metadata && typeof parsed.metadata === 'object') {
                        extractKeys(parsed.metadata);
                    }
                    // Extract chunk-level metadata keys (including nested)
                    if (parsed && Array.isArray(parsed.chunks)) {
                        for (const chunk of parsed.chunks) {
                            if (chunk && chunk.metadata && typeof chunk.metadata === 'object') {
                                extractKeys(chunk.metadata);
                            }
                        }
                    }
                } catch (e) {
                    // Skip files that fail to parse
                    console.warn(`[MetadataManager] Skipping metadata file (parse error): ${file}`);
                }
            }
        } catch (e) {
            console.error('[MetadataManager] Error aggregating property keys:', e);
        }
        return Array.from(propertyKeys);
    }

    /**
     * Reads and parses a metadata file by its path. Returns the parsed object or null on error.
     */
    async readMetadataFile(filePath: string): Promise<any | null> {
        try {
            const data = await this.vault.adapter.read(filePath);
            return JSON.parse(data);
        } catch (e) {
            console.warn(`[MetadataManager] Failed to read metadata file: ${filePath}`);
            return null;
        }
    }
}
