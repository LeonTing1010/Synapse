import { DataWriteOptions } from "obsidian";

export interface SynapseSettings {
    enabled: boolean;
    aiProvider: "openai" | "anthropic" | "local" | "openrouter" | "bailian" | "huggingface"; // Removed 'ollama'
    model: string;
    openaiApiKey: string;
    anthropicApiKey: string;
    openrouterApiKey: string;
    processingDelay: number;
    maxSearchResults: number;
    enableRealTimeSearch: boolean;
    backup: boolean;
    textChunkSize: number;
    embeddingDimension: number; // Embedding dimension for the model

    // Optional settings for huggingface integration
    huggingfaceEndpoint?: string;
    huggingfaceModel?: string;

    modelConfigName?: string; // 当前选中的大语言模型配置名
    embeddingModelName?: string; // 当前选中的embedding模型配置名

    // Metadata settings
    acceptedMetadataTypes: string[]; // List of property keys accepted by the user
    ignoredMetadataTypes: string[]; // List of property keys ignored by the user
}

export const DEFAULT_SETTINGS: SynapseSettings = {
    enabled: true,
    aiProvider: "openai",
    model: "gpt-3.5-turbo",
    openaiApiKey: "",
    anthropicApiKey: "",
    openrouterApiKey: "",
    processingDelay: 2000,
    maxSearchResults: 10,
    enableRealTimeSearch: true,
    backup: true,
    textChunkSize: 1000,
    embeddingDimension: 768, // Default embedding dimension

    // Default values for huggingface settings
    huggingfaceEndpoint: "",
    huggingfaceModel: "",
    modelConfigName: 'openai-gpt',
    embeddingModelName: 'openai-embed',

    // Default metadata settings
    acceptedMetadataTypes: [],
    ignoredMetadataTypes: [],
};
