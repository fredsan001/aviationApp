#!/usr/bin/env python3
"""
Backend API Testing for AeroEnglish ATC App - Learning Path Endpoints
Testing the new Learning Path API endpoints as requested.
"""

import requests
import json
import sys
from typing import Dict, Any, List

# Base URL from environment configuration
BASE_URL = "https://skycomm-app.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

def print_test_header(test_name: str):
    """Print formatted test header"""
    print(f"\n{'='*60}")
    print(f"TEST: {test_name}")
    print(f"{'='*60}")

def print_response(response: requests.Response, show_full_content: bool = False):
    """Print formatted response details"""
    print(f"Status Code: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    
    try:
        content = response.json()
        if show_full_content or len(str(content)) < 500:
            print(f"Response: {json.dumps(content, indent=2)}")
        else:
            print(f"Response (truncated): {str(content)[:500]}...")
    except:
        print(f"Response Text: {response.text[:500]}...")

def test_get_videos() -> List[Dict[str, Any]]:
    """Get available videos to use in learning path tests"""
    print_test_header("GET Available Videos (for Learning Path setup)")
    
    try:
        response = requests.get(f"{API_BASE}/videos", timeout=30)
        print_response(response)
        
        if response.status_code == 200:
            videos = response.json()
            print(f"✅ Found {len(videos)} videos available")
            return videos
        else:
            print(f"❌ Failed to get videos: {response.status_code}")
            return []
            
    except Exception as e:
        print(f"❌ Error getting videos: {str(e)}")
        return []

def test_get_learning_path_initial():
    """Test 1: Get Learning Path (should return empty array initially or existing items)"""
    print_test_header("Test 1: GET /api/learning-path (Initial State)")
    
    try:
        response = requests.get(f"{API_BASE}/learning-path", timeout=30)
        print_response(response, show_full_content=True)
        
        if response.status_code == 200:
            path_items = response.json()
            print(f"✅ GET /api/learning-path successful")
            print(f"Current learning path has {len(path_items)} items")
            return path_items
        else:
            print(f"❌ GET /api/learning-path failed with status {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Error in GET /api/learning-path: {str(e)}")
        return None

def test_update_learning_path(videos: List[Dict[str, Any]]):
    """Test 2: Update Learning Path with video items"""
    print_test_header("Test 2: PUT /api/learning-path (Update Learning Path)")
    
    if len(videos) < 2:
        print("❌ Need at least 2 videos to test learning path update")
        return False
    
    # Use first two videos for the learning path
    video_1 = videos[0]
    video_2 = videos[1]
    
    learning_path_data = {
        "items": [
            {
                "video_id": video_1["id"],
                "order": 0,
                "is_path_exclusive": False
            },
            {
                "video_id": video_2["id"],
                "order": 1,
                "is_path_exclusive": True
            }
        ]
    }
    
    print(f"Updating learning path with videos:")
    print(f"  - Video 1: {video_1['title']} (ID: {video_1['id']}) - order: 0, exclusive: False")
    print(f"  - Video 2: {video_2['title']} (ID: {video_2['id']}) - order: 1, exclusive: True")
    
    try:
        response = requests.put(
            f"{API_BASE}/learning-path",
            json=learning_path_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        print_response(response, show_full_content=True)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ PUT /api/learning-path successful")
            print(f"Updated learning path with {result.get('items_count', 'unknown')} items")
            return True
        else:
            print(f"❌ PUT /api/learning-path failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error in PUT /api/learning-path: {str(e)}")
        return False

def test_get_learning_path_with_progress():
    """Test 3: Get Learning Path with Progress for student TEST1234"""
    print_test_header("Test 3: GET /api/learning-path/videos/TEST1234 (With Progress)")
    
    access_code = "TEST1234"
    
    try:
        response = requests.get(f"{API_BASE}/learning-path/videos/{access_code}", timeout=30)
        print_response(response, show_full_content=True)
        
        if response.status_code == 200:
            videos_with_progress = response.json()
            print(f"✅ GET /api/learning-path/videos/{access_code} successful")
            print(f"Learning path contains {len(videos_with_progress)} videos with progress data")
            
            # Show progress details for each video
            for i, video in enumerate(videos_with_progress):
                print(f"  Video {i+1}: {video.get('title', 'Unknown')}")
                print(f"    - Order: {video.get('path_order', 'N/A')}")
                print(f"    - Exclusive: {video.get('is_path_exclusive', False)}")
                print(f"    - Watched Count: {video.get('watched_count', 0)}")
                print(f"    - Completed: {video.get('completed', False)}")
                print(f"    - Ready for Evaluation: {video.get('ready_for_evaluation', False)}")
            
            return videos_with_progress
        else:
            print(f"❌ GET /api/learning-path/videos/{access_code} failed with status {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Error in GET /api/learning-path/videos/{access_code}: {str(e)}")
        return None

def test_verify_updated_path():
    """Test 4: Verify updated learning path"""
    print_test_header("Test 4: GET /api/learning-path (Verify Updates)")
    
    try:
        response = requests.get(f"{API_BASE}/learning-path", timeout=30)
        print_response(response, show_full_content=True)
        
        if response.status_code == 200:
            path_items = response.json()
            print(f"✅ GET /api/learning-path verification successful")
            print(f"Updated learning path contains {len(path_items)} items")
            
            # Verify the structure and order
            for item in path_items:
                print(f"  Item: Video ID {item.get('video_id', 'Unknown')}")
                print(f"    - Order: {item.get('order', 'N/A')}")
                print(f"    - Exclusive: {item.get('is_path_exclusive', False)}")
                if 'video' in item:
                    print(f"    - Video Title: {item['video'].get('title', 'Unknown')}")
            
            return path_items
        else:
            print(f"❌ GET /api/learning-path verification failed with status {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Error in GET /api/learning-path verification: {str(e)}")
        return None

def main():
    """Run all Learning Path API tests"""
    print("🚀 Starting Learning Path API Testing for AeroEnglish ATC App")
    print(f"Base URL: {BASE_URL}")
    print(f"API Base: {API_BASE}")
    
    # Test results tracking
    test_results = {
        "get_videos": False,
        "get_learning_path_initial": False,
        "update_learning_path": False,
        "get_learning_path_with_progress": False,
        "verify_updated_path": False
    }
    
    # Get available videos first
    videos = test_get_videos()
    if videos:
        test_results["get_videos"] = True
    
    # Test 1: Get initial learning path
    initial_path = test_get_learning_path_initial()
    if initial_path is not None:
        test_results["get_learning_path_initial"] = True
    
    # Test 2: Update learning path (only if we have videos)
    if videos:
        update_success = test_update_learning_path(videos)
        if update_success:
            test_results["update_learning_path"] = True
    
    # Test 3: Get learning path with progress
    progress_videos = test_get_learning_path_with_progress()
    if progress_videos is not None:
        test_results["get_learning_path_with_progress"] = True
    
    # Test 4: Verify updated path
    updated_path = test_verify_updated_path()
    if updated_path is not None:
        test_results["verify_updated_path"] = True
    
    # Print final summary
    print(f"\n{'='*60}")
    print("LEARNING PATH API TEST SUMMARY")
    print(f"{'='*60}")
    
    passed_tests = sum(test_results.values())
    total_tests = len(test_results)
    
    for test_name, passed in test_results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name.replace('_', ' ').title()}: {status}")
    
    print(f"\nOverall Result: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print("🎉 All Learning Path API tests PASSED!")
        return 0
    else:
        print("⚠️  Some Learning Path API tests FAILED!")
        return 1

if __name__ == "__main__":
    sys.exit(main())