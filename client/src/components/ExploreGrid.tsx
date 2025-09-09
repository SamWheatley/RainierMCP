import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Upload, Brain, Check } from "lucide-react";
import UploadZone from "./UploadZone";
import FileCard from "./FileCard";
import type { UploadedFile } from "@shared/schema";

interface ExploreGridProps {
  onAskAboutFile: (file: UploadedFile) => void;
}

export default function ExploreGrid({ onAskAboutFile }: ExploreGridProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  
  const queryClient = useQueryClient();

  const { data: filesData, isLoading } = useQuery<{ files: UploadedFile[] }>({
    queryKey: ['/api/files'],
  });

  const files: UploadedFile[] = filesData?.files || [];

  // Separate files into shared (Segment 7) and personal
  const sharedFiles = files.filter(file => file.shared);
  const personalFiles = files.filter(file => !file.shared);

  const filterFilesBySearch = (fileList: UploadedFile[]) => fileList.filter(file => {
    const matchesSearch = searchQuery === "" || 
      file.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (file.extractedText && file.extractedText.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = fileTypeFilter === "all" || 
      (fileTypeFilter === "transcripts" && file.mimeType.includes("text")) ||
      (fileTypeFilter === "documents" && file.mimeType.includes("pdf")) ||
      (fileTypeFilter === "videos" && file.mimeType.includes("video"));
    
    return matchesSearch && matchesType;
  });

  const filteredSharedFiles = filterFilesBySearch(sharedFiles);
  const filteredPersonalFiles = filterFilesBySearch(personalFiles);

  const handleUploadComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/files'] });
    setShowUpload(false);
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const selectAllFiles = () => {
    const allFileIds = [...filteredSharedFiles, ...filteredPersonalFiles].map(f => f.id);
    setSelectedFiles(allFileIds);
  };

  const clearSelection = () => {
    setSelectedFiles([]);
  };

  const generateInsightsMutation = useMutation({
    mutationFn: async (fileIds: string[]) => {
      return await apiRequest('POST', '/api/research-insights/generate', {
        fileIds,
        dataset: 'selected',
        model: 'openai'
      });
    },
    onSuccess: (data) => {
      setIsGeneratingInsights(false);
      setSelectedFiles([]);
      // Navigate to insights tab to show results
      window.location.hash = '#insights';
    },
    onError: (error) => {
      setIsGeneratingInsights(false);
      console.error('Failed to generate insights:', error);
    }
  });

  const handleGenerateInsights = () => {
    if (selectedFiles.length === 0) return;
    setIsGeneratingInsights(true);
    generateInsightsMutation.mutate(selectedFiles);
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          {/* Selection Actions */}
          {selectedFiles.length > 0 && (
            <div className="lg:col-span-full mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-blue-900">
                    {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearSelection}
                    className="h-8"
                  >
                    Clear selection
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllFiles}
                    className="h-8"
                  >
                    Select all
                  </Button>
                </div>
                <Button
                  onClick={handleGenerateInsights}
                  disabled={isGeneratingInsights}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-generate-insights"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  {isGeneratingInsights ? 'Generating...' : 'Generate Insights'}
                </Button>
              </div>
            </div>
          )}
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search transcripts, documents, and insights..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Filter Dropdowns */}
            <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="transcripts">Transcripts</SelectItem>
                <SelectItem value="documents">Documents</SelectItem>
                <SelectItem value="videos">Videos</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                <SelectItem value="research">Research</SelectItem>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Upload Button */}
            <Button 
              onClick={() => setShowUpload(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      {showUpload && (
        <UploadZone 
          onComplete={handleUploadComplete}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* Content Sections */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-xl shadow-lg p-6">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
              <div className="flex space-x-2">
                <div className="h-6 bg-gray-200 rounded w-16"></div>
                <div className="h-6 bg-gray-200 rounded w-12"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredSharedFiles.length === 0 && filteredPersonalFiles.length === 0 && files.length === 0 ? (
        /* Empty State */
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📁</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No research files yet</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Upload your first transcript, document, or video to start analyzing research insights with AI.
          </p>
          <Button 
            onClick={() => setShowUpload(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Your First File
          </Button>
        </div>
      ) : filteredSharedFiles.length === 0 && filteredPersonalFiles.length === 0 ? (
        /* No results */
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No files found</h3>
          <p className="text-gray-600 mb-6">
            Try adjusting your search terms or filters.
          </p>
          <Button variant="outline" onClick={() => {
            setSearchQuery("");
            setFileTypeFilter("all");
            setTeamFilter("all");
          }}>
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Segment 7 Section */}
          <div>
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Segment 7</h2>
              <p className="text-gray-600">Research data and documents for the Segment 7 initiative</p>
              <div className="mt-4 text-sm text-gray-500">
                {filteredSharedFiles.length} file{filteredSharedFiles.length !== 1 ? 's' : ''} • Shared across all users
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSharedFiles.map((file) => (
                <FileCard 
                  key={file.id} 
                  file={file} 
                  onAskQuestions={() => onAskAboutFile(file)}
                  isSelected={selectedFiles.includes(file.id)}
                  onToggleSelection={() => toggleFileSelection(file.id)}
                />
              ))}
            </div>
          </div>

          {/* Personal Data Section */}
          <div>
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Personal Data</h2>
              <p className="text-gray-600">Your private research files and documents</p>
              <div className="mt-4 text-sm text-gray-500">
                {filteredPersonalFiles.length} file{filteredPersonalFiles.length !== 1 ? 's' : ''} • Private to your account
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPersonalFiles.map((file) => (
                <FileCard 
                  key={file.id} 
                  file={file} 
                  onAskQuestions={() => onAskAboutFile(file)}
                  isSelected={selectedFiles.includes(file.id)}
                  onToggleSelection={() => toggleFileSelection(file.id)}
                />
              ))}
              
              {/* Add New File Card in Personal Data section */}
              <div 
                onClick={() => setShowUpload(true)}
                className="bg-white rounded-xl shadow-lg border-2 border-dashed border-gray-300 hover:border-primary transition-colors duration-200 cursor-pointer"
              >
                <div className="p-6 h-full flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                    <Upload className="w-6 h-6 text-gray-500" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm mb-2">Upload New File</h3>
                  <p className="text-xs text-gray-600">
                    Add transcripts, documents, or videos to analyze
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
