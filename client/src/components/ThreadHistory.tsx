import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatThread } from "@shared/schema";

interface ThreadHistoryProps {
  currentThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
}

export default function ThreadHistory({ currentThreadId, onThreadSelect, onNewThread }: ThreadHistoryProps) {
  const { data: threadsData, isLoading } = useQuery({
    queryKey: ['/api/threads'],
  });

  const threads: ChatThread[] = threadsData?.threads || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    if (diffInHours < 48) return "1 day ago";
    return `${Math.floor(diffInHours / 24)} days ago`;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Chat History</h3>
        <Button 
          variant="ghost"
          onClick={onNewThread}
          className="text-sm text-primary hover:text-primary/80 font-medium"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Chat
        </Button>
      </div>
      
      <ScrollArea className="h-[calc(100%-4rem)]">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 text-sm">No conversations yet</p>
            <p className="text-gray-500 text-xs mt-1">Start by asking a question</p>
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => onThreadSelect(thread.id)}
                className={`p-3 rounded-lg cursor-pointer transition-colors duration-200 border ${
                  currentThreadId === thread.id
                    ? 'bg-primary/10 border-primary'
                    : 'hover:bg-gray-50 border-transparent hover:border-gray-200'
                }`}
              >
                <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                  {thread.title}
                </h4>
                <p className="text-xs text-gray-600 mb-2">
                  {formatDate(thread.updatedAt || thread.createdAt!)}
                </p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
