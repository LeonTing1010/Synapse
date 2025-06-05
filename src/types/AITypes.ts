export interface ExtractedMetadata {
    fileId: string; // Add fileId
    filePath: string;
    title: string;
    chunkSize: number;
    lastModified: number; // Add lastModified
    chunks: ChunkMetadata[]; // Add chunks array
    lastProcessed: number;
    sentiment?: number;
    readingTime?: number;
    wordCount?: number;
    metadata?: { [key: string]: any }; // Add file-level metadata container
}

export interface ChunkMetadata {
    index: number;
    hash: string;
    start: number;
    end: number;
    lastProcessed: number;
    embeddingRef?: string; // Reference to embedding location
    metadata?: { // Chunk-level AI metadata
        summary?: string;
        entities?: Entity[];
        relations?: Relation[];
        [key: string]: any; // Allow other chunk-level metadata
    };
}

export interface Entity {
    name: string;
    type: string;
    confidence: number;
    text: string;
    startIndex?: number;
    endIndex?: number;
}

export interface Relation {
    source: Entity; // Change from string to Entity
    target: Entity; // Change from string to Entity
    type: string;
    confidence: number;
    text?: string;
}

export enum EntityType {
    PERSON = 'person',
    ORGANIZATION = 'organization',
    LOCATION = 'location',
    CONCEPT = 'concept',
    DATE = 'date',
    EVENT = 'event'
}

export enum RelationType {
    MENTIONS = 'mentions',
    RELATED_TO = 'related_to',
    PART_OF = 'part_of',
    LOCATED_IN = 'located_in',
    WORKS_FOR = 'works_for'
}

export interface GraphNode {
    id: string;
    label: string;
    type: string;
    properties: Record<string, any>;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    type: string;
    weight: number;
}

export interface AIResponse {
    content: string;
    confidence: number;
    model: string;
    timestamp: number;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface EmbeddingResult {
    vector: number[];
    model: string;
    dimensions: number;
    timestamp: number;
}

// Define a single ExtractedMetadata interface
export interface ExtractedMetadata {
    filePath: string;
    lastProcessed: number;
}

// If you need a partial version for updates, create a separate interface
export interface PartialExtractedMetadata {
    filePath?: string;
    lastProcessed?: number;
}

export interface AIModelOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
}