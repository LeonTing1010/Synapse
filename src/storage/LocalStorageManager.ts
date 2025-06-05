import { TFile, Vault, DataAdapter } from 'obsidian';
import { SynapseSettings } from '../types/Settings';
import { ExtractedMetadata } from '../types/AITypes';
import SynapsePlugin from '../../main';
import * as crypto from 'crypto';
import { getFileId, chunkText, ensureParentDirectory, formatBytes, buildChunkRefsFromEmbeddings, getChunkId } from './StorageUtils';
import { MetadataManager } from './MetadataManager';
import { EmbeddingManager } from './EmbeddingManager';
import { VectorIndexManager } from './VectorIndexManager';
import { VectorSearchEngine } from '../search/VectorSearchEngine'; // Import VectorSearchEngine
import { EmbeddingGenerator } from '../ai/EmbeddingGenerator'; // Import EmbeddingGenerator

export class LocalStorageManager {
    private vault: Vault;
    private settings: SynapseSettings;
    public dataPath: string; // Made public
    private plugin: SynapsePlugin;
    public metadataManager: MetadataManager; // Made public
    public embeddingManager: EmbeddingManager; // Made public
    public vectorIndexManager: VectorIndexManager; // Made public
    private embeddingGenerator: EmbeddingGenerator; // Add EmbeddingGenerator property

    constructor(
        vault: Vault,
        settings: SynapseSettings,
        plugin: SynapsePlugin,
        embeddingGenerator: EmbeddingGenerator // Add EmbeddingGenerator parameter
    ) {
        this.vault = vault;
        this.settings = settings;
        this.plugin = plugin; // Store plugin instance
        this.embeddingGenerator = embeddingGenerator; // Assign EmbeddingGenerator

        // Correct way to get the vault's absolute filesystem path
        // This is not officially typed, so we use a type cast
        const vaultBasePath = (this.vault.adapter as any).basePath;
        this.dataPath = `${vaultBasePath}/.synapse`;

        // Ensure no trailing slash on the final dataPath
        if (this.dataPath.endsWith('/')) {
            this.dataPath = this.dataPath.slice(0, -1);
        }

        // [LocalStorageManager] Remove or comment out all console.log for production cleanliness
        // console.log('[Synapse] LocalStorageManager dataPath set to:', this.dataPath); // Added logging

        // Instantiate the new managers
        this.metadataManager = new MetadataManager(this.vault, this.dataPath);
        this.embeddingManager = new EmbeddingManager(this.vault, this.dataPath);
        this.vectorIndexManager = new VectorIndexManager(this.vault, this.dataPath);
        // Pass the App instance to VectorSearchEngine
        // Ensure VectorSearchEngine is instantiated with the correct parameters
        // VectorSearchEngine now expects EmbeddingGenerator, not AIModelManager
        this.plugin.vectorSearch = new VectorSearchEngine(this.plugin.app, this.metadataManager, this.vectorIndexManager, this.embeddingGenerator); // Use imported class and pass app
    }

    async initialize() {
        await this.ensureDataDirectory();
        // Initialization for sub-managers can go here if needed
        // await this.metadataManager.initialize();
        // await this.embeddingManager.initialize();
        // await this.vectorIndexManager.initialize();
    }

    private async ensureDataDirectory() {
        try {
            const adapter = this.vault.adapter;
            const exists = await adapter.exists(this.dataPath);

            if (!exists) {
                await adapter.mkdir(this.dataPath);
            }
        } catch (error) {
            console.error('Error ensuring data directory:', error);
            throw error;
        }
    }

