import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, FolderOpen, Brain, Shield } from "lucide-react";
import magnifyingGlassImage from "@assets/magnifying-glass-search-black-icon-transparent-background-701751694974241svd11gtb6h_1755712552612.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <img 
                src={magnifyingGlassImage} 
                alt="Magnifying Glass" 
                className="w-8 h-8 object-contain"
              />
              <span className="text-xl font-semibold text-gray-900">Come Near</span>
              <div className="hidden sm:block w-px h-6 bg-gray-300"></div>
              <span className="hidden sm:inline-block text-gray-600 font-medium">Ranier</span>
            </div>
            <Button 
              onClick={() => window.location.href = '/api/login'}
              className="bg-primary hover:bg-primary/90"
            >
              Sign In
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 sm:text-6xl mb-6">
            Research Intelligence
            <span className="block text-primary">Made Simple</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Transform your qualitative research into actionable insights with AI-powered analysis. 
            Upload transcripts, ask questions, and discover patterns that matter.
          </p>
          <Button 
            size="lg"
            onClick={() => window.location.href = '/api/login'}
            className="bg-primary hover:bg-primary/90 text-lg px-8 py-3"
          >
            Get Started
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>AI-Powered Conversations</CardTitle>
              <CardDescription>
                Ask natural language questions about your research files and get intelligent responses with source citations.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <FolderOpen className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Smart File Management</CardTitle>
              <CardDescription>
                Upload transcripts, documents, and videos. Our system automatically processes and indexes your content for instant search.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Context-Aware Insights</CardTitle>
              <CardDescription>
                Ranier understands your research context and provides bias-aware analysis with confidence scoring and transparent reasoning.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Private & Secure</CardTitle>
              <CardDescription>
                Your research data stays private. Each team member has their own secure workspace with role-based access controls.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-16">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Ready to transform your research workflow?
          </h2>
          <p className="text-gray-600 mb-8">
            Join Come Near's internal research intelligence platform and start extracting insights from your data today.
          </p>
          <Button 
            size="lg"
            onClick={() => window.location.href = '/api/login'}
            className="bg-primary hover:bg-primary/90 text-lg px-8 py-3"
          >
            Sign In to Get Started
          </Button>
        </div>
      </div>
    </div>
  );
}
