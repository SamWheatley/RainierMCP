import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, AlertTriangle, Calendar, Download, BarChart3, Quote, Loader2, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import QuoteDetailModal from "./QuoteDetailModal";
import SubsegmentAnalysis from "./SubsegmentAnalysis";

interface TrendMetric {
  theme: string;
  currentValue: number;
  previousValue: number;
  changePercentage: number;
  trendDirection: "up" | "down" | "stable";
  confidence: number;
  category?: string;
  evidence?: string[];
}

interface PullQuote {
  text: string;
  speaker: string;
  sourceFile: string;
  theme: string;
  sentiment?: string;
  impact?: string;
  context?: string;
}

interface EarlyWarning {
  concern: string;
  description: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  trendPercentage: number;
  evidence?: string[];
  recommendations?: string[];
}

export default function ReportsPage() {
  const [selectedQuote, setSelectedQuote] = useState<PullQuote | null>(null);
  const [activeTab, setActiveTab] = useState("intelligence");

  // Real API data queries
  const { data: trendData, isLoading: trendsLoading } = useQuery({
    queryKey: ['/api/trend-metrics'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
  });

  const { data: quotesData, isLoading: quotesLoading } = useQuery({
    queryKey: ['/api/pull-quotes'],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: warningsData, isLoading: warningsLoading } = useQuery({
    queryKey: ['/api/early-warnings'],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const trendMetrics: TrendMetric[] = (trendData as any)?.trends || [];
  const pullQuotes: PullQuote[] = (quotesData as any)?.quotes || [];
  const earlyWarnings: EarlyWarning[] = (warningsData as any)?.warnings || [];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Research Intelligence Reports</h1>
          <p className="text-lg text-gray-600 mt-2">Predictive analytics and in-depth analysis from qualitative research data</p>
        </div>
        <Button className="flex items-center space-x-2">
          <Download className="w-4 h-4" />
          <span>Download Current Report</span>
        </Button>
      </div>

      {/* Report Type Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="intelligence" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Research Intelligence
          </TabsTrigger>
          <TabsTrigger value="subsegments" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Subsegment Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="intelligence">
          <div className="space-y-8">

      {/* Predictive Intelligence Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Detection */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <span>Trend Detection</span>
              {trendsLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            </CardTitle>
            <CardDescription>
              AI-analyzed theme prevalence changes from S3 transcript data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {trendsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span className="text-gray-600">Analyzing transcript data...</span>
              </div>
            ) : trendMetrics.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                No trend data available. Try refreshing or check back later.
              </div>
            ) : (
              trendMetrics.map((metric, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{metric.theme}</h4>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-sm text-gray-600">
                        {metric.previousValue}% → {metric.currentValue}%
                      </span>
                      <Badge variant={metric.trendDirection === 'up' ? 'default' : metric.trendDirection === 'down' ? 'destructive' : 'secondary'}>
                        {metric.trendDirection === 'up' ? '+' : metric.trendDirection === 'down' ? '-' : ''}{Math.abs(metric.changePercentage)}%
                      </Badge>
                    </div>
                    {metric.category && (
                      <span className="text-xs text-gray-500 capitalize">{metric.category}</span>
                    )}
                  </div>
                  <div className="text-right">
                    {metric.trendDirection === 'up' ? (
                      <TrendingUp className="w-6 h-6 text-green-600" />
                    ) : metric.trendDirection === 'down' ? (
                      <TrendingDown className="w-6 h-6 text-red-600" />
                    ) : (
                      <BarChart3 className="w-6 h-6 text-gray-400" />
                    )}
                    <p className="text-xs text-gray-500 mt-1">{Math.round(metric.confidence * 100)}% conf.</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Early Warning System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Early Warnings</span>
              {warningsLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            </CardTitle>
            <CardDescription>
              AI-detected emerging concerns from transcript analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {warningsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-xs text-gray-600">Detecting patterns...</span>
              </div>
            ) : earlyWarnings.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-600">
                No emerging concerns detected
              </div>
            ) : (
              earlyWarnings.map((warning, index) => (
                <div key={index} className={`p-3 border rounded-lg ${
                  warning.severity === 'high' ? 'border-red-200 bg-red-50' :
                  warning.severity === 'medium' ? 'border-amber-200 bg-amber-50' :
                  'border-blue-200 bg-blue-50'
                }`}>
                  <h4 className={`font-semibold text-sm ${
                    warning.severity === 'high' ? 'text-red-900' :
                    warning.severity === 'medium' ? 'text-amber-900' :
                    'text-blue-900'
                  }`}>{warning.concern}</h4>
                  <p className={`text-xs mt-1 ${
                    warning.severity === 'high' ? 'text-red-700' :
                    warning.severity === 'medium' ? 'text-amber-700' :
                    'text-blue-700'
                  }`}>{warning.trendPercentage}% trend increase</p>
                  {warning.description && (
                    <p className={`text-xs mt-1 ${
                      warning.severity === 'high' ? 'text-red-600' :
                      warning.severity === 'medium' ? 'text-amber-600' :
                      'text-blue-600'
                    }`}>{warning.description}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comparative Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            <span>Comparative Analysis</span>
          </CardTitle>
          <CardDescription>
            Current insights vs. same period last year
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">Total Insights</h3>
              <p className="text-2xl font-bold text-blue-600 mt-2">47</p>
              <p className="text-sm text-gray-600">+15% vs. last year</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">High Confidence</h3>
              <p className="text-2xl font-bold text-green-600 mt-2">38</p>
              <p className="text-sm text-gray-600">+22% vs. last year</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">New Themes</h3>
              <p className="text-2xl font-bold text-purple-600 mt-2">12</p>
              <p className="text-sm text-gray-600">+8% vs. last year</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Pull Quotes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Quote className="w-5 h-5 text-indigo-600" />
            <span>Key Pull Quotes</span>
            {quotesLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          </CardTitle>
          <CardDescription>
            AI-extracted impactful participant voices from S3 transcripts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {quotesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span className="text-gray-600">Extracting powerful quotes...</span>
            </div>
          ) : pullQuotes.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No quotes available. Try refreshing or check back later.
            </div>
          ) : (
            pullQuotes.map((quote, index) => (
              <div 
                key={index} 
                className="border-l-4 border-indigo-500 pl-4 py-2 cursor-pointer hover:bg-gray-50 rounded-r-lg transition-colors duration-200"
                onClick={() => setSelectedQuote(quote)}
                data-testid={`quote-card-${index}`}
              >
                <blockquote className="text-gray-700 italic mb-2">
                  "{quote.text}"
                </blockquote>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-600">
                    <span className="font-medium">{quote.speaker}</span> • {quote.sourceFile}
                  </div>
                  <div className="flex items-center space-x-2">
                    {quote.sentiment && (
                      <Badge variant="outline" className={`text-xs ${
                        quote.sentiment === 'positive' ? 'text-green-700 border-green-200' :
                        quote.sentiment === 'negative' ? 'text-red-700 border-red-200' :
                        'text-gray-700 border-gray-200'
                      }`}>
                        {quote.sentiment}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-indigo-700 border-indigo-200">
                      {quote.theme}
                    </Badge>
                  </div>
                </div>
                {quote.context && (
                  <p className="text-xs text-gray-500 mt-2">{quote.context}</p>
                )}
                <div className="text-xs text-indigo-600 mt-2 opacity-70 hover:opacity-100">
                  Click to view full context →
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Monthly Reports Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-600" />
            <span>Report Timeline</span>
          </CardTitle>
          <CardDescription>
            Historical research intelligence reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-4 border border-blue-200 bg-blue-50 rounded-lg">
            <div>
              <h4 className="font-semibold text-blue-900">September 2025 Report</h4>
              <p className="text-sm text-blue-700">In Progress... (47 insights analyzed)</p>
            </div>
            <Badge variant="secondary">Current</Badge>
          </div>
          
          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
            <div>
              <h4 className="font-semibold text-gray-900">August 2025 Report</h4>
              <p className="text-sm text-gray-600">52 insights analyzed • 38 high confidence</p>
            </div>
            <Button variant="ghost" size="sm">
              <Download className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
            <div>
              <h4 className="font-semibold text-gray-900">July 2025 Report</h4>
              <p className="text-sm text-gray-600">49 insights analyzed • 35 high confidence</p>
            </div>
            <Button variant="ghost" size="sm">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
          </div>
        </TabsContent>

        <TabsContent value="subsegments">
          <SubsegmentAnalysis />
        </TabsContent>
      </Tabs>

      {/* Quote Detail Modal */}
      {selectedQuote && (
        <QuoteDetailModal
          isOpen={!!selectedQuote}
          onClose={() => setSelectedQuote(null)}
          quote={selectedQuote}
        />
      )}
    </div>
  );
}