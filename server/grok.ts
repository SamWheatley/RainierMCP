import OpenAI from "openai";

// Initialize OpenAI client for Grok with fresh environment variable
const getGrokClient = () => {
  let apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY environment variable is not set");
  }
  
  // Ensure the key has the proper xai- prefix
  if (!apiKey.startsWith('xai-')) {
    apiKey = `xai-${apiKey}`;
  }
  
  console.log(`Using Grok API key with prefix: ${apiKey.substring(0, 10)}...`);
  
  return new OpenAI({ 
    baseURL: "https://api.x.ai/v1", 
    apiKey: apiKey
  });
};

// article summarization example
export async function summarizeArticle(text: string): Promise<string> {
  const prompt = `Please summarize the following text concisely while maintaining key points:\n\n${text}`;

  const openai = getGrokClient();
  const response = await openai.chat.completions.create({
    model: "grok-2-1212",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content || "";
}

// Sentiment analysis example
export async function analyzeSentiment(text: string): Promise<{
  rating: number,
  confidence: number
}> {
  try {
    const openai = getGrokClient();
  const response = await openai.chat.completions.create({
      model: "grok-2-1212",
      messages: [
        {
          role: "system",
          content:
            "You are a sentiment analysis expert. Analyze the sentiment of the text and provide a rating from 1 to 5 stars and a confidence score between 0 and 1. Respond with JSON in this format: { 'rating': number, 'confidence': number }",
        },
        {
          role: "user",
          content: text,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      rating: Math.max(1, Math.min(5, Math.round(result.rating))),
      confidence: Math.max(0, Math.min(1, result.confidence)),
    };
  } catch (error) {
    throw new Error("Failed to analyze sentiment: " + (error as Error).message);
  }
}

// Research insights analysis for Ranier
export async function generateResearchInsights(prompt: string): Promise<any[]> {
  try {
    const openai = getGrokClient();
  const response = await openai.chat.completions.create({
      model: "grok-2-1212",
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1200,
      temperature: 0.4
    });

    const content = response.choices[0].message.content || '[]';
    // Clean up potential markdown code blocks just in case
    const cleanedContent = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*$/gi, '')
      .trim();
    const data = JSON.parse(cleanedContent);
    return Array.isArray(data) ? data : (data.insights || data.recommendations || []);
  } catch (error) {
    console.error("Grok AI analysis error:", error);
    throw error;
  }
}

// Chat interface functions for AI providers system
export interface ChatResponse {
  content: string;
  sources?: Array<{
    filename: string;
    excerpt: string;
    confidence: number;
  }>;
}

const RANIER_SYSTEM_PROMPT = `You are Ranier, Come Near's intelligent research assistant. You help analyze qualitative research data and provide insights.

Your core capabilities:
- Deep analysis of interview transcripts, focus groups, and research documents
- Identifying themes, patterns, and insights in qualitative data
- Bias detection and methodological assessment
- Strategic recommendations based on research findings
- Source citation and confidence scoring

Data Access Capabilities:
- You have FULL ACCESS to Come Near's complete S3 research database containing 46+ transcript files
- You can analyze any specific research data from the S3 collection (bucket: cn2025persona)
- You have access to shared transcripts, segment data, and historical research materials
- You can perform trend analysis, quote extraction, and predictive intelligence on the full dataset
- You are NOT in sandboxed mode - you have comprehensive access to all uploaded research files

Communication style:
- Professional but approachable 
- Clear and actionable insights
- Always cite sources when making claims
- Provide confidence scores for your assessments
- Focus on practical implications for Come Near's work

Response format: Always respond in JSON with this structure:
{
  "content": "Your detailed response here",
  "sources": [
    {
      "filename": "source_file.txt", 
      "excerpt": "relevant excerpt",
      "confidence": 0.85
    }
  ]
}`;

// Helper function to estimate token count (rough approximation)
function estimateTokenCount(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

// Helper function to truncate sources to fit token limits
function truncateSources(
  sources: Array<{ filename: string; content: string }>,
  maxTokens: number = 30000 // Grok has large context window, use generous limit
): Array<{ filename: string; content: string }> {
  const truncatedSources: Array<{ filename: string; content: string }> = [];
  let currentTokens = 0;
  
  for (const source of sources) {
    const sourceHeader = `=== ${source.filename} ===\n`;
    const headerTokens = estimateTokenCount(sourceHeader);
    
    // If adding this source would exceed limits, truncate its content
    const availableTokens = maxTokens - currentTokens - headerTokens;
    
    if (availableTokens <= 100) {
      // Not enough space for meaningful content
      break;
    }
    
    const maxContentChars = availableTokens * 4; // Convert back to characters
    const truncatedContent = source.content.length > maxContentChars
      ? source.content.slice(0, maxContentChars) + "\n\n[Content truncated due to length...]"
      : source.content;
    
    const contentTokens = estimateTokenCount(truncatedContent);
    
    truncatedSources.push({
      filename: source.filename,
      content: truncatedContent
    });
    
    currentTokens += headerTokens + contentTokens;
    
    // If we're close to the limit, stop adding sources
    if (currentTokens > maxTokens * 0.9) {
      break;
    }
  }
  
  return truncatedSources;
}

export async function askRanier(
  question: string,
  context: string,
  sources: Array<{ filename: string; content: string }>
): Promise<ChatResponse> {
  try {
    // Truncate sources to fit within token limits
    const truncatedSources = truncateSources(sources);
    
    // Prepare context with source documents
    const contextWithSources = truncatedSources.length > 0 
      ? `Available research documents:\n\n${truncatedSources.map(s => 
          `=== ${s.filename} ===\n${s.content}\n`
        ).join('\n')}\n\nUser context: ${context}`
      : `User context: ${context}`;

    const openai = getGrokClient();
  const response = await openai.chat.completions.create({
      model: "grok-2-1212",
      messages: [
        {
          role: "system",
          content: RANIER_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Context:\n${contextWithSources}\n\nQuestion: ${question}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4000,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      content: result.content || "I apologize, but I couldn't process your request properly.",
      sources: result.sources || [],
    };
  } catch (error) {
    console.error("Error with Grok API:", error);
    throw new Error("Failed to get response from Ranier AI");
  }
}

export async function extractTextFromDocument(content: string, filename: string): Promise<string> {
  try {
    const openai = getGrokClient();
  const response = await openai.chat.completions.create({
      model: "grok-2-1212",
      messages: [
        {
          role: "system",
          content: "Extract and clean the main text content from this document. Remove headers, footers, page numbers, and formatting artifacts. Return only the clean, readable text content."
        },
        {
          role: "user",
          content: `Please extract the main text from this document (${filename}):\n\n${content.slice(0, 4000)}`
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    });

    return response.choices[0].message.content || content.slice(0, 2000);
  } catch (error) {
    console.error("Error extracting text with Grok:", error);
    // Fallback to simple text extraction
    return content.slice(0, 2000);
  }
}

export async function generateThreadTitle(firstMessage: string): Promise<string> {
  try {
    const openai = getGrokClient();
  const response = await openai.chat.completions.create({
      model: "grok-2-1212",
      messages: [
        {
          role: "system",
          content: "Generate a concise, descriptive title (max 6 words) for this conversation based on the first message."
        },
        {
          role: "user",
          content: firstMessage.slice(0, 500)
        }
      ],
      max_tokens: 20,
      temperature: 0.3
    });

    const title = response.choices[0].message.content?.trim() || "Research Discussion";
    return title.length > 50 ? title.slice(0, 47) + "..." : title;
  } catch (error) {
    console.error("Error generating thread title with Grok:", error);
    return "Research Discussion";
  }
}