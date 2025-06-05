import { SynapseSettings } from '../types/Settings';
import { ResponseGenerator } from './ResponseGenerator';
import { MetadataManager } from '../storage/MetadataManager';
import { VectorSearchEngine } from '../search/VectorSearchEngine';
// import { LocalStorageManager } from '../storage/LocalStorageManager';
import { App, TFile, Notice } from 'obsidian'; // Import App, TFile, and Notice
import SynapsePlugin from '../../main'; // Import the main plugin class to access settings

// Define a type for structured suggestions
export interface Suggestion {
    type: 'tag' | 'link' | 'property';
    value: string; // The suggested value (e.g., "#mytag", "[[Another Note]]", "status: in-progress")
    notePath?: string; // Optional: The path of the note the suggestion applies to (e.g., for links)
    key?: string; // Optional: For property suggestions, the property key
    propertyValue?: any; // Optional: For property suggestions, the property value
    action?: 'add' | 'update' | 'merge' | 'standardize'; // The action to perform
}

export class AISuggestionService {
    // private settings: SynapseSettings;
    private responseGenerator: ResponseGenerator;
    private metadataManager: MetadataManager;
    private vectorSearchEngine: VectorSearchEngine;
    private app: App; // Add App property
    private plugin: SynapsePlugin; // Add plugin property

    constructor(
        plugin: SynapsePlugin // Accept plugin in constructor
    ) {
        this.plugin = plugin; // Assign plugin
        // this.settings = plugin.settings;
        this.responseGenerator = plugin.responseGenerator;
        this.metadataManager = plugin.storageManager.metadataManager;
        this.vectorSearchEngine = plugin.vectorSearch;
        this.app = plugin.app;
    }

    /**
     * Suggests relevant tags based on the given text content.
     * @param text The text content to analyze.
     * @returns A promise resolving to an array of tag suggestions.
     */
    async suggestTags(text: string): Promise<Suggestion[]> {
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Suggesting tags for text:', text);
        }

        // Construct a prompt for the AI to suggest tags
        const prompt = `Analyze the following text and suggest relevant tags from a knowledge base perspective. Provide the tags as a comma-separated list.\n\nText: ${text}\n\nSuggested Tags:`;

