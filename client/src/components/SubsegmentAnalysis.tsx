import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Users, Brain, Quote, AlertTriangle, CheckCircle, Download, Play } from "lucide-react";

interface Subsegment {
  id: string;
  name: string;
  description: string;
  size: number;
  percentage: number;
  cohesion: number;
  separation: number;
  rawCoverage: number;
  internalCoverage: number;
  agencyCoverage: number;
  distinguishingAttributes: string[];
  representativeQuotes: Array<{
    participantId: string;
    timestamp: string;
    quote: string;
    sourceUrl: string;
  }>;
  provisional: boolean;
}

interface Persona {
  id: string;
  subsegmentId: string;
  name: string;
  snapshot: string;
  motivations: string[];
  jobsToBeDone: {
    functional: string[];
    emotional: string[];
    social: string[];
  };
  painPoints: string[];
  beliefs: string[];
  triggers: string[];
  channels: string[];
  resonantMessages: string[];
  avoidLanguage: string[];
  quotes: Array<{
    participantId: string;
    timestamp: string;
    quote: string;
    context: string;
  }>;
  confidence: number;
  dataCoverage: string;
  caveats: string[];
}

interface AnalysisResults {
  subsegments: Subsegment[];
  personas: Persona[];
  metadata: {
    totalParticipants: number;
    analysisDate: string;
    corpusSize: number;
    methodNotes: string;
    biasFlags: string[];
  };
}

