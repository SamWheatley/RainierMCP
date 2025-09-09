import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  boolean,
  real,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat threads table for storing user conversations
export const chatThreads = pgTable("chat_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat messages table for storing individual messages
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
  role: varchar("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  sources: jsonb("sources").$type<Array<{
    filename: string;
    excerpt: string;
    confidence: number;
  }>>(),
  attachments: jsonb("attachments").$type<Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Temporary chat attachments table for files used only in conversations
export const chatAttachments = pgTable("chat_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
  filename: varchar("filename").notNull(),
  originalName: varchar("original_name").notNull(),
  mimeType: varchar("mime_type").notNull(),
  size: real("size").notNull(),
  objectPath: varchar("object_path").notNull(),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Uploaded files table for managing research documents
export const uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filename: varchar("filename").notNull(),
  originalName: varchar("original_name").notNull(),
  mimeType: varchar("mime_type").notNull(),
  size: real("size").notNull(),
  objectPath: varchar("object_path").notNull(),
  isProcessed: boolean("is_processed").default(false),
  extractedText: text("extracted_text"),
  tags: text("tags").array(),
  shared: boolean("shared").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatThreadSchema = createInsertSchema(chatThreads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertChatAttachmentSchema = createInsertSchema(chatAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Insight sessions to group related insights together
export const insightSessions = pgTable("insight_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  dataset: varchar("dataset", { enum: ["all", "segment7", "personal"] }).notNull(),
  model: varchar("model", { enum: ["openai", "anthropic", "grok"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Research Insights table
export const researchInsights = pgTable("research_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull().references(() => insightSessions.id, { onDelete: "cascade" }),
  type: varchar("type", { enum: ["theme", "bias", "pattern", "recommendation"] }).notNull(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  confidence: real("confidence").notNull(),
  sources: jsonb("sources").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInsightSessionSchema = createInsertSchema(insightSessions).omit({
  id: true,
  createdAt: true,
});

export type InsightSession = typeof insightSessions.$inferSelect;
export type InsertInsightSession = z.infer<typeof insertInsightSessionSchema>;
export type ResearchInsight = typeof researchInsights.$inferSelect;
export type InsertResearchInsight = typeof researchInsights.$inferInsert;
export type InsertChatThread = z.infer<typeof insertChatThreadSchema>;
export type ChatThread = typeof chatThreads.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatAttachment = z.infer<typeof insertChatAttachmentSchema>;
export type ChatAttachment = typeof chatAttachments.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type UploadedFile = typeof uploadedFiles.$inferSelect;

// Reports table for storing generated reports
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  description: text("description"),
  type: varchar("type", { enum: ["monthly", "custom", "automated"] }).notNull(),
  status: varchar("status", { enum: ["generating", "completed", "failed"] }).notNull().default("generating"),
  dateRange: jsonb("date_range").$type<{ start: string; end: string }>().notNull(),
  s3FilesAnalyzed: jsonb("s3_files_analyzed").$type<string[]>().default([]),
  totalInsightsCount: integer("total_insights_count").notNull().default(0),
  confidenceThreshold: real("confidence_threshold").notNull().default(0.7),
  analysisParameters: jsonb("analysis_parameters").$type<{
    models: string[];
    includeTypes: string[];
    focusThemes?: string[];
  }>().notNull(),
  reportUrl: varchar("report_url"), // For downloadable report files
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Report insights table for linking insights to specific reports  
export const reportInsights = pgTable("report_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  insightId: varchar("insight_id").notNull().references(() => researchInsights.id, { onDelete: "cascade" }),
  insightTitle: varchar("insight_title").notNull(),
  insightContent: text("insight_content").notNull(),
  confidenceScore: real("confidence_score").notNull(),
  keyQuotes: jsonb("key_quotes").$type<Array<{
    text: string;
    speaker: string;
    source: string;
  }>>().default([]),
  sourceFiles: jsonb("source_files").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

// Trend metrics table for predictive intelligence
export const trendMetrics = pgTable("trend_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  theme: varchar("theme").notNull(),
  period: varchar("period").notNull(), // "2025-09", "2025-Q3", etc.
  value: real("value").notNull(), // percentage or count
  previousValue: real("previous_value"),
  changePercentage: real("change_percentage"),
  trendDirection: varchar("trend_direction", { enum: ["up", "down", "stable"] }).notNull(),
  confidence: real("confidence").notNull(),
  sampleSize: integer("sample_size").notNull(),
  sourceFiles: jsonb("source_files").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<{
    category: string;
    subcategory?: string;
    detectionMethod: string;
    alertThreshold?: number;
  }>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pull quotes table for storing impactful participant quotes
export const pullQuotes = pgTable("pull_quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  speaker: varchar("speaker").notNull(),
  sourceFile: varchar("source_file").notNull(),
  theme: varchar("theme").notNull(),
  sentiment: varchar("sentiment", { enum: ["positive", "negative", "neutral"] }).notNull(),
  confidenceScore: real("confidence_score").notNull(),
  contextBefore: text("context_before"),
  contextAfter: text("context_after"),
  tags: text("tags").array().default([]),
  isHighlighted: boolean("is_highlighted").default(false),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for new tables
export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReportInsightSchema = createInsertSchema(reportInsights).omit({
  id: true,
  createdAt: true,
});

export const insertTrendMetricSchema = createInsertSchema(trendMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPullQuoteSchema = createInsertSchema(pullQuotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for new tables
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type ReportInsight = typeof reportInsights.$inferSelect;
export type InsertReportInsight = z.infer<typeof insertReportInsightSchema>;
export type TrendMetric = typeof trendMetrics.$inferSelect;
export type InsertTrendMetric = z.infer<typeof insertTrendMetricSchema>;
export type PullQuote = typeof pullQuotes.$inferSelect;
export type InsertPullQuote = z.infer<typeof insertPullQuoteSchema>;
