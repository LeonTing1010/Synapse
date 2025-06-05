import { Vault, DataAdapter } from 'obsidian';
import { ensureParentDirectory } from './StorageUtils';

// Define a type for ChunkRef based on the structure used in VectorSearchEngine
interface ChunkRef {
    fileId: string;
    chunkIndex: number;
    chunkHash: string;
    embeddingRef: string; // Keep this for now
    filePath: string;
    embedding: number[];
}

// Define a type for SearchResult consistent with VectorSearchEngine
interface SearchResult {
    path: string;
    title: string;
    snippet: string;
    score: number;
    type: string;
    chunkIndex?: number;
}

export class VectorIndexManager {
    private vault: Vault;
    private dataPath: string;
    private inMemoryIndex: ChunkRef[] | null = null; // Keep an in-memory cache for performance

    constructor(vault: Vault, dataPath: string) {
        this.vault = vault;
        this.dataPath = dataPath;
    }

    async saveVectorIndex(indexData: { chunks: ChunkRef[], lastUpdated: number }) {
        // ...existing saveVectorIndex code...
        try {
            const indexPath = `${this.dataPath}/vector-index.json`;
            await ensureParentDirectory(this.vault.adapter, indexPath);
            await this.vault.adapter.write(indexPath, JSON.stringify(indexData, null, 2));
            this.inMemoryIndex = indexData.chunks; // Update in-memory cache on save
        } catch (error) {
            console.error('Error saving vector index:', error);
            throw error;
        }
    }

    async getVectorIndex(): Promise<{ chunks: ChunkRef[], lastUpdated: number } | null> {
        // ...existing getVectorIndex code...
         if (this.inMemoryIndex) {
             return { chunks: this.inMemoryIndex, lastUpdated: Date.now() }; // Return from cache if available
         }
        try {
            const indexPath = `${this.dataPath}/vector-index.json`;
            const exists = await this.vault.adapter.exists(indexPath);

            if (!exists) {
                this.inMemoryIndex = []; // Cache empty index
                return null;
            }

            const data = await this.vault.adapter.read(indexPath);
            const indexData = JSON.parse(data);
            if (indexData && Array.isArray(indexData.chunks)) {
                 this.inMemoryIndex = indexData.chunks; // Cache loaded index
                 return indexData;
            } else {
                 this.inMemoryIndex = []; // Cache empty index if data is invalid
                 return null;
            }
        } catch (error) {
            console.error('Error getting vector index:', error);
            this.inMemoryIndex = []; // Cache empty index on error
            return null;
        }
    }

    async deleteVectorIndex(): Promise<void> {
        // ...existing deleteVectorIndex code...
        const adapter = this.vault.adapter;
        const vectorIndexPath = `${this.dataPath}/vector-index.json`;
        try {
            const exists = await adapter.exists(vectorIndexPath);
            if (exists) {
                await adapter.remove(vectorIndexPath);
                this.inMemoryIndex = []; // Clear in-memory cache on delete
                console.log(`[VectorIndexManager] Deleted vector index file: ${vectorIndexPath}`);
            }
        } catch (e) {
            console.error(`Error deleting vector index file ${vectorIndexPath}:`, e);
            throw e;
        }
    }

