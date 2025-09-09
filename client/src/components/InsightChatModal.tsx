import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Bot, User, TrendingUp, AlertTriangle, Users, Lightbulb, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ResearchInsight {
  id: string;
  type: 'theme' | 'bias' | 'pattern' | 'recommendation';
  title: string;
  description: string;
  confidence: number;
  sources: string[];
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: string[];
}

interface InsightChatModalProps {
  insight: ResearchInsight | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function InsightChatModal({ insight, isOpen, onClose }: InsightChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize chat with a welcome message when insight changes
  useEffect(() => {
    if (insight && isOpen) {
      const welcomeMessage: ChatMessage = {
        id: `welcome-${insight.id}`,
        role: 'assistant',
        content: `Hi! I'm here to help you explore this **${insight.type}** insight in depth. You can ask me questions like:

• "Can you give me specific quotes that support this finding?"
• "What other themes relate to this pattern?"
• "Which participants mentioned this most?"
• "How confident should we be in this insight?"

I have access to all the source transcripts that informed this insight. What would you like to explore?`,
        timestamp: new Date().toISOString(),
      };
      setMessages([welcomeMessage]);
    }
  }, [insight, isOpen]);

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      setIsLoading(true);
      
      try {
        const response = await apiRequest('POST', '/api/insight-chat', {
          insightId: insight?.id,
          message,
          context: {
            insightTitle: insight?.title,
            insightType: insight?.type,
            insightDescription: insight?.description,
            sources: insight?.sources || []
          }
        });
        
        const jsonResponse = await response.json();
        console.log("🔧 Parsed API response:", jsonResponse);
        return jsonResponse;
      } catch (error) {
        console.error("🚨 API request failed:", error);
        throw error;
      }
    },
    onSuccess: (response: any) => {
      console.log("🎯 Insight chat response received:", response);
      
      let responseContent = "";
      if (response && typeof response === 'object') {
        responseContent = response.content || response.message || response.data?.content || "";
      } else if (typeof response === 'string') {
        responseContent = response;
      }
      
      if (!responseContent) {
        console.warn("⚠️ No content found in response:", response);
        responseContent = "I apologize, but I couldn't generate a response at this time.";
      }
      
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: new Date().toISOString(),
        sources: response?.sources || [],
      };
      
      console.log("📝 Adding message to chat:", assistantMessage.content.substring(0, 100) + "...");
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    },
    onError: (error: any) => {
      setIsLoading(false);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !insight) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user', 
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(inputMessage);
    setInputMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'theme': return <TrendingUp className="w-4 h-4" />;
      case 'bias': return <AlertTriangle className="w-4 h-4" />;
      case 'pattern': return <Users className="w-4 h-4" />;
      case 'recommendation': return <Lightbulb className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'theme': return 'bg-blue-100 text-blue-600 border-blue-200';
      case 'bias': return 'bg-red-100 text-red-600 border-red-200';
      case 'pattern': return 'bg-green-100 text-green-600 border-green-200';
      case 'recommendation': return 'bg-yellow-100 text-yellow-600 border-yellow-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  if (!insight) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] h-[90vh] flex flex-col" data-testid="insight-chat-modal">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${getInsightColor(insight.type)}`}>
              {getInsightIcon(insight.type)}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{insight.title}</h2>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="outline" className={getInsightColor(insight.type)}>
                  {insight.type}
                </Badge>
                <Badge variant="outline">
                  {Math.round(insight.confidence * 100)}% confidence
                </Badge>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Insight Context */}
        <Card className="bg-gray-50 flex-shrink-0">
          <CardContent className="p-3">
            <p className="text-gray-700 text-sm mb-2 line-clamp-2">{insight.description}</p>
            {insight.sources.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Source Files:</p>
                <div className="flex flex-wrap gap-1">
                  {insight.sources.slice(0, 3).map((source, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {source}
                    </Badge>
                  ))}
                  {insight.sources.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{insight.sources.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat Messages */}
        <ScrollArea className="flex-1 min-h-0 px-1">
          <div className="space-y-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start space-x-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div className={`flex space-x-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'user' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-secondary text-secondary-foreground'
                  }`}>
                    {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={`rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white ml-4'
                      : 'bg-gray-100 text-gray-900 mr-4'
                  }`}>
                    <div className="prose prose-sm max-w-none">
                      {/* Simple markdown-like formatting */}
                      {message.content.split('\n').map((line, i) => {
                        if (line.startsWith('•')) {
                          return <div key={i} className="ml-4">• {line.slice(1).trim()}</div>;
                        }
                        // Handle bold text
                        const parts = line.split(/(\*\*.*?\*\*)/);
                        return (
                          <div key={i}>
                            {parts.map((part, j) => {
                              if (part.startsWith('**') && part.endsWith('**')) {
                                return <strong key={j}>{part.slice(2, -2)}</strong>;
                              }
                              return part;
                            })}
                          </div>
                        );
                      })}
                    </div>
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-opacity-20">
                        <p className="text-xs opacity-70 mb-1">Sources:</p>
                        <div className="flex flex-wrap gap-1">
                          {message.sources.map((source, index) => (
                            <Badge key={index} variant="secondary" className="text-xs opacity-70">
                              {source}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-secondary rounded-lg p-3 mr-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t pt-4 flex-shrink-0">
          <div className="flex space-x-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about this insight, request quotes, explore patterns..."
              className="flex-1"
              disabled={isLoading}
              data-testid="insight-chat-input"
            />
            <Button 
              onClick={handleSendMessage}
              disabled={isLoading || !inputMessage.trim()}
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Press Enter to send. I can extract quotes and analyze patterns from the {insight.sources.length} source file{insight.sources.length !== 1 ? 's' : ''} that informed this insight.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}