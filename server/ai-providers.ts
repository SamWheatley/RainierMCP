// Common interface for AI providers
export interface AIProvider {
  askRainier(
    question: string,
    context: string,
    sources: Array<{ filename: string; content: string }>
  ): Promise<ChatResponse>;
  extractTextFromDocument(content: string, filename: string): Promise<string>;
  generateThreadTitle(firstMessage: string): Promise<string>;
}

export interface ChatResponse {
  content: string;
  sources?: Array<{
    filename: string;
    excerpt: string;
    confidence: number;
  }>;
}

export type AIProviderType = 'openai' | 'anthropic' | 'grok';

// Factory function to get AI provider
export async function getAIProvider(providerType: AIProviderType): Promise<AIProvider> {
  switch (providerType) {
    case 'openai': {
      const openaiModule = await import('./openai');
      return {
        askRainier: openaiModule.askRainier,
        extractTextFromDocument: openaiModule.extractTextFromDocument,
        generateThreadTitle: openaiModule.generateThreadTitle,
      };
    }
    case 'anthropic': {
      const anthropicModule = await import('./anthropic');
      return {
        askRainier: anthropicModule.askRainier,
        extractTextFromDocument: anthropicModule.extractTextFromDocument,
        generateThreadTitle: anthropicModule.generateThreadTitle,
      };
    }
    case 'grok': {
      const grokModule = await import('./grok');
      return {
        askRainier: grokModule.askRainier,
        extractTextFromDocument: grokModule.extractTextFromDocument,
        generateThreadTitle: grokModule.generateThreadTitle,
      };
    }
    default:
      throw new Error(`Unknown AI provider: ${providerType}`);
  }
}

// Web search function
async function performWebSearch(query: string): Promise<string> {
  try {
    const { performWebSearch: webSearchFn, extractSearchTerms } = await import('./webSearch');
    const searchTerms = extractSearchTerms(query);
    return await webSearchFn(searchTerms, 3);
  } catch (error) {
    console.error("Web search failed:", error);
    return "[Web search temporarily unavailable]";
  }
}

// Smart fallback function that tries primary provider, then falls back to alternatives
export async function askWithFallback(
  primaryProvider: AIProviderType,
  question: string,
  context: string,
  sources: Array<{ filename: string; content: string }>,
  internetAccess: boolean = false
): Promise<{ response: ChatResponse; usedProvider: AIProviderType; usedFallback: boolean }> {
  const fallbackProvider: AIProviderType = primaryProvider === 'grok' ? 'anthropic' : 
                                           primaryProvider === 'openai' ? 'anthropic' : 'openai';
  
  // Augment sources with web search results if internet access is enabled
  let augmentedSources = sources;
  if (internetAccess) {
    try {
      const webResults = await performWebSearch(question);
      augmentedSources = [
        ...sources,
        {
          filename: "Web Search Results",
          content: webResults
        }
      ];
    } catch (webError) {
      console.warn("Web search failed, continuing with document-only analysis:", webError);
    }
  }

  // Try primary provider first
  try {
    const provider = await getAIProvider(primaryProvider);
    const response = await provider.askRainier(question, context, augmentedSources);
    return { 
      response, 
      usedProvider: primaryProvider, 
      usedFallback: false 
    };
  } catch (primaryError) {
    console.log(`Primary provider ${primaryProvider} failed:`, primaryError);
    
    // Check if it's a token/rate limit error OR API key error that should trigger fallback
    const shouldFallback = primaryError instanceof Error && (
      primaryError.message.includes('token') ||
      primaryError.message.includes('rate_limit') ||
      primaryError.message.includes('429') ||
      primaryError.message.includes('too large') ||
      primaryError.message.includes('Request too large') ||
      primaryError.message.includes('API key') ||
      primaryError.message.includes('Failed to get response from Rainier AI')
    );
    
    if (shouldFallback) {
      try {
        console.log(`Falling back to ${fallbackProvider} due to ${primaryProvider} limits`);
        
        // For fallback, use more aggressive source truncation to fit smaller context windows
        const truncatedSources = sources.map(source => ({
          filename: source.filename,
          content: source.content.slice(0, 8000) // Smaller for fallback
        }));
        
        const fallbackProviderInstance = await getAIProvider(fallbackProvider);
        const response = await fallbackProviderInstance.askRainier(question, context, truncatedSources);
        
        // Add a note that fallback was used
        const enhancedResponse = {
          ...response,
          content: response.content + `\n\n*Note: Response generated using fallback AI model (${fallbackProvider}) due to ${primaryProvider} API issues.*`
        };
        
        return { 
          response: enhancedResponse, 
          usedProvider: fallbackProvider, 
          usedFallback: true 
        };
      } catch (fallbackError) {
        console.error(`Fallback provider ${fallbackProvider} also failed:`, fallbackError);
        // If both fail, throw the original primary error
        throw primaryError;
      }
    } else {
      // If it's not a token/rate limit error, don't try fallback
      throw primaryError;
    }
  }
}