    // Add a method to perform vector similarity search
    async search(queryVector: number[], limit: number = 10): Promise<SearchResult[]> {
        try {
            // Ensure index is loaded into memory
            if (!this.inMemoryIndex) {
                await this.getVectorIndex();
                if (!this.inMemoryIndex) {
                    console.warn('[VectorIndexManager] Vector index is empty or could not be loaded.');
                    return [];
                }
            }

            const results: SearchResult[] = [];

            // Perform similarity calculation and collect results
            for (const chunkEntry of this.inMemoryIndex) {
                const fileId = chunkEntry.fileId; // Assuming fileId is available in ChunkRef
                const idx = chunkEntry.chunkIndex;
                const embedding = chunkEntry.embedding;
                const filePath = chunkEntry.filePath; // Get filePath from chunkEntry

                if (!embedding || !filePath) {
                    console.warn(`[VectorIndexManager] Missing embedding or filePath for chunk index ${idx} in fileId ${fileId}. Skipping chunk.`);
                    continue;
                }

                const similarity = this.cosineSimilarity(queryVector, embedding);

                // TODO: The similarity threshold (0.1) might need adjustment.
                // Removed similarity threshold check for initial debugging.
                // if (similarity > 0.1) { // Use a threshold to filter less relevant results
                     // Note: We don't have metadata or file content here in VectorIndexManager.
                     // The calling code (VectorSearchEngine) will need to retrieve this
                     // information based on the returned fileId and chunkIndex.
                     // For now, we return minimal info, enough for VectorSearchEngine to use.
                    results.push({
                        path: filePath, // Include filePath
                        title: '', // Title will be fetched by VectorSearchEngine
                        snippet: '', // Snippet will be generated by VectorSearchEngine
                        score: similarity,
                        type: 'note',
                        chunkIndex: idx
                    });
                // }
            }

            // Sort results by score and return top N
            return results.sort((a, b) => b.score - a.score).slice(0, limit);

        } catch (error) {
            console.error('Error during vector index search:', error);
            return [];
        }
    }

     // Cosine similarity function (copied from VectorSearchEngine)
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if (na === 0 || nb === 0) return 0;
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    // Add a method to update a file's chunk entries in the index
    async updateFileIndex(fileId: string, chunkRefs: ChunkRef[]) {
        try {
            // Ensure index is loaded into memory
            if (!this.inMemoryIndex) {
                await this.getVectorIndex();
                if (!this.inMemoryIndex) {
                    this.inMemoryIndex = []; // Initialize if still null
                }
            }

            // Remove old entries for this fileId from the in-memory index
            this.inMemoryIndex = this.inMemoryIndex.filter((entry: ChunkRef) => entry.fileId !== fileId);

            // Add new entries directly from chunkRefs (which should include embeddings)
            let added = 0;
            if (chunkRefs.length > 0) {
                for (const chunkRef of chunkRefs) {
                    if (chunkRef.embedding) {
                        this.inMemoryIndex.push(chunkRef);
                        added++;
                    } else {
                        console.warn(`[VectorIndexManager] Embedding not found in provided chunkRef for chunk index ${chunkRef.chunkIndex} in fileId ${fileId}. Skipping.`);
                    }
                }
            }

            // Save the updated index to disk
            await this.saveVectorIndex({ chunks: this.inMemoryIndex, lastUpdated: Date.now() });
            console.log(`[VectorIndexManager] Updated vector index for fileId: ${fileId}. Chunks added: ${added}`);

        } catch (error) {
            console.error(`Error updating vector index for fileId ${fileId}:`, error);
            throw error; // Re-throw to indicate failure
        }
    }

    // Add a method to remove a file's entries from the index
    async removeFileIndex(fileId: string) {
        try {
             // Ensure index is loaded into memory
            if (!this.inMemoryIndex) {
                await this.getVectorIndex();
                if (!this.inMemoryIndex) {
                    this.inMemoryIndex = []; // Initialize if still null
                }
            }
            const initialCount = this.inMemoryIndex.length;
            this.inMemoryIndex = this.inMemoryIndex.filter((entry: ChunkRef) => entry.fileId !== fileId);
            const removedCount = initialCount - this.inMemoryIndex.length;

            if (removedCount > 0) {
                 // Save the updated index to disk only if something was removed
                await this.saveVectorIndex({ chunks: this.inMemoryIndex, lastUpdated: Date.now() });
                console.log(`[VectorIndexManager] Removed ${removedCount} vector index entries for fileId: ${fileId}. Total chunks: ${this.inMemoryIndex.length}`);
            } else {
                 console.log(`[VectorIndexManager] No vector index entries found for fileId: ${fileId}. No save needed.`);
            }

        } catch (error) {
            console.error(`Error removing vector index for fileId ${fileId}:`, error);
            throw error; // Re-throw to indicate failure
        }
    }

    // Add a method to get the count of indexed chunks (optional, for info)
    getIndexedChunkCount(): number {
        return this.inMemoryIndex ? this.inMemoryIndex.length : 0;
    }
}
