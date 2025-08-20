import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, Video, FileImage, MoreVertical, MessageSquare, Download } from "lucide-react";
import type { UploadedFile } from "@shared/schema";

interface FileCardProps {
  file: UploadedFile;
  onAskQuestions: () => void;
}

export default function FileCard({ file, onAskQuestions }: FileCardProps) {
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('video')) return Video;
    if (mimeType.includes('image')) return FileImage;
    return FileText;
  };

  const getFileTypeLabel = (mimeType: string) => {
    if (mimeType.includes('video')) return 'Video';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('text')) return 'Transcript';
    return 'Document';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "1 day ago";
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return date.toLocaleDateString();
  };

  const IconComponent = getFileIcon(file.mimeType);
  
  return (
    <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <IconComponent className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">
                {file.originalName}
              </h3>
              <p className="text-xs text-gray-600">
                {getFileTypeLabel(file.mimeType)} • {formatFileSize(file.size)}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Download className="h-4 w-4 mr-2" />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {file.extractedText && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-3">
            {file.extractedText.substring(0, 150)}...
          </p>
        )}
        
        <div className="flex items-center justify-between text-xs text-gray-600 mb-4">
          <span>Uploaded {formatDate(file.createdAt!)}</span>
          <Badge 
            variant={file.isProcessed ? "default" : "secondary"}
            className={file.isProcessed ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
          >
            {file.isProcessed ? "Processed" : "Processing"}
          </Badge>
        </div>
        
        {file.tags && file.tags.length > 0 && (
          <div className="flex items-center space-x-2 mb-4">
            {file.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {file.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{file.tags.length - 3} more</span>
            )}
          </div>
        )}
      </div>
      
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost"
            size="sm"
            onClick={onAskQuestions}
            className="text-primary hover:text-primary/80 text-sm font-medium"
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Ask Questions
          </Button>
          <Button variant="ghost" size="sm" className="text-gray-600 hover:text-primary text-sm">
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
