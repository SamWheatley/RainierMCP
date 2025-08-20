import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ObjectUploader } from "./ObjectUploader";
import { X, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { UploadResult } from "@uppy/core";
import type { ChatAttachment } from "@shared/schema";

interface ChatAttachmentUploaderProps {
  open: boolean;
  onClose: () => void;
  onAttachmentsReady: (attachments: ChatAttachment[]) => void;
}

export default function ChatAttachmentUploader({ 
  open, 
  onClose, 
  onAttachmentsReady 
}: ChatAttachmentUploaderProps) {
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const processAttachmentMutation = useMutation({
    mutationFn: async (fileData: {
      uploadURL: string;
      originalName: string;
      mimeType: string;
      size: number;
      messageId: string;
    }) => {
      const response = await apiRequest('POST', '/api/chat/attachments/process', fileData);
      return response.json();
    },
    onSuccess: (data) => {
      setAttachments(prev => [...prev, data.attachment]);
    },
    onError: (error) => {
      toast({
        title: "Attachment processing failed",
        description: "There was an error processing your attachment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGetUploadParameters = async () => {
    const response = await apiRequest('POST', '/api/chat/attachments/upload', {});
    const data = await response.json();
    return {
      method: 'PUT' as const,
      url: data.uploadURL,
    };
  };

  const handleUploadComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    const successfulUploads = result.successful;
    
    if (successfulUploads.length > 0) {
      setIsProcessing(true);
      
      // Process each uploaded file as a temporary attachment
      successfulUploads.forEach(upload => {
        processAttachmentMutation.mutate({
          uploadURL: upload.uploadURL || '',
          originalName: upload.name,
          mimeType: upload.type || 'application/octet-stream',
          size: upload.size || 0,
          messageId: 'temp', // Will be updated when message is created
        });
      });
    }
  };

  const handleUseAttachments = () => {
    onAttachmentsReady(attachments);
    setAttachments([]);
    setIsProcessing(false);
    onClose();
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attach Files to Chat</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Attach files temporarily for this conversation. These won't be saved to your research library.
          </p>

          {attachments.length === 0 ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <ObjectUploader
                maxNumberOfFiles={5}
                maxFileSize={10485760} // 10MB
                onGetUploadParameters={handleGetUploadParameters}
                onComplete={handleUploadComplete}
                buttonClassName="bg-primary hover:bg-primary/90"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span>Choose Files for Chat</span>
                </div>
              </ObjectUploader>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h4 className="font-medium">Attached Files:</h4>
                {attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-4 h-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{attachment.originalName}</p>
                        <p className="text-xs text-gray-500">
                          {attachment.extractedText 
                            ? `${attachment.extractedText.length} characters extracted`
                            : 'Processing...'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between">
                <ObjectUploader
                  maxNumberOfFiles={5}
                  maxFileSize={10485760}
                  onGetUploadParameters={handleGetUploadParameters}
                  onComplete={handleUploadComplete}
                  buttonClassName="bg-gray-200 hover:bg-gray-300 text-gray-700"
                >
                  <span>Add More Files</span>
                </ObjectUploader>
                
                <Button 
                  onClick={handleUseAttachments}
                  disabled={isProcessing || processAttachmentMutation.isPending}
                  className="bg-primary hover:bg-primary/90"
                >
                  Use in Chat ({attachments.length})
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}