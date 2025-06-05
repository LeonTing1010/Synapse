import { Vault, DataAdapter } from 'obsidian';
import * as crypto from 'crypto';

// Helper to encode string to base64url
export function base64urlEncode(str: string): string {
    // Use Buffer for Node.js environment in Obsidian
    // @ts-ignore
    const base64 = Buffer.from(str).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Extracts the file ID from a file path
export function getFileId(filePath: string): string {
    // 使用文件路径的 base64url 编码作为文件 ID (可逆)
    return base64urlEncode(filePath);
}

// Ensures the parent directory of a given file path exists
export async function ensureParentDirectory(adapter: DataAdapter, filePath: string) {
    const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
    const exists = await adapter.exists(parentDir);
    if (!exists) {
        await adapter.mkdir(parentDir);
    }
}

// Splits text into chunks of specified size
export function chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
}

// Helper to calculate chunk start/end positions (already implicitly done in chunkText loop, but good to have explicit if needed)
export function calculateChunkPositions(chunks: string[], chunkSize: number): { start: number, end: number }[] {
    const positions: { start: number, end: number }[] = [];
    let currentStart = 0;

    for (const chunk of chunks) {
        const chunkLength = Math.min(chunkSize, chunk.length);
        positions.push({ start: currentStart, end: currentStart + chunkLength });
        currentStart += chunkLength;
    }

    return positions;
}

// Formats bytes into a human-readable string (e.g., "15.2 MB")
export function formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Builds chunk references for embeddings
export function buildChunkRefsFromEmbeddings(fileId: string, embeddings: Record<number, number[]>, chunkHashes: string[], filePath: string): any[] {
    const chunkRefs: any[] = [];
    for (const hash of chunkHashes) {
        const index = chunkHashes.indexOf(hash);
        if (index !== -1) {
            chunkRefs.push({
                fileId,
                chunkIndex: index,
                chunkHash: hash, // Include the actual hash
                embeddingRef: `../embeddings/${fileId}.json#${index}`,
                filePath, // Include filePath for potential future use
                embedding: embeddings[index] // Always include embedding for VectorIndexManager
            });
        }
    }
    return chunkRefs;
}

// Generates a unique identifier for a chunk ({fileId}-{chunkHash})
export function getChunkId(fileId: string, chunkHash: string): string {
    return `${fileId}-${chunkHash}`;
}
