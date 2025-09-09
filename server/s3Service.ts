import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import type { UploadedFile } from '@shared/schema';

export interface S3File {
  id: string;
  title: string;
  extractedText: string;
  metadata: {
    size: number;
    lastModified: Date;
    contentType: string;
    studyType: string;
    location: string;
    participants?: string[];
  };
}

export class S3TranscriptService {
  private s3: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.PARTNER_BUCKET || 'cn2025persona';
    this.s3 = new S3Client({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID_RAINIER!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_RAINIER!
      },
      region: process.env.AWS_DEFAULT_REGION || 'us-east-1'
    });
  }

  async getCuratedTranscripts(): Promise<S3File[]> {
    try {
      // List all curated files
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'curated/',
        MaxKeys: 1000
      });
      const listResponse = await this.s3.send(listCommand);

      if (!listResponse.Contents) {
        return [];
      }

      // Fetch content for each file
      const files: S3File[] = [];
      
      for (const obj of listResponse.Contents) {
        if (!obj.Key || !obj.Key.endsWith('.norm.txt')) continue;

        try {
          // Get file content
          const getCommand = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: obj.Key
          });
          const getResponse = await this.s3.send(getCommand);

          const content = await getResponse.Body?.transformToString('utf-8') || '';
          const fileName = obj.Key.replace('curated/', '').replace('.norm.txt', '');
          
          // Determine study type and metadata from filename
          const studyType = this.categorizeStudyType(fileName);
          const participants = this.extractParticipants(fileName);
          const location = this.extractLocation(fileName);

          files.push({
            id: `s3-${obj.Key}`,
            title: fileName,
            extractedText: content,
            metadata: {
              size: obj.Size || 0,
              lastModified: obj.LastModified || new Date(),
              contentType: 'text/plain',
              studyType,
              location,
              participants
            }
          });

        } catch (error) {
          console.error(`Error fetching S3 file ${obj.Key}:`, error);
          continue;
        }
      }

      return files.sort((a, b) => a.title.localeCompare(b.title));

    } catch (error) {
      console.error('Error fetching curated transcripts:', error);
      return [];
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
    if (lower.match(/^p\d+[-_]/) || lower.includes('aida') || lower.includes('brian') || lower.includes('gary')) {
      return 'Individual Interviews';
    }
    if (lower.includes('christian') || lower.includes('spirituality')) {
      return 'Faith-Based Research';
    }
    if (lower.includes('audience') || lower.includes('segmentation')) {
      return 'Audience Segmentation';
    }
    
    return 'Research Transcripts';
  }

  private extractLocation(fileName: string): string {
    const lower = fileName.toLowerCase();
    
    if (lower.includes('atlanta')) return 'Atlanta';
    if (lower.includes('portland')) return 'Portland';
    if (lower.includes('denver')) return 'Denver';
    if (lower.includes('la ') || lower.includes('la_')) return 'Los Angeles';
    
    return 'Unknown';
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
  s3FileToFileData(s3File: S3File): UploadedFile {
    return {
      id: s3File.id,
      userId: 'system', // System-wide shared files
      filename: s3File.title,
      originalName: s3File.title,
      mimeType: 'text/plain',
      size: s3File.metadata.size,
      objectPath: `s3://curated/${s3File.title}.norm.txt`,
      isProcessed: true,
      extractedText: s3File.extractedText,
      tags: [s3File.metadata.studyType, s3File.metadata.location].filter(Boolean),
      shared: true,
      createdAt: s3File.metadata.lastModified,
      updatedAt: s3File.metadata.lastModified
    };
  }
}