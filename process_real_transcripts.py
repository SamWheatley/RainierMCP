#!/usr/bin/env python3
"""
Process the real transcript data from Garth in the Transcripts/ folder
"""

import os
import sys
sys.path.append('.')

# Override the bucket name to the new one
os.environ['PARTNER_BUCKET'] = 'cn2025persona'

from ingester_cn_only import CNIngester

def main():
    print("🎉 PROCESSING REAL COME NEAR TRANSCRIPT DATA 🎉")
    print("=" * 60)
    
    try:
        ingester = CNIngester()
        print(f"Bucket: {ingester.bucket_name}")
        print(f"Processing prefix: Transcripts/")
        print()
        
        # Run the full ingestion workflow on real data
        success = ingester.ingest("Transcripts/")
        
        if success:
            print("\n🚀 REAL DATA PROCESSING COMPLETE!")
            print("✅ Health check written")
            print("✅ Transcript pairs discovered and processed") 
            print("✅ Normalized curated files generated")
            print("✅ Audit manifest created")
            print("\nRanier is now live with real Come Near research data! 🎊")
        else:
            print("\n❌ Processing failed - check logs above")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()