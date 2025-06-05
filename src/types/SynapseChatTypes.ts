import { Suggestion } from "../ai/AISuggestionService";

export interface ChatMessage {
    id: string;
    content: string; // Can be plain text or a representation of structured data
    sender: 'user' | 'ai';
    timestamp: number;
    sources?: { path: string; snippet: string }[];
    type?: 'text' | 'suggestion-list';
    suggestions?: Suggestion[];
}
