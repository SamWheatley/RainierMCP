#!/usr/bin/env python3
"""
Come Near S3 Data Lake Ingester (CN-only, no mirror)
Operates entirely within s3://cn-rainier-data-lake to ingest paired
AWS Transcribe .json + minutes .txt files and emit audit manifests.
"""

import os
import sys
import json
import hashlib
import argparse
import unicodedata
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional

import boto3
from botocore.exceptions import ClientError, NoCredentialsError


class CNIngester:
    def __init__(self):
        """Initialize the Come Near ingester with AWS credentials from environment."""
        self.bucket_name = os.environ.get('PARTNER_BUCKET', 'cn-rainier-data-lake')
        self.region = os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
        
        # Create S3 client with CN credentials
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID_RAINIER'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY_RAINIER'),
            region_name=self.region
        )
        
        self.schema_version = 1
        self.ingester_info = {"name": "parallax-ingester", "version": "0.1.0"}
        
    def health_check(self) -> bool:
        """Perform health check: list bucket and write health file."""
        try:
            # List bucket to verify access
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            print(f"✓ Bucket access verified: {self.bucket_name}")
            
            # Write health check file
            timestamp = datetime.now(timezone.utc).isoformat()
            health_content = f"Health check at {timestamp}\n"
            health_key = "parallax/health/healthcheck.txt"
            
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=health_key,
                Body=health_content.encode('utf-8'),
                ContentType='text/plain'
            )
            print(f"✓ Health check written: {health_key}")
            return True
            
        except Exception as e:
            print(f"✗ Health check failed: {e}")
            return False
    
    def discover_pairs(self, prefix: str = "uploads/") -> List[Tuple[str, str, str]]:
        """Discover paired .json + .txt files in the specified prefix."""
        pairs = []
        files_by_base = {}
        
        try:
            paginator = self.s3_client.get_paginator('list_objects_v2')
            for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
                if 'Contents' not in page:
                    continue
                    
                for obj in page['Contents']:
                    key = obj['Key']
                    if key.endswith('.json') or key.endswith('.txt'):
                        # Extract base name (without extension)
                        base_key = key[:-5] if key.endswith('.json') else key[:-4]
                        
                        if base_key not in files_by_base:
                            files_by_base[base_key] = {}
                        
                        if key.endswith('.json'):
                            files_by_base[base_key]['json'] = key
                        elif key.endswith('.txt'):
                            files_by_base[base_key]['txt'] = key
            
            # Find complete pairs
            for base_key, files in files_by_base.items():
                if 'json' in files and 'txt' in files:
                    pairs.append((base_key, files['json'], files['txt']))
                else:
                    missing = 'txt' if 'json' in files else 'json'
                    print(f"⚠ Incomplete pair for {base_key}: missing .{missing}")
            
            print(f"✓ Found {len(pairs)} complete pairs in {prefix}")
            return pairs
            
        except Exception as e:
            print(f"✗ Discovery failed: {e}")
            return []
    
    def normalize_text(self, content: str) -> str:
        """Normalize text content per v0 specification."""
        # UTF-8 decode + Unicode NFC normalization
        if isinstance(content, bytes):
            content = content.decode('utf-8', errors='replace')
        content = unicodedata.normalize('NFC', content)
        
        # Strip BOM and zero-width characters
        content = content.lstrip('\ufeff')  # Remove BOM
        content = ''.join(char for char in content if unicodedata.category(char) != 'Cf')
        
        # Collapse multi-space to single space
        import re
        content = re.sub(r' +', ' ', content)
        
        # Normalize line breaks to \n
        content = content.replace('\r\n', '\n').replace('\r', '\n')
        
        # Condense 2+ blank lines to one
        content = re.sub(r'\n\n+', '\n\n', content)
        
        # Strip leading/trailing whitespace
        content = content.strip()
        
        return content
    
    def calculate_sha256(self, content: bytes) -> str:
        """Calculate SHA256 checksum of content."""
        return hashlib.sha256(content).hexdigest()
    
    def get_object_info(self, key: str) -> Dict:
        """Get object metadata and content info."""
        try:
            response = self.s3_client.head_object(Bucket=self.bucket_name, Key=key)
            obj_response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
            content = obj_response['Body'].read()
            
            return {
                'key': key,
                'size_bytes': response['ContentLength'],
                'content_type': response.get('ContentType', 'application/octet-stream'),
                'checksum': f"sha256:{self.calculate_sha256(content)}",
                'content': content
            }
        except Exception as e:
            print(f"✗ Failed to get object info for {key}: {e}")
            return None
    
    def curate_file(self, base_key: str, txt_key: str, txt_info: Dict) -> Optional[Dict]:
        """Curate a text file and write to curated/ with tags."""
        try:
            # Normalize text content
            original_content = txt_info['content'].decode('utf-8', errors='replace')
            normalized_content = self.normalize_text(original_content)
            normalized_bytes = normalized_content.encode('utf-8')
            
            # Generate curated key
            base_name = os.path.basename(base_key)
            curated_key = f"curated/{base_name}.norm.txt"
            
            # Check if curated file already exists with same content (idempotence)
            try:
                existing_obj = self.s3_client.get_object(Bucket=self.bucket_name, Key=curated_key)
                existing_content = existing_obj['Body'].read()
                existing_checksum = self.calculate_sha256(existing_content)
                new_checksum = self.calculate_sha256(normalized_bytes)
                
                if existing_checksum == new_checksum:
                    print(f"✓ Curated file already exists with same content: {curated_key}")
                    return {
                        'curated_key': curated_key,
                        'curated_size_bytes': len(normalized_bytes),
                        'curated_checksum': f"sha256:{new_checksum}"
                    }
            except ClientError as e:
                if e.response['Error']['Code'] != 'NoSuchKey':
                    raise
            
            # Write curated file with optional tags (graceful fallback)
            try:
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=curated_key,
                    Body=normalized_bytes,
                    ContentType='text/plain; charset=utf-8',
                    Tagging='project=come-near&source=transcribe&schema_version=1'
                )
            except ClientError as e:
                if e.response.get('Error', {}).get('Code') in {'AccessDenied', 'InvalidTag'}:
                    print(f"⚠ Tagging denied for {curated_key}; proceeding without object tags")
                    # Write without tags - rely on manifest-only tagging
                    self.s3_client.put_object(
                        Bucket=self.bucket_name,
                        Key=curated_key,
                        Body=normalized_bytes,
                        ContentType='text/plain; charset=utf-8'
                    )
                else:
                    raise
            
            print(f"✓ Curated file written: {curated_key}")
            return {
                'curated_key': curated_key,
                'curated_size_bytes': len(normalized_bytes),
                'curated_checksum': f"sha256:{self.calculate_sha256(normalized_bytes)}"
            }
            
        except Exception as e:
            print(f"✗ Failed to curate {txt_key}: {e}")
            return None
    
    def write_manifest(self, entries: List[Dict], source_prefix: str) -> bool:
        """Write batch manifest to manifests/dt=YYYY-MM-DD/ partition."""
        try:
            now = datetime.now(timezone.utc)
            dt = now.strftime('%Y-%m-%d')
            batch_id = f"ingest-{now.isoformat().replace('+00:00', 'Z')}"
            
            manifest = {
                'schema_version': self.schema_version,
                'batch_id': batch_id,
                'dt': dt,
                'source_bucket': self.bucket_name,
                'source_prefix': source_prefix,
                'ingester': self.ingester_info,
                'entries': entries
            }
            
            manifest_key = f"manifests/dt={dt}/{batch_id}.json"
            manifest_content = json.dumps(manifest, indent=2)
            
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=manifest_key,
                Body=manifest_content.encode('utf-8'),
                ContentType='application/json'
            )
            
            print(f"✓ Manifest written: {manifest_key}")
            print(f"  Batch ID: {batch_id}")
            print(f"  Entries: {len(entries)}")
            return True
            
        except Exception as e:
            print(f"✗ Failed to write manifest: {e}")
            return False
    
    def ingest(self, prefix: str = "uploads/") -> bool:
        """Main ingestion workflow."""
        print(f"=== Come Near Data Lake Ingestion ===")
        print(f"Bucket: {self.bucket_name}")
        print(f"Prefix: {prefix}")
        print()
        
        # Step 1: Health check
        if not self.health_check():
            return False
        print()
        
        # Step 2: Discovery
        pairs = self.discover_pairs(prefix)
        if not pairs:
            print("No pairs found to process")
            return True
        print()
        
        # Step 3: Process pairs
        manifest_entries = []
        processed_count = 0
        
        for base_key, json_key, txt_key in pairs:
            print(f"Processing pair: {os.path.basename(base_key)}")
            
            # Get source file info
            json_info = self.get_object_info(json_key)
            txt_info = self.get_object_info(txt_key)
            
            if not json_info or not txt_info:
                print(f"✗ Failed to get file info for {base_key}")
                continue
            
            # Curate text file
            curation_result = self.curate_file(base_key, txt_key, txt_info)
            if not curation_result:
                print(f"✗ Failed to curate {base_key}")
                continue
            
            # Add entries to manifest
            # JSON entry
            manifest_entries.append({
                'key': json_info['key'],
                'type': 'aws_transcribe_json',
                'size_bytes': json_info['size_bytes'],
                'checksum': json_info['checksum'],
                'content_type': json_info['content_type'],
                'pii': 'low',
                'status': 'ingested'
            })
            
            # TXT entry with curation info
            txt_entry = {
                'key': txt_info['key'],
                'type': 'minutes_txt',
                'size_bytes': txt_info['size_bytes'],
                'checksum': txt_info['checksum'],
                'content_type': txt_info['content_type'],
                'pii': 'low',
                'status': 'ingested',
                'curated_key': curation_result['curated_key'],
                'curated_checksum': curation_result['curated_checksum'],
                'curated_size_bytes': curation_result['curated_size_bytes']
            }
            manifest_entries.append(txt_entry)
            
            processed_count += 1
            print(f"✓ Processed {base_key}")
            print()
        
        # Step 4: Write manifest
        if manifest_entries:
            success = self.write_manifest(manifest_entries, prefix)
            print()
            print(f"=== Summary ===")
            print(f"Processed: {processed_count} pairs")
            print(f"Manifest entries: {len(manifest_entries)}")
            print(f"Status: {'SUCCESS' if success else 'FAILED'}")
            return success
        else:
            print("No entries to write to manifest")
            return True


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description='Come Near S3 Data Lake Ingester')
    parser.add_argument('--prefix', default='uploads/', 
                       help='S3 prefix to search for files (default: uploads/)')
    
    args = parser.parse_args()
    
    try:
        ingester = CNIngester()
        success = ingester.ingest(args.prefix)
        sys.exit(0 if success else 1)
        
    except NoCredentialsError:
        print("✗ AWS credentials not found. Please check environment variables.")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Ingestion failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()