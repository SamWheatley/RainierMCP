import { Quote } from "lucide-react";

interface Source {
  filename: string;
  excerpt: string;
  confidence: number;
}

interface SourceCitationsProps {
  sources: Source[];
}

export default function SourceCitations({ sources }: SourceCitationsProps) {
  const averageConfidence = sources.reduce((sum, source) => sum + source.confidence, 0) / sources.length;

  return (
    <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-3 text-xs border-l-4 border-primary">
      <div className="flex items-center space-x-2 mb-2">
        <Quote className="w-4 h-4 text-primary" />
        <span className="font-medium text-gray-900">
          Sources (Confidence: {Math.round(averageConfidence * 100)}%)
        </span>
      </div>
      <div className="space-y-2">
        {sources.map((source, index) => (
          <div key={index} className="bg-white rounded p-2 border border-gray-200">
            <span className="font-medium text-gray-900">{source.filename}</span>
            <p className="text-gray-600 mt-1">{source.excerpt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
