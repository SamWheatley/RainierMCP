#!/usr/bin/env python3
"""
Explore the cn2025persona bucket to see where Garth put the transcript files
"""

import os
import boto3
from botocore.exceptions import ClientError


def main():
    # Connect to new bucket
    bucket_name = 'cn2025persona'
    s3_client = boto3.client(
        's3',
        aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID_RAINIER'),
        aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY_RAINIER'),
        region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
    )
    
    print(f"=== Exploring Bucket: {bucket_name} ===")
    
    try:
        # List all objects to understand the structure
        print("\n📂 Bucket Contents (first 50 objects):")
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            MaxKeys=50
        )
        
        if 'Contents' not in response:
            print("   (Bucket is empty)")
            return
        
        # Group by prefixes to understand folder structure
        prefixes = {}
        files_by_extension = {}
        
        for obj in response['Contents']:
            key = obj['Key']
            size = obj['Size']
            modified = obj['LastModified']
            
            # Extract prefix (folder)
            if '/' in key:
                prefix = '/'.join(key.split('/')[:-1]) + '/'
            else:
                prefix = '(root)'
            
            if prefix not in prefixes:
                prefixes[prefix] = []
            prefixes[prefix].append((key, size, modified))
            
            # Track extensions
            if '.' in key:
                ext = key.split('.')[-1].lower()
                if ext not in files_by_extension:
                    files_by_extension[ext] = 0
                files_by_extension[ext] += 1
        
        # Show folder structure
        print(f"\n📁 Folder Structure:")
        for prefix in sorted(prefixes.keys()):
            files = prefixes[prefix]
            print(f"   {prefix} ({len(files)} files)")
            
            # Show first few files in each folder
            for key, size, modified in files[:3]:
                print(f"      📄 {os.path.basename(key)} ({size} bytes)")
            if len(files) > 3:
                print(f"      ... and {len(files) - 3} more files")
        
        # Show file types
        print(f"\n📊 File Types:")
        for ext, count in sorted(files_by_extension.items()):
            print(f"   .{ext}: {count} files")
        
        # Look for JSON/TXT pairs specifically
        print(f"\n🔍 Looking for JSON/TXT pairs:")
        json_files = [obj['Key'] for obj in response['Contents'] if obj['Key'].endswith('.json')]
        txt_files = [obj['Key'] for obj in response['Contents'] if obj['Key'].endswith('.txt')]
        
        print(f"   JSON files: {len(json_files)}")
        if json_files:
            for json_file in json_files[:5]:
                print(f"      📄 {json_file}")
        
        print(f"   TXT files: {len(txt_files)}")
        if txt_files:
            for txt_file in txt_files[:5]:
                print(f"      📄 {txt_file}")
        
        # Check for potential pairs
        if json_files and txt_files:
            print(f"\n🔗 Checking for pairs:")
            for json_file in json_files[:3]:
                base = json_file[:-5]  # Remove .json
                corresponding_txt = base + '.txt'
                if corresponding_txt in [obj['Key'] for obj in response['Contents']]:
                    print(f"   ✅ PAIR: {base}")
                else:
                    print(f"   ❌ No match for: {json_file}")
        
    except ClientError as e:
        print(f"❌ Error accessing bucket: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()