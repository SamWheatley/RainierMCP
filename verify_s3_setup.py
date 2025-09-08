#!/usr/bin/env python3
"""
S3 Data Lake Verification Script
Replicates AWS CLI commands using boto3 for smoke testing
"""

import os
import json
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError


def main():
    # Initialize S3 client
    s3_client = boto3.client(
        's3',
        aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID_RAINIER'),
        aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY_RAINIER'),
        region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
    )
    
    bucket_name = os.environ.get('PARTNER_BUCKET', 'cn-rainier-data-lake')
    
    print("=== S3 Data Lake Verification ===")
    print(f"Bucket: {bucket_name}")
    print()
    
    # 1. List objects in uploads/ (max 5)
    print("1) Sources in uploads/:")
    try:
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='uploads/',
            MaxKeys=5
        )
        if 'Contents' in response:
            for obj in response['Contents']:
                print(f"   {obj['Key']} ({obj['Size']} bytes)")
        else:
            print("   (No objects found)")
    except Exception as e:
        print(f"   Error: {e}")
    print()
    
    # 2. Health check file
    print("2) Health check file:")
    try:
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='parallax/health/'
        )
        if 'Contents' in response:
            for obj in response['Contents']:
                print(f"   ✓ {obj['Key']} (modified: {obj['LastModified']})")
        else:
            print("   (No health check file found)")
    except Exception as e:
        print(f"   Error: {e}")
    print()
    
    # 3. Curated outputs
    print("3) Curated outputs:")
    try:
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='curated/',
            MaxKeys=5
        )
        if 'Contents' in response:
            for obj in response['Contents']:
                print(f"   ✓ {obj['Key']} ({obj['Size']} bytes)")
        else:
            print("   (No curated files found)")
    except Exception as e:
        print(f"   Error: {e}")
    print()
    
    # 4. Today's manifests
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    print(f"4) Manifests for {today}:")
    try:
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix=f'manifests/dt={today}/',
            MaxKeys=5
        )
        if 'Contents' in response:
            for obj in response['Contents']:
                print(f"   ✓ {obj['Key']} ({obj['Size']} bytes)")
        else:
            print("   (No manifests found for today)")
    except Exception as e:
        print(f"   Error: {e}")
    print()
    
    # 5. Test object tagging on health file
    print("5) Checking object tags:")
    try:
        health_objects = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='parallax/health/'
        )
        if 'Contents' in health_objects and len(health_objects['Contents']) > 0:
            health_key = health_objects['Contents'][0]['Key']
            try:
                tags_response = s3_client.get_object_tagging(
                    Bucket=bucket_name,
                    Key=health_key
                )
                if tags_response['TagSet']:
                    print(f"   Health file tags: {tags_response['TagSet']}")
                else:
                    print("   Health file has no tags")
            except ClientError as e:
                if e.response['Error']['Code'] == 'NoSuchTagSet':
                    print("   Health file has no tags")
                else:
                    print(f"   Could not check tags: {e}")
        
        # Check curated file tags if any exist
        curated_objects = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='curated/',
            MaxKeys=1
        )
        if 'Contents' in curated_objects and len(curated_objects['Contents']) > 0:
            curated_key = curated_objects['Contents'][0]['Key']
            try:
                tags_response = s3_client.get_object_tagging(
                    Bucket=bucket_name,
                    Key=curated_key
                )
                print(f"   Curated file tags: {tags_response['TagSet']}")
            except ClientError as e:
                if e.response['Error']['Code'] == 'NoSuchTagSet':
                    print("   Curated file has no tags")
                else:
                    print(f"   Could not check curated tags: {e}")
    except Exception as e:
        print(f"   Error checking tags: {e}")
    print()
    
    # 6. Manifest content check (if available)
    print("6) Latest manifest content:")
    try:
        manifest_response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix=f'manifests/dt={today}/'
        )
        if 'Contents' in manifest_response and len(manifest_response['Contents']) > 0:
            # Get the latest manifest
            latest_manifest = sorted(manifest_response['Contents'], 
                                   key=lambda x: x['LastModified'])[-1]
            
            obj_response = s3_client.get_object(
                Bucket=bucket_name,
                Key=latest_manifest['Key']
            )
            manifest_content = obj_response['Body'].read().decode('utf-8')
            manifest_data = json.loads(manifest_content)
            
            print(f"   Latest: {latest_manifest['Key']}")
            print(f"   Batch ID: {manifest_data.get('batch_id', 'N/A')}")
            print(f"   Date: {manifest_data.get('dt', 'N/A')}")
            print(f"   Entries: {len(manifest_data.get('entries', []))}")
            
            # Check if any minutes_txt entries have curated_key
            minutes_entries = [e for e in manifest_data.get('entries', []) 
                             if e.get('type') == 'minutes_txt']
            if minutes_entries:
                for entry in minutes_entries[:3]:  # Show first 3
                    has_curated = 'curated_key' in entry and entry['curated_key']
                    status = "✓" if has_curated else "✗"
                    print(f"   {status} {entry.get('key', 'N/A')} -> {entry.get('curated_key', 'missing')}")
        else:
            print("   (No manifests found)")
    except Exception as e:
        print(f"   Error reading manifest: {e}")
    
    print("\n=== Verification Complete ===")


if __name__ == "__main__":
    main()