// Common interface for AI providers
export interface AIProvider {
  askRanier(
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

export type AIProviderType = 'openai' | 'anthropic';

// Factory function to get AI provider
export async function getAIProvider(providerType: AIProviderType): Promise<AIProvider> {
  switch (providerType) {
    case 'openai': {
      const openaiModule = await import('./openai');
      return {
        askRanier: openaiModule.askRanier,
        extractTextFromDocument: openaiModule.extractTextFromDocument,
        generateThreadTitle: openaiModule.generateThreadTitle,
      };
    }
    case 'anthropic': {
      const anthropicModule = await import('./anthropic');
      return {
        askRanier: anthropicModule.askRanier,
        extractTextFromDocument: anthropicModule.extractTextFromDocument,
        generateThreadTitle: anthropicModule.generateThreadTitle,
      };
    }
    default:
      throw new Error(`Unknown AI provider: ${providerType}`);
  }
}

// Smart fallback function that tries primary provider, then falls back to alternatives
export async function askWithFallback(
  primaryProvider: AIProviderType,
  question: string,
  context: string,
  sources: Array<{ filename: string; content: string }>
): Promise<{ response: ChatResponse; usedProvider: AIProviderType; usedFallback: boolean }> {
  const fallbackProvider: AIProviderType = primaryProvider === 'openai' ? 'anthropic' : 'openai';
  
  // Try primary provider first
  try {
    const provider = await getAIProvider(primaryProvider);
    const response = await provider.askRanier(question, context, sources);
    return { 
      response, 
      usedProvider: primaryProvider, 
      usedFallback: false 
    };
  } catch (primaryError) {
    console.log(`Primary provider ${primaryProvider} failed:`, primaryError);
    
    // Check if it's a token/rate limit error that might work better with fallback
    const shouldFallback = primaryError instanceof Error && (
      primaryError.message.includes('token') ||
      primaryError.message.includes('rate_limit') ||
      primaryError.message.includes('429') ||
      primaryError.message.includes('too large') ||
      primaryError.message.includes('Request too large')
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
        const response = await fallbackProviderInstance.askRanier(question, context, truncatedSources);
        
        // Add a note that fallback was used
        const enhancedResponse = {
          ...response,
          content: response.content + "\n\n*Note: Response generated using fallback AI model due to document size limitations.*"
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