        try {
            // Call the ResponseGenerator to get AI response
            const aiResponse = await this.responseGenerator.generateResponse(prompt);
            // Only log in development mode
            if (process.env.NODE_ENV === 'development') {
                console.log('[AISuggestionService] AI response for tags:', aiResponse);
            }

            // TODO: Implement parsing of aiResponse to extract tag suggestions
            // For now, simulate parsing by splitting a hypothetical comma-separated string
            const simulatedTags = aiResponse.split(',').map(tag => tag.trim()).filter(tag => tag !== '');

            // Map parsed tags to Suggestion objects
            const suggestions: Suggestion[] = simulatedTags.map(tag => ({
                type: 'tag',
                value: tag
            }));

            return suggestions;

        } catch (error) {
            console.error('Error suggesting tags:', error);
            return []; // Return empty array on error
        }
    }

    /**
     * Suggests relevant links to other notes or blocks based on the given text content.
     * @param text The text content to analyze.
     * @returns A promise resolving to an array of link suggestions.
     */
    async suggestLinks(text: string): Promise<Suggestion[]> {
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Suggesting links for text:', text);
        }

        try {
            // Use VectorSearchEngine to find semantically related notes
            // The second argument (3) is a placeholder for the number of results
            const relatedNotes = await this.vectorSearchEngine.semanticSearch(text, 5); // Get top 5 related notes
            // Only log in development mode
            if (process.env.NODE_ENV === 'development') {
                console.log('[AISuggestionService] Related notes found:', relatedNotes);
            }

            // Get current file path to filter out self
            const currentFilePath = this.app.workspace.getActiveFile()?.path;
            // Filter out the current file from suggestions
            const filteredNotes = relatedNotes.filter(note => note.path !== currentFilePath);

            // Map related notes to link suggestions
            const suggestions: Suggestion[] = filteredNotes.map(note => ({
                type: 'link',
                value: note.title, // Use note title as the link value
                notePath: note.path // Include the note path
                // TODO: In Phase 2, potentially use AI to suggest specific block references within these notes
            }));

            return suggestions;

        } catch (error) {
            console.error('Error suggesting links:', error);
            return []; // Return empty array on error
        }
    }

    /**
     * Suggests relevant property values based on the given text content and property key (optional).
     * @param text The text content to analyze.
     * @param propertyKey Optional property key to narrow down suggestions.
     * @returns A promise resolving to an array of property suggestions.
     */
    async suggestProperties(text: string, propertyKey?: string): Promise<Suggestion[]> {
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Suggesting properties for text:', text, 'key:', propertyKey);
        }
        try {
            // Get known property keys/values from MetadataManager for context
            const knownProperties = await this.metadataManager.getAllPropertyKeys?.() || [];
            let prompt: string;
            if (propertyKey) {
                // If a property key is specified, ask for values for that property
                prompt = `Given the following note content, suggest likely values for the property '${propertyKey}'.\n\nKnown property keys: ${knownProperties.join(", ")}\n\nText: ${text}\n\nSuggested values (comma-separated):`;
            } else {
                // Otherwise, ask for likely property key-value pairs
                prompt = `Analyze the following note content and suggest relevant property key-value pairs (e.g., status: completed, priority: high).\n\nKnown property keys: ${knownProperties.join(", ")}\n\nText: ${text}\n\nSuggested properties (comma-separated, key: value):`;
            }
            const aiResponse = await this.responseGenerator.generateResponse(prompt);
            // Only log in development mode
            if (process.env.NODE_ENV === 'development') {
                console.log('[AISuggestionService] AI response for properties:', aiResponse);
            }
            let suggestions: Suggestion[] = [];
            if (propertyKey) {
                // Expect comma-separated values, filter out empty/invalid
                const values = aiResponse.split(',').map(v => v.trim()).filter(v => v.length > 0);
                suggestions = values.map(value => ({
                    type: 'property',
                    value: `${propertyKey}: ${value}`,
                    key: propertyKey,
                    propertyValue: value,
                    action: 'add'
                }));
            } else {
                // Expect comma-separated key: value pairs, robustly parse and filter
                const pairs = aiResponse.split(',').map(p => p.trim()).filter(p => p.includes(':'));
                suggestions = pairs.map(pair => {
                    const [key, ...rest] = pair.split(':');
                    const k = key.trim();
                    const v = rest.join(':').trim();
                    if (k && v) {
                        return {
                            type: 'property',
                            value: `${k}: ${v}`,
                            key: k,
                            propertyValue: v,
                            action: 'add'
                        };
                    }
                    return null;
                }).filter(Boolean) as Suggestion[];
            }
            return suggestions;
        } catch (error) {
            console.error('Error suggesting properties:', error);
            return [];
        }
    }

    /**
     * Checks for metadata consistency issues across all notes: duplicate/similar tags, inconsistent property values.
     * Returns suggestions for merging tags or standardizing property values.
     */
    async checkMetadataConsistency(): Promise<Suggestion[]> {
        const suggestions: Suggestion[] = [];
        const metadataFiles = await this.metadataManager.listMetadataFiles();
        const tagMap: Record<string, Set<string>> = {};
        // Change propertyValues to store file paths per value
        const propertyValues: Record<string, Record<string, Set<string>>> = {};
        const tagVariants: Record<string, Set<string>> = {};
        const normalize = (tag: string) => tag.toLowerCase().replace(/[-_ ]/g, '');

        for (const file of metadataFiles) {
            const parsed = await this.metadataManager.readMetadataFile(file);
            if (!parsed) continue;

            if (parsed && Array.isArray(parsed.keywords)) {
                for (const tag of parsed.keywords) {
                    const norm = normalize(tag);
                    if (!tagMap[norm]) tagMap[norm] = new Set();
                    tagMap[norm].add(tag);
                    if (!tagVariants[tag]) tagVariants[tag] = new Set();
                    tagVariants[tag].add(file);
                }
            }

            if (parsed && parsed.metadata && typeof parsed.metadata === 'object') {
                for (const [key, value] of Object.entries(parsed.metadata)) {
                    const stringValue = String(value); // Ensure value is a string for map key
                    if (!propertyValues[key]) propertyValues[key] = {};
                    if (!propertyValues[key][stringValue]) propertyValues[key][stringValue] = new Set();
                    propertyValues[key][stringValue].add(file); // Store file path
                }
            }
        }

        for (const [norm, variants] of Object.entries(tagMap)) {
            if (variants.size > 1) {
                suggestions.push({
                    type: 'tag',
                    value: `Similar tags detected: ${Array.from(variants).join(', ')}. Consider merging.`,
                    action: 'merge'
                });
            }
        }

        for (const [key, valuesMap] of Object.entries(propertyValues)) {
            const values = Object.keys(valuesMap);
            if (values.length > 1) {
                suggestions.push({
                    type: 'property',
                    value: `Inconsistent values for '${key}': ${values.join(', ')}. Consider standardizing.`,
                    key,
                    action: 'standardize'
                });
            }
        }

        return suggestions;
    }

    /**
     * Suggests potential new metadata types (tags/properties) that frequently appear in notes but are not yet defined.
     * Uses metadata files to analyze and compare with existing metadata keys/tags.
     */
    async suggestMetadataTypeInsights(): Promise<Suggestion[]> {
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Suggesting metadata type insights...');
        }
        // 1. 获取所有 metadata 文件的 property keys
        const allKeys: string[] = await this.metadataManager.getAllPropertyKeys();
        // 2. 过滤掉 settings.acceptedMetadataTypes 和 settings.ignoredMetadataTypes
        const settings = this.plugin.settings;
        const filteredKeys = allKeys.filter(key =>
            key &&
            !settings.acceptedMetadataTypes.includes(key) &&
            !settings.ignoredMetadataTypes.includes(key)
        );
        // 3. 统计频率，按出现次数排序（可选）
        const keyCount: Record<string, number> = {};
        for (const key of allKeys) {
            if (!keyCount[key]) keyCount[key] = 0;
            keyCount[key]++;
        }
        // 4. 降低阈值：只要出现1次也返回，且输出所有 key 供调试
        const sortedKeys = filteredKeys
            .filter(key => keyCount[key] >= 1)
            .sort((a, b) => keyCount[b] - keyCount[a])
            .slice(0, 20);
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] All property keys:', allKeys);
            console.log('[AISuggestionService] Filtered keys:', filteredKeys);
        }
        // 5. 构造 Suggestion[]
        const suggestions: Suggestion[] = sortedKeys.map(key => ({
            type: 'property',
            key,
            value: `Potential new metadata type: ${key}`,
            action: 'add'
        }));
        return suggestions;
    }


    /**
     * Handles the acceptance of a potential new metadata type suggestion.
     * This method should contain the logic to register the new type,
     * e.g., adding it to a global list of known properties or prompting
     * the user to add it to a template.
     * @param suggestion The suggestion object for the metadata type.
     * @returns A boolean indicating whether the acceptance was successful.
     */
    async acceptMetadataTypeInsight(suggestion: Suggestion): Promise<boolean> {
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Accepting metadata type insight:', suggestion);
        }
        if (!suggestion.key) {
            console.error('[AISuggestionService] Cannot accept type insight without a key.');
            return false;
        }

        const settings = this.plugin.settings;
        // Add to accepted list if not already there
        if (!settings.acceptedMetadataTypes.includes(suggestion.key)) {
            settings.acceptedMetadataTypes.push(suggestion.key);
            // Remove from ignored list if it was there
            settings.ignoredMetadataTypes = settings.ignoredMetadataTypes.filter(key => key !== suggestion.key);
            await this.plugin.saveSettings();
            // Only log in development mode
            if (process.env.NODE_ENV === 'development') {
                console.log(`[AISuggestionService] Accepted type '${suggestion.key}'. Settings saved.`);
            }
            return true;
        }
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log(`[AISuggestionService] Type '${suggestion.key}' already accepted.`);
        }
        return false; // Already accepted
    }

    /**
     * Handles the ignoring of a potential new metadata type suggestion.
     * This method should contain the logic to prevent the suggestion
     * from being shown again, e.g., adding it to a local ignore list.
     * @param suggestion The suggestion object for the metadata type.
     * @returns A boolean indicating whether the ignore action was successful.
     */
    async ignoreMetadataTypeInsight(suggestion: Suggestion): Promise<boolean> {
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Ignoring metadata type insight:', suggestion);
        }
         if (!suggestion.key) {
            console.error('[AISuggestionService] Cannot ignore type insight without a key.');
            return false;
        }

        const settings = this.plugin.settings;
        // Add to ignored list if not already there
        if (!settings.ignoredMetadataTypes.includes(suggestion.key)) {
            settings.ignoredMetadataTypes.push(suggestion.key);
             // Remove from accepted list if it was there
            settings.acceptedMetadataTypes = settings.acceptedMetadataTypes.filter(key => key !== suggestion.key);
            await this.plugin.saveSettings();
            // Only log in development mode
            if (process.env.NODE_ENV === 'development') {
                console.log(`[AISuggestionService] Ignored type '${suggestion.key}'. Settings saved.`);
            }
            return true;
        }
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log(`[AISuggestionService] Type '${suggestion.key}' already ignored.`);
        }
        return false; // Already ignored
    }


    /**
     * Applies a batch merge action for similar tags.
     * @param suggestions An array of tag suggestions with action 'merge'.
     * @param targetTag The tag to standardize to.
     * @returns A promise resolving when the merge is complete.
     */
    async applyBatchMerge(suggestions: Suggestion[], targetTag: string): Promise<void> {
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Applying batch merge:', suggestions, 'to tag:', targetTag);
        }

        const oldTagsToReplace: string[] = [];
        for (const suggestion of suggestions) {
            if (suggestion.type === 'tag' && suggestion.action === 'merge') {
                // Extract the specific tag variants from the suggestion value string
                const match = suggestion.value.match(/Similar tags detected: (.*?)\. Consider merging\./);
                if (match && match[1]) {
                    const variants = match[1].split(',').map(tag => tag.trim());
                    oldTagsToReplace.push(...variants);
                }
            }
        }

        if (oldTagsToReplace.length === 0) {
            console.warn('[AISuggestionService] No tags found to merge.');
            new Notice('Synapse: No similar tags found to merge.');
            return;
        }

        let filesModifiedCount = 0;
        for (const filePath of this.app.vault.getFiles().map(f => f.path)) {
            try {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (!(file instanceof TFile)) {
                    console.warn(`[AISuggestionService] Skipping non-file path: ${filePath}`);
                    continue;
                }

                let fileContent = await this.app.vault.read(file);
                let newContent = fileContent;

                // Regex to find YAML frontmatter
                const yamlRegex = /^---\n([\s\S]*?)\n---\n?/;
                const match = fileContent.match(yamlRegex);
                let frontmatter = '';
                let body = fileContent;

                if (match) {
                    frontmatter = match[1];
                    body = fileContent.slice(match[0].length);
                }

                // Process frontmatter tags (assuming tags are in a 'tags' or 'keywords' array or comma-separated string)
                let newFrontmatter = frontmatter;
                oldTagsToReplace.forEach(oldTag => {
                    // Simple regex replacement for tags in frontmatter (handles array or string)
                    // This regex looks for the tag preceded by start of string, comma, space, or hyphen, and followed by end of string, comma, space, or hyphen.
                    const tagRegex = new RegExp(`(^|[,\s-])${oldTag}([,\s-]|$))`, 'g');
                    newFrontmatter = newFrontmatter.replace(tagRegex, `$1${targetTag}$2`);
                });

                // Process body tags (inline tags like #tag)
                let newBody = body;
                 oldTagsToReplace.forEach(oldTag => {
                    // Regex replacement for inline tags
                    const inlineTagRegex = new RegExp(`#${oldTag}(?=\s|$)`, 'g');
                    newBody = newBody.replace(inlineTagRegex, `#${targetTag}`);
                });

                // Reconstruct the file content
                if (match) {
                    newContent = `---\n${newFrontmatter.trim()}\n---\n${newBody.trimStart()}`;
                } else {
                    // If no frontmatter existed, just update the body
                    newContent = newBody;
                }

                // Modify the file only if content has changed
                if (newContent !== fileContent) {
                    await this.app.vault.modify(file, newContent);
                    // Only log in development mode
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`[AISuggestionService] Merged tags in file: ${filePath}`);
                    }
                    filesModifiedCount++;
                    // Trigger metadata update for the modified file
                    // Assuming processFile exists and updates metadata
                    // await this.storageManager.processSingleFile(file);
                }

            } catch (error) {
                console.error(`Error merging tags in file ${filePath}:`, error);
                 new Notice(`Synapse: Error merging tags in ${filePath}. See console for details.`);
            }
        }

         new Notice(`Synapse: Batch merge complete. Replaced ${oldTagsToReplace.join(', ')} with ${targetTag} in ${filesModifiedCount} files.`);
    }

    /**
     * Applies a batch standardize action for property values.
     * @param suggestions An array of property suggestions with action 'standardize'.
     * @param targetValue The value to standardize to for a given key.
     * @returns A promise resolving when the standardization is complete.
     */
    async applyBatchStandardize(suggestions: Suggestion[], targetValue: string): Promise<void> {
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Applying batch standardize:', suggestions, 'to value:', targetValue);
        }

        if (suggestions.length === 0) {
            console.warn('[AISuggestionService] No standardization suggestions provided.');
            new Notice('Synapse: No properties found to standardize.');
            return;
        }

        let filesModifiedCount = 0;
        for (const suggestion of suggestions) {
            if (suggestion.type === 'property' && suggestion.action === 'standardize' && suggestion.key) {
                 const propertyKey = suggestion.key;

                 for (const filePath of this.app.vault.getFiles().map(f => f.path)) {
                    try {
                        const file = this.app.vault.getAbstractFileByPath(filePath);
                        if (!(file instanceof TFile)) {
                            console.warn(`[AISuggestionService] Skipping non-file path: ${filePath}`);
                            continue;
                        }

                        let fileContent = await this.app.vault.read(file);
                        let newContent = fileContent;

                        // Regex to find YAML frontmatter
                        const yamlRegex = /^---\n([\s\S]*?)\n---\n?/;
                        const match = fileContent.match(yamlRegex);
                        let frontmatter = '';
                        let body = fileContent;

                        if (match) {
                            frontmatter = match[1];
                            body = fileContent.slice(match[0].length);
                        }

                        let newFrontmatter = frontmatter;
                        // Regex to find the specific property line in frontmatter
                        const propertyRegex = new RegExp(`(^|\n)${propertyKey}:.*?(?=\n|$)`, 'g');

                        if (newFrontmatter.match(propertyRegex)) {
                            // Replace existing property line
                            newFrontmatter = newFrontmatter.replace(propertyRegex, `$1${propertyKey}: ${targetValue}`);
                        } else if (match) {
                            // Add property to existing frontmatter
                            newFrontmatter = `${newFrontmatter.trim()}\n${propertyKey}: ${targetValue}`; // Add to existing block
                        } else {
                             // Create new frontmatter block with the property
                             newContent = `---\n${propertyKey}: ${targetValue}\n---\n${fileContent}`; // Add to start of file
                        }

                         if (match) { // Reconstruct if there was existing frontmatter
                             newContent = `---\n${newFrontmatter.trim()}\n---\n${body.trimStart()}`;
                         }

                        // Modify the file only if content has changed
                        if (newContent !== fileContent) {
                            await this.app.vault.modify(file, newContent);
                            // Only log in development mode
                            if (process.env.NODE_ENV === 'development') {
                                console.log(`[AISuggestionService] Standardized property '${propertyKey}' in file: ${filePath}`);
                            }
                            filesModifiedCount++;
                            // Trigger metadata update for the modified file
                            // Assuming processFile exists and updates metadata
                            // await this.storageManager.processSingleFile(file);
                        }

                    } catch (error) {
                        console.error(`Error standardizing property in file ${filePath}:`, error);
                         new Notice(`Synapse: Error standardizing property in ${filePath}. See console for details.`);
                    }
                }
            }
        }

         new Notice(`Synapse: Batch standardize complete. Set value for property in ${filesModifiedCount} files.`);
    }

    /**
     * Applies a single tag suggestion to the active file.
     * @param file The active TFile.
     * @param tag The tag to add (including #).
     * @returns Promise<boolean> True if applied successfully, false otherwise.
     */
    async applyTagSuggestion(file: TFile, tag: string): Promise<boolean> {
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Applying tag suggestion:', tag, 'to file:', file.path);
        }
        try {
            let fileContent = await this.app.vault.read(file);
            let newContent = fileContent;

            // Parse new tags from various formats: JSON, comma, markdown list, etc.
            let tagsToAdd: string[] = [];
            let raw = tag.trim();
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    tagsToAdd = parsed.map(t => String(t));
                } else {
                    tagsToAdd = [raw];
                }
            } catch {
                if (/^[-\s#]/m.test(raw) && raw.includes('\n')) {
                    tagsToAdd = raw.split('\n').map(l => l.replace(/^[-\s#]+/, '').trim()).filter(Boolean);
                } else if (raw.includes(',')) {
                    tagsToAdd = raw.split(',').map(t => t.trim());
                } else {
                    tagsToAdd = [raw];
                }
            }
            // Clean: remove leading -, #, whitespace, deduplicate, filter empty, remove # in YAML
            tagsToAdd = tagsToAdd
                .map(t => t.replace(/^[-\s#]+/, '').replace(/^#+/, '').trim())
                .filter(Boolean);

            // Always use YAML frontmatter for tags
            const yamlRegex = /^---\n([\s\S]*?)\n---\n?/;
            let frontmatter = '';
            let body = fileContent;
            let match = fileContent.match(yamlRegex);
            if (match) {
                frontmatter = match[1];
                body = fileContent.slice(match[0].length);
            }
            let newFrontmatter = frontmatter;
            const tagsKeyRegex = /(^|\n)tags:\s*(.*?)(?=\n|$)/;
            let allTags: string[] = [];
            const tagsMatch = frontmatter.match(tagsKeyRegex);
            if (tagsMatch) {
                let existingTagsBlock = tagsMatch[2];
                let existingTags: string[] = [];
                if (existingTagsBlock.trim().startsWith('-')) {
                    // YAML list (may be malformed, so parse all lines after 'tags:')
                    const lines = frontmatter.split('\n');
                    let tagsStart = lines.findIndex(l => l.trim().startsWith('tags:'));
                    if (tagsStart !== -1) {
                        let i = tagsStart + 1;
                        while (i < lines.length && lines[i].trim().startsWith('-')) {
                            let line = lines[i].replace(/^[-\s#]+/, '').replace(/^#+/, '').trim();
                            // If line looks like a JSON array, parse and flatten
                            if (/^\[.*\]$/.test(line)) {
                                try {
                                    const arr = JSON.parse(line);
                                    if (Array.isArray(arr)) {
                                        existingTags.push(...arr.map(t => String(t)));
                                    } else {
                                        existingTags.push(line);
                                    }
                                } catch {
                                    existingTags.push(line);
                                }
                            } else {
                                existingTags.push(line);
                            }
                            i++;
                        }
                    }
                } else if (/^\[.*\]$/.test(existingTagsBlock.trim())) {
                    // JSON array on the same line
                    try {
                        const arr = JSON.parse(existingTagsBlock.trim());
                        if (Array.isArray(arr)) {
                            existingTags = arr.map(t => String(t));
                        } else {
                            existingTags = [existingTagsBlock.trim()];
                        }
                    } catch {
                        existingTags = [existingTagsBlock.trim()];
                    }
                } else if (existingTagsBlock.includes(',')) {
                    // Comma-separated string
                    existingTags = existingTagsBlock.split(',').map(t => t.replace(/^[-\s#]+/, '').replace(/^#+/, '').trim()).filter(Boolean);
                } else if (existingTagsBlock.trim()) {
                    existingTags = [existingTagsBlock.trim()];
                }
                allTags = existingTags.concat(tagsToAdd);
                // Deduplicate and clean again
                allTags = allTags.map(t => t.replace(/^[-\s#]+/, '').replace(/^#+/, '').trim()).filter((t, i, arr) => t && arr.indexOf(t) === i);
                // Replace the whole tags block with new YAML list
                let newTagsBlock = allTags.map(t => `- ${t}`).join('\n');
                // Replace the entire tags block (not just the line)
                newFrontmatter = frontmatter.replace(/(^|\n)tags:\s*([\s\S]*?)(?=\n\w|\n$|$)/, `$1tags:\n${newTagsBlock}`);
            } else {
                // No tags key, add as YAML list only if tagsToAdd is not empty
                allTags = tagsToAdd;
                allTags = allTags.map(t => t.replace(/^[-\s#]+/, '').replace(/^#+/, '').trim()).filter((t, i, arr) => t && arr.indexOf(t) === i);
                if (allTags.length > 0) {
                    let newTagsBlock = allTags.map(t => `- ${t}`).join('\n');
                    newFrontmatter = `${newFrontmatter.trim()}\ntags:\n${newTagsBlock}`;
                } else {
                    newFrontmatter = `${newFrontmatter.trim()}`;
                }
            }
            // Always reconstruct YAML frontmatter
            newContent = `---\n${newFrontmatter.trim()}\n---\n${body.trimStart()}`;
            if (newContent !== fileContent) {
                await this.app.vault.modify(file, newContent);
                return true;
            }
            return false; // Content did not change
        } catch (error) {
            console.error('Error applying tag suggestion:', error);
            return false;
        }
    }

    /**
     * Applies a single link suggestion to the active file.
     * @param file The active TFile.
     * @param linkText The text to display for the link.
     * @param notePath The path to the note to link to.
     * @returns Promise<boolean> True if applied successfully, false otherwise.
     */
    async applyLinkSuggestion(file: TFile, linkText: string, notePath?: string): Promise<boolean> {
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Applying link suggestion:', linkText, 'to file:', file.path, 'target:', notePath);
        }
        try {
            const link = notePath ? `[[${notePath}|${linkText}]]` : `[[${linkText}]]`;
            let fileContent = await this.app.vault.read(file);
            // Simple approach: Add link at the end of the file
            const newContent = `${fileContent.trim()}\n\n${link}`;

            if (newContent !== fileContent) {
                await this.app.vault.modify(file, newContent);
                 // Trigger metadata update for the modified file
                // await this.storageManager.processSingleFile(file);
                return true;
            }

            return false; // Content did not change

        } catch (error) {
            console.error('Error applying link suggestion:', error);
            return false;
        }
    }

    /**
     * Applies a single property suggestion to the active file.
     * @param file The active TFile.
     * @param key The property key.
     * @param value The property value.
     * @returns Promise<boolean> True if applied successfully, false otherwise.
     */
    async applyPropertySuggestion(file: TFile, key: string, value: string): Promise<boolean> {
        if (process.env.NODE_ENV === 'development') {
            console.log('[AISuggestionService] Applying property suggestion:', key, ':', value, 'to file:', file.path);
        }
        try {
            let fileContent = await this.app.vault.read(file);
            let newContent = fileContent;

            const yamlRegex = /^---\n([\s\S]*?)\n---\n?/;
            const match = fileContent.match(yamlRegex);
            let frontmatter = '';
            let body = fileContent;

            if (match) {
                frontmatter = match[1];
                body = fileContent.slice(match[0].length);
            }

            let newFrontmatter = frontmatter;
            const propertyRegex = new RegExp(`(^|\n)${key}:.*?(?=\n|$)`, 'g');

            if (newFrontmatter.match(propertyRegex)) {
                // Replace existing property line
                newFrontmatter = newFrontmatter.replace(propertyRegex, `$1${key}: ${value}`);
            } else if (match) {
                // Add property to existing frontmatter
                newFrontmatter = `${newFrontmatter.trim()}\n${key}: ${value}`; // Add to existing block
            } else {
                 // Create new frontmatter block with the property
                 newContent = `---\n${key}: ${value}\n---\n${fileContent}`; // Add to start of file
            }

             if (match) { // Reconstruct if there was existing frontmatter
                 newContent = `---\n${newFrontmatter.trim()}\n---\n${body.trimStart()}`;
             }

            if (newContent !== fileContent) {
                await this.app.vault.modify(file, newContent);
                 // Trigger metadata update for the modified file
                // await this.storageManager.processSingleFile(file);
                return true;
            }

            return false; // Content did not change

        } catch (error) {
            console.error('Error applying property suggestion:', error);
            return false;
        }
    }

    // TODO: Add other AI-related backend logic here, e.g., for content generation assistance
}
