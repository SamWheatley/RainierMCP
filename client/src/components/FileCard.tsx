import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, Video, FileImage, MoreVertical, MessageSquare, Download, RefreshCw, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UploadedFile } from "@shared/schema";

interface FileCardProps {
  file: UploadedFile;
  onAskQuestions: () => void;
  isSelected?: boolean;
  onToggleSelection?: () => void;
}

export default function FileCard({ file, onAskQuestions, isSelected = false, onToggleSelection }: FileCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reprocessMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/files/${file.id}/reprocess`);
    },
    onSuccess: () => {
      toast({
        title: "File reprocessing started",
        description: "Your file is being reprocessed and will be ready shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
    },
    onError: () => {
      toast({
        title: "Reprocessing failed",
        description: "There was an error reprocessing your file. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/files/${file.id}`);
    },
    onSuccess: () => {
      toast({
        title: "File deleted",
        description: "Your file has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "There was an error deleting your file. Please try again.",
        variant: "destructive",
      });
    },
  });

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
    <div className={`bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden ${
      isSelected ? 'border-2 border-blue-500 ring-2 ring-blue-100' : 'border border-gray-200'
    }`}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          {/* Selection Checkbox */}
          {onToggleSelection && (
            <div 
              className="flex-shrink-0 mr-3 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection();
              }}
              data-testid={`checkbox-file-${file.id}`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected 
                  ? 'bg-blue-600 border-blue-600 text-white' 
                  : 'border-gray-300 hover:border-blue-400'
              }`}>
                {isSelected && <Check className="w-3 h-3" />}
              </div>
            </div>
          )}
          <div className="flex items-center space-x-3 flex-1">
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
              <DropdownMenuItem 
                className="text-red-600"
                onClick={() => {
                  if (confirm(`Are you sure you want to delete "${file.originalName}"? This action cannot be undone.`)) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
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
          <span>Uploaded {formatDate(file.createdAt! as string)}</span>
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
            disabled={!file.isProcessed}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Ask Questions
          </Button>
          <div className="flex space-x-1">
            {!file.isProcessed && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => reprocessMutation.mutate()}
                disabled={reprocessMutation.isPending}
                className="text-orange-600 hover:text-orange-800 text-sm"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${reprocessMutation.isPending ? 'animate-spin' : ''}`} />
                Reprocess
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-primary text-sm">
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
