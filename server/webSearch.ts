// Web search functionality for internet access mode
export async function performWebSearch(query: string, maxResults: number = 3): Promise<string> {
  try {
    console.log(`Performing web search for: "${query}"`);
    
    // Import the web search capability
    const { searchWeb } = await import('./webSearchHelper');
    const searchResults = await searchWeb(query, maxResults);
    
    return `Web Search Results for "${query}":\n\n${searchResults}`;
    
  } catch (error) {
    console.error("Web search failed:", error);
    return `[Web search failed: ${error.message}]`;
  }
}

// Extract search terms from a longer query
export function extractSearchTerms(query: string): string {
  // Remove common question words and extract key terms
  const stopWords = ['what', 'how', 'why', 'when', 'where', 'who', 'is', 'are', 'can', 'does', 'do', 'the', 'a', 'an'];
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
  
  // Take first 5-6 key terms for focused search
  return words.slice(0, 6).join(' ');
}