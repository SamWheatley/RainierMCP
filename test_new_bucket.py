#!/usr/bin/env python3
"""
Test ingester with the new cn2025persona bucket to verify real data processing
"""

import os
import sys
sys.path.append('.')

# Override the bucket name temporarily
os.environ['PARTNER_BUCKET'] = 'cn2025persona'

# Import and run the ingester
from ingester_cn_only import CNIngester

def main():
    print("=== Testing New Bucket: cn2025persona ===")
    
    try:
        ingester = CNIngester()
        print(f"Using bucket: {ingester.bucket_name}")
        
        # Run discovery first to see what's available
        pairs = ingester.discover_pairs("uploads/")
        print(f"Discovered {len(pairs)} transcript pairs")
        
        if pairs:
            print("\nFound transcript pairs:")
            for base_key, json_key, txt_key in pairs[:5]:  # Show first 5
                print(f"  📁 {os.path.basename(base_key)}")
                print(f"     JSON: {json_key}")
                print(f"     TXT:  {txt_key}")
        
        # If we have pairs, run full ingestion
        if pairs:
            print(f"\n🎉 REAL DATA FOUND! Processing {len(pairs)} pairs...")
            success = ingester.ingest("uploads/")
            if success:
                print("✅ Ingestion completed successfully!")
            else:
                print("❌ Ingestion failed")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()