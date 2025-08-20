import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || ""
});

export interface ChatResponse {
  content: string;
  sources?: Array<{
    filename: string;
    excerpt: string;
    confidence: number;
  }>;
}

export interface ProcessedDocument {
  chunks: Array<{
    text: string;
    embedding: number[];
  }>;
}

// Ranier AI personality system prompt based on requirements
const RANIER_SYSTEM_PROMPT = `You are Ranier — Come Near's internal research intelligence agent.

Voice & Personality:
- You are smart, grounded, and insightful — not corporate, not fluffy.
- You speak as a trusted internal teammate, not as an anonymous AI assistant.
- You acknowledge uncertainty and bias when appropriate, clearly stating confidence levels.
- You are transparent about why you are making certain inferences.
- You are sensitive to religious phrasing, donor relationship nuance, and user role context.

Mission Alignment:
Your purpose is to help Come Near teams extract meaning from research data (interviews, transcripts, documents) and turn it into insight-driven action without losing the raw humanity of the source.

Output Requirements:
- ALWAYS return sources (filename or reference) when making factual claims.
- When summarizing or guessing, explicitly state: "Inference" or "Hypothesis".
- Offer proactive follow-up suggestions.
- Provide confidence scores for your insights.

Style:
- Clear. Strong. Collegial.
- Encourage curiosity and next steps.
- Avoid jargon. Balance humility with confidence.

Always respond in JSON format with this structure:
{
  "content": "Your response content here",
  "confidence": 0.85,
  "sources": [
    {
      "filename": "document.txt",
      "excerpt": "relevant excerpt",
      "confidence": 0.90
    }
  ],
  "followUpSuggestions": ["suggestion 1", "suggestion 2"]
}`;

export async function askRanier(
  question: string,
  context: string,
  sources: Array<{ filename: string; content: string }>
): Promise<ChatResponse> {
  try {
    // Prepare context with source documents
    const contextWithSources = sources.length > 0 
      ? `Available research documents:\n\n${sources.map(s => 
          `=== ${s.filename} ===\n${s.content}\n`
        ).join('\n')}\n\nUser context: ${context}`
      : `User context: ${context}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    return {
      content: result.content || "I apologize, but I couldn't process your request properly.",
      sources: result.sources || [],
    };
  } catch (error) {
    console.error("Error with OpenAI API:", error);
    throw new Error("Failed to get response from Ranier AI");
  }
}

export async function extractTextFromDocument(content: string, filename: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Extract and clean the main text content from this document. Remove any formatting artifacts, headers, footers, or metadata. Return only the core textual content that would be useful for research analysis.",
        },
        {
          role: "user",
          content: `File: ${filename}\n\nContent:\n${content}`,
        },
      ],
      temperature: 0.1,
    });

    return response.choices[0].message.content || content;
  } catch (error) {
    console.error("Error extracting text:", error);
    return content; // Fallback to original content
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw new Error("Failed to generate embedding");
  }
}

export async function generateThreadTitle(firstMessage: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Generate a short, descriptive title (3-6 words) for a research conversation based on the first user message. Focus on the main topic or research area being explored.",
        },
        {
          role: "user",
          content: firstMessage,
        },
      ],
      max_tokens: 20,
      temperature: 0.5,
    });

    return response.choices[0].message.content?.trim() || "Research Conversation";
  } catch (error) {
    console.error("Error generating title:", error);
    return "Research Conversation";
  }
}
