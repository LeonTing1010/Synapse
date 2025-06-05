import { SynapseSettings } from '../types/Settings';
import { AIModelOptions } from '../types/AITypes';
import { AIModelManager } from './AIModelManager';

export class ResponseGenerator {
    private settings: SynapseSettings;
    private modelManager: AIModelManager; // Add AIModelManager instance

    constructor(settings: SynapseSettings, modelManager: AIModelManager) {
        this.settings = settings;
        this.modelManager = modelManager; // Assign AIModelManager
    }

    // Add a method to update settings and modelManager
    public updateSettings(newSettings: SynapseSettings, newModelManager: AIModelManager) {
        this.settings = newSettings;
        this.modelManager = newModelManager;
    }

    async generateResponse(prompt: string, options?: AIModelOptions): Promise<string> {
        try {
            // Get the LLM model from the current LLM config
            const llmModel = this.modelManager.getCurrentLLMConfig()?.model || this.settings.model;

            // Default options
            const modelOptions = {
                model: options?.model || llmModel,
                temperature: options?.temperature || 0.7,
                maxTokens: options?.maxTokens || 1000,
                topP: options?.topP || 1,
                frequencyPenalty: options?.frequencyPenalty || 0,
                presencePenalty: options?.presencePenalty || 0
            };

            // Use AIModelManager.callAI for all response generation
            // The task name and payload structure will depend on the specific API being called
            // For chat/completion tasks, a common task name might be "chat/completions" or similar.
            // The payload typically includes the model name and messages.
            const task = "chat/completions"; // Example task name - adjust based on actual API
            const payload = {
                model: modelOptions.model, // Use the model from options or config
                messages: [{ role: 'user', content: prompt }],
                // Include other options if the API supports them
                temperature: modelOptions.temperature,
                max_tokens: modelOptions.maxTokens,
                top_p: modelOptions.topP,
                frequency_penalty: modelOptions.frequencyPenalty,
                presence_penalty: modelOptions.presencePenalty
            };

            const response = await this.modelManager.callLLM(task, payload);

            // TODO: Adapt parsing based on actual API response format for chat/completions
            // Assuming the response structure is similar to OpenAI: { choices: [{ message: { content: '...' } }] }
            const generatedText = response?.choices?.[0]?.message?.content || '';

            return generatedText;

        } catch (error) {
            console.error('Error generating response:', error);
            return 'Sorry, I encountered an error while generating a response.';
        }
    }

    // Removed provider-specific call methods (callOpenAI, callAnthropic, etc.)

    // Removed generateLocalResponse method
}