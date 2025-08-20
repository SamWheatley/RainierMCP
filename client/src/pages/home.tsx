import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Navbar from "@/components/Navbar";
import Chat from "@/components/Chat";
import ThreadHistory from "@/components/ThreadHistory";
import ExploreGrid from "@/components/ExploreGrid";
import type { UploadedFile } from "@shared/schema";

export default function Home() {
  const [activeTab, setActiveTab] = useState<'ask' | 'explore' | 'history'>('ask');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const handleThreadSelect = (threadId: string) => {
    setCurrentThreadId(threadId);
    setActiveTab('ask');
  };

  const handleNewThread = () => {
    setCurrentThreadId(null);
    setActiveTab('ask');
  };

  const handleAskAboutFile = (file: UploadedFile) => {
    // Switch to ask tab and potentially create a new thread
    setActiveTab('ask');
    setCurrentThreadId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'ask' ? (
          <div className="grid grid-cols-1 lg:grid-cols-1 gap-6 h-[calc(100vh-8rem)]">
            <Chat 
              threadId={currentThreadId}
              onThreadCreated={setCurrentThreadId}
            />
          </div>
        ) : activeTab === 'history' ? (
          <div className="max-w-4xl mx-auto">
            <ThreadHistory 
              currentThreadId={currentThreadId}
              onThreadSelect={handleThreadSelect}
              onNewThread={handleNewThread}
            />
          </div>
        ) : (
          <ExploreGrid onAskAboutFile={handleAskAboutFile} />
        )}
      </div>
    </div>
  );
}
