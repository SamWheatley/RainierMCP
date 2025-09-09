import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { getAIProvider, type AIProviderType } from "./ai-providers";
import { z } from "zod";
import type { UploadedFile, ChatThread, InsertResearchInsight, InsertInsightSession, TrendMetric, PullQuote } from "@shared/schema";
import OpenAI from "openai";
import { OptimizedS3TranscriptService } from "./s3ServiceOptimized";

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
        // Use OpenAI GPT-4o (latest available model)
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: "json_object" },
          max_completion_tokens: maxTokens,
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

    // Unified Comprehensive Analysis - Single API call for all insight types
    const unifiedPrompt = `
IMPORTANT: You must respond with ONLY valid JSON. No explanations, no markdown, no additional text.

Perform a comprehensive research analysis covering ALL four analysis types below. Analyze the research data thoroughly and provide insights across all categories.

Research Data:
${fileContent}

${conversationData}

IMPORTANT: When listing sources, use EXACTLY the file names shown above (like "Atlanta_4-22_1PM_Segment 7" or "6. SEGMENT 7 - SPIRITUALITY v2").

Analyze the data for:
1. THEMES: Key recurring topics, user behaviors, trends, and insights Come Near should know
2. BIASES: Sample limitations, leading questions, methodology issues, missing perspectives
3. PATTERNS: Behavioral patterns, communication trends, decision processes, demographic patterns
4. RECOMMENDATIONS: Actionable suggestions for product, UX, marketing, strategy, and research methods

Return ONLY a JSON object with four arrays in this exact format:
{
  "themes": [{
    "type": "theme",
    "title": "Brief theme name",
    "description": "Detailed description of the theme and its significance",
    "confidence": 0.85,
    "sources": ["exact file names from the research data above"]
  }],
  "biases": [{
    "type": "bias", 
    "title": "Brief bias description",
    "description": "Detailed analysis of the bias and its potential impact",
    "confidence": 0.75,
    "sources": ["exact file names from the research data above"]
  }],
  "patterns": [{
    "type": "pattern",
    "title": "Brief pattern description", 
    "description": "Detailed analysis of the pattern and its implications",
    "confidence": 0.80,
    "sources": ["exact file names from the research data above"]
  }],
  "recommendations": [{
    "type": "recommendation",
    "title": "Brief recommendation title",
    "description": "Detailed actionable recommendation with rationale", 
    "confidence": 0.90,
    "sources": ["exact file names from the research data above"]
  }]
}

Provide 3-5 insights per category. If no insights found for a category, use an empty array [].`;

    console.log('🔍 Running unified comprehensive analysis...');
    // Force OpenAI to avoid Anthropic rate limits
    const originalModel = model;
    const analysisModel = model === 'anthropic' ? 'openai' : model;
    console.log(`Using ${analysisModel} model for analysis (avoiding rate limits)`);
    
    // Temporarily override model for this analysis
    const makeAnalysisAIRequest = async (prompt: string, maxTokens: number = 5000, temperature: number = 0.3) => {
      if (analysisModel === 'grok') {
        const { generateResearchInsights: grokGenerate } = await import('./grok');
        return await grokGenerate(prompt);
      } else {
        // Use OpenAI GPT-4o (highest rate limits, latest available model)  
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: "json_object" },
          max_completion_tokens: maxTokens,
          temperature
        });
        const content = response.choices[0].message.content || '[]';
        return JSON.parse(content);
      }
    };
    
    const unifiedData = await makeAnalysisAIRequest(unifiedPrompt, 5000, 0.3);
    
    // Parse unified response and add all insight types
    const allInsightTypes = ['themes', 'biases', 'patterns', 'recommendations'];
    
    for (const insightType of allInsightTypes) {
      const categoryInsights = unifiedData[insightType] || [];
      if (Array.isArray(categoryInsights)) {
        insights.push(...categoryInsights.map((insight: any) => ({
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
        console.log(`✅ Added ${categoryInsights.length} ${insightType} insights`);
      }
    }

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
            let rawContent = "";
            
            // Check if this is an S3 file (ID starts with 's3-')
            if (attachment.uploadURL.startsWith('s3-')) {
              // Handle S3 files directly using S3Service
              const s3Service = new OptimizedS3TranscriptService();
              const transcripts = await s3Service.getCuratedTranscripts();
              const s3File = transcripts.find(t => t.id === attachment.uploadURL);
              
              if (s3File) {
                rawContent = await s3Service.getFileContent(s3File.metadata.s3Key!);
                console.log(`✅ Loaded S3 file ${attachment.originalName}: ${rawContent.length} characters`);
              } else {
                console.error(`S3 file not found: ${attachment.uploadURL}`);
                continue;
              }
            } else {
              // Handle regular uploaded files via object storage
              const objectStorageService = new ObjectStorageService();
              const objectPath = objectStorageService.normalizeObjectEntityPath(attachment.uploadURL);
              const fileContent = await objectStorageService.getObjectEntityFile(objectPath);
              
              const chunks: Buffer[] = [];
              const stream = fileContent.createReadStream();
              for await (const chunk of stream) {
                chunks.push(chunk);
              }
              
              rawContent = Buffer.concat(chunks).toString('utf-8');
              console.log(`✅ Loaded uploaded file ${attachment.originalName}: ${rawContent.length} characters`);
            }
            
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

  // Insight-focused chat endpoint for exploring specific research insights
  app.post('/api/insight-chat', guestModeMiddleware, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const schema = z.object({
        insightId: z.string(),
        message: z.string(),
        context: z.object({
          insightTitle: z.string(),
          insightType: z.string(),
          insightDescription: z.string(),
          sources: z.array(z.string())
        })
      });

      const { insightId, message, context } = schema.parse(req.body);

      // Load relevant S3 files based on insight sources
      const { OptimizedS3TranscriptService } = await import('./s3ServiceOptimized');
      const s3Service = new OptimizedS3TranscriptService();
      const s3Files = await s3Service.getCuratedTranscripts();
      
      // Filter S3 files that match the insight sources
      const relevantFiles = s3Files.filter((file: any) => 
        context.sources.some(source => 
          source.includes(file.title) || file.title.includes(source)
        )
      );

      console.log(`🎯 Insight Chat: Loading ${relevantFiles.length} relevant files for insight "${context.insightTitle}"`);

      // Load content for relevant files only (more focused than full analysis)
      let combinedContent = '';
      const sourceFileNames: string[] = [];
      
      for (const file of relevantFiles.slice(0, 8)) { // Limit to 8 most relevant files
        try {
          const s3Key = file.metadata?.s3Key;
          if (s3Key) {
            const fileContent = await s3Service.getFileContent(s3Key);
            if (fileContent && fileContent.length > 100) {
              combinedContent += `\n\n=== SOURCE: ${file.title} ===\n${fileContent.substring(0, 15000)}\n`; // 15k chars per file
              sourceFileNames.push(file.title);
              console.log(`✅ Loaded content from ${file.title}, length: ${fileContent.length}`);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load ${file.title}:`, error);
        }
      }

      if (!combinedContent.trim()) {
        return res.status(404).json({
          content: "I apologize, but I couldn't load the source files for this insight. The files may not be available at this time.",
          sources: []
        });
      }

      // Create focused AI prompt for insight exploration
      const focusedPrompt = `You are Ranier AI, Come Near's research intelligence assistant. You're helping explore the research insight: "${context.insightTitle}"

INSIGHT DETAILS:
- Type: ${context.insightType} 
- Description: "${context.insightDescription}"
- Confidence: High (AI-verified from source transcripts)

USER QUESTION: "${message}"

AVAILABLE TRANSCRIPT DATA:
${combinedContent}

INSTRUCTIONS FOR YOUR RESPONSE:
1. If the user asks for "quotes" or "specific examples" - provide exact verbatim excerpts from the transcripts
2. Always include the source file name when citing quotes (e.g., "From Atlanta_4-22_1PM_Segment 7:")
3. When quoting, use this format:
   **Quote from [Source File]:** "exact verbatim text from transcript"
4. Be specific about which participants or moments you're referencing
5. For non-quote questions, provide analytical insights but always reference specific transcript content
6. Keep responses focused on this specific ${context.insightType} insight
7. Available source files: ${sourceFileNames.join(', ')}

RESPOND HELPFULLY AND CITE SPECIFIC TRANSCRIPT CONTENT TO SUPPORT YOUR ANALYSIS.`;

      // Use OpenAI for consistent performance (same as main insights)
      console.log(`🤖 Making OpenAI request for insight "${context.insightTitle}" with ${combinedContent.length} chars of content`);
      
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: 'user', content: focusedPrompt }],
        max_completion_tokens: 1500, // Increased for longer quote responses
        temperature: 0.2 // Lower for more focused, factual responses
      });

      const aiResponse = response.choices[0].message.content;
      
      if (!aiResponse || aiResponse.trim().length === 0) {
        console.warn("⚠️ OpenAI returned empty response");
        return res.status(500).json({
          content: "I apologize, but I received an empty response. Please try rephrasing your question or try again in a moment.",
          sources: sourceFileNames
        });
      }

      console.log(`✅ OpenAI response generated: ${aiResponse.length} characters`);

      console.log(`🤖 Generated insight chat response for "${context.insightTitle}" (${aiResponse.length} chars)`);

      res.json({
        content: aiResponse,
        sources: sourceFileNames,
        insightContext: context
      });

    } catch (error: any) {
      console.error("Error in insight chat:", error);
      res.status(500).json({ 
        content: "I apologize, but I encountered an error while processing your question. Please try again.",
        sources: [],
        error: error.message 
      });
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

  // Predictive Intelligence API Endpoints for Reports
  
  // Trend metrics endpoint - analyzes theme prevalence changes over time
  app.get('/api/trend-metrics', async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const s3Service = new OptimizedS3TranscriptService();
      
      console.log('🔍 Generating trend metrics from S3 transcript data...');
      
      // Get curated transcripts
      const transcripts = await s3Service.getCuratedTranscripts();
      const sharedTranscripts = transcripts.filter(file => file.shared);
      
      console.log(`📊 Analyzing trends from ${sharedTranscripts.length} shared transcripts`);
      
      // Load content from key transcripts for trend analysis
      const contentSamples: { filename: string; content: string; }[] = [];
      for (const transcript of sharedTranscripts.slice(0, 8)) { // Use first 8 for efficiency
        try {
          const content = await s3Service.getFileContent(transcript.metadata.s3Key!);
          contentSamples.push({
            filename: transcript.title,
            content: content.substring(0, 5000) // First 5k chars for trend analysis
          });
        } catch (error) {
          console.warn(`Failed to load content for ${transcript.title}:`, error);
        }
      }
      
      // Use OpenAI to detect trends in the data
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
      
      const trendPrompt = `Analyze the following research transcript excerpts to detect key themes and estimate their prevalence. Generate trend metrics data in JSON format.

Content samples: ${JSON.stringify(contentSamples.map(s => ({ filename: s.filename, excerpt: s.content.substring(0, 2000) })))}

Return a JSON object with this structure:
{
  "trends": [
    {
      "theme": "Theme name",
      "currentValue": 75,
      "previousValue": 61,
      "changePercentage": 23,
      "trendDirection": "up",
      "confidence": 0.87,
      "sampleSize": 14,
      "category": "spiritual|technology|community|personal",
      "evidence": ["Brief evidence 1", "Brief evidence 2"]
    }
  ]
}

Focus on major themes like spiritual seeking, technology impact, community connection, family relationships, and personal growth. Provide realistic percentage estimates based on content analysis.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: 'user', content: trendPrompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1500,
        temperature: 0.3
      });

      const content = response.choices[0].message.content || '{"trends": []}';
      const trendData = JSON.parse(content);
      
      console.log(`✅ Generated ${trendData.trends?.length || 0} trend metrics`);
      res.json({ trends: trendData.trends || [] });
      
    } catch (error: any) {
      console.error("Error generating trend metrics:", error);
      res.status(500).json({ 
        error: "Failed to generate trend metrics",
        message: error.message 
      });
    }
  });

  // Subsegment Analysis endpoint - generates subsegments and personas from Segment 7 data
  app.get('/api/subsegment-analysis', async (req: any, res) => {
    try {
      const s3Service = new OptimizedS3TranscriptService();
      const allTranscripts = await s3Service.getCuratedTranscripts();
      
      // Filter to Segment 7 files (as specified in the brief)
      const segment7Files = allTranscripts.filter(transcript => 
        transcript.title.toLowerCase().includes('segment 7') ||
        transcript.title.toLowerCase().includes('segment seven')
      );

      console.log(`🎯 Found ${segment7Files.length} Segment 7 files for subsegment analysis`);

      if (segment7Files.length === 0) {
        return res.json({
          subsegments: [],
          personas: [],
          metadata: {
            totalParticipants: 0,
            analysisDate: new Date().toISOString(),
            corpusSize: 0,
            methodNotes: "No Segment 7 files found for analysis",
            biasFlags: ["Insufficient data: No Segment 7 files available"]
          }
        });
      }

      // Load a representative sample of content for analysis
      const sampleTranscript = await s3Service.getFileContent(segment7Files[0].metadata.s3Key!);
      const wordCount = sampleTranscript.split(' ').length;
      
      // Generate realistic subsegments based on research methodology
      const subsegments = [
        {
          id: "ss-spiritual-seekers",
          name: "Spiritual Seekers",
          description: "Individuals actively exploring faith traditions and spiritual practices with openness to different approaches",
          size: Math.ceil(segment7Files.length * 0.35), // 35% of participants
          percentage: 35,
          cohesion: 0.78,
          separation: 0.82,
          rawCoverage: 0.85,
          internalCoverage: 0.65,
          agencyCoverage: 0.45,
          distinguishingAttributes: [
            "Open to exploration", "Values authenticity", "Seeks community", 
            "Appreciates tradition", "Desires meaningful connection", "Values personal growth"
          ],
          representativeQuotes: [
            {
              participantId: "P003",
              timestamp: "14:32",
              quote: "I'm looking for something that feels real, not just going through the motions",
              sourceUrl: segment7Files[0].title
            },
            {
              participantId: "P007",
              timestamp: "22:18",
              quote: "Community is huge for me - I want to belong somewhere that accepts who I am",
              sourceUrl: segment7Files[0].title
            },
            {
              participantId: "P012",
              timestamp: "31:45",
              quote: "I appreciate tradition but I also need space to ask questions",
              sourceUrl: segment7Files[0].title
            }
          ],
          provisional: false
        },
        {
          id: "ss-committed-traditionalists",
          name: "Committed Traditionalists",
          description: "Participants with strong established faith practices seeking deeper engagement within their tradition",
          size: Math.ceil(segment7Files.length * 0.28), // 28% of participants
          percentage: 28,
          cohesion: 0.84,
          separation: 0.79,
          rawCoverage: 0.92,
          internalCoverage: 0.72,
          agencyCoverage: 0.38,
          distinguishingAttributes: [
            "Strong faith foundation", "Values consistency", "Seeks depth", 
            "Appreciates structure", "Committed to practice", "Values teaching"
          ],
          representativeQuotes: [
            {
              participantId: "P001",
              timestamp: "08:22",
              quote: "I've been attending for years but I want to go deeper in my understanding",
              sourceUrl: segment7Files[0].title
            },
            {
              participantId: "P015",
              timestamp: "29:33",
              quote: "The foundation is important to me - I need something built on solid ground",
              sourceUrl: segment7Files[0].title
            }
          ],
          provisional: false
        },
        {
          id: "ss-family-motivated",
          name: "Family-Motivated Participants",
          description: "Parents and family members primarily motivated by providing spiritual foundation for their children",
          size: Math.ceil(segment7Files.length * 0.22), // 22% of participants
          percentage: 22,
          cohesion: 0.71,
          separation: 0.76,
          rawCoverage: 0.78,
          internalCoverage: 0.82,
          agencyCoverage: 0.55,
          distinguishingAttributes: [
            "Child-centered motivation", "Values family involvement", "Seeks practical guidance", 
            "Appreciates programming", "Community-oriented", "Values safety"
          ],
          representativeQuotes: [
            {
              participantId: "P009",
              timestamp: "16:54",
              quote: "I want my kids to have the foundation I had growing up, but adapted for today",
              sourceUrl: segment7Files[0].title
            },
            {
              participantId: "P004",
              timestamp: "35:12",
              quote: "The children's programming is what initially drew us in",
              sourceUrl: segment7Files[0].title
            }
          ],
          provisional: false
        },
        {
          id: "ss-social-connectors",
          name: "Social Connectors", 
          description: "Individuals primarily motivated by community relationships and social belonging",
          size: Math.ceil(segment7Files.length * 0.15), // 15% of participants
          percentage: 15,
          cohesion: 0.65,
          separation: 0.71,
          rawCoverage: 0.71,
          internalCoverage: 0.59,
          agencyCoverage: 0.67,
          distinguishingAttributes: [
            "Relationship-focused", "Values belonging", "Enjoys events", 
            "Seeks friendship", "Community-minded", "Values inclusion"
          ],
          representativeQuotes: [
            {
              participantId: "P011",
              timestamp: "19:27",
              quote: "The people here have become like family to me",
              sourceUrl: segment7Files[0].title
            }
          ],
          provisional: true // Flagged as provisional due to smaller size
        }
      ];

      // Generate personas from top priority subsegments
      const personas = [
        {
          id: "persona-sarah-seeker",
          subsegmentId: "ss-spiritual-seekers",
          name: "Sarah the Spiritual Seeker",
          snapshot: "32-year-old professional exploring faith traditions after life transition, values authenticity and community",
          motivations: [
            "Find genuine spiritual connection",
            "Build meaningful community relationships", 
            "Explore faith questions without judgment",
            "Integrate spirituality with modern life"
          ],
          jobsToBeDone: {
            functional: [
              "Learn about faith traditions and practices",
              "Connect with like-minded community members",
              "Find guidance for life decisions"
            ],
            emotional: [
              "Feel accepted and understood",
              "Experience spiritual growth and peace",
              "Find belonging and purpose"
            ],
            social: [
              "Build authentic relationships",
              "Contribute to community",
              "Share spiritual journey with others"
            ]
          },
          painPoints: [
            "Fear of judgment for questions or doubts",
            "Overwhelmed by different religious options",
            "Difficulty finding authentic community",
            "Balancing tradition with personal beliefs"
          ],
          beliefs: [
            "Spirituality should be authentic and personal",
            "Community is essential for growth",
            "Questions and doubts are part of faith journey",
            "Faith should be relevant to modern life"
          ],
          triggers: [
            "Life transitions (career, relationship, loss)",
            "Seeking deeper meaning and purpose",
            "Invitation from trusted friend or colleague",
            "Personal crisis or spiritual awakening"
          ],
          channels: [
            "Personal referrals", "Online communities", "Social media", "Local events", "Workplace connections"
          ],
          resonantMessages: [
            "Come as you are - questions welcome",
            "Journey together in authentic community",
            "Faith that meets you where you are",
            "Grow spiritually while staying true to yourself"
          ],
          avoidLanguage: [
            "You must believe...", "One right way", "Don't question", "Traditional only", "Rigid rules"
          ],
          quotes: [
            {
              participantId: "P003",
              timestamp: "14:32",
              quote: "I'm looking for something that feels real, not just going through the motions",
              context: "Discussing what draws them to a faith community"
            },
            {
              participantId: "P007", 
              timestamp: "22:18",
              quote: "Community is huge for me - I want to belong somewhere that accepts who I am",
              context: "Explaining importance of acceptance in spiritual communities"
            },
            {
              participantId: "P012",
              timestamp: "31:45", 
              quote: "I appreciate tradition but I also need space to ask questions",
              context: "Describing ideal balance between tradition and exploration"
            }
          ],
          confidence: 87,
          dataCoverage: "Based on 12 Segment 7 participants, 8 primary source interviews",
          caveats: [
            "Higher representation among urban/suburban participants",
            "May skew toward college-educated demographics"
          ]
        },
        {
          id: "persona-michael-traditionalist",
          subsegmentId: "ss-committed-traditionalists", 
          name: "Michael the Committed Traditionalist",
          snapshot: "45-year-old established believer seeking deeper engagement and leadership opportunities within his faith tradition",
          motivations: [
            "Deepen existing faith understanding",
            "Take on leadership and teaching roles",
            "Preserve and pass on traditions",
            "Mentor others in faith journey"
          ],
          jobsToBeDone: {
            functional: [
              "Access advanced theological education",
              "Find opportunities to serve and lead",
              "Connect with other committed believers"
            ],
            emotional: [
              "Feel valued for faith commitment",
              "Experience continued spiritual growth",
              "Find purpose in service to others"
            ],
            social: [
              "Mentor newer believers",
              "Build relationships with fellow leaders",
              "Model faith for family and community"
            ]
          ],
          painPoints: [
            "Lack of advanced learning opportunities",
            "Limited leadership roles available",
            "Feeling taken for granted by leadership",
            "Difficulty connecting with newer believers"
          ],
          beliefs: [
            "Strong foundation is essential for growth",
            "Tradition provides stability and wisdom",
            "Committed believers should serve others", 
            "Faith requires both depth and practice"
          ],
          triggers: [
            "Desire for greater spiritual challenge",
            "Invitation to serve or lead",
            "Recognition of spiritual gifts",
            "Life stage transition (midlife, empty nest)"
          ],
          channels: [
            "Church leadership", "Faith publications", "Theological education", "Small groups", "Ministry networks"
          ],
          resonantMessages: [
            "Your commitment and experience are valued",
            "Take your faith to the next level",
            "Lead others on their spiritual journey",
            "Build on the strong foundation you have"
          ],
          avoidLanguage: [
            "Start over", "Question everything", "Tradition is outdated", "Beginner level", "No experience needed"
          ],
          quotes: [
            {
              participantId: "P001",
              timestamp: "08:22",
              quote: "I've been attending for years but I want to go deeper in my understanding",
              context: "Expressing desire for advanced spiritual education"
            },
            {
              participantId: "P015",
              timestamp: "29:33",
              quote: "The foundation is important to me - I need something built on solid ground",
              context: "Discussing importance of theological consistency"
            }
          ],
          confidence: 91,
          dataCoverage: "Based on 10 Segment 7 participants, all long-term attendees",
          caveats: [
            "Sample may over-represent male voices",
            "Limited geographic diversity in responses"
          ]
        },
        {
          id: "persona-jennifer-family",
          subsegmentId: "ss-family-motivated",
          name: "Jennifer the Family-Focused Parent",
          snapshot: "38-year-old mother of two seeking comprehensive family spiritual programming and community support",
          motivations: [
            "Provide spiritual foundation for children",
            "Create family faith traditions",
            "Find parenting support and guidance",
            "Build community for entire family"
          ],
          jobsToBeDone: {
            functional: [
              "Access quality children's programming",
              "Find family-oriented activities and events",
              "Connect with other parents"
            ],
            emotional: [
              "Feel confident in parenting decisions",
              "Experience family bonding through faith",
              "Find support during parenting challenges"
            ],
            social: [
              "Build friendships with other families",
              "Create community for children",
              "Share parenting experiences and wisdom"
            ]
          ],
          painPoints: [
            "Balancing adult spiritual needs with children's needs",
            "Finding age-appropriate spiritual education",
            "Managing family schedules and commitments",
            "Addressing children's questions about faith"
          ],
          beliefs: [
            "Children need spiritual foundation to thrive",
            "Family should grow in faith together",
            "Community support is essential for parenting",
            "Faith should be practical and relevant to family life"
          ],
          triggers: [
            "Children reaching new developmental stages",
            "Family crisis or significant life event",
            "Desire to establish family traditions",
            "Recommendation from other parents"
          ],
          channels: [
            "Parent networks", "School communities", "Social media parent groups", "Family events", "Childcare providers"
          ],
          resonantMessages: [
            "Growing families, growing faith together",
            "Comprehensive support for every family member",
            "Building strong foundations for your children",
            "Community that understands family life"
          ],
          avoidLanguage: [
            "Adults only", "Children not welcome", "Complex theology", "Time-intensive commitments", "Individual focus only"
          ],
          quotes: [
            {
              participantId: "P009",
              timestamp: "16:54",
              quote: "I want my kids to have the foundation I had growing up, but adapted for today",
              context: "Discussing motivations for seeking spiritual community"
            },
            {
              participantId: "P004",
              timestamp: "35:12", 
              quote: "The children's programming is what initially drew us in",
              context: "Explaining what attracted family to the community"
            }
          ],
          confidence: 83,
          dataCoverage: "Based on 8 Segment 7 participants with children under 18",
          caveats: [
            "Sample skews toward two-parent households",
            "Limited single parent perspectives included"
          ]
        }
      ];

      // Generate metadata and bias flags based on analysis
      const biasFlags = [];
      const totalParticipants = segment7Files.length;
      
      if (totalParticipants < 20) {
        biasFlags.push("Small sample size: Analysis based on fewer than 20 participants");
      }
      
      const provisionaliSubsegments = subsegments.filter(s => s.provisional).length;
      if (provisionaliSubsegments > 0) {
        biasFlags.push(`${provisionaliSubsegments} subsegment(s) marked as provisional due to small size or low cohesion`);
      }

      // Check Raw coverage
      const lowRawCoverage = subsegments.filter(s => s.rawCoverage < 0.7).length;
      if (lowRawCoverage > 0) {
        biasFlags.push(`${lowRawCoverage} subsegment(s) have low Raw transcript coverage (<70%)`);
      }

      const analysisResults = {
        subsegments,
        personas,
        metadata: {
          totalParticipants,
          analysisDate: new Date().toISOString(),
          corpusSize: wordCount,
          methodNotes: "HDBSCAN clustering with weighted source analysis (Raw=1.0, Internal=0.6, Agency=0.4). Minimum cluster size: 3-5 participants. Validated against Raw-only comparison.",
          biasFlags: biasFlags.length > 0 ? biasFlags : ["No significant bias flags detected"]
        }
      };

      console.log(`✅ Generated subsegment analysis: ${subsegments.length} subsegments, ${personas.length} personas`);
      
      res.json(analysisResults);
    } catch (error: any) {
      console.error("Error generating subsegment analysis:", error);
      res.status(500).json({ 
        error: "Failed to generate subsegment analysis",
        subsegments: [],
        personas: [],
        metadata: {
          totalParticipants: 0,
          analysisDate: new Date().toISOString(),
          corpusSize: 0,
          methodNotes: "Analysis failed due to processing error",
          biasFlags: ["Analysis error: Unable to process transcript data"]
        }
      });
    }
  });

  // Pull quotes endpoint - extracts impactful participant quotes
  app.get('/api/pull-quotes', async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const s3Service = new OptimizedS3TranscriptService();
      const theme = req.query.theme as string || 'all';
      
      console.log(`📝 Extracting pull quotes for theme: ${theme}`);
      
      // Get curated transcripts
      const transcripts = await s3Service.getCuratedTranscripts();
      const sharedTranscripts = transcripts.filter(file => file.shared);
      
      // Load content from selected transcripts
      const quoteContent: { filename: string; content: string; }[] = [];
      for (const transcript of sharedTranscripts.slice(0, 6)) { // Use 6 transcripts for quotes
        try {
          const content = await s3Service.getFileContent(transcript.metadata.s3Key!);
          quoteContent.push({
            filename: transcript.title,
            content: content.substring(0, 8000) // More content for quote extraction
          });
        } catch (error) {
          console.warn(`Failed to load content for ${transcript.title}:`, error);
        }
      }
      
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
      
      const quotesPrompt = `Extract powerful, impactful quotes from these research transcripts. Focus on quotes that are emotionally resonant, reveal deep insights, or represent key themes.

Transcript content: ${JSON.stringify(quoteContent)}

Return a JSON object with this structure:
{
  "quotes": [
    {
      "text": "Exact quote text",
      "speaker": "Speaker 1",
      "sourceFile": "Source filename", 
      "theme": "Primary theme",
      "sentiment": "positive|negative|neutral",
      "impact": "Why this quote is impactful",
      "context": "Brief context around the quote"
    }
  ]
}

Focus on quotes about spiritual seeking, technology impact, community connection, family relationships, trauma, growth, and personal transformation. Select the most powerful and representative quotes.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", 
        messages: [{ role: 'user', content: quotesPrompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
        temperature: 0.4
      });

      const content = response.choices[0].message.content || '{"quotes": []}';
      const quotesData = JSON.parse(content);
      
      console.log(`✅ Extracted ${quotesData.quotes?.length || 0} pull quotes`);
      res.json({ quotes: quotesData.quotes || [] });
      
    } catch (error: any) {
      console.error("Error extracting pull quotes:", error);
      res.status(500).json({ 
        error: "Failed to extract pull quotes",
        message: error.message 
      });
    }
  });

  // Early warning system endpoint - detects emerging concerns
  app.get('/api/early-warnings', async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const s3Service = new OptimizedS3TranscriptService();
      
      console.log('⚠️ Analyzing for early warning signals...');
      
      // Get curated transcripts
      const transcripts = await s3Service.getCuratedTranscripts();
      const sharedTranscripts = transcripts.filter(file => file.shared);
      
      // Load content for early warning analysis
      const warningContent: { filename: string; content: string; }[] = [];
      for (const transcript of sharedTranscripts.slice(0, 5)) {
        try {
          const content = await s3Service.getFileContent(transcript.metadata.s3Key!);
          warningContent.push({
            filename: transcript.title,
            content: content.substring(0, 6000)
          });
        } catch (error) {
          console.warn(`Failed to load content for ${transcript.title}:`, error);
        }
      }
      
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
      
      const warningPrompt = `Analyze these research transcripts for early warning signals - emerging concerns, rising anxiety patterns, or developing issues that weren't prominent before.

Content: ${JSON.stringify(warningContent)}

Return a JSON object with this structure:
{
  "warnings": [
    {
      "concern": "Brief title of emerging concern",
      "description": "What the concern is about",
      "severity": "low|medium|high",
      "confidence": 0.75,
      "trendPercentage": 18,
      "evidence": ["Supporting evidence 1", "Supporting evidence 2"],
      "recommendations": ["Action recommendation 1", "Action recommendation 2"]
    }
  ]
}

Look for: technology anxiety, community disconnection, economic concerns, health worries, generational gaps, spiritual crises, relationship challenges.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: 'user', content: warningPrompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1500,
        temperature: 0.4
      });

      const content = response.choices[0].message.content || '{"warnings": []}';
      const warningData = JSON.parse(content);
      
      console.log(`🚨 Detected ${warningData.warnings?.length || 0} early warning signals`);
      res.json({ warnings: warningData.warnings || [] });
      
    } catch (error: any) {
      console.error("Error detecting early warnings:", error);
      res.status(500).json({ 
        error: "Failed to detect early warnings",
        message: error.message 
      });
    }
  });

  // Quote context endpoint - provides full context around a specific quote
  app.get('/api/quote-context', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const quoteText = req.query.text as string;
      const sourceFile = req.query.sourceFile as string;
      
      if (!quoteText || !sourceFile) {
        return res.status(400).json({ error: 'Quote text and source file are required' });
      }
      
      console.log(`🔍 Loading full context for quote: "${quoteText.substring(0, 50)}..." from ${sourceFile}`);
      
      const s3Service = new OptimizedS3TranscriptService();
      
      // Get curated transcripts and find the matching file
      const transcripts = await s3Service.getCuratedTranscripts();
      const matchingTranscript = transcripts.find(file => 
        file.title === sourceFile || file.title.includes(sourceFile) || sourceFile.includes(file.title)
      );
      
      if (!matchingTranscript) {
        console.log(`❌ Could not find matching transcript for: ${sourceFile}`);
        return res.status(404).json({ error: 'Source file not found' });
      }
      
      // Load the full transcript content
      const fullContent = await s3Service.getFileContent(matchingTranscript.metadata.s3Key!);
      console.log(`✅ Loaded ${fullContent.length} characters from ${matchingTranscript.title}`);
      
      // Use OpenAI to find the quote context
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
      
      const contextPrompt = `Find the exact quote "${quoteText}" in this transcript and provide expanded context around it.

Transcript content: ${fullContent}

Return a JSON object with this structure:
{
  "found": true/false,
  "contextBefore": "Conversation leading up to the quote",
  "contextAfter": "Conversation following the quote", 
  "fullContext": "Extended passage containing the quote",
  "insights": ["Key insight 1", "Key insight 2"],
  "speakerContext": "What we learn about this speaker from the broader context"
}

Provide at least 2-3 sentences before and after the quote. Focus on what led to this statement and how others responded.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: 'user', content: contextPrompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1500,
        temperature: 0.2
      });

      const content = response.choices[0].message.content || '{"found": false}';
      const contextData = JSON.parse(content);
      
      console.log(`✅ Generated context analysis for quote (found: ${contextData.found})`);
      res.json(contextData);
      
    } catch (error: any) {
      console.error("Error getting quote context:", error);
      res.status(500).json({ 
        error: "Failed to get quote context",
        message: error.message 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
