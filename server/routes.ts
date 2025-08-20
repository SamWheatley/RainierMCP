import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { getAIProvider, type AIProviderType } from "./ai-providers";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Object storage routes for file serving
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req, res) => {
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
  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  app.post("/api/files/process", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const schema = z.object({
      uploadURL: z.string(),
      originalName: z.string(),
      mimeType: z.string(),
      size: z.number(),
    });

    try {
      const { uploadURL, originalName, mimeType, size } = schema.parse(req.body);
      const objectStorageService = new ObjectStorageService();
      
      // Set ACL policy for private file
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(uploadURL, {
        owner: userId,
        visibility: "private",
      });

      // Create file record in database
      const file = await storage.createUploadedFile({
        userId,
        filename: objectPath.split('/').pop() || originalName,
        originalName,
        mimeType,
        size,
        objectPath,
        isProcessed: false,
      });

      // TODO: Process file content for text extraction in background
      // For now, mark as processed
      await storage.updateFileProcessingStatus(file.id, true);

      res.json({ file });
    } catch (error) {
      console.error("Error processing file:", error);
      res.status(500).json({ error: "Failed to process file" });
    }
  });

  // Chat thread routes
  app.get("/api/threads", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    try {
      const threads = await storage.getUserChatThreads(userId);
      res.json({ threads });
    } catch (error) {
      console.error("Error fetching threads:", error);
      res.status(500).json({ error: "Failed to fetch threads" });
    }
  });

  app.post("/api/threads", isAuthenticated, async (req, res) => {
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

  app.patch("/api/threads/:threadId", isAuthenticated, async (req, res) => {
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

  app.delete("/api/threads/:threadId", isAuthenticated, async (req, res) => {
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

  app.get("/api/threads/:threadId/messages", isAuthenticated, async (req, res) => {
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

  app.post("/api/threads/:threadId/messages", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const { threadId } = req.params;
    const schema = z.object({
      content: z.string(),
      aiProvider: z.enum(['openai', 'anthropic']).optional().default('openai'),
    });

    try {
      const { content, aiProvider } = schema.parse(req.body);

      // Verify thread ownership
      const thread = await storage.getChatThread(threadId, userId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      // Save user message
      const userMessage = await storage.createChatMessage({
        threadId,
        role: "user",
        content,
      });

      // Get user's files for context
      const userFiles = await storage.getUserFiles(userId);
      const processedFiles = userFiles.filter(f => f.isProcessed && f.extractedText);
      
      // Prepare context for AI
      const sources = processedFiles.map(f => ({
        filename: f.originalName,
        content: f.extractedText || "",
      }));

      // Get AI provider and response
      const aiProviderInstance = await getAIProvider(aiProvider as AIProviderType);
      const aiResponse = await aiProviderInstance.askRanier(content, "", sources);

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
        const newTitle = await aiProviderInstance.generateThreadTitle(content);
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

  // File management routes
  app.get("/api/files", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    try {
      const files = await storage.getUserFiles(userId);
      res.json({ files });
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.delete("/api/files/:fileId", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const { fileId } = req.params;

    try {
      const file = await storage.getUploadedFile(fileId, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // TODO: Delete from object storage
      // TODO: Delete from database
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
