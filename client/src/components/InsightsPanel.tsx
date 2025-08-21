import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, TrendingUp, Users, AlertTriangle, Brain, FileText } from "lucide-react";
import ThreadHistory from "@/components/ThreadHistory";
import ResearchInsights from "@/components/ResearchInsights";

interface InsightsPanelProps {
  currentThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
}

export default function InsightsPanel({ currentThreadId, onThreadSelect, onNewThread }: InsightsPanelProps) {
  return (
    <div className="max-w-6xl mx-auto">
      <Tabs defaultValue="conversations" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="conversations" className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4" />
            <span>Conversations</span>
          </TabsTrigger>
          <TabsTrigger value="research-insights" className="flex items-center space-x-2">
            <Brain className="w-4 h-4" />
            <span>Research Insights</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversations" className="space-y-6">
          <ThreadHistory 
            currentThreadId={currentThreadId}
            onThreadSelect={onThreadSelect}
            onNewThread={onNewThread}
          />
        </TabsContent>

        <TabsContent value="research-insights" className="space-y-6">
          <ResearchInsights />
        </TabsContent>
      </Tabs>
    </div>
  );
}