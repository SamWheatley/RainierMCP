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