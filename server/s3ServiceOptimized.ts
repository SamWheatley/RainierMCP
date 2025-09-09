import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

export interface S3File {
  id: string;
  title: string;
  extractedText: string;
  shared?: boolean; // For Segment 7 filtering in research insights
  metadata: {
    size: number;
    lastModified: Date;
    contentType: string;
    studyType: string;
    location?: string;
    participants?: string[];
    s3Key?: string;
  };
}

export class OptimizedS3TranscriptService {
  private s3: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = 'cn2025persona'; // Updated to use correct bucket with 46 transcript files
    this.s3 = new S3Client({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID_RAINIER!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_RAINIER!
      },
      region: 'us-east-2' // cn2025persona bucket is in us-east-2 region
    });
  }

  async getCuratedTranscripts(): Promise<S3File[]> {
    try {
      console.log(`🔍 Fetching S3 transcript metadata from bucket: ${this.bucketName}`);
      
      // List all transcript files (metadata only for fast loading)
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'Transcripts/',
        MaxKeys: 1000
      });
      
      console.log(`📡 S3 Request: Bucket=${this.bucketName}, Prefix=Transcripts/`);
      const listResponse = await this.s3.send(listCommand);
      console.log(`📥 S3 Response: ${JSON.stringify({ 
        KeyCount: listResponse.KeyCount, 
        IsTruncated: listResponse.IsTruncated,
        ContentsLength: listResponse.Contents?.length 
      })}`);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        console.log('⚠️ No S3 contents found - trying different prefixes...');
        
        // Try without prefix to see what's actually in the bucket
        const rootListCommand = new ListObjectsV2Command({
          Bucket: this.bucketName,
          MaxKeys: 10
        });
        const rootResponse = await this.s3.send(rootListCommand);
        console.log(`🔍 Root bucket contents: ${rootResponse.Contents?.map(obj => obj.Key).join(', ') || 'empty'}`);
        
        return [];
      }

      console.log(`📁 Found ${listResponse.Contents.length} S3 objects`);

      // Create file objects with metadata only (no content download for speed)
      const files: S3File[] = [];
      
      for (const obj of listResponse.Contents) {
        if (!obj.Key || !obj.Key.endsWith('.txt')) continue;

        const fileName = obj.Key.replace('Transcripts/', '').replace('.txt', '');
        
        // Determine study type and metadata from filename
        const studyType = this.categorizeStudyType(fileName);
        const participants = this.extractParticipants(fileName);
        const location = this.extractLocation(fileName);

        // Mark Segment 7 files as shared for research insights filtering
        const isSegment7 = fileName.toLowerCase().includes('segment 7') || 
                          fileName.toLowerCase().includes('segment_7') ||
                          studyType.includes('Segment 7');

        files.push({
          id: `s3-${obj.Key}`,
          title: fileName,
          extractedText: `Research transcript from ${studyType}. ${participants.length > 0 ? `Participants: ${participants.join(', ')}` : ''} Click to analyze with AI.`,
          shared: isSegment7, // Enable Segment 7 filtering for research insights
          metadata: {
            size: obj.Size || 0,
            lastModified: obj.LastModified || new Date(),
            contentType: 'text/plain',
            studyType,
            location,
            participants,
            s3Key: obj.Key // Store S3 key for later content fetching
          }
        });
      }

      console.log(`✅ Successfully processed ${files.length} S3 transcript files`);
      return files.sort((a, b) => a.title.localeCompare(b.title));

    } catch (error) {
      console.error('❌ Error fetching curated transcripts:', error);
      return [];
    }
  }

  // Get full content for a specific file when needed
  async getFileContent(s3Key: string): Promise<string> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      });
      const getResponse = await this.s3.send(getCommand);
      return await getResponse.Body?.transformToString('utf-8') || '';
    } catch (error) {
      console.error(`Error fetching content for ${s3Key}:`, error);
      return '';
    }
  }

  private categorizeStudyType(fileName: string): string {
    const lower = fileName.toLowerCase();
    
    if (lower.includes('segment 7') || lower.includes('segment_7')) {
      return 'Segment 7 Focus Groups';
    }
    if (lower.includes('atlanta') || lower.includes('la ') || lower.includes('portland') || lower.includes('denver')) {
      return 'Regional Focus Groups';
    }
    if (lower.includes('faith') || lower.includes('christian') || lower.includes('church')) {
      return 'Faith-Based Research';
    }
    if (lower.includes('interview') || lower.includes('1-1') || lower.includes('one on one')) {
      return 'Individual Interviews';
    }
    if (lower.includes('audience') || lower.includes('demographic')) {
      return 'Audience Segmentation';
    }
    return 'General Research';
  }

  private extractLocation(fileName: string): string {
    const lower = fileName.toLowerCase();
    
    if (lower.includes('atlanta')) return 'Atlanta';
    if (lower.includes('portland')) return 'Portland';
    if (lower.includes('denver')) return 'Denver';
    if (lower.includes('la ') || lower.includes('los angeles')) return 'Los Angeles';
    
    return '';
  }

  private extractParticipants(fileName: string): string[] {
    const participants: string[] = [];
    
    // Extract individual names from filename patterns
    const namePatterns = [
      /aida/i, /arthur/i, /brian/i, /charles/i, /darius/i, /gary/i, 
      /anna/i, /cecilia/i, /brad/i, /flo/i, /jeff/i, /mikayla/i,
      /john/i, /lars/i, /medina/i, /tiana/i, /michael/i
    ];
    
    namePatterns.forEach(pattern => {
      const match = fileName.match(pattern);
      if (match) {
        participants.push(match[0].charAt(0).toUpperCase() + match[0].slice(1).toLowerCase());
      }
    });

    // Handle P1-P9 patterns
    const pMatch = fileName.match(/P(\d+)[-_]/);
    if (pMatch) {
      participants.push(`Participant ${pMatch[1]}`);
    }

    return participants;
  }

  // Convert S3File to UploadedFile format for compatibility  
  s3FileToFileData(s3File: S3File): any {
    return {
      id: s3File.id,
      userId: 'system', // System-wide shared files
      filename: s3File.title,
      originalName: s3File.title,
      mimeType: 'text/plain',
      size: s3File.metadata.size,
      objectPath: `s3://Transcripts/${s3File.title}.norm.txt`,
      isProcessed: true,
      extractedText: s3File.extractedText,
      tags: [s3File.metadata.studyType, s3File.metadata.location].filter(Boolean),
      shared: true,
      createdAt: s3File.metadata.lastModified,
      updatedAt: s3File.metadata.lastModified
    };
  }
}