import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NotebookPen, Paperclip, Brain, FileText, X, Globe, Shield, MessageSquare, Search } from "lucide-react";
import ChatMessage from "./ChatMessage";
import ChatAttachmentUploader from "./ChatAttachmentUploader";
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage as ChatMessageType, ChatAttachment, UploadedFile } from "@shared/schema";

interface ChatProps {
  threadId: string | null;
  onThreadCreated: (threadId: string) => void;
  selectedFile?: UploadedFile | null;
  onFileLoaded?: () => void;
}

export default function Chat({ threadId, onThreadCreated, selectedFile, onFileLoaded }: ChatProps) {
  const [message, setMessage] = useState("");
  const [showSources, setShowSources] = useState(true);
  const [aiProvider, setAiProvider] = useState<'openai' | 'anthropic' | 'grok'>('anthropic');
  const [internetAccess, setInternetAccess] = useState(false);
  const [showAttachmentDialog, setShowAttachmentDialog] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<any[]>([]);
  const [mode, setMode] = useState<'ask' | 'explore'>('ask');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Auto-load selected file when provided
  useEffect(() => {
    if (selectedFile && !threadId) {
      // For S3 files, we need to handle them differently than uploaded files
      // S3 files don't have an uploadURL but are directly accessible via their content
      // We'll pass the file ID so the backend can load it from S3 directly
      const fileAttachment = {
        id: selectedFile.id,
        originalName: selectedFile.originalName,
        mimeType: selectedFile.mimeType,
        size: selectedFile.size,
        uploadURL: selectedFile.id.startsWith('s3-') ? selectedFile.id : selectedFile.objectPath,
      };
      
      setPendingAttachments([fileAttachment]);
      
      // Set a helpful initial message
      setMessage(`I'd like to analyze the research file "${selectedFile.originalName}". What insights can you provide?`);
      
      // Call onFileLoaded to clear the selected file
      onFileLoaded?.();
      
      toast({
        title: "File Ready for Analysis",
        description: `${selectedFile.originalName} has been loaded. Ask your questions!`,
      });
    }
  }, [selectedFile, threadId, onFileLoaded, toast]);

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
    mutationFn: async ({ content, targetThreadId, attachments }: { content: string; targetThreadId: string; attachments?: ChatAttachment[] }) => {
      if (!targetThreadId) {
        throw new Error("No thread ID");
      }
      const response = await apiRequest('POST', `/api/threads/${targetThreadId}/messages`, { 
        content, 
        aiProvider,
        internetAccess,
        attachments 
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      const targetThreadId = variables.targetThreadId;
      queryClient.invalidateQueries({ queryKey: ['/api/threads', targetThreadId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/threads'] });
      setMessage("");
      setPendingAttachments([]); // Clear attachments after sending
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
        await sendMessageMutation.mutateAsync({ 
          content: message, 
          targetThreadId: newThreadId,
          attachments: pendingAttachments 
        });
      } else {
        await sendMessageMutation.mutateAsync({ 
          content: message, 
          targetThreadId: threadId,
          attachments: pendingAttachments 
        });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      
      let errorMessage = "There was an error sending your message. Please try again.";
      
      // Check if it's a token limit error
      if (error instanceof Error && error.message && error.message.includes('token')) {
        errorMessage = "Your document is too large. Try asking about specific sections or uploading a smaller file.";
      }
      
      toast({
        title: "Failed to send message",
        description: errorMessage,
        variant: "destructive",
      });
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
      <div className="p-4 border-b border-gray-200">
        {/* Mode Toggle */}
        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center bg-gray-100 p-1 rounded-full">
            <Button
              variant={mode === 'ask' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('ask')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                mode === 'ask'
                  ? 'bg-white shadow-sm text-gray-900 hover:bg-white'
                  : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Ask
            </Button>
            <Button
              variant={mode === 'explore' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('explore')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                mode === 'explore'
                  ? 'bg-white shadow-sm text-gray-900 hover:bg-white'
                  : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Search className="w-4 h-4 mr-2" />
              Explore
            </Button>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'ask' ? 'Research Assistant' : 'Explore Come Near'}
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {mode === 'ask' 
              ? 'Ask questions about your uploaded research files'
              : 'Search Google Drives and internal resources'
            }
          </p>
        </div>
        
        {/* AI Provider Selection and Settings - only show in Ask mode */}
        {mode === 'ask' && (
          <div className="mt-3 flex items-center justify-center space-x-4 flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <Brain className="w-4 h-4 text-gray-500" />
              <Select value={aiProvider} onValueChange={(value) => setAiProvider(value as 'openai' | 'anthropic' | 'grok')}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="grok">Grok</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Internet Access Toggle */}
            <div className="flex items-center space-x-2">
              <Button
                variant={internetAccess ? "default" : "outline"}
                size="sm"
                onClick={() => setInternetAccess(!internetAccess)}
                className={`text-xs h-7 px-3 transition-all ${
                  internetAccess 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
                }`}
              >
                {internetAccess ? (
                  <>
                    <Globe className="w-3 h-3 mr-1.5" />
                    Internet
                  </>
                ) : (
                  <>
                    <Shield className="w-3 h-3 mr-1.5" />
                    Sandboxed
                  </>
                )}
              </Button>
            </div>
            
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <Checkbox 
                checked={showSources}
                onCheckedChange={(checked) => setShowSources(checked === true)}
              />
              <span className="text-xs text-gray-600">Show sources</span>
            </label>
            
            <div className="text-xs text-gray-600 px-2 py-0.5 bg-gray-100 rounded-full">
              {fileCount} files
            </div>
          </div>
        )}
      </div>
      
      {/* Content Area */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {mode === 'ask' ? (
          // Ask Mode - Show chat messages
          <>
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
          </>
        ) : (
          // Explore Mode - Show placeholder for Google Drive search
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Google Drive Integration</h3>
            <p className="text-gray-600 max-w-md">
              Search and explore Come Near's Google Drive resources. This feature will allow you to find documents, presentations, and data across all shared drives.
            </p>
            <div className="mt-6 text-sm text-gray-500">
              Coming soon - Integration with Google Drive API
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat Input */}
      <div className="p-6 border-t border-gray-200">
        {/* Show pending attachments */}
        {pendingAttachments.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Attached for this message ({pendingAttachments.length}):
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingAttachments([])}
                className="text-gray-500 hover:text-gray-700"
              >
                Clear all
              </Button>
            </div>
            <div className="space-y-1">
              {pendingAttachments.map((attachment, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-gray-700">{attachment.originalName}</span>
                    <span className="text-gray-500">
                      ({(attachment.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== index))}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex items-end space-x-3">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setShowAttachmentDialog(true)}
            className={`text-gray-600 hover:text-primary ${pendingAttachments.length > 0 ? 'bg-primary/10 text-primary' : ''}`}
            disabled={mode === 'explore'} // Disable attachments in explore mode
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-h-[44px] max-h-32 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
            <Textarea
              ref={textareaRef}
              placeholder={
                mode === 'ask' 
                  ? "Ask a question about your research files..." 
                  : "Search Google Drives..."
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              className="resize-none border-0 shadow-none focus-visible:ring-0 text-sm"
              rows={1}
              disabled={mode === 'explore'} // Disable input in explore mode for now
            />
          </div>
          <Button 
            onClick={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isPending || mode === 'explore'}
            className="bg-primary hover:bg-primary/90"
          >
            {mode === 'ask' ? <NotebookPen className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      
      {/* Chat Attachment Dialog */}
      <ChatAttachmentUploader
        open={showAttachmentDialog}
        onClose={() => setShowAttachmentDialog(false)}
        onAttachmentsReady={(attachments) => {
          setPendingAttachments(attachments);
        }}
      />
    </div>
  );
}
