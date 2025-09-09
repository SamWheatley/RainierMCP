import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { getAIProvider, type AIProviderType } from "./ai-providers";
import { z } from "zod";
import type { UploadedFile, ChatThread, InsertResearchInsight, InsertInsightSession } from "@shared/schema";
import OpenAI from "openai";

// Helper function to generate session titles
function generateSessionTitle(dataset: string, model: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const datasetLabel = {
    'all': 'All Data',
    'segment7': 'Segment 7 Only',
    'personal': 'Personal Only'
  }[dataset] || 'All Data';
  
  const modelLabel = {
    'openai': 'OpenAI',
    'anthropic': 'Anthropic',
    'grok': 'Grok'
  }[model] || 'OpenAI';
  
  return `${dateStr} ${datasetLabel} (${modelLabel}) Insights`;
}

// AI-powered research insights generation
async function generateResearchInsights(
  userId: string, 
  files: UploadedFile[], 
  threads: ChatThread[],
  model: string = 'openai',
  dataset: string = 'all'
): Promise<{ sessionId: string; insights: InsertResearchInsight[] }> {
  const insights: InsertResearchInsight[] = [];
  
  // Create a session for this analysis run
  const sessionTitle = generateSessionTitle(dataset, model);
  const session = await storage.createInsightSession({
    userId,
    title: sessionTitle,
    dataset: dataset as 'all' | 'segment7' | 'personal',
    model: model as 'openai' | 'anthropic' | 'grok',
  });
  
  try {
    // Helper function to make AI requests based on selected model
    const makeAIRequest = async (prompt: string, maxTokens: number = 1500, temperature: number = 0.3) => {
      if (model === 'grok') {
        const { generateResearchInsights: grokGenerate } = await import('./grok');
        return await grokGenerate(prompt);
      } else if (model === 'anthropic') {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
          temperature
        });
        const textContent = (response.content[0] as any).text || '[]';
        // Clean up potential markdown code blocks and other formatting
        let cleanedContent = textContent
          .replace(/```json\s*/gi, '')
          .replace(/```\s*$/gi, '')
          .replace(/```\s*/gi, '') // Handle cases with just ```
          .replace(/^[^[\{]*/, '') // Remove any text before JSON starts
          .replace(/[^}\]]*$/, '') // Remove any text after JSON ends
          .trim();
        
        // If it still doesn't look like JSON, try to extract JSON from the response
        if (!cleanedContent.startsWith('[') && !cleanedContent.startsWith('{')) {
          const jsonMatch = cleanedContent.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
          if (jsonMatch) {
            cleanedContent = jsonMatch[1];
          } else {
            // If no JSON found, return empty array for this insight type
            console.warn("No valid JSON found in AI response, returning empty array");
            return [];
          }
        }
        
        try {
          const parsed = JSON.parse(cleanedContent);
          return parsed;
        } catch (parseError) {
          console.warn("Failed to parse JSON:", parseError instanceof Error ? parseError.message : 'Unknown error');
          return [];
        }
      } else {
        // Default to OpenAI
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          temperature
        });
        const content = response.choices[0].message.content || '[]';
        try {
          const parsed = JSON.parse(content);
          return parsed;
        } catch (parseError) {
          console.warn("OpenAI JSON parse error:", parseError instanceof Error ? parseError.message : 'Unknown error');
          return [];
        }
      }
    };
    
    // Prepare content for AI analysis with chunking to handle token limits
    const fileContents: Array<{name: string, content: string, isS3: boolean, s3Key?: string}> = [];
    
    for (const file of files) {
      if ((file as any).isS3File && (file as any).s3Key) {
        // Load S3 file content on-demand
        try {
          const s3Service = new (await import('./s3ServiceOptimized')).OptimizedS3TranscriptService();
          const content = await s3Service.getFileContent((file as any).s3Key);
          // Truncate very long files to prevent token overflow
          const truncatedContent = content.length > 15000 ? content.substring(0, 15000) + '\n[Content truncated...]' : content;
          fileContents.push({
            name: file.originalName, 
            content: truncatedContent,
            isS3: true,
            s3Key: (file as any).s3Key
          });
          console.log(`✅ Loaded S3 content for ${file.originalName}, length: ${content.length}`);
        } catch (error) {
          console.error(`❌ Error loading S3 content for ${file.originalName}:`, error);
          fileContents.push({
            name: file.originalName,
            content: '[Content unavailable]',
            isS3: true
          });
        }
      } else if (file.extractedText) {
        // Use existing extracted text for uploaded files
        fileContents.push({
          name: file.originalName,
          content: file.extractedText,
          isS3: false
        });
      }
    }
    
    // Create manageable content chunks to avoid rate limits (Anthropic: 30K tokens/min)
    const maxContentLength = 60000; // Much smaller to avoid rate limits
    let currentLength = 0;
    const selectedFiles: typeof fileContents = [];
    
    for (const fileData of fileContents) {
      const fileText = `File: ${fileData.name}\n${fileData.content}\n\n`;
      if (currentLength + fileText.length > maxContentLength && selectedFiles.length > 0) {
        console.log(`⚠️ Truncating analysis at ${selectedFiles.length} files to stay within rate limit`);
        break;
      }
      selectedFiles.push(fileData);
      currentLength += fileText.length;
    }
    
    const fileContent = selectedFiles.map(f => `File: ${f.name}\n${f.content}`).join('\n\n');
    const conversationData = threads.map(t => `Thread: ${t.title}`).join('\n');
    
    // Store file metadata for source links
    const fileMetadata = selectedFiles.reduce((acc, f) => {
      acc[f.name] = { isS3: f.isS3, s3Key: f.s3Key };
      return acc;
    }, {} as Record<string, {isS3: boolean, s3Key?: string}>);
    
    if (!fileContent && !conversationData) {
      return insights;
    }

    // Theme Detection Analysis
    const themePrompt = `
IMPORTANT: You must respond with ONLY valid JSON. No explanations, no markdown, no additional text.

Analyze the following research data and identify key themes, patterns, and insights. Focus on:
1. Recurring topics and concepts
2. Common user behaviors or pain points  
3. Emerging trends or patterns
4. Important insights that Come Near should know

Research Data:
${fileContent}

${conversationData}

IMPORTANT: When listing sources, use EXACTLY the file names shown above (like "Atlanta_4-22_1PM_Segment 7" or "6. SEGMENT 7 - SPIRITUALITY v2").

Return ONLY a JSON array of theme insights in this exact format:
[{
  "type": "theme",
  "title": "Brief theme name",
  "description": "Detailed description of the theme and its significance",
  "confidence": 0.85,
  "sources": ["exact file names from the research data above"]
}]

Limit to 3-5 most significant themes. If no themes found, return exactly: []`;

    const themeData = await makeAIRequest(themePrompt, 1500, 0.3);
    const themeInsights = Array.isArray(themeData) ? themeData : (themeData.themes || themeData.insights || []);
    
    insights.push(...themeInsights.map((insight: any) => ({
      ...insight,
      userId,
      sessionId: session.id,
      sources: insight.sources ? insight.sources.map((source: string) => {
        const fileData = fileMetadata[source];
        if (fileData?.isS3 && fileData.s3Key) {
          return `${source} (S3: Transcripts/${fileData.s3Key.split('/').pop()})`;
        }
        return source;
      }) : []
    })));

    // Add delay to avoid rate limits (Anthropic: 30K tokens/minute)
    console.log('⏳ Waiting 20 seconds to avoid rate limit...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Bias Detection Analysis
    const biasPrompt = `
IMPORTANT: You must respond with ONLY valid JSON. No explanations, no markdown, no additional text.

Analyze the following research data for potential biases, leading questions, or methodological concerns:
1. Leading or loaded questions
2. Sample bias or demographic gaps
3. Confirmation bias in question framing
4. Missing perspectives or voices

Research Data:
${fileContent}

Return ONLY a JSON array of bias-related insights in this exact format:
[{
  "type": "bias",
  "title": "Brief bias concern",
  "description": "Explanation of the bias and why it matters for Come Near's research quality",
  "confidence": 0.75,
  "sources": ["specific file names from the data above"]
}]

Look for subtle biases too - even minor concerns are valuable for improving research quality. If absolutely no biases found, return exactly: []`;

    const biasData = await makeAIRequest(biasPrompt, 1000, 0.2);
    const biasInsights = Array.isArray(biasData) ? biasData : (biasData.biases || biasData.insights || []);
    
    insights.push(...biasInsights.map((insight: any) => ({
      ...insight,
      userId,
      sessionId: session.id,
      sources: insight.sources ? insight.sources.map((source: string) => {
        const fileData = fileMetadata[source];
        if (fileData?.isS3 && fileData.s3Key) {
          return `${source} (S3: Transcripts/${fileData.s3Key.split('/').pop()})`;
        }
        return source;
      }) : []
    })));

    // Add delay to avoid rate limits
    console.log('⏳ Waiting 20 seconds to avoid rate limit...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Pattern Recognition Analysis
    const patternPrompt = `
IMPORTANT: You must respond with ONLY valid JSON. No explanations, no markdown, no additional text.

Analyze the following research data to identify behavioral patterns, trends, and recurring structures:
1. Communication patterns and interaction styles
2. Decision-making patterns and preferences  
3. Behavioral trends across participants
4. Recurring problem-solving approaches
5. Patterns in motivations and values

Research Data:
${fileContent}

Return ONLY a JSON array of pattern insights in this exact format:
[{
  "type": "pattern",
  "title": "Clear pattern name", 
  "description": "Detailed explanation of the pattern and its significance for Come Near's work",
  "confidence": 0.8,
  "sources": ["specific file names from the data above"]
}]

Focus on 2-4 most significant patterns that could inform strategy. If no patterns found, return exactly: []`;

    const patternData = await makeAIRequest(patternPrompt, 1200, 0.3);
    const patternInsights = Array.isArray(patternData) ? patternData : (patternData.patterns || patternData.insights || []);
    
    insights.push(...patternInsights.map((insight: any) => ({
      ...insight,
      userId,
      sessionId: session.id,
      sources: insight.sources ? insight.sources.map((source: string) => {
        const fileData = fileMetadata[source];
        if (fileData?.isS3 && fileData.s3Key) {
          return `${source} (S3: Transcripts/${fileData.s3Key.split('/').pop()})`;
        }
        return source;
      }) : []
    })));

    // Add delay to avoid rate limits
    console.log('⏳ Waiting 20 seconds to avoid rate limit...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Recommendation Generation
    const recPrompt = `
IMPORTANT: You must respond with ONLY valid JSON. No explanations, no markdown, no additional text.

Based on the research analysis, provide actionable recommendations for Come Near's team:
1. Research methodology improvements
2. Product/service insights
3. Strategic recommendations
4. Next steps for further investigation

Research Data Summary:
${fileContent.substring(0, 2000)}...

Return ONLY a JSON array of recommendations in this exact format:
[{
  "type": "recommendation",
  "title": "Actionable recommendation",
  "description": "Detailed explanation and implementation guidance",
  "confidence": 0.80,
  "sources": ["specific file names from the data above"]
}]

Focus on 2-4 highest-impact recommendations. If no recommendations found, return exactly: []`;

    const recData = await makeAIRequest(recPrompt, 1200, 0.4);
    const recommendations = Array.isArray(recData) ? recData : (recData.recommendations || recData.insights || []);
    
    insights.push(...recommendations.map((insight: any) => ({
      ...insight,
      userId,
      sessionId: session.id,
      sources: insight.sources ? insight.sources.map((source: string) => {
        const fileData = fileMetadata[source];
        if (fileData?.isS3 && fileData.s3Key) {
          return `${source} (S3: Transcripts/${fileData.s3Key.split('/').pop()})`;
        }
        return source;
      }) : []
    })));

  } catch (error) {
    console.error("Error in AI analysis:", error);
    console.error("Error details:", error instanceof Error ? error.message : error);
    // Return fallback insights if AI fails
    insights.push({
      userId,
      sessionId: session.id,
      type: 'recommendation' as const,
      title: 'Analysis Available',
      description: `Found ${files.length} files and ${threads.length} conversations ready for detailed analysis. AI analysis temporarily unavailable - please try again.`,
      confidence: 0.5,
      sources: []
    });
  }

  return { sessionId: session.id, insights };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);
  
  // Guest mode middleware - allows unauthenticated access with demo user
  const guestModeMiddleware = (req: any, res: any, next: any) => {
    // If already authenticated, continue
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }
    
    // Check if this is a guest mode request
    const isGuestMode = req.headers['x-guest-mode'] === 'true' || req.query.guest === 'true';
    
    if (isGuestMode) {
      // Simulate guest user
      req.user = {
        claims: {
          sub: 'demo-user-id',
          email: 'demo@example.com',
          first_name: 'Demo',
          last_name: 'User'
        }
      };
      req.isAuthenticated = () => true;
      return next();
    }
    
    // Default to requiring authentication
    return isAuthenticated(req, res, next);
  };

  // Auth routes
  app.get('/api/auth/user', guestModeMiddleware, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      // Return demo user for prototype
      res.json({
        id: userId,
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Object storage routes for file serving
  app.get("/objects/:objectPath(*)", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // File upload routes
  app.post("/api/objects/upload", guestModeMiddleware, async (req, res) => {
    try {
      console.log("Getting upload URL for demo user...");
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      console.log("Generated upload URL:", uploadURL);
      res.json({ uploadURL });
    } catch (error: any) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ 
        error: "Failed to get upload URL",
        details: error?.message || "Unknown error" 
      });
    }
  });

  app.post("/api/files/process", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const schema = z.object({
      uploadURL: z.string(),
      originalName: z.string(),
      mimeType: z.string(),
      size: z.number(),
      destination: z.enum(['personal', 'segment7']).optional(),
    });

    try {
      const { uploadURL, originalName, mimeType, size, destination } = schema.parse(req.body);
      
      console.log(`Processing file upload for user: ${userId}`);
      
      // Ensure demo user exists in database FIRST
      if (userId === 'demo-user-id') {
        console.log("Creating demo user in database...");
        try {
          const demoUser = await storage.upsertUser({
            email: 'demo@example.com',
            firstName: 'Demo',
            lastName: 'User',
            profileImageUrl: null,
          }, userId);
          console.log("Demo user created successfully:", demoUser.id);
        } catch (userError: any) {
          console.error("Failed to ensure demo user exists:", userError);
          return res.status(500).json({ 
            error: "Failed to create demo user", 
            details: userError?.message || "User creation failed"
          });
        }
      }
      const objectStorageService = new ObjectStorageService();
      
      // Set ACL policy for private file
      let objectPath;
      try {
        objectPath = await objectStorageService.trySetObjectEntityAclPolicy(uploadURL, {
          owner: userId,
          visibility: "private",
        });
      } catch (aclError) {
        console.warn("ACL policy setting failed, using normalized path:", aclError);
        // Fallback to normalized path if ACL fails
        objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      }

      // Determine if this is a Segment 7 file that should be shared
      // Use destination from user selection, or fallback to filename detection
      const isSegment7 = destination === 'segment7' || 
                        (destination === undefined && (
                          originalName.toLowerCase().includes('segment 7') || 
                          originalName.toLowerCase().includes('segment_7') ||
                          originalName.toLowerCase().includes('segment-7')
                        ));

      // Create file record in database
      const file = await storage.createUploadedFile({
        userId,
        filename: objectPath.split('/').pop() || originalName,
        originalName,
        mimeType,
        size,
        objectPath,
        isProcessed: false,
        shared: isSegment7,
      });

      // Download and process file content for text extraction
      try {
        const fileContent = await objectStorageService.getObjectEntityFile(objectPath);
        
        // Get the file content as text
        const chunks: Buffer[] = [];
        const stream = fileContent.createReadStream();
        
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        
        const rawContent = Buffer.concat(chunks).toString('utf-8');
        console.log(`Downloaded file content for ${originalName}, length: ${rawContent.length}`);
        
        // Extract clean text using AI (default to OpenAI)
        const { extractTextFromDocument } = await import('./openai');
        const extractedText = await extractTextFromDocument(rawContent, originalName);
        console.log(`Extracted text for ${originalName}, length: ${extractedText.length}`);
        
        // Update file with extracted text
        await storage.updateFileProcessingStatus(file.id, true, extractedText);
        
      } catch (extractionError) {
        console.error("Error extracting text from file:", extractionError);
        // Continue with basic file info even if extraction fails
        // Mark as processed but without extracted text if extraction fails
        await storage.updateFileProcessingStatus(file.id, true);
      }

      res.json({ file });
    } catch (error: any) {
      console.error("Error processing file:", error);
      console.error("Full error details:", {
        message: error?.message,
        stack: error?.stack,
        uploadURL: req.body.uploadURL,
        originalName: req.body.originalName,
        userId
      });
      res.status(500).json({ 
        error: "Failed to process file",
        details: error?.message || "Unknown processing error"
      });
    }
  });

  // Chat thread routes
  app.get("/api/threads", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    try {
      const threads = await storage.getUserChatThreads(userId);
      res.json({ threads });
    } catch (error) {
      console.error("Error fetching threads:", error);
      res.status(500).json({ error: "Failed to fetch threads" });
    }
  });

  app.post("/api/threads", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const schema = z.object({
      title: z.string().optional(),
    });

    try {
      const { title } = schema.parse(req.body);
      const thread = await storage.createChatThread({
        userId,
        title: title || "New Conversation",
      });
      res.json({ thread });
    } catch (error) {
      console.error("Error creating thread:", error);
      res.status(500).json({ error: "Failed to create thread" });
    }
  });

  app.patch("/api/threads/:threadId", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const { threadId } = req.params;
    const schema = z.object({
      title: z.string().min(1, "Title cannot be empty"),
    });

    try {
      const { title } = schema.parse(req.body);
      
      // Verify thread ownership
      const thread = await storage.getChatThread(threadId, userId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      await storage.updateChatThread(threadId, title);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating thread:", error);
      res.status(500).json({ error: "Failed to update thread" });
    }
  });

  app.delete("/api/threads/:threadId", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const { threadId } = req.params;

    try {
      // Verify thread ownership
      const thread = await storage.getChatThread(threadId, userId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      await storage.deleteChatThread(threadId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting thread:", error);
      res.status(500).json({ error: "Failed to delete thread" });
    }
  });

  app.get("/api/threads/:threadId/messages", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const { threadId } = req.params;

    try {
      // Verify thread ownership
      const thread = await storage.getChatThread(threadId, userId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      const messages = await storage.getThreadMessages(threadId);
      res.json({ messages });
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/threads/:threadId/messages", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const { threadId } = req.params;
    const schema = z.object({
      content: z.string(),
      aiProvider: z.enum(['openai', 'anthropic', 'grok']).optional().default('openai'),
      internetAccess: z.boolean().optional().default(false),
      attachments: z.array(z.object({
        uploadURL: z.string(),
        originalName: z.string(),
        mimeType: z.string(),
        size: z.number(),
      })).optional(),
    });

    try {
      const { content, aiProvider, internetAccess, attachments } = schema.parse(req.body);

      // Verify thread ownership
      const thread = await storage.getChatThread(threadId, userId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      // Process attachments if any
      let attachmentTexts: Array<{filename: string, content: string}> = [];
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          try {
            const objectStorageService = new ObjectStorageService();
            const objectPath = objectStorageService.normalizeObjectEntityPath(attachment.uploadURL);
            const fileContent = await objectStorageService.getObjectEntityFile(objectPath);
            
            const chunks: Buffer[] = [];
            const stream = fileContent.createReadStream();
            for await (const chunk of stream) {
              chunks.push(chunk);
            }
            
            const rawContent = Buffer.concat(chunks).toString('utf-8');
            
            // For very large files, just use first part without AI extraction to avoid token limits
            let extractedText = "";
            if (rawContent.length > 100000) {
              // File is very large, just take first part and clean it
              extractedText = rawContent.slice(0, 50000);
              console.log(`Large file ${attachment.originalName}: using first 50k chars without AI extraction`);
            } else {
              // Extract text using AI with error handling for smaller files
              try {
                const { extractTextFromDocument } = await import('./openai');
                extractedText = await extractTextFromDocument(rawContent, attachment.originalName);
              } catch (extractionError) {
                console.error("Error extracting text from attachment:", extractionError);
                extractedText = rawContent.slice(0, 25000); // Even smaller fallback
              }
            }
            
            // Sanitize text
            const sanitizedText = extractedText
              .replace(/\0/g, '')
              .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
              .trim();
              
            attachmentTexts.push({
              filename: attachment.originalName,
              content: sanitizedText
            });
          } catch (error) {
            console.error(`Error processing attachment ${attachment.originalName}:`, error);
          }
        }
      }

      // Save user message with attachments info
      const userMessage = await storage.createChatMessage({
        threadId,
        role: "user",
        content,
        attachments: attachments?.map(att => ({
          id: att.uploadURL,
          filename: att.originalName,
          mimeType: att.mimeType,
          size: att.size,
        })),
      });

      // Get user's files for context
      const userFiles = await storage.getUserFiles(userId);
      const processedFiles = userFiles.filter(f => f.isProcessed && f.extractedText);
      
      // Prepare context from both permanent files and temporary attachments
      const sources = [
        ...processedFiles.map(f => ({
          filename: f.originalName,
          content: f.extractedText || "",
        })),
        ...attachmentTexts
      ];

      // Get AI response with automatic fallback
      const { askWithFallback } = await import('./ai-providers');
      
      // If internet access is enabled, add context about it
      const contextString = internetAccess 
        ? "You have internet access and can search for current information when needed to supplement your analysis of the provided documents. Use internet search strategically to provide more complete and up-to-date insights."
        : "You are operating in sandboxed mode with access only to the uploaded research files. Focus your analysis exclusively on the content provided in the documents.";
      
      const { response: aiResponse, usedProvider, usedFallback } = await askWithFallback(
        aiProvider as AIProviderType, 
        content, 
        contextString, 
        sources,
        internetAccess
      );
      
      if (usedFallback) {
        console.log(`Successfully used fallback provider: ${usedProvider} instead of ${aiProvider}`);
      }

      // Save AI message
      const assistantMessage = await storage.createChatMessage({
        threadId,
        role: "assistant",
        content: aiResponse.content,
        sources: aiResponse.sources,
      });

      // Update thread title if this is the first user message
      const allMessages = await storage.getThreadMessages(threadId);
      if (allMessages.filter(m => m.role === "user").length === 1) {
        // Use the successful provider (either primary or fallback) for title generation
        const titleProvider = await getAIProvider(usedProvider);
        const newTitle = await titleProvider.generateThreadTitle(content);
        await storage.updateChatThread(threadId, newTitle);
      }

      res.json({ 
        userMessage, 
        assistantMessage,
        sources: aiResponse.sources 
      });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Chat attachment upload routes (temporary files for conversations)
  app.post("/api/chat/attachments/upload", guestModeMiddleware, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting chat attachment upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.post("/api/chat/attachments/process", guestModeMiddleware, async (req, res) => {
    const { uploadURL, originalName, mimeType, size, messageId } = req.body;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      // Download and process the file content
      const fileContent = await objectStorageService.getObjectEntityFile(objectPath);
      const chunks: Buffer[] = [];
      const stream = fileContent.createReadStream();

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const rawContent = Buffer.concat(chunks).toString('utf-8');
      console.log(`Downloaded chat attachment ${originalName}, length: ${rawContent.length}`);

      // Extract text using AI with error handling
      let extractedText = "";
      try {
        const { extractTextFromDocument } = await import('./openai');
        extractedText = await extractTextFromDocument(rawContent, originalName);
        console.log(`Extracted text for chat attachment ${originalName}, length: ${extractedText.length}`);
      } catch (extractionError) {
        console.error("Error extracting text from chat attachment:", extractionError);
        // Use raw content as fallback if extraction fails
        extractedText = rawContent.slice(0, 50000); // Limit to first 50k chars
      }

      // Sanitize text for database storage (remove null bytes and other problematic characters)
      const sanitizedText = extractedText
        .replace(/\0/g, '') // Remove null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters
        .trim();

      // Create chat attachment (not permanent file)
      const attachment = await storage.createChatAttachment({
        messageId,
        filename: originalName.replace(/[^a-zA-Z0-9.-]/g, '_'),
        originalName,
        mimeType,
        size,
        objectPath,
        extractedText: sanitizedText,
      });

      res.json({ attachment });
    } catch (error) {
      console.error("Error processing chat attachment:", error);
      res.status(500).json({ error: "Failed to process attachment" });
    }
  });

  // File management routes
  app.get("/api/files", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    try {
      let files;
      if (userId) {
        // Authenticated user - get their files plus shared files
        files = await storage.getUserFiles(userId);
      } else {
        // Guest user - only get shared files
        files = await storage.getSharedFiles();
      }

      // Add S3 curated transcript files
      try {
        const { OptimizedS3TranscriptService } = await import('./s3ServiceOptimized');
        const s3Service = new OptimizedS3TranscriptService();
        const s3Files = await s3Service.getCuratedTranscripts();
        
        // Convert S3 files to FileData format and add to results
        const s3FileData = s3Files.map(f => s3Service.s3FileToFileData(f));
        files.push(...s3FileData);
        
      } catch (s3Error) {
        console.error("Error fetching S3 files:", s3Error);
        // Continue without S3 files if there's an error
      }

      res.json({ files });
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // Admin endpoint to reprocess all user files
  app.post("/api/admin/reprocess-all-files", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    
    try {
      const userFiles = await storage.getUserFiles(userId);
      const unprocessedFiles = userFiles.filter(f => !f.isProcessed || !f.extractedText);
      
      console.log(`Reprocessing ${unprocessedFiles.length} files for user ${userId}`);
      
      const objectStorageService = new ObjectStorageService();
      const results = [];
      
      for (const file of unprocessedFiles) {
        try {
          console.log(`Processing file: ${file.originalName}`);
          
          // Download file content
          const fileContent = await objectStorageService.getObjectEntityFile(file.objectPath);
          const chunks: Buffer[] = [];
          const stream = fileContent.createReadStream();
          
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          
          const rawContent = Buffer.concat(chunks).toString('utf-8');
          console.log(`File ${file.originalName} content length: ${rawContent.length}`);
          
          // Extract text using AI
          const { extractTextFromDocument } = await import('./openai');
          const extractedText = await extractTextFromDocument(rawContent, file.originalName);
          console.log(`Extracted text length: ${extractedText.length}`);
          
          // Update file with extracted text
          await storage.updateFileProcessingStatus(file.id, true, extractedText);
          
          results.push({
            id: file.id,
            name: file.originalName,
            success: true,
            extractedLength: extractedText.length
          });
          
        } catch (error) {
          console.error(`Error processing file ${file.originalName}:`, error);
          results.push({
            id: file.id,
            name: file.originalName,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      res.json({ results, processed: results.length });
    } catch (error) {
      console.error("Error reprocessing files:", error);
      res.status(500).json({ error: "Failed to reprocess files" });
    }
  });

  app.post("/api/files/:fileId/reprocess", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const { fileId } = req.params;

    try {
      const file = await storage.getUploadedFile(fileId, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const objectStorageService = new ObjectStorageService();
      
      try {
        // Download file content
        const fileContent = await objectStorageService.getObjectEntityFile(file.objectPath);
        
        const chunks: Buffer[] = [];
        const stream = fileContent.createReadStream();
        
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        
        const rawContent = Buffer.concat(chunks).toString('utf-8');
        console.log(`Reprocessing file ${file.originalName}, content length: ${rawContent.length}`);
        
        // Extract text using AI
        const { extractTextFromDocument } = await import('./openai');
        const extractedText = await extractTextFromDocument(rawContent, file.originalName);
        console.log(`Extracted text for ${file.originalName}, length: ${extractedText.length}`);
        
        // Update file with extracted text
        await storage.updateFileProcessingStatus(file.id, true, extractedText);
        
        res.json({ success: true, extractedTextLength: extractedText.length });
      } catch (extractionError) {
        console.error("Error reprocessing file:", extractionError);
        res.status(500).json({ error: "Failed to extract text from file" });
      }
    } catch (error) {
      console.error("Error reprocessing file:", error);
      res.status(500).json({ error: "Failed to reprocess file" });
    }
  });

  app.delete("/api/files/:fileId", guestModeMiddleware, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const { fileId } = req.params;

    try {
      const file = await storage.getUploadedFile(fileId, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Delete from object storage if objectPath exists
      if (file.objectPath) {
        try {
          const objectStorageService = new ObjectStorageService();
          const objectFile = await objectStorageService.getObjectEntityFile(file.objectPath);
          await objectFile.delete();
          console.log(`Deleted object storage file: ${file.objectPath}`);
        } catch (storageError) {
          console.warn("Error deleting from object storage:", storageError);
          // Continue with database deletion even if object storage fails
        }
      }

      // Delete from database
      await storage.deleteUploadedFile(fileId, userId);
      console.log(`Deleted file ${file.originalName} (${fileId}) for user ${userId}`);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Research Insights API routes
  app.get('/api/research-insights', guestModeMiddleware, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const sessions = await storage.getInsightSessions(userId);
      // Flatten all insights from all sessions for backwards compatibility
      const allInsights = sessions.flatMap(session => session.insights);
      res.json({ insights: allInsights, sessions });
    } catch (error: any) {
      console.error("Error fetching research insights:", error);
      res.status(500).json({ error: "Failed to fetch research insights" });
    }
  });

  app.post('/api/research-insights/generate', guestModeMiddleware, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const { dataset = 'all', model = 'openai' } = req.body;
      
      // Get user's files and conversations for analysis
      let files = await storage.getUploadedFilesByUser(userId);
      const threads = await storage.getChatThreadsByUser(userId);
      
      // ALSO get S3 transcript files for real data analysis
      const { OptimizedS3TranscriptService } = await import('./s3ServiceOptimized');
      const s3Service = new OptimizedS3TranscriptService();
      const s3Files = await s3Service.getCuratedTranscripts();
      
      // Convert S3 files to the expected format and merge
      const convertedS3Files = s3Files.map(s3File => ({
        id: s3File.id,
        originalName: s3File.title,
        extractedText: '', // Will load on-demand
        shared: s3File.shared || false,
        isS3File: true,
        s3Key: s3File.metadata.s3Key
      }));
      
      // Combine uploaded files and S3 files
      files = [...files, ...convertedS3Files];
      
      // Filter files based on dataset selection
      if (dataset === 'segment7') {
        files = files.filter(file => file.shared);
      } else if (dataset === 'personal') {
        files = files.filter(file => !file.shared);
      }
      // 'all' uses all files (both shared and personal)
      
      if (files.length === 0 && threads.length === 0) {
        const datasetName = dataset === 'segment7' ? 'Segment 7' : 
                           dataset === 'personal' ? 'personal' : '';
        return res.status(400).json({ 
          error: `No ${datasetName} data available for analysis. Upload files or start conversations first.` 
        });
      }

      // Generate insights using AI analysis
      const result = await generateResearchInsights(userId, files, threads, model, dataset);
      
      // Store insights in database
      for (const insight of result.insights) {
        await storage.createResearchInsight(insight);
      }

      res.json({ 
        message: "Research insights generated successfully", 
        count: result.insights.length,
        sessionId: result.sessionId
      });
    } catch (error: any) {
      console.error("Error generating research insights:", error);
      res.status(500).json({ error: "Failed to generate research insights" });
    }
  });

  app.put('/api/research-insights/:id', guestModeMiddleware, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const { id } = req.params;
      const { title } = req.body;

      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: "Title is required" });
      }

      await storage.updateResearchInsight(id, userId, title.trim());
      res.json({ message: "Research insight updated successfully" });
    } catch (error: any) {
      console.error("Error updating research insight:", error);
      res.status(500).json({ error: "Failed to update research insight" });
    }
  });

  app.delete('/api/research-insights/:id', guestModeMiddleware, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const { id } = req.params;

      await storage.deleteResearchInsight(id, userId);
      res.json({ message: "Research insight deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting research insight:", error);
      res.status(500).json({ error: "Failed to delete research insight" });
    }
  });

  // S3 Data Lake Ingestion Admin Endpoint
  app.post('/admin/ingest', guestModeMiddleware, async (req: any, res) => {
    try {
      const { spawn } = require('child_process');
      const prefix = req.body.prefix || 'uploads/';
      
      console.log(`Starting S3 ingestion for prefix: ${prefix}`);
      
      // Spawn Python ingester process
      const ingester = spawn('python', ['ingester_cn_only.py', '--prefix', prefix], {
        env: process.env,
        stdio: 'pipe'
      });
      
      let output = '';
      let errorOutput = '';
      
      ingester.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        console.log(`[Ingester] ${text.trim()}`);
      });
      
      ingester.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`[Ingester Error] ${text.trim()}`);
      });
      
      ingester.on('close', (code: number) => {
        if (code === 0) {
          console.log('S3 ingestion completed successfully');
          res.json({ 
            success: true, 
            message: 'Ingestion completed successfully',
            output: output.trim()
          });
        } else {
          console.error(`S3 ingestion failed with code ${code}`);
          res.status(500).json({ 
            success: false, 
            message: `Ingestion failed with exit code ${code}`,
            error: errorOutput.trim(),
            output: output.trim()
          });
        }
      });
      
      // Handle timeout (10 minutes max)
      setTimeout(() => {
        ingester.kill();
        res.status(408).json({ 
          success: false, 
          message: 'Ingestion timed out after 10 minutes'
        });
      }, 10 * 60 * 1000);
      
    } catch (error: any) {
      console.error("Error running S3 ingestion:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to start ingestion process",
        error: error.message 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
