// Standalone S3 debug script
import { OptimizedS3TranscriptService } from './s3ServiceOptimized';

async function testS3Connection() {
  console.log('🧪 Testing S3 connection...');
  
  try {
    const s3Service = new OptimizedS3TranscriptService();
    
    // Test different folder structures
    const foldersToTry = [
      '', // root
      'transcripts/',
      'Transcripts/',
      'data/',
      'uploads/',
      'files/',
      'curated/',
      'research/',
      'cn2025persona/',
      'interviews/',
      'focus-groups/'
    ];
    
    for (const folder of foldersToTry) {
      console.log(`🔍 Checking folder: ${folder || 'root'}`);
      
      // Use the S3 client directly to list objects
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      const listCommand = new ListObjectsV2Command({
        Bucket: 'cn-rainier-data-lake',
        Prefix: folder,
        MaxKeys: 50
      });
      
      const response = await s3Service['s3'].send(listCommand);
      if (response.Contents && response.Contents.length > 0) {
        console.log(`  📁 Found ${response.Contents.length} objects:`);
        response.Contents.forEach(obj => {
          if (obj.Key) {
            console.log(`    - ${obj.Key} (${obj.Size} bytes)`);
          }
        });
      } else {
        console.log(`  ✅ Empty`);
      }
    }
    
  } catch (error) {
    console.error('❌ S3 Test failed:', error);
  }
}

testS3Connection().then(() => process.exit(0));