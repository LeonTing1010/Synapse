import { App, TFile } from 'obsidian';
import { AIModelManager } from '../ai/AIModelManager';
import { ExtractedMetadata } from '../types/AITypes';
import { MetadataManager } from '../storage/MetadataManager';
import { VectorIndexManager } from '../storage/VectorIndexManager';
import { EmbeddingGenerator } from '../ai/EmbeddingGenerator'; // Import EmbeddingGenerator

interface SearchResult {
    path: string;
    title: string;
    snippet: string;
    score: number;
    type: string;
    chunkIndex?: number; // Add chunk index to search result
}

export class VectorSearchEngine {
    private metadataManager: MetadataManager;
    private vectorIndexManager: VectorIndexManager;
    // Change type from AIModelManager to EmbeddingGenerator
    private embeddingGenerator: EmbeddingGenerator;
    private app: App; // Declare app property

    constructor(
        app: App, // Add app parameter
        metadataManager: MetadataManager,
        vectorIndexManager: VectorIndexManager,
        // Change parameter type to EmbeddingGenerator
        embeddingGenerator: EmbeddingGenerator
    ) {
        this.app = app; // Assign app
        this.metadataManager = metadataManager;
        this.vectorIndexManager = vectorIndexManager;
        // Assign EmbeddingGenerator
        this.embeddingGenerator = embeddingGenerator;
    }

    async initialize() {
        // Initialization logic, potentially ensure index directory exists
        // [VectorSearchEngine] Remove or comment out all console.log for production cleanliness
        console.log('VectorSearchEngine initialized.');
    }

    // Perform semantic search using the VectorIndexManager
    async semanticSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
        try {
            // Use the injected EmbeddingGenerator
            const queryVector = await this.embeddingGenerator.generateEmbedding(query);
            // console.log('[Synapse] Semantic Search - Query Vector generated:', queryVector ? 'Generated' : 'Failed');
            if (!queryVector) {
                console.error('[Synapse] Failed to generate query embedding.');
                return [];
            }
            // console.log('[Synapse] Query Vector (first 5 elements):', queryVector.slice(0, 5));

            // Delegate the vector search to VectorIndexManager
            const vectorSearchResults = await this.vectorIndexManager.search(queryVector, limit);
            // console.log('[Synapse] Vector Index Search returned:', vectorSearchResults.length, 'results.');

            const results: SearchResult[] = [];

            // Process results from VectorIndexManager
            for (const vectorResult of vectorSearchResults) {
                const filePath = vectorResult.path; // Get filePath from vectorResult
                const idx = vectorResult.chunkIndex; // Get chunkIndex from vectorResult
                const similarity = vectorResult.score;

                if (!filePath) {
                     console.warn(`[Synapse] Vector search result missing filePath for chunk index: ${idx}. Skipping.`);
                     continue;
                }

                // Load metadata and file content for relevant chunks
                const metadata = await this.metadataManager.getFileMetadata(filePath); // Assuming getFileMetadata takes filePath

                // Explicitly check if metadata, chunkSize, and idx are available and are numbers
                if (!metadata || typeof metadata.chunkSize !== 'number' || typeof idx !== 'number') {
                    console.warn(`[Synapse] Could not load metadata or missing/invalid chunk info for filePath: ${filePath}. Skipping.`);
                    continue;
                }

                const file = this.app.vault.getAbstractFileByPath(metadata.filePath);
                if (!(file instanceof TFile)) {
                     console.warn(`[Synapse] Could not get TFile for filePath: ${metadata.filePath} for relevant chunk. Skipping.`);
                    continue;
                }
                const fileContent = await this.app.vault.read(file);
                const chunkSize = metadata.chunkSize;

                // Now we are sure idx and chunkSize are numbers
                const snippet = this.generateChunkSnippet(fileContent, idx, chunkSize, query);
                results.push({
                    path: metadata.filePath,
                    title: metadata.title, // Assuming title is stored in metadata
                    snippet,
                    score: similarity,
                    type: 'note',
                    chunkIndex: idx
                });
            }

            // Results are already sorted by VectorIndexManager, but we can re-sort if needed
            return results.sort((a, b) => b.score - a.score);

        } catch (error) {
            console.error('Semantic search error:', error);
            return [];
        }
    }

    // Simple keyword search (kept for potential fallback or other uses)
    async keywordSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
        // ...existing code...
         console.warn('[Synapse] keywordSearch in VectorSearchEngine is not fully implemented after index refactoring.');
         return []; // Returning empty for now as in-memory index is removed
    }

    // Cosine similarity function (kept for potential other uses, though duplicated in VectorIndexManager)
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

    private escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private generateChunkSnippet(fileContent: string, chunkIndex: number, chunkSize: number, query: string): string {
        const startIndex = chunkIndex * chunkSize;
        const endIndex = startIndex + chunkSize;
        const chunkText = fileContent.substring(startIndex, endIndex);
        const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 1);
        const lowerChunkText = chunkText.toLowerCase();
        const snippetLength = 200;
        const contextLength = 50;
        let bestSnippet = '';
        let snippetStart = -1;
        let snippetEnd = -1;
        for (const term of queryTerms) {
            const index = lowerChunkText.indexOf(term);
            if (index !== -1) {
                snippetStart = Math.max(0, index - contextLength);
                snippetEnd = Math.min(chunkText.length, index + term.length + contextLength);
                bestSnippet = chunkText.substring(snippetStart, snippetEnd);
                break;
            }
        }
        if (bestSnippet) {
            const prefix = snippetStart > 0 ? '...' : '';
            const suffix = snippetEnd < chunkText.length ? '...' : '';
            let highlightedSnippet = bestSnippet;
            for (const term of queryTerms) {
                const safeTerm = this.escapeRegExp(term);
                const regex = new RegExp(`(${safeTerm})`, 'gi');
                highlightedSnippet = highlightedSnippet.replace(regex, '**$1**');
            }
            return prefix + highlightedSnippet + suffix;
        }
        return chunkText.substring(0, snippetLength) + (chunkText.length > snippetLength ? '...' : '');
    }
}