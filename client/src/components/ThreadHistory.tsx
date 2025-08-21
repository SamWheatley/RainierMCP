import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, Save, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { ChatThread } from "@shared/schema";

interface ThreadHistoryProps {
  currentThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
}

export default function ThreadHistory({ currentThreadId, onThreadSelect, onNewThread }: ThreadHistoryProps) {
  const queryClient = useQueryClient();
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");

  const { data: threadsData, isLoading } = useQuery<{ threads: ChatThread[] }>({
    queryKey: ['/api/threads'],
  });

  const threads: ChatThread[] = threadsData?.threads || [];

  const renameMutation = useMutation({
    mutationFn: async ({ threadId, title }: { threadId: string; title: string }) => {
      return await apiRequest('PATCH', `/api/threads/${threadId}`, { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/threads'] });
      setEditingThreadId(null);
      setEditingTitle("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (threadId: string) => {
      return await apiRequest('DELETE', `/api/threads/${threadId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/threads'] });
      // If we deleted the current thread, reset to null
      if (currentThreadId && currentThreadId === deleteMutation.variables) {
        onThreadSelect('');
      }
    },
  });

  const handleStartEdit = (thread: ChatThread) => {
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title);
  };

  const handleSaveEdit = () => {
    if (editingThreadId && editingTitle.trim()) {
      renameMutation.mutate({ threadId: editingThreadId, title: editingTitle.trim() });
    }
  };

  const handleCancelEdit = () => {
    setEditingThreadId(null);
    setEditingTitle("");
  };

  const handleDelete = (threadId: string) => {
    if (confirm('Are you sure you want to delete this conversation?')) {
      deleteMutation.mutate(threadId);
    }
  };

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
        <h3 className="text-lg font-semibold text-gray-900">Conversations</h3>
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
                className={`p-3 rounded-lg transition-colors duration-200 border group ${
                  currentThreadId === thread.id
                    ? 'bg-primary/10 border-primary'
                    : 'hover:bg-gray-50 border-transparent hover:border-gray-200'
                }`}
              >
                {editingThreadId === thread.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="text-sm"
                      placeholder="Thread title"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <div className="flex items-center space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleSaveEdit}
                        disabled={renameMutation.isPending}
                      >
                        <Save className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelEdit}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div 
                      onClick={() => onThreadSelect(thread.id)}
                      className="cursor-pointer"
                    >
                      <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                        {thread.title}
                      </h4>
                      <p className="text-xs text-gray-600 mb-2">
                        {formatDate((thread.updatedAt || thread.createdAt || new Date().toISOString()).toString())}
                      </p>
                    </div>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(thread);
                        }}
                        className="h-6 w-6 p-0"
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(thread.id);
                        }}
                        className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
