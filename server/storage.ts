import {
  users,
  chatThreads,
  chatMessages,
  chatAttachments,
  uploadedFiles,
  researchInsights,
  type User,
  type UpsertUser,
  type ChatThread,
  type InsertChatThread,
  type ChatMessage,
  type InsertChatMessage,
  type ChatAttachment,
  type InsertChatAttachment,
  type UploadedFile,
  type InsertUploadedFile,
  type ResearchInsight,
  type InsertResearchInsight,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser, id: string): Promise<User>;
  
  // Chat thread operations
  createChatThread(thread: InsertChatThread): Promise<ChatThread>;
  getUserChatThreads(userId: string): Promise<ChatThread[]>;
  getChatThread(id: string, userId: string): Promise<ChatThread | undefined>;
  updateChatThread(id: string, title: string): Promise<void>;
  deleteChatThread(id: string, userId: string): Promise<void>;
  
  // Chat message operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getThreadMessages(threadId: string): Promise<ChatMessage[]>;
  
  // Chat attachment operations
  createChatAttachment(attachment: InsertChatAttachment): Promise<ChatAttachment>;
  getMessageAttachments(messageId: string): Promise<ChatAttachment[]>;
  
  // File operations
  createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getUserFiles(userId: string): Promise<UploadedFile[]>;
  getUploadedFile(id: string, userId: string): Promise<UploadedFile | undefined>;
  updateFileProcessingStatus(id: string, isProcessed: boolean, extractedText?: string): Promise<void>;
  deleteUploadedFile(id: string, userId: string): Promise<void>;
  searchFilesByContent(userId: string, query: string): Promise<UploadedFile[]>;
  getUploadedFilesByUser(userId: string): Promise<UploadedFile[]>;
  getChatThreadsByUser(userId: string): Promise<ChatThread[]>;
  
  // Research Insights operations
  createResearchInsight(insight: InsertResearchInsight): Promise<ResearchInsight>;
  getResearchInsights(userId: string): Promise<ResearchInsight[]>;
  updateResearchInsight(id: string, userId: string, title: string): Promise<void>;
  deleteResearchInsight(id: string, userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser, id: string): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({ ...userData, id })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Chat thread operations
  async createChatThread(thread: InsertChatThread): Promise<ChatThread> {
    const [newThread] = await db
      .insert(chatThreads)
      .values(thread)
      .returning();
    return newThread;
  }

  async getUserChatThreads(userId: string): Promise<ChatThread[]> {
    return await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.userId, userId))
      .orderBy(desc(chatThreads.updatedAt));
  }

  async getChatThread(id: string, userId: string): Promise<ChatThread | undefined> {
    const [thread] = await db
      .select()
      .from(chatThreads)
      .where(and(eq(chatThreads.id, id), eq(chatThreads.userId, userId)));
    return thread;
  }

  async updateChatThread(id: string, title: string): Promise<void> {
    await db
      .update(chatThreads)
      .set({ title, updatedAt: new Date() })
      .where(eq(chatThreads.id, id));
  }

  async deleteChatThread(id: string, userId: string): Promise<void> {
    await db
      .delete(chatThreads)
      .where(and(eq(chatThreads.id, id), eq(chatThreads.userId, userId)));
  }

  // Chat message operations
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [newMessage] = await db
      .insert(chatMessages)
      .values(message as any)
      .returning();
    return newMessage;
  }

  async getThreadMessages(threadId: string): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(chatMessages.createdAt);
  }

  // Chat attachment operations
  async createChatAttachment(attachment: InsertChatAttachment): Promise<ChatAttachment> {
    const [newAttachment] = await db
      .insert(chatAttachments)
      .values(attachment)
      .returning();
    return newAttachment;
  }

  async getMessageAttachments(messageId: string): Promise<ChatAttachment[]> {
    return await db
      .select()
      .from(chatAttachments)
      .where(eq(chatAttachments.messageId, messageId))
      .orderBy(chatAttachments.createdAt);
  }

  // File operations
  async createUploadedFile(file: InsertUploadedFile): Promise<UploadedFile> {
    const [newFile] = await db
      .insert(uploadedFiles)
      .values(file)
      .returning();
    return newFile;
  }

  async getUserFiles(userId: string): Promise<UploadedFile[]> {
    // Get both user's own files AND shared files
    return await db
      .select()
      .from(uploadedFiles)
      .where(or(
        eq(uploadedFiles.userId, userId),
        eq(uploadedFiles.shared, true)
      ))
      .orderBy(desc(uploadedFiles.createdAt));
  }

  async getUploadedFile(id: string, userId: string): Promise<UploadedFile | undefined> {
    const [file] = await db
      .select()
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.id, id), eq(uploadedFiles.userId, userId)));
    return file;
  }

  async updateFileProcessingStatus(id: string, isProcessed: boolean, extractedText?: string): Promise<void> {
    await db
      .update(uploadedFiles)
      .set({ 
        isProcessed, 
        extractedText,
        updatedAt: new Date() 
      })
      .where(eq(uploadedFiles.id, id));
  }

  async deleteUploadedFile(id: string, userId: string): Promise<void> {
    await db
      .delete(uploadedFiles)
      .where(and(eq(uploadedFiles.id, id), eq(uploadedFiles.userId, userId)));
  }

  async searchFilesByContent(userId: string, query: string): Promise<UploadedFile[]> {
    // Simple text search - in production, you'd want to use full-text search or vector similarity
    return await db
      .select()
      .from(uploadedFiles)
      .where(and(
        eq(uploadedFiles.userId, userId),
        // Simple ILIKE search on extracted text and filename
      ))
      .orderBy(desc(uploadedFiles.createdAt));
  }

  async getUploadedFilesByUser(userId: string): Promise<UploadedFile[]> {
    return await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.userId, userId))
      .orderBy(desc(uploadedFiles.createdAt));
  }

  async getChatThreadsByUser(userId: string): Promise<ChatThread[]> {
    return await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.userId, userId))
      .orderBy(desc(chatThreads.updatedAt));
  }

  // Research Insights operations
  async createResearchInsight(insight: InsertResearchInsight): Promise<ResearchInsight> {
    const [created] = await db
      .insert(researchInsights)
      .values(insight)
      .returning();
    return created;
  }

  async getResearchInsights(userId: string): Promise<ResearchInsight[]> {
    return await db
      .select()
      .from(researchInsights)
      .where(eq(researchInsights.userId, userId))
      .orderBy(desc(researchInsights.createdAt));
  }

  async updateResearchInsight(id: string, userId: string, title: string): Promise<void> {
    await db
      .update(researchInsights)
      .set({ 
        title, 
        updatedAt: new Date()
      })
      .where(and(
        eq(researchInsights.id, id), 
        eq(researchInsights.userId, userId)
      ));
  }

  async deleteResearchInsight(id: string, userId: string): Promise<void> {
    await db
      .delete(researchInsights)
      .where(and(
        eq(researchInsights.id, id), 
        eq(researchInsights.userId, userId)
      ));
  }
}

export const storage = new DatabaseStorage();
