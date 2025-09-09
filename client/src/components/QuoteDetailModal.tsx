import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Quote, MessageSquare, FileText, Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface QuoteDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: {
    text: string;
    speaker: string;
    sourceFile: string;
    theme: string;
    sentiment?: string;
    context?: string;
  };
}

export default function QuoteDetailModal({ isOpen, onClose, quote }: QuoteDetailModalProps) {
  // Query to get full context for this quote
  const { data: contextData, isLoading: contextLoading } = useQuery({
    queryKey: ['/api/quote-context', { text: quote.text, sourceFile: quote.sourceFile }],
    enabled: isOpen && !!quote.text,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="flex items-center space-x-2 text-lg font-semibold">
                <Quote className="w-5 h-5 text-indigo-600" />
                <span>Quote Details & Context</span>
              </DialogTitle>
              <DialogDescription className="mt-2">
                Full context and surrounding content for this participant quote
              </DialogDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Quote metadata */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
            <Badge variant="outline" className="text-indigo-700 border-indigo-200">
              {quote.theme}
            </Badge>
            {quote.sentiment && (
              <Badge variant="outline" className={`${
                quote.sentiment === 'positive' ? 'text-green-700 border-green-200' :
                quote.sentiment === 'negative' ? 'text-red-700 border-red-200' :
                'text-gray-700 border-gray-200'
              }`}>
                {quote.sentiment}
              </Badge>
            )}
            <div className="flex items-center text-sm text-gray-600">
              <FileText className="w-4 h-4 mr-1" />
              {quote.sourceFile}
            </div>
          </div>
        </DialogHeader>

        {/* Main content area */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            <div className="space-y-6">
              {/* Original Quote */}
              <div className="border-l-4 border-indigo-500 pl-4 py-3 bg-indigo-50 rounded-r-lg">
                <h3 className="font-semibold text-indigo-900 mb-2">Original Quote</h3>
                <blockquote className="text-gray-800 italic text-lg leading-relaxed">
                  "{quote.text}"
                </blockquote>
                <p className="text-sm text-indigo-700 mt-2 font-medium">— {quote.speaker}</p>
              </div>

              {/* Extended Context */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Full Context & Surrounding Content
                </h3>
                
                {contextLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span className="text-gray-600">Loading full context from transcript...</span>
                  </div>
                ) : (contextData as any)?.fullContext ? (
                  <div className="space-y-4">
                    <div className="prose prose-sm max-w-none">
                      {/* Context before */}
                      {(contextData as any).contextBefore && (
                        <div className="text-gray-600 italic border-l-2 border-gray-300 pl-3 mb-4">
                          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Context Before</h4>
                          <p className="leading-relaxed">{(contextData as any).contextBefore}</p>
                        </div>
                      )}
                      
                      {/* Highlighted quote */}
                      <div className="bg-yellow-100 border-l-4 border-yellow-500 pl-4 py-3 my-4">
                        <p className="font-semibold text-gray-900">"{quote.text}"</p>
                        <p className="text-sm text-gray-700 mt-1">— {quote.speaker}</p>
                      </div>
                      
                      {/* Context after */}
                      {(contextData as any).contextAfter && (
                        <div className="text-gray-600 italic border-l-2 border-gray-300 pl-3 mt-4">
                          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Context After</h4>
                          <p className="leading-relaxed">{(contextData as any).contextAfter}</p>
                        </div>
                      )}
                    </div>

                    {/* Additional metadata */}
                    {(contextData as any).insights && (contextData as any).insights.length > 0 && (
                      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="font-semibold text-blue-900 mb-2">Related Insights</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                          {(contextData as any).insights.map((insight: string, index: number) => (
                            <li key={index}>{insight}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-600">
                    <p>Unable to load additional context for this quote.</p>
                    <p className="text-sm mt-2">The quote may be from a processed summary or the original transcript may be unavailable.</p>
                  </div>
                )}
              </div>

              {/* Quote Impact & Analysis */}
              {quote.context && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-2">Quote Analysis</h3>
                  <p className="text-green-800 text-sm leading-relaxed">{quote.context}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 pt-4 border-t">
          <div className="flex justify-between items-center">
            <div className="text-xs text-gray-500">
              Source: {quote.sourceFile} • Speaker: {quote.speaker}
            </div>
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}