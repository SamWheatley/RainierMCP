import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, TrendingUp, AlertTriangle, Users, FileText, Brain, Lightbulb, MoreVertical, Edit2, Trash2, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ResearchInsight {
  id: string;
  type: 'theme' | 'bias' | 'pattern' | 'recommendation';
  title: string;
  description: string;
  confidence: number;
  sources: string[];
  createdAt: string;
}

interface InsightSession {
  id: string;
  title: string;
  dataset: 'all' | 'segment7' | 'personal';
  model: 'openai' | 'anthropic' | 'grok';
  createdAt: string;
  insights: ResearchInsight[];
}

export default function ResearchInsights() {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    stage: string;
    progress: number;
    stages: string[];
  } | null>(null);
  const [editingInsight, setEditingInsight] = useState<{ id: string; title: string } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [datasetFilter, setDatasetFilter] = useState<'all' | 'segment7' | 'personal'>('all');
  const selectedModel = 'openai'; // Fixed to OpenAI for optimal performance

  const { toast } = useToast();

  // Fetch existing insights with sessions
  const { data: insightsData, isLoading } = useQuery<{ 
    insights: ResearchInsight[]; 
    sessions: InsightSession[] 
  }>({
    queryKey: ['/api/research-insights'],
  });

  const insights: ResearchInsight[] = insightsData?.insights || [];
  const sessions: InsightSession[] = insightsData?.sessions || [];

  // Flatten all insights from all sessions for tabbed display
  const allInsights = sessions.flatMap(session => session.insights);

  // Generate new insights
  const generateInsightsMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      
      const stages = [
        "Analyzing uploaded files and conversations...",
        "Detecting themes and patterns...", 
        "Identifying potential biases...",
        "Generating recommendations...",
        "Finalizing insights..."
      ];
      
      setGenerationProgress({ stage: stages[0], progress: 10, stages });
      
      // Simulate progress updates during the long request
      let currentStage = 0;
      const progressInterval = setInterval(() => {
        currentStage++;
        if (currentStage < stages.length) {
          setGenerationProgress({ 
            stage: stages[currentStage], 
            progress: 10 + (currentStage * 20), 
            stages 
          });
        }
      }, 12000); // Update every 12 seconds
      
      try {
        const response = await apiRequest('POST', '/api/research-insights/generate', {
          dataset: datasetFilter,
          model: selectedModel
        });
        clearInterval(progressInterval);
        setGenerationProgress({ stage: "Complete!", progress: 100, stages });
        
        // Show success message after a brief delay
        setTimeout(() => {
          setGenerationProgress(null);
          setIsGenerating(false);
        }, 2000);
        
        return response;
      } catch (error) {
        clearInterval(progressInterval);
        setGenerationProgress(null);
        setIsGenerating(false);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-insights'] });
      toast({
        title: "Success",
        description: "Research insights generated successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate research insights",
        variant: "destructive",
      });
    },
  });

  // Delete insight
  const deleteInsightMutation = useMutation({
    mutationFn: (insightId: string) => apiRequest('DELETE', `/api/research-insights/${insightId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-insights'] });
      toast({
        title: "Success",
        description: "Insight deleted successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete insight",
        variant: "destructive",
      });
    },
  });

  // Update insight title
  const updateInsightMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => 
      apiRequest('PATCH', `/api/research-insights/${id}`, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-insights'] });
      setEditingInsight(null);
      setNewTitle("");
      toast({
        title: "Success",
        description: "Insight updated successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update insight",
        variant: "destructive",
      });
    },
  });

  const handleStartEdit = (insight: ResearchInsight) => {
    setEditingInsight({ id: insight.id, title: insight.title });
    setNewTitle(insight.title);
  };

  const handleSaveEdit = () => {
    if (editingInsight && newTitle.trim()) {
      updateInsightMutation.mutate({ id: editingInsight.id, title: newTitle.trim() });
    }
  };

  const handleCancelEdit = () => {
    setEditingInsight(null);
    setNewTitle("");
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'theme':
        return <TrendingUp className="w-4 h-4" />;
      case 'bias':
        return <AlertTriangle className="w-4 h-4" />;
      case 'pattern':
        return <Users className="w-4 h-4" />;
      case 'recommendation':
        return <Lightbulb className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'theme':
        return 'bg-blue-100 text-blue-600 border-blue-200';
      case 'bias':
        return 'bg-red-100 text-red-600 border-red-200';
      case 'pattern':
        return 'bg-green-100 text-green-600 border-green-200';
      case 'recommendation':
        return 'bg-yellow-100 text-yellow-600 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  const getDatasetName = (dataset: string) => {
    switch (dataset) {
      case 'segment7':
        return 'Segment 7';
      case 'personal':
        return 'Personal Files';
      default:
        return 'All Data';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="ml-2">Loading insights...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6" data-testid="research-insights">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Brain className="w-6 h-6 mr-2" />
            Research Insights
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Generation Progress */}
      {generationProgress && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin">
                    <RefreshCw className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-primary">Generating Research Insights</p>
                    <p className="text-sm text-gray-600">{generationProgress.stage}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {generationProgress.progress === 100 ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <span className="text-sm font-medium text-primary">
                      {generationProgress.progress}%
                    </span>
                  )}
                </div>
              </div>
              <Progress value={generationProgress.progress} className="w-full" />
              <div className="grid grid-cols-5 gap-2 text-xs">
                {generationProgress.stages.map((stage, index) => {
                  const stageProgress = (index + 1) * 20;
                  const isActive = generationProgress.progress >= stageProgress - 10;
                  const isComplete = generationProgress.progress >= stageProgress;
                  
                  return (
                    <div 
                      key={index} 
                      className={`flex items-center space-x-1 ${
                        isComplete ? 'text-green-600' : 
                        isActive ? 'text-primary' : 'text-gray-400'
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : isActive ? (
                        <div className="w-3 h-3 border-2 border-current rounded-full animate-pulse" />
                      ) : (
                        <div className="w-3 h-3 border border-current rounded-full" />
                      )}
                      <span className="truncate">{stage.split(' ')[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generation Controls */}
      {!isGenerating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Generate New Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <div className="w-full max-w-md">
                <label className="text-sm font-medium mb-2 block">Data Source</label>
                <Select 
                  value={datasetFilter} 
                  onValueChange={(value: 'all' | 'segment7' | 'personal') => setDatasetFilter(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select data source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Data</SelectItem>
                    <SelectItem value="segment7">Segment 7 Only</SelectItem>
                    <SelectItem value="personal">Personal Files Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button 
              onClick={() => generateInsightsMutation.mutate()}
              disabled={isGenerating}
              className="w-full"
              data-testid="button-generate-insights"
            >
              <Brain className="w-4 h-4 mr-2" />
              Generate Insights for {getDatasetName(datasetFilter)}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Insights Display */}
      {allInsights.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No insights yet</h3>
            <p className="text-gray-600 mb-4">
              Generate your first research insights to discover themes, patterns, and recommendations from your data.
            </p>
            <Button 
              onClick={() => generateInsightsMutation.mutate()}
              disabled={isGenerating}
            >
              <Brain className="w-4 h-4 mr-2" />
              Generate First Insights
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="themes">Themes</TabsTrigger>
            <TabsTrigger value="bias">Bias</TabsTrigger>
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <ScrollArea className="h-[600px]">
              <div className="space-y-4 pr-4">
                {allInsights
                  .sort((a, b) => b.confidence - a.confidence)
                  .map((insight) => (
                  <Card key={insight.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-lg ${getInsightColor(insight.type)}`}>
                            {getInsightIcon(insight.type)}
                          </div>
                          <div>
                            {editingInsight?.id === insight.id ? (
                              <div className="flex items-center space-x-2">
                                <Input
                                  value={newTitle}
                                  onChange={(e) => setNewTitle(e.target.value)}
                                  className="text-lg font-semibold"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit();
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                  autoFocus
                                />
                                <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                                <Button size="sm" variant="outline" onClick={handleCancelEdit}>Cancel</Button>
                              </div>
                            ) : (
                              <CardTitle className="text-lg">{insight.title}</CardTitle>
                            )}
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline" className={getInsightColor(insight.type)}>
                                {insight.type}
                              </Badge>
                              <Badge variant="outline">
                                {formatConfidence(insight.confidence)} confidence
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleStartEdit(insight)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteInsightMutation.mutate(insight.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 mb-4">{insight.description}</p>
                      {insight.sources.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-gray-600 mb-2">Sources:</p>
                          <div className="flex flex-wrap gap-2">
                            {insight.sources.map((source, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {source}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Filtered tabs */}
          {['themes', 'bias', 'patterns', 'recommendations'].map((filterType) => (
            <TabsContent key={filterType} value={filterType} className="space-y-4">
              <ScrollArea className="h-[600px]">
                <div className="space-y-4 pr-4">
                  {allInsights
                    .filter((insight) => {
                      switch (filterType) {
                        case 'themes': return insight.type === 'theme';
                        case 'bias': return insight.type === 'bias';
                        case 'patterns': return insight.type === 'pattern';
                        case 'recommendations': return insight.type === 'recommendation';
                        default: return false;
                      }
                    })
                    .sort((a, b) => b.confidence - a.confidence)
                    .map((insight) => (
                      <Card key={insight.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`p-2 rounded-lg ${getInsightColor(insight.type)}`}>
                                {getInsightIcon(insight.type)}
                              </div>
                              <div>
                                {editingInsight?.id === insight.id ? (
                                  <div className="flex items-center space-x-2">
                                    <Input
                                      value={newTitle}
                                      onChange={(e) => setNewTitle(e.target.value)}
                                      className="text-lg font-semibold"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveEdit();
                                        if (e.key === 'Escape') handleCancelEdit();
                                      }}
                                      autoFocus
                                    />
                                    <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>Cancel</Button>
                                  </div>
                                ) : (
                                  <CardTitle className="text-lg">{insight.title}</CardTitle>
                                )}
                                <div className="flex items-center space-x-2 mt-1">
                                  <Badge variant="outline" className={getInsightColor(insight.type)}>
                                    {insight.type}
                                  </Badge>
                                  <Badge variant="outline">
                                    {formatConfidence(insight.confidence)} confidence
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleStartEdit(insight)}>
                                  <Edit2 className="w-4 h-4 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => deleteInsightMutation.mutate(insight.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-gray-700 mb-4">{insight.description}</p>
                          {insight.sources.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-gray-600 mb-2">Sources:</p>
                              <div className="flex flex-wrap gap-2">
                                {insight.sources.map((source, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {source}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}