    // Process a single file: chunk, embed, extract metadata, save, and update index
    async processSingleFile(file: TFile): Promise<void> {
        console.log(`[LocalStorageManager] Processing single file: ${file.path}`);
        try {
            const fileId = getFileId(file.path);
            const content = await this.vault.read(file);
            const currentFileLastModified = file.stat.mtime;
            const currentChunkSize = 768; // Assuming fixed chunk size for now

            let existingMetadata = await this.metadataManager.getFileMetadata(file.path);
            const existingEmbeddings = await this.embeddingManager.getEmbeddingFile(file.path) || {};

            // Get previous chunk hashes from existing metadata
            const prevChunkHashes: Record<number, string> = {};
            if (existingMetadata?.chunks) {
                existingMetadata.chunks.forEach((chunk: any) => {
                    if (chunk.index !== undefined && chunk.hash) {
                        prevChunkHashes[chunk.index] = chunk.hash;
                    }
                });
            }

            // Use incremental embedding generator
            const { embeddings: incrementalEmbeddings, chunkHashes: newChunkHashesMap } =
                await this.embeddingGenerator.generateIncrementalEmbeddingsForFile(file.path, content, prevChunkHashes);

            // Merge incremental embeddings with existing ones
            const mergedEmbeddings: Record<number, number[]> = { ...existingEmbeddings, ...incrementalEmbeddings };

            // Build new chunk info based on new chunks and hashes
            const chunks = chunkText(content, currentChunkSize);
            const newChunkInfo: any[] = [];
            for (let i = 0; i < chunks.length; i++) {
                 const chunkContent = chunks[i];
                 const chunkHash = newChunkHashesMap[i]; // Use hash from incremental generator result
                 const embedding = mergedEmbeddings[i]; // Use merged embedding

                 if (embedding === undefined) {
                      console.warn(`[LocalStorageManager] Embedding missing for chunk ${i} of ${file.path} after incremental generation.`);
                      // Fallback to zero vector if embedding is still missing
                      mergedEmbeddings[i] = new Array(this.embeddingGenerator.getEmbeddingDimension()).fill(0);
                 }

                newChunkInfo.push({
                    index: i,
                    hash: chunkHash,
                    start: content.indexOf(chunkContent, i * currentChunkSize),
                    end: content.indexOf(chunkContent, i * currentChunkSize) + chunkContent.length,
                    lastProcessed: Date.now(),
                    embeddingRef: `../embeddings/${fileId}.json#${i}`,
                    metadata: {} // Placeholder for chunk-level metadata
                });
            }

            // 4. Extract AI metadata for the whole file and for each chunk
            // 提取 Obsidian 元数据（title, filePath, lastModified, tags, properties, links）
            const extractAIMetadata = async (text: string, file: TFile, chunkRange?: {start: number, end: number}) => {
                const app = (window as any).app;
                const fileCache = app.metadataCache.getFileCache(file);
                let tags: string[] = [];
                if (fileCache?.frontmatter && Array.isArray(fileCache.frontmatter.tags)) {
                    tags = tags.concat(fileCache.frontmatter.tags);
                }
                if (fileCache?.frontmatter && typeof fileCache.frontmatter.tag === 'string') {
                    tags.push(fileCache.frontmatter.tag);
                }
                if (fileCache?.tags) {
                    tags = tags.concat(fileCache.tags.map((t: any) => t.tag.replace(/^#/, '')));
                }
                tags = Array.from(new Set(tags));
                const builtinKeys = ['tags', 'tag', 'aliases', 'cssclass'];
                let properties: Record<string, any> = {};
                if (fileCache?.frontmatter) {
                    for (const [k, v] of Object.entries(fileCache.frontmatter)) {
                        if (!builtinKeys.includes(k) && !k.startsWith('css')) {
                            properties[k] = v;
                        }
                    }
                }
                let outlinks: string[] = [];
                if (fileCache?.links) {
                    outlinks = fileCache.links.map((l: any) => l.link);
                }
                let backlinks: string[] = [];
                if (app.metadataCache.getBacklinksForFile) {
                    const b = app.metadataCache.getBacklinksForFile(file.path);
                    if (b && b.data) {
                        backlinks = Object.keys(b.data);
                    }
                }
                // chunk 范围内的内容（如需分块分析）
                if (chunkRange) {
                    // chunk 只返回 chunkText
                    return { chunkText: text.substring(chunkRange.start, chunkRange.end) };
                } else {
                    // 全局 metadata 返回全部元信息
                    return { tags, properties, outlinks, backlinks };
                }
            };
            // Extract global metadata
            const globalMetadata = await extractAIMetadata(content, file);
            // Extract chunk-level metadata（只保留 chunkText）
            for (let i = 0; i < newChunkInfo.length; i++) {
                newChunkInfo[i].metadata = { chunkText: content.substring(newChunkInfo[i].start, newChunkInfo[i].end) };
            }

            // 5. Save file-level metadata (including new chunk info and hashes)
            const fileMetadataToSave: ExtractedMetadata = {
                fileId,
                filePath: file.path,
                title: existingMetadata?.title || file.basename,
                lastModified: currentFileLastModified,
                chunkSize: currentChunkSize,
                chunks: newChunkInfo, // Use new chunk info with updated hashes and metadata
                lastProcessed: Date.now(),
                metadata: globalMetadata // Save global metadata
            };
            await this.metadataManager.saveFileMetadata(file.path, fileMetadataToSave, currentChunkSize);

            // 6. Save merged embeddings file
            console.log(`[LocalStorageManager] Saving merged embeddings for file: ${file.path}`);
            await this.embeddingManager.saveEmbeddingFile(file.path, mergedEmbeddings);

            // 7. Update Vector Index for this file
            // Pass merged embeddings and new chunk hashes to build chunk refs
            await this.vectorIndexManager.updateFileIndex(fileId, buildChunkRefsFromEmbeddings(fileId, mergedEmbeddings, Object.values(newChunkHashesMap), file.path));

            console.log(`[LocalStorageManager] Finished processing file: ${file.path}`);

        } catch (error) {
            console.error(`[LocalStorageManager] Error processing file ${file.path}:`, error);
            // Depending on the error, you might want to clean up partially saved data
        }
    }

    // Handle file deletion: remove data from all managers
    async deleteFileData(file: TFile): Promise<void> {
        console.log(`[LocalStorageManager] Deleting data for file: ${file.path}`);
        try {
            const fileId = getFileId(file.path);
            await this.metadataManager.deleteMetadataFile(fileId);
            await this.embeddingManager.deleteEmbeddingFile(fileId);
            await this.vectorIndexManager.removeFileIndex(fileId);
            console.log(`[LocalStorageManager] Deleted data for file: ${file.path}`);
        } catch (error) {
            console.error(`[LocalStorageManager] Error deleting data for file ${file.path}:`, error);
            // Continue even if one deletion fails
        }
    }

    async rebuildDatabase() {
        console.log('Rebuilding database...');
        try {
            // @ts-ignore
            const vault: Vault = window.app.vault;
            const markdownFiles = vault.getMarkdownFiles();
            console.log(`Found ${markdownFiles.length} markdown files.`);

            // Clear existing data before full rebuild
            await this.metadataManager.deleteAllMetadataFiles();
            await this.embeddingManager.deleteAllEmbeddingFiles();
            await this.vectorIndexManager.deleteVectorIndex();
            console.log('[LocalStorageManager] Cleared existing database for rebuild.');

            // Process each file individually
            for (const file of markdownFiles) {
                await this.processSingleFile(file);
            }

            console.log('Database rebuild finished.');
            return true;
        } catch (error) {
            console.error('Error during database rebuild:', error);
            return false;
        }
    }

    /**
     * 三向一致性校验与自动修复
     * @param autoFix 是否自动修复不一致（否则只报告）
     * @returns 校验报告对象
     */
    async checkAndRepairConsistency(autoFix: boolean = false): Promise<{errors: string[], fixed: string[]}> {
        const errors: string[] = [];
        const fixed: string[] = [];
        const adapter = this.vault.adapter;
        const metadataDir = `${this.dataPath}/metadata`;
        const embeddingsDir = `${this.dataPath}/embeddings`;
        const vectorIndexPath = `${this.dataPath}/vector-index.json`;

        const metadataFiles = await this.metadataManager.listMetadataFiles();
        const embeddingFiles = await this.embeddingManager.listEmbeddingFiles();
        let vectorIndex: any = await this.vectorIndexManager.getVectorIndex();
        const vectorChunks = vectorIndex?.chunks || [];

        // 1. 校验 metadata -> vector-index/embeddings
        for (const metaFilePath of metadataFiles) {
             const fileName = metaFilePath.substring(metaFilePath.lastIndexOf('/') + 1);
            const fileId = fileName.replace('.json', '');
            let metadata: any;
            try { metadata = await this.metadataManager.getFileMetadataById(fileId); } catch { continue; }
            if (!metadata) continue; // Should not happen if listed, but for safety

            for (const chunk of metadata.chunks || []) {
                // 校验 vector-index 是否有对应条目
                const idx = vectorChunks.findIndex((c: any) => c.fileId === fileId && c.chunkHash === chunk.hash && c.chunkIndex === chunk.index);
                if (idx === -1) {
                    errors.push(`[vector-index] 缺少 fileId=${fileId} chunkHash=${chunk.hash} chunkIndex=${chunk.index}`);
                    if (autoFix) {
                        // Need to get the embedding to add to vector index
                        let embedding: number[] = [];
                         const refMatch = chunk.embeddingRef.match(/\{(.+?)\}\.json#(\d+)/);
                         if (refMatch) {
                             const refFileId = refMatch[1];
                             const refIdx = Number(refMatch[2]);
                             try {
                                 const embData = await this.embeddingManager.getEmbeddingFileById(refFileId);
                                 if (embData && (refIdx in embData)) {
                                     embedding = embData[refIdx];
                                 }
                             } catch (e) {
                                 console.error(`Error fetching embedding for consistency check fileId=${refFileId} idx=${refIdx}:`, e);
                             }
                         }
                        vectorChunks.push({fileId, chunkHash: chunk.hash, chunkIndex: chunk.index, embeddingRef: chunk.embeddingRef, filePath: metadata.filePath, embedding: embedding}); // Include filePath and embedding
                        fixed.push(`[vector-index] 自动补全 fileId=${fileId} chunkHash=${chunk.hash}`);
                    }
                }
                // 校验 embeddingRef 指向的 embedding 是否存在
                const refMatch = chunk.embeddingRef.match(/\{(.+?)\}\.json#(\d+)/);
                if (refMatch) {
                    const refFileId = refMatch[1];
                    const refIdx = Number(refMatch[2]);
                    try {
                        let embData = await this.embeddingManager.getEmbeddingFileById(refFileId);
                        if (!embData || !(refIdx in embData)) {
                            errors.push(`[embeddings] 缺少 embedding fileId=${refFileId} idx=${refIdx}`);
                            if (autoFix) {
                                if (!embData) embData = {};
                                embData[refIdx] = [];
                                // Reconstruct the full path for saving
                                const embFilePath = `${this.dataPath}/embeddings/${refFileId}.json`;
                                await this.embeddingManager.saveEmbeddingFile(embFilePath, embData);
                                fixed.push(`[embeddings] 自动补全空 embedding fileId=${refFileId} idx=${refIdx}`);
                            }
                        }
                    } catch {
                         errors.push(`[embeddings] 缺少文件 fileId=${refFileId}`);
                        if (autoFix) {
                             // Reconstruct the full path for saving
                            const embFilePath = `${this.dataPath}/embeddings/${refFileId}.json`;
                             await this.embeddingManager.saveEmbeddingFile(embFilePath, {[refIdx]: []});
                            fixed.push(`[embeddings] 自动创建空 embedding 文件 fileId=${refFileId}`);
                        }
                    }
                }
            }
        }
        // 2. 遍历 vector-index -> metadata/embeddings
        for (const chunk of vectorChunks) {
            // 校验 metadata
            try {
                const meta = await this.metadataManager.getFileMetadataById(chunk.fileId);
                const metaChunk = (meta?.chunks || []).find((c: any) => c.hash === chunk.chunkHash && c.index === chunk.chunkIndex);
                if (!meta) {
                     errors.push(`[metadata] 缺少文件 fileId=${chunk.fileId}`);
                } else if (!metaChunk) {
                    errors.push(`[metadata] 缺少 chunk fileId=${chunk.fileId} chunkHash=${chunk.chunkHash}`);
                    if (autoFix) {
                        // 不自动补 metadata，需人工介入
                    }
                }
            } catch {
                 errors.push(`[metadata] 缺少文件 fileId=${chunk.fileId}`);
            }
            // 校验 embedding
            const refMatch = chunk.embeddingRef.match(/\{(.+?)\}\.json#(\d+)/);
            if (refMatch) {
                const refFileId = refMatch[1];
                const refIdx = Number(refMatch[2]);
                try {
                    let embData = await this.embeddingManager.getEmbeddingFileById(refFileId);
                    if (!embData || !(refIdx in embData)) {
                        errors.push(`[embeddings] 缺少 embedding fileId=${refFileId} idx=${refIdx}`);
                        if (autoFix) {
                            if (!embData) embData = {};
                            embData[refIdx] = [];
                            // Reconstruct the full path for saving
                            const embFilePath = `${this.dataPath}/embeddings/${refFileId}.json`;
                            await this.embeddingManager.saveEmbeddingFile(embFilePath, embData);
                            fixed.push(`[embeddings] 自动补全空 embedding fileId=${refFileId} idx=${refIdx}`);
                        }
                    }
                } catch {
                    errors.push(`[embeddings] 缺少文件 fileId=${refFileId}`);
                    if (autoFix) {
                        // Reconstruct the full path for saving
                        const embFilePath = `${this.dataPath}/embeddings/${refFileId}.json`;
                        await this.embeddingManager.saveEmbeddingFile(embFilePath, {[refIdx]: []});
                        fixed.push(`[embeddings] 自动创建空 embedding 文件 fileId=${refFileId}`);
                    }
                }
            }
        }
        // 3. 遍历 embeddings -> metadata/vector-index
        for (const embFilePath of embeddingFiles) {
            const fileName = embFilePath.substring(embFilePath.lastIndexOf('/') + 1);
            const fileId = fileName.replace('.json', '');
            let embData: any;
            try { embData = await this.embeddingManager.getEmbeddingFileById(fileId); } catch { continue; }
            if (!embData) continue; // Should not happen if listed, but for safety

            for (const idx of Object.keys(embData)) {
                // metadata
                try {
                    const meta = await this.metadataManager.getFileMetadataById(fileId);
                    const metaChunk = (meta?.chunks || []).find((c: any) => c.index === Number(idx));
                    if (!meta) {
                         errors.push(`[metadata] 缺少文件 fileId=${fileId}`);
                    } else if (!metaChunk) {
                        errors.push(`[metadata] 未引用 embedding fileId=${fileId} idx=${idx}`);
                        if (autoFix) {
                            delete embData[idx];
                            fixed.push(`[embeddings] 删除孤立 embedding fileId=${fileId} idx=${idx}`);
                        }
                    }
                } catch {}
                // vector-index
                const inVector = vectorChunks.some((c: any) => c.fileId === fileId && c.chunkIndex === Number(idx));
                if (!inVector) {
                    errors.push(`[vector-index] 未引用 embedding fileId=${fileId} idx=${idx}`);
                    if (autoFix) {
                        delete embData[idx];
                        fixed.push(`[embeddings] 删除孤立 embedding fileId=${fileId} idx=${idx}`);
                    }
                }
            }
            if (autoFix) {
                 // Need to save the updated embData back
                 // Reconstruct the full path for saving
                 const fullEmbFilePath = `${this.dataPath}/embeddings/${fileName}`;
                 await this.embeddingManager.saveEmbeddingFile(fullEmbFilePath, embData);
            }
        }
        // 4. 如有修复，保存 vector-index
        if (autoFix) {
            await this.vectorIndexManager.saveVectorIndex({chunks: vectorChunks, lastUpdated: Date.now()});
        }

        return {errors, fixed};
    }

    // 删除同步：清理已删除文件的 metadata、embeddings、vector-index 条目
    async cleanupDeletedFiles(): Promise<{deleted: string[]}> {
        const deleted: string[] = [];
        const adapter = this.vault.adapter;
        const metadataDir = `${this.dataPath}/metadata`;
        const embeddingsDir = `${this.dataPath}/embeddings`;
        const vectorIndexPath = `${this.dataPath}/vector-index.json`;

        // List files in metadata and embeddings directories
        let metadataFiles: string[] = await this.metadataManager.listMetadataFiles();
        let embeddingFiles: string[] = await this.embeddingManager.listEmbeddingFiles();

        let vectorIndex: any = await this.vectorIndexManager.getVectorIndex();
        const vectorChunks = vectorIndex?.chunks || [];

        // Get vault markdown files
        // @ts-ignore
        const vault: Vault = window.app.vault;
        const markdownFiles = vault.getMarkdownFiles();
        const validFileIds = new Set(markdownFiles.map(f => getFileId(f.path)));

        // 1. Clean up metadata
        for (const metaFilePath of metadataFiles) {
            // Extract fileId from the full path returned by listMetadataFiles (which is already full path relative to dataPath)
            const fileName = metaFilePath.substring(metaFilePath.lastIndexOf('/') + 1);
            const fileId = fileName.replace('.json', '');

            if (!validFileIds.has(fileId)) {
                console.log('[Synapse] Attempting to delete metadata file:', metaFilePath); // Added logging
                try {
                    await this.metadataManager.deleteMetadataFile(fileId); // Use the new manager method
                    deleted.push(`[metadata] 删除已失效 fileId=${fileId} (${metaFilePath})`);
                } catch (e) {
                    console.error(`Error deleting metadata file ${metaFilePath}:`, e);
                    // Continue even if deletion fails for one file
                }
            }
        }

        // 2. Clean up embeddings
        for (const embFilePath of embeddingFiles) {
             // Extract fileId from the full path returned by listEmbeddingFiles
            const fileName = embFilePath.substring(embFilePath.lastIndexOf('/') + 1);
            const fileId = fileName.replace('.json', '');

            if (!validFileIds.has(fileId)) {
                console.log('[Synapse] Attempting to delete embedding file:', embFilePath); // Added logging
                try {
                    await this.embeddingManager.deleteEmbeddingFile(fileId); // Use the new manager method
                    deleted.push(`[embeddings] 删除已失效 fileId=${fileId} (${embFilePath})`);
                } catch (e) {
                    console.error(`Error deleting embedding file ${embFilePath}:`, e);
                    // Continue even if deletion fails for one file
                }
            }
        }

        // 3. Clean up vector-index
        const newChunks = vectorChunks.filter((c: any) => validFileIds.has(c.fileId));
        if (newChunks.length !== vectorChunks.length) {
            try {
                await this.vectorIndexManager.saveVectorIndex({chunks: newChunks, lastUpdated: Date.now()});
                deleted.push(`[vector-index] 清理失效 fileId 条目`);
            } catch (e) {
                 console.error(`Error writing vector index file ${vectorIndexPath}:`, e);
            }
        }
        return {deleted};
    }

    // Returns the number of processed notes (files with metadata)
    async getProcessedNotesCount(): Promise<number> {
        try {
            const metadataFiles = await this.metadataManager.listMetadataFiles();
            return metadataFiles.length;
        } catch (e) {
            console.error('Error getting processed notes count:', e);
            return 0;
        }
    }

    // Returns the total size of all metadata, embeddings, and vector-index files in bytes as a string
    async getDatabaseSize(): Promise<string> {
        const adapter = this.vault.adapter;
        let total = 0;
        const metadataDir = `${this.dataPath}/metadata`;
        const embeddingsDir = `${this.dataPath}/embeddings`;
        const vectorIndexPath = `${this.dataPath}/vector-index.json`;

        // Calculate size of metadata files
        try {
            const metadataFiles = await this.metadataManager.listMetadataFiles();
            for (const filePath of metadataFiles) {
                 const stat = await adapter.stat(filePath);
                 total += stat?.size || 0;
            }
        } catch (e) {
            console.error(`Error calculating size for metadata directory ${metadataDir}:`, e);
        }

        // Calculate size of embeddings files
         try {
            const embeddingFiles = await this.embeddingManager.listEmbeddingFiles();
            for (const filePath of embeddingFiles) {
                 const stat = await adapter.stat(filePath);
                 total += stat?.size || 0;
            }
        } catch (e) {
            console.error(`Error calculating size for embeddings directory ${embeddingsDir}:`, e);
        }

        // Add vector index file size
        try {
            const stat = await adapter.stat(vectorIndexPath);
            total += stat?.size || 0;
        } catch (e) {
            console.error(`Error getting size for vector index file ${vectorIndexPath}:`, e);
        }
        return formatBytes(total);
    }
}