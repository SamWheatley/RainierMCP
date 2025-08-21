import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RefreshCw, TrendingUp, AlertTriangle, Users, FileText, Brain, Lightbulb, MoreVertical, Edit2, Trash2 } from "lucide-react";
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

export default function ResearchInsights() {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingInsight, setEditingInsight] = useState<{ id: string; title: string } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [datasetFilter, setDatasetFilter] = useState<'all' | 'segment7' | 'personal'>('all');
  const [selectedModel, setSelectedModel] = useState<'openai' | 'anthropic' | 'grok'>('openai');

  // Fetch existing insights
  const { data: insightsData, isLoading } = useQuery<{ insights: ResearchInsight[] }>({
    queryKey: ['/api/research-insights'],
  });

  const insights: ResearchInsight[] = insightsData?.insights || [];

  // Generate new insights
  const generateInsightsMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      const response = await apiRequest('POST', '/api/research-insights/generate', {
        dataset: datasetFilter,
        model: selectedModel
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-insights'] });
      setIsGenerating(false);
    },
    onError: () => {
      setIsGenerating(false);
    },
  });

  // Delete insight mutation
  const deleteInsightMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/research-insights/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-insights'] });
    },
  });

  // Update insight title mutation  
  const updateInsightMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      await apiRequest('PUT', `/api/research-insights/${id}`, { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-insights'] });
      setEditingInsight(null);
      setNewTitle("");
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
      case 'theme': return <TrendingUp className="w-5 h-5" />;
      case 'bias': return <AlertTriangle className="w-5 h-5" />;
      case 'pattern': return <Users className="w-5 h-5" />;
      case 'recommendation': return <Lightbulb className="w-5 h-5" />;
      default: return <Brain className="w-5 h-5" />;
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'theme': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'bias': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'pattern': return 'bg-green-100 text-green-800 border-green-200';
      case 'recommendation': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="w-6 h-6 text-primary" />
                <span>Research Insights</span>
              </CardTitle>
              <CardDescription>
                AI-powered analysis of your research data including theme detection, bias identification, and pattern recognition.
              </CardDescription>
            </div>
            <div className="flex items-center space-x-3">
              <Select value={datasetFilter} onValueChange={(value) => setDatasetFilter(value as 'all' | 'segment7' | 'personal')}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Data</SelectItem>
                  <SelectItem value="segment7">Segment 7 Only</SelectItem>
                  <SelectItem value="personal">Personal Only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedModel} onValueChange={(value) => setSelectedModel(value as 'openai' | 'anthropic' | 'grok')}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="grok">Grok</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={() => generateInsightsMutation.mutate()}
                disabled={isGenerating}
                className="min-w-[140px]"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 mr-2" />
                    Generate Insights
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Insights Display */}
      {insights.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No insights yet</h3>
            <p className="text-gray-600 mb-6">
              Upload some research files and start conversations to generate insights.
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
                {insights
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
                  {insights
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
                                <Badge variant="outline">
                                  {formatConfidence(insight.confidence)} confidence
                                </Badge>
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