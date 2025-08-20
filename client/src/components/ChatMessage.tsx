import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import SourceCitations from "./SourceCitations";
import type { ChatMessage } from "@shared/schema";

interface ChatMessageProps {
  message: ChatMessage;
  showSources: boolean;
}

export default function ChatMessage({ message, showSources }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarFallback className={isUser ? "bg-gray-300" : "bg-primary text-white"}>
          {isUser ? "U" : "🤖"}
        </AvatarFallback>
      </Avatar>
      <div className={`max-w-[70%] ${isUser ? 'space-y-0' : 'space-y-3'}`}>
        <div className={`rounded-lg p-4 ${
          isUser 
            ? 'bg-primary text-white' 
            : 'bg-gray-50'
        }`}>
          <p className={`text-sm ${isUser ? 'text-white' : 'text-gray-900'}`}>
            {message.content}
          </p>
        </div>
        
        {!isUser && showSources && message.sources && message.sources.length > 0 && (
          <SourceCitations sources={message.sources} />
        )}
      </div>
    </div>
  );
}
