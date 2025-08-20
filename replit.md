# Overview

Ranier is Come Near's internal research intelligence platform that transforms qualitative research into actionable insights. The application serves as a transcript and interview analysis tool with plans to evolve into a full InsightStream-style research operating system. It provides AI-powered analysis capabilities for multiple internal teams (Research, Product, Marketing, Donor Relations) to extract meaningful patterns from research data.

The platform features a modern chat-based interface for asking questions about uploaded documents, an exploration interface for browsing research files, and intelligent AI responses with source citations and confidence scoring.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system variables
- **State Management**: TanStack Query for server state and caching
- **Routing**: Wouter for lightweight client-side routing
- **Component Structure**: Modular design with reusable UI components

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful APIs with structured JSON responses
- **Authentication**: OpenID Connect (OIDC) integration with Replit auth
- **Session Management**: Express sessions with PostgreSQL store
- **File Processing**: AI-powered text extraction and analysis pipeline

## Data Storage Solutions
- **Primary Database**: PostgreSQL with Neon serverless hosting
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Object Storage**: Google Cloud Storage with ACL-based access control
- **Session Storage**: PostgreSQL-backed session store
- **File Upload**: Direct-to-cloud upload with presigned URLs

## AI Integration
- **Provider**: OpenAI GPT-4o for chat and analysis
- **Personality System**: Custom "Ranier AI" with Come Near-specific prompts
- **Response Format**: Structured JSON with content, sources, and confidence scores
- **Document Processing**: Text extraction and semantic analysis capabilities

## Authentication & Authorization
- **Identity Provider**: Replit OIDC for SSO authentication
- **Access Control**: Object-level ACL policies for file permissions
- **Session Security**: Secure HTTP-only cookies with configurable TTL
- **User Management**: Automatic user provisioning from OIDC claims

# External Dependencies

## Cloud Services
- **Neon Database**: Serverless PostgreSQL hosting
- **Google Cloud Storage**: Object storage with advanced ACL controls
- **Replit Authentication**: OIDC identity provider and session management
- **OpenAI API**: GPT-4o for natural language processing and analysis

## File Upload Infrastructure
- **Uppy**: File upload library with dashboard UI and progress tracking
- **AWS S3 Plugin**: Direct-to-cloud upload capabilities (configured for GCS)
- **Presigned URLs**: Secure upload endpoint generation

## Development Tools
- **Replit Integration**: Development environment plugins and error handling
- **TypeScript**: Full type safety across frontend and backend
- **ESBuild**: Production bundling for server-side code