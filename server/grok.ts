import OpenAI from "openai";

const openai = new OpenAI({ 
  baseURL: "https://api.x.ai/v1", 
  apiKey: process.env.XAI_API_KEY 
});

// article summarization example
export async function summarizeArticle(text: string): Promise<string> {
  const prompt = `Please summarize the following text concisely while maintaining key points:\n\n${text}`;

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
    const response = await openai.chat.completions.create({
      model: "grok-2-1212",
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1200,
      temperature: 0.4
    });

    const content = response.choices[0].message.content || '[]';
    const data = JSON.parse(content);
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

function truncateSources(sources: Array<{ filename: string; content: string }>, maxTotal: number = 15000): Array<{ filename: string; content: string }> {
  if (!sources.length) return sources;
  
  const maxPerSource = Math.floor(maxTotal / sources.length);
  return sources.map(source => ({
    filename: source.filename,
    content: source.content.slice(0, maxPerSource)
  }));
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
      max_tokens: 2000,
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