export default function SubsegmentAnalysis() {
  const [analysisTriggered, setAnalysisTriggered] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: analysisResults, isLoading, error } = useQuery({
    queryKey: ['/api/subsegment-analysis'],
    enabled: analysisTriggered,
  });

  const results = analysisResults as AnalysisResults | undefined;

  const runAnalysis = async () => {
    setAnalysisTriggered(true);
  };

  const downloadReport = () => {
    // Implementation for downloading PDF report
    console.log("Downloading subsegment analysis report...");
  };

  if (!analysisTriggered) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <Users className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Subsegment & Persona Analysis</h2>
            <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
              Analyze Segment 7 research data to identify natural subsegments and create detailed personas
              using advanced clustering and qualitative synthesis.
            </p>
          </div>
        </div>

        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Analysis Methodology
            </CardTitle>
            <CardDescription>
              This analysis follows the Come Near research framework with proper data weighting and bias validation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="font-semibold text-blue-900">Data Sources</div>
                <div className="text-sm text-blue-700 mt-1">
                  Raw Transcripts (1.0x)<br/>
                  Internal Summaries (0.6x)<br/>
                  Agency Decks (0.4x)
                </div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="font-semibold text-green-900">Clustering Method</div>
                <div className="text-sm text-green-700 mt-1">
                  HDBSCAN Algorithm<br/>
                  Embeddings + Attributes<br/>
                  Min Segment Size: 3-5
                </div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="font-semibold text-purple-900">Validation</div>
                <div className="text-sm text-purple-700 mt-1">
                  Raw-Only Comparison<br/>
                  Coverage Thresholds<br/>
                  Bias Detection
                </div>
              </div>
            </div>

            <Separator />

            <div className="text-center">
              <Button 
                onClick={runAnalysis}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Subsegment Analysis
              </Button>
              <p className="text-sm text-gray-500 mt-2">
                Analysis typically takes 30-60 seconds to complete
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <Brain className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mt-4">Analyzing Research Data</h2>
          <p className="text-gray-600 mt-2">Processing Segment 7 transcripts and generating insights...</p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Preprocessing transcripts</span>
              <span>Complete</span>
            </div>
            <Progress value={100} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Extracting features</span>
              <span>Complete</span>
            </div>
            <Progress value={100} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Running clustering analysis</span>
              <span>In Progress</span>
            </div>
            <Progress value={65} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Generating personas</span>
              <span>Pending</span>
            </div>
            <Progress value={0} className="h-2" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analysis Failed</h2>
          <p className="text-gray-600 mt-2">
            There was an error processing the research data. Please try again.
          </p>
          <Button 
            onClick={() => setAnalysisTriggered(false)}
            variant="outline"
            className="mt-4"
          >
            Reset Analysis
          </Button>
        </div>
      </div>
    );
  }

  if (!results) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Subsegment & Persona Analysis</h2>
          <p className="text-gray-600 mt-1">
            Analysis of {results.metadata.totalParticipants} participants • 
            Generated on {new Date(results.metadata.analysisDate).toLocaleDateString()}
          </p>
        </div>
        <Button onClick={downloadReport} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Download Report
        </Button>
      </div>

      {/* Bias Flags */}
      {results.metadata.biasFlags.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-800 text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Data Quality Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.metadata.biasFlags.map((flag, index) => (
              <div key={index} className="text-amber-700 text-sm">• {flag}</div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subsegments">Subsegments ({results.subsegments.length})</TabsTrigger>
          <TabsTrigger value="personas">Personas ({results.personas.length})</TabsTrigger>
          <TabsTrigger value="methodology">Methodology</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Subsegments Identified</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{results.subsegments.length}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {results.subsegments.filter(s => !s.provisional).length} validated, {results.subsegments.filter(s => s.provisional).length} provisional
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Personas Created</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{results.personas.length}</div>
                <div className="text-sm text-gray-600 mt-1">
                  Avg confidence: {Math.round(results.personas.reduce((sum, p) => sum + p.confidence, 0) / results.personas.length)}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Data Coverage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">{results.metadata.totalParticipants}</div>
                <div className="text-sm text-gray-600 mt-1">
                  Participants analyzed
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Largest Subsegments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {results.subsegments
                  .sort((a, b) => b.size - a.size)
                  .slice(0, 3)
                  .map((subsegment) => (
                    <div key={subsegment.id} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{subsegment.name}</div>
                        <div className="text-sm text-gray-600">{subsegment.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{subsegment.percentage}%</div>
                        <div className="text-sm text-gray-600">{subsegment.size} participants</div>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key Personas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {results.personas
                  .sort((a, b) => b.confidence - a.confidence)
                  .slice(0, 3)
                  .map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{persona.name}</div>
                        <div className="text-sm text-gray-600">{persona.snapshot}</div>
                      </div>
                      <Badge variant={persona.confidence > 80 ? "default" : "secondary"}>
                        {persona.confidence}% confidence
                      </Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subsegments">
          <div className="space-y-6">
            {results.subsegments.map((subsegment) => (
              <Card key={subsegment.id} className={subsegment.provisional ? "border-amber-200" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {subsegment.name}
                      {subsegment.provisional && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          Provisional
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{subsegment.percentage}%</div>
                      <div className="text-sm text-gray-600">{subsegment.size} participants</div>
                    </div>
                  </div>
                  <CardDescription>{subsegment.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Coverage Stats */}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Raw Coverage</div>
                      <div className="text-gray-600">{Math.round(subsegment.rawCoverage * 100)}%</div>
                    </div>
                    <div>
                      <div className="font-medium">Cohesion</div>
                      <div className="text-gray-600">{subsegment.cohesion.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="font-medium">Separation</div>
                      <div className="text-gray-600">{subsegment.separation.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Distinguishing Attributes */}
                  <div>
                    <div className="font-medium mb-2">Distinguishing Attributes</div>
                    <div className="flex flex-wrap gap-1">
                      {subsegment.distinguishingAttributes.map((attr, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {attr}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Representative Quotes */}
                  <div>
                    <div className="font-medium mb-2 flex items-center gap-2">
                      <Quote className="w-4 h-4" />
                      Representative Quotes
                    </div>
                    <div className="space-y-3">
                      {subsegment.representativeQuotes.slice(0, 3).map((quote, index) => (
                        <div key={index} className="bg-gray-50 p-3 rounded-lg text-sm">
                          <div className="italic text-gray-700">"{quote.quote}"</div>
                          <div className="text-xs text-gray-500 mt-1">
                            — Participant {quote.participantId} • {quote.timestamp}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="personas">
          <div className="space-y-6">
            {results.personas.map((persona) => (
              <Card key={persona.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{persona.name}</CardTitle>
                    <Badge variant={persona.confidence > 80 ? "default" : "secondary"}>
                      {persona.confidence}% confidence
                    </Badge>
                  </div>
                  <CardDescription>{persona.snapshot}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Core Details */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Core Motivations</h4>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {persona.motivations.map((motivation, index) => (
                            <li key={index}>• {motivation}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Jobs to Be Done</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium text-blue-600">Functional:</span>
                            <ul className="ml-2 mt-1 space-y-1">
                              {persona.jobsToBeDone.functional.map((job, index) => (
                                <li key={index} className="text-gray-700">• {job}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <span className="font-medium text-green-600">Emotional:</span>
                            <ul className="ml-2 mt-1 space-y-1">
                              {persona.jobsToBeDone.emotional.map((job, index) => (
                                <li key={index} className="text-gray-700">• {job}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <span className="font-medium text-purple-600">Social:</span>
                            <ul className="ml-2 mt-1 space-y-1">
                              {persona.jobsToBeDone.social.map((job, index) => (
                                <li key={index} className="text-gray-700">• {job}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Pain Points</h4>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {persona.painPoints.map((pain, index) => (
                            <li key={index}>• {pain}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Beliefs & Values</h4>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {persona.beliefs.map((belief, index) => (
                            <li key={index}>• {belief}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Key Triggers</h4>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {persona.triggers.map((trigger, index) => (
                            <li key={index}>• {trigger}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Preferred Channels</h4>
                        <div className="flex flex-wrap gap-1">
                          {persona.channels.map((channel, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {channel}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messaging Guidance */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-2 text-green-600">Messages That Resonate</h4>
                      <ul className="text-sm text-gray-700 space-y-1">
                        {persona.resonantMessages.map((message, index) => (
                          <li key={index}>• {message}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2 text-red-600">Language to Avoid</h4>
                      <ul className="text-sm text-gray-700 space-y-1">
                        {persona.avoidLanguage.map((language, index) => (
                          <li key={index}>• {language}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Quote Collage */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Quote className="w-4 h-4" />
                      Quote Collage
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {persona.quotes.map((quote, index) => (
                        <div key={index} className="bg-gray-50 p-3 rounded-lg text-sm">
                          <div className="italic text-gray-700 mb-2">"{quote.quote}"</div>
                          <div className="text-xs text-gray-500">
                            Context: {quote.context}
                          </div>
                          <div className="text-xs text-gray-500">
                            — Participant {quote.participantId} • {quote.timestamp}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Confidence & Caveats */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium mb-2 text-blue-900">Data Quality & Confidence</h4>
                    <div className="text-sm text-blue-800 space-y-1">
                      <div><span className="font-medium">Coverage:</span> {persona.dataCoverage}</div>
                      <div><span className="font-medium">Confidence:</span> {persona.confidence}%</div>
                      {persona.caveats.length > 0 && (
                        <div>
                          <span className="font-medium">Caveats:</span>
                          <ul className="ml-2 mt-1">
                            {persona.caveats.map((caveat, index) => (
                              <li key={index}>• {caveat}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="methodology">
          <Card>
            <CardHeader>
              <CardTitle>Analysis Methodology</CardTitle>
              <CardDescription>
                Detailed methodology and parameters used for subsegment and persona generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-2">Data Sources & Weighting</h4>
                <div className="bg-gray-50 p-4 rounded-lg text-sm">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="font-medium">Raw Transcripts</div>
                      <div className="text-gray-600">Weight: 1.0</div>
                      <div className="text-gray-600">Primary source data</div>
                    </div>
                    <div>
                      <div className="font-medium">Internal Summaries</div>
                      <div className="text-gray-600">Weight: 0.6</div>
                      <div className="text-gray-600">Processed insights</div>
                    </div>
                    <div>
                      <div className="font-medium">Agency Decks</div>
                      <div className="text-gray-600">Weight: 0.4</div>
                      <div className="text-gray-600">External analysis</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Clustering Parameters</h4>
                <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-2">
                  <div><span className="font-medium">Algorithm:</span> HDBSCAN (Hierarchical Density-Based Spatial Clustering)</div>
                  <div><span className="font-medium">Feature Set:</span> Embeddings + Topic Indicators + Extracted Attributes + Sentiment Scores</div>
                  <div><span className="font-medium">Minimum Cluster Size:</span> 3-5 participants</div>
                  <div><span className="font-medium">Validation Method:</span> Silhouette Score + DBCV (Density-Based Cluster Validation)</div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Quality Assurance</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm">Raw-only validation comparison performed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm">Minimum 70% Raw coverage threshold enforced</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm">Quote diversity verified (≥3 distinct participants per persona)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm">Recency and bias checks completed</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Limitations & Considerations</h4>
                <div className="bg-amber-50 p-4 rounded-lg text-sm space-y-1 text-amber-800">
                  <div>• Analysis limited to Segment 7 participants only</div>
                  <div>• Personas represent patterns, not individual participants</div>
                  <div>• Results should be validated with additional research</div>
                  <div>• Confidence scores reflect data quality, not absolute truth</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}