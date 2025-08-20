import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NotebookPen, Paperclip, Brain } from "lucide-react";
import ChatMessage from "./ChatMessage";
import UploadZone from "./UploadZone";
import type { ChatMessage as ChatMessageType } from "@shared/schema";

interface ChatProps {
  threadId: string | null;
  onThreadCreated: (threadId: string) => void;
}

export default function Chat({ threadId, onThreadCreated }: ChatProps) {
  const [message, setMessage] = useState("");
  const [showSources, setShowSources] = useState(true);
  const [aiProvider, setAiProvider] = useState<'openai' | 'anthropic'>('openai');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['/api/threads', threadId, 'messages'],
    enabled: !!threadId,
  });

  const { data: filesData } = useQuery({
    queryKey: ['/api/files'],
  });

  const createThreadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/threads', {});
      return response.json();
    },
    onSuccess: (data) => {
      onThreadCreated(data.thread.id);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, targetThreadId }: { content: string; targetThreadId: string }) => {
      if (!targetThreadId) {
        throw new Error("No thread ID");
      }
      const response = await apiRequest('POST', `/api/threads/${targetThreadId}/messages`, { 
        content, 
        aiProvider 
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      const targetThreadId = variables.targetThreadId;
      queryClient.invalidateQueries({ queryKey: ['/api/threads', targetThreadId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/threads'] });
      setMessage("");
    },
  });

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      if (!threadId) {
        // Create new thread first
        const result = await createThreadMutation.mutateAsync();
        const newThreadId = result.thread.id;
        // Send message to new thread
        await sendMessageMutation.mutateAsync({ content: message, targetThreadId: newThreadId });
      } else {
        await sendMessageMutation.mutateAsync({ content: message, targetThreadId: threadId });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [(messagesData as any)?.messages]);

  const messages: ChatMessageType[] = (messagesData as any)?.messages || [];
  const fileCount = (filesData as any)?.files?.length || 0;

  return (
    <div className="lg:col-span-2 bg-white rounded-xl shadow-lg flex flex-col h-[calc(100vh-8rem)]">
      {/* Chat Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Research Assistant</h2>
        <p className="text-sm text-gray-600 mt-1">Ask questions about your uploaded research files</p>
        
        {/* AI Provider Selection and Settings */}
        <div className="mt-4 flex items-center space-x-4 flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Brain className="w-4 h-4 text-gray-500" />
            <Select value={aiProvider} onValueChange={(value) => setAiProvider(value as 'openai' | 'anthropic')}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <Checkbox 
              checked={showSources}
              onCheckedChange={(checked) => setShowSources(checked === true)}
            />
            <span className="text-sm text-gray-600">Show source citations</span>
          </label>
          
          <div className="text-xs text-gray-600 px-2 py-1 bg-gray-100 rounded-full">
            {fileCount} files available
          </div>
        </div>
      </div>
      
      {/* Chat Messages */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {!threadId && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm">🤖</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 max-w-[70%]">
              <p className="text-gray-900 text-sm">
                Hello! I'm Ranier, your research intelligence assistant. I can help you analyze and extract insights from your uploaded transcripts and documents. What would you like to explore today?
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage 
            key={msg.id} 
            message={msg} 
            showSources={showSources}
          />
        ))}

        {sendMessageMutation.isPending && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm">🤖</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 max-w-[70%]">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-gray-600 text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat Input */}
      <div className="p-6 border-t border-gray-200">
        <div className="flex items-end space-x-3">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setShowUploadDialog(true)}
            className="text-gray-600 hover:text-primary"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-h-[44px] max-h-32 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
            <Textarea
              ref={textareaRef}
              placeholder="Ask a question about your research files..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              className="resize-none border-0 shadow-none focus-visible:ring-0 text-sm"
              rows={1}
            />
          </div>
          <Button 
            onClick={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isPending}
            className="bg-primary hover:bg-primary/90"
          >
            <NotebookPen className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-2xl">
          <UploadZone 
            onComplete={() => {
              setShowUploadDialog(false);
              queryClient.invalidateQueries({ queryKey: ['/api/files'] });
            }}
            onClose={() => setShowUploadDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
