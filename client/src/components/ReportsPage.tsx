import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, Calendar, Download, BarChart3, Quote } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface TrendMetric {
  theme: string;
  currentValue: number;
  previousValue: number;
  changePercentage: number;
  trend: "up" | "down" | "stable";
  confidence: number;
}

interface PullQuote {
  text: string;
  speaker: string;
  source: string;
  theme: string;
}

export default function ReportsPage() {
  // Mock data for now - will be replaced with real API calls
  const trendMetrics: TrendMetric[] = [
    {
      theme: "Spiritual Seeking Beyond Traditional Religion",
      currentValue: 73,
      previousValue: 59,
      changePercentage: 23,
      trend: "up",
      confidence: 0.91
    },
    {
      theme: "Technology Impact on Daily Life", 
      currentValue: 84,
      previousValue: 71,
      changePercentage: 18,
      trend: "up",
      confidence: 0.88
    },
    {
      theme: "Community Connection Challenges",
      currentValue: 62,
      previousValue: 78,
      changePercentage: -21,
      trend: "down", 
      confidence: 0.85
    }
  ];

  const pullQuotes: PullQuote[] = [
    {
      text: "When I was 14, my mom passed. I just remember being so angry at God at the church because the church believed that my mom would be healed.",
      speaker: "Speaker 1",
      source: "SEGMENT 7 - PAST v2",
      theme: "Spiritual Seeking"
    },
    {
      text: "I cannot remember one moment in my life where I actually believed into the Catholic religion later on in life when I learned more.",
      speaker: "Speaker 5", 
      source: "SEGMENT 7 - SPIRITUALITY v2",
      theme: "Spiritual Seeking"
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Research Intelligence Reports</h1>
          <p className="text-lg text-gray-600 mt-2">Predictive analytics and trend analysis from qualitative research data</p>
        </div>
        <Button className="flex items-center space-x-2">
          <Download className="w-4 h-4" />
          <span>Download Current Report</span>
        </Button>
      </div>

      {/* Predictive Intelligence Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Detection */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <span>Trend Detection</span>
            </CardTitle>
            <CardDescription>
              Theme prevalence changes since last quarter
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {trendMetrics.map((metric, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{metric.theme}</h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-sm text-gray-600">
                      {metric.previousValue}% → {metric.currentValue}%
                    </span>
                    <Badge variant={metric.trend === 'up' ? 'default' : metric.trend === 'down' ? 'destructive' : 'secondary'}>
                      {metric.trend === 'up' ? '+' : metric.trend === 'down' ? '-' : ''}{Math.abs(metric.changePercentage)}%
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  {metric.trend === 'up' ? (
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  ) : metric.trend === 'down' ? (
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  ) : (
                    <BarChart3 className="w-6 h-6 text-gray-400" />
                  )}
                  <p className="text-xs text-gray-500 mt-1">{Math.round(metric.confidence * 100)}% conf.</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Early Warning System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Early Warnings</span>
            </CardTitle>
            <CardDescription>
              Emerging concerns detected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 border border-amber-200 bg-amber-50 rounded-lg">
              <h4 className="font-semibold text-amber-900 text-sm">Technology Anxiety Rising</h4>
              <p className="text-xs text-amber-700 mt-1">18% increase in tech-related concerns</p>
            </div>
            <div className="p-3 border border-blue-200 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-900 text-sm">Community Disconnect</h4>
              <p className="text-xs text-blue-700 mt-1">21% decline in community connection themes</p>
            </div>
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
          </CardTitle>
          <CardDescription>
            Powerful participant voices supporting trending insights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pullQuotes.map((quote, index) => (
            <div key={index} className="border-l-4 border-indigo-500 pl-4 py-2">
              <blockquote className="text-gray-700 italic mb-2">
                "{quote.text}"
              </blockquote>
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-600">
                  <span className="font-medium">{quote.speaker}</span> • {quote.source}
                </div>
                <Badge variant="outline" className="text-indigo-700 border-indigo-200">
                  {quote.theme}
                </Badge>
              </div>
            </div>
          ))}
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
  );
}