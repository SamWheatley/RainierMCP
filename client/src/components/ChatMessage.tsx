import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import SourceCitations from "./SourceCitations";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
          <div className={`text-sm ${isUser ? 'text-white' : 'text-gray-900'} prose prose-sm max-w-none ${isUser ? 'prose-invert' : ''}`}>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                // Override default styles to work with our theme
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                code: ({ children }) => <code className={`px-1.5 py-0.5 rounded text-xs font-mono ${isUser ? 'bg-white/20' : 'bg-gray-200'}`}>{children}</code>,
                pre: ({ children }) => <pre className={`p-3 rounded-md text-xs font-mono overflow-x-auto ${isUser ? 'bg-white/20' : 'bg-gray-200'}`}>{children}</pre>,
                blockquote: ({ children }) => <blockquote className={`border-l-4 pl-4 italic ${isUser ? 'border-white/40' : 'border-gray-300'}`}>{children}</blockquote>,
                h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
        
        {!isUser && showSources && message.sources && message.sources.length > 0 && (
          <SourceCitations sources={message.sources} />
        )}
      </div>
    </div>
  );
}
