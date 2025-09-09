#!/usr/bin/env python3
"""
Check old bucket for any data that needs migration
"""

import os
import boto3
from botocore.exceptions import ClientError


def main():
    # Check old bucket
    old_bucket = 'cn-rainier-data-lake'
    s3_client = boto3.client(
        's3',
        aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID_RAINIER'),
        aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY_RAINIER'),
        region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
    )
    
    print(f"=== Checking Old Bucket: {old_bucket} ===")
    
    # Check each directory
    prefixes = ['uploads/', 'curated/', 'manifests/', 'parallax/health/']
    
    for prefix in prefixes:
        print(f"\n{prefix}:")
        try:
            response = s3_client.list_objects_v2(
                Bucket=old_bucket,
                Prefix=prefix,
                MaxKeys=10
            )
            if 'Contents' in response:
                for obj in response['Contents']:
                    print(f"   📁 {obj['Key']} ({obj['Size']} bytes, {obj['LastModified']})")
            else:
                print("   (empty)")
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchBucket':
                print(f"   ⚠️  Bucket {old_bucket} no longer exists")
                break
            else:
                print(f"   ❌ Error: {e}")
    
    print("\n=== Summary ===")
    print("If any important data found above, it may need migration to cn2025persona")


if __name__ == "__main__":
    main()