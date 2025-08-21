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