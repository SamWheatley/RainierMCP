import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ObjectUploader } from "./ObjectUploader";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, CloudUpload } from "lucide-react";
import type { UploadResult } from "@uppy/core";

interface UploadZoneProps {
  onComplete: () => void;
  onClose: () => void;
}

export default function UploadZone({ onComplete, onClose }: UploadZoneProps) {
  const { toast } = useToast();
  const [destination, setDestination] = useState<'personal' | 'segment7'>('personal');
  const [processingFiles, setProcessingFiles] = useState<Set<string>>(new Set());
  const [completedFiles, setCompletedFiles] = useState<Set<string>>(new Set());
  const [totalFiles, setTotalFiles] = useState(0);
  
  const processFileMutation = useMutation({
    mutationFn: async (fileData: {
      uploadURL: string;
      originalName: string;
      mimeType: string;
      size: number;
      destination: 'personal' | 'segment7';
    }) => {
      const response = await apiRequest('POST', '/api/files/process', fileData);
      return response.json();
    },
    onSuccess: (data, variables) => {
      setCompletedFiles(prev => new Set([...Array.from(prev), variables.originalName]));
      setProcessingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.originalName);
        return newSet;
      });
    },
    onError: (error, variables) => {
      setProcessingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.originalName);
        return newSet;
      });
      toast({
        title: "Upload failed",
        description: `Failed to process ${variables.originalName}. Please try again.`,
        variant: "destructive",
      });
    },
  });

  const handleGetUploadParameters = async () => {
    const response = await apiRequest('POST', '/api/objects/upload', {});
    const data = await response.json();
    return {
      method: 'PUT' as const,
      url: data.uploadURL,
    };
  };

  const handleUploadComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    const successfulUploads = result.successful;
    
    if (successfulUploads && successfulUploads.length > 0) {
      setTotalFiles(successfulUploads.length);
      
      // Process all uploaded files
      successfulUploads.forEach(upload => {
        const uploadURL = upload.uploadURL;
        if (uploadURL && typeof uploadURL === 'string') {
          const fileName = upload.name || 'Unknown file';
          setProcessingFiles(prev => new Set([...Array.from(prev), fileName]));
          
          processFileMutation.mutate({
            uploadURL,
            originalName: fileName,
            mimeType: upload.type || 'application/octet-stream',
            size: upload.size || 0,
            destination,
          });
        }
      });
      
      toast({
        title: "Files uploaded successfully",
        description: `Processing ${successfulUploads.length} file${successfulUploads.length !== 1 ? 's' : ''}...`,
      });
    }
  };
  
  // Check if all files are processed and trigger completion
  const isAllProcessed = totalFiles > 0 && completedFiles.size === totalFiles && processingFiles.size === 0;
  
  if (isAllProcessed && totalFiles > 0) {
    // Reset state and trigger completion
    setTimeout(() => {
      setTotalFiles(0);
      setCompletedFiles(new Set());
      setProcessingFiles(new Set());
      toast({
        title: "All files processed!",
        description: `Successfully processed ${completedFiles.size} transcript${completedFiles.size !== 1 ? 's' : ''}. They're now available in your Archive.`,
      });
      onComplete();
    }, 1000);
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Upload Research Files</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-colors duration-200">
        <div className="mb-4">
          <CloudUpload className="mx-auto h-12 w-12 text-gray-400" />
        </div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Bulk Upload Transcripts</h4>
        <p className="text-gray-600 mb-4">Upload up to 50 transcript files at once for analysis</p>
        
        <div className="space-y-4 mb-6">
          <div className="max-w-xs mx-auto">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload to:
            </label>
            <Select value={destination} onValueChange={(value: 'personal' | 'segment7') => setDestination(value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal Data</SelectItem>
                <SelectItem value="segment7">Segment 7</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2 text-sm text-gray-600">
            <p>Supported formats: PDF, TXT, DOCX, MP4, MP3, WAV</p>
            <p>Maximum file size: 100MB • Up to 50 files</p>
            {totalFiles > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="font-medium text-blue-900 mb-2">
                  Processing {totalFiles} file{totalFiles !== 1 ? 's' : ''}...
                </p>
                <div className="space-y-1 text-sm">
                  <p className="text-blue-700">✅ Completed: {completedFiles.size}</p>
                  <p className="text-blue-600">⏳ Processing: {processingFiles.size}</p>
                  <p className="text-gray-600">📊 Total: {totalFiles}</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <ObjectUploader
          maxNumberOfFiles={50}
          maxFileSize={100 * 1024 * 1024} // 100MB
          onGetUploadParameters={handleGetUploadParameters}
          onComplete={handleUploadComplete}
          buttonClassName="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg font-medium"
        >
          {totalFiles > 0 ? 'Upload More Files' : 'Choose Files'}
        </ObjectUploader>
      </div>
    </div>
  );
}
