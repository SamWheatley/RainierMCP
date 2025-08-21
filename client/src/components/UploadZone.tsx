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
    onSuccess: () => {
      toast({
        title: "File uploaded successfully",
        description: "Your file is being processed and will be available shortly.",
      });
      onComplete();
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: "There was an error processing your file. Please try again.",
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
      const upload = successfulUploads[0];
      const uploadURL = upload.uploadURL;
      if (uploadURL && typeof uploadURL === 'string') {
        processFileMutation.mutate({
          uploadURL,
          originalName: upload.name,
          mimeType: upload.type || 'application/octet-stream',
          size: upload.size || 0,
          destination,
        });
      }
    }
  };

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
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Upload Research Files</h4>
        <p className="text-gray-600 mb-4">Drag and drop your transcripts, documents, or videos here</p>
        
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
            <p>Maximum file size: 100MB</p>
          </div>
        </div>
        
        <ObjectUploader
          maxNumberOfFiles={5}
          maxFileSize={100 * 1024 * 1024} // 100MB
          onGetUploadParameters={handleGetUploadParameters}
          onComplete={handleUploadComplete}
          buttonClassName="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg font-medium"
        >
          Choose Files
        </ObjectUploader>
      </div>
    </div>
  );
}
