#!/usr/bin/env python3
"""
AeroEnglish Backend API Tests

Tests all backend endpoints for the aviation communication learning platform:
1. Admin Login API
2. Access Codes CRUD API  
3. Categories CRUD API
4. Videos CRUD API
5. User Progress API
6. Auto Transcription (Whisper)
"""

import requests
import json
import os
import tempfile
from io import BytesIO

# Backend URL from environment
BACKEND_URL = "https://repeat-learn-speak.preview.emergentagent.com/api"

# Test constants
ADMIN_PASSWORD = "aero2024admin"
TEST_ACCESS_CODE = "TEST1234"
TEST_CLIENT_NAME = "Test Student"

class APITestResult:
    def __init__(self):
        self.results = []
        self.failed_tests = []
        self.success_count = 0
        self.total_count = 0

    def log_test(self, test_name, success, details):
        self.total_count += 1
        result = {
            "test": test_name,
            "success": success,
            "details": details
        }
        self.results.append(result)
        
        if success:
            self.success_count += 1
            print(f"✅ {test_name}")
        else:
            self.failed_tests.append(result)
            print(f"❌ {test_name}: {details}")

    def print_summary(self):
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.success_count}/{self.total_count} passed")
        print(f"{'='*60}")
        
        if self.failed_tests:
            print("\n🔍 FAILED TESTS:")
            for test in self.failed_tests:
                print(f"• {test['test']}: {test['details']}")
        else:
            print("\n🎉 ALL TESTS PASSED!")

# Initialize test results
test_results = APITestResult()

def test_admin_login():
    """Test admin login functionality"""
    print("\n🔐 Testing Admin Login...")
    
    # Test valid login
    try:
        response = requests.post(
            f"{BACKEND_URL}/admin/login",
            json={"password": ADMIN_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and "authenticated" in data.get("message", "").lower():
                test_results.log_test("Admin login with correct password", True, "Login successful")
            else:
                test_results.log_test("Admin login with correct password", False, f"Unexpected response: {data}")
        else:
            test_results.log_test("Admin login with correct password", False, f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        test_results.log_test("Admin login with correct password", False, f"Request failed: {str(e)}")

    # Test invalid login
    try:
        response = requests.post(
            f"{BACKEND_URL}/admin/login",
            json={"password": "wrongpassword"},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 401:
            test_results.log_test("Admin login with wrong password", True, "Correctly rejected invalid password")
        else:
            test_results.log_test("Admin login with wrong password", False, f"Expected 401, got {response.status_code}")
            
    except Exception as e:
        test_results.log_test("Admin login with wrong password", False, f"Request failed: {str(e)}")

def test_access_codes():
    """Test access code functionality"""
    print("\n🎟️  Testing Access Codes...")
    
    # Test getting all access codes
    try:
        response = requests.get(f"{BACKEND_URL}/access-codes")
        
        if response.status_code == 200:
            codes = response.json()
            test_results.log_test("Get all access codes", True, f"Retrieved {len(codes)} access codes")
            
            # Check if TEST1234 exists
            test_code_exists = any(code.get("code") == TEST_ACCESS_CODE for code in codes)
            if test_code_exists:
                test_results.log_test("TEST1234 access code exists", True, "Test access code found in database")
            else:
                test_results.log_test("TEST1234 access code exists", False, "Test access code not found")
        else:
            test_results.log_test("Get all access codes", False, f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        test_results.log_test("Get all access codes", False, f"Request failed: {str(e)}")

    # Test verifying valid access code
    try:
        response = requests.post(
            f"{BACKEND_URL}/access-codes/verify",
            json={"code": TEST_ACCESS_CODE},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("valid") and data.get("client_name"):
                test_results.log_test("Verify valid access code (TEST1234)", True, f"Code verified for client: {data.get('client_name')}")
            else:
                test_results.log_test("Verify valid access code (TEST1234)", False, f"Invalid response format: {data}")
        else:
            test_results.log_test("Verify valid access code (TEST1234)", False, f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        test_results.log_test("Verify valid access code (TEST1234)", False, f"Request failed: {str(e)}")

    # Test verifying invalid access code
    try:
        response = requests.post(
            f"{BACKEND_URL}/access-codes/verify",
            json={"code": "INVALID"},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 401:
            test_results.log_test("Verify invalid access code", True, "Correctly rejected invalid code")
        else:
            test_results.log_test("Verify invalid access code", False, f"Expected 401, got {response.status_code}")
            
    except Exception as e:
        test_results.log_test("Verify invalid access code", False, f"Request failed: {str(e)}")

def test_categories():
    """Test categories CRUD functionality"""
    print("\n📂 Testing Categories...")
    
    # Test getting all categories
    try:
        response = requests.get(f"{BACKEND_URL}/categories")
        
        if response.status_code == 200:
            categories = response.json()
            test_results.log_test("Get all categories", True, f"Retrieved {len(categories)} categories")
            
            # Check for "Takeoff Communications"
            has_takeoff = any("takeoff" in cat.get("name", "").lower() for cat in categories)
            if has_takeoff:
                test_results.log_test("Takeoff Communications category exists", True, "Found Takeoff Communications category")
            else:
                test_results.log_test("Takeoff Communications category exists", False, "Takeoff Communications category not found")
        else:
            test_results.log_test("Get all categories", False, f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        test_results.log_test("Get all categories", False, f"Request failed: {str(e)}")

    # Test creating a new category
    created_category_id = None
    try:
        response = requests.post(
            f"{BACKEND_URL}/categories",
            json={"name": "Landing Communications", "description": "Landing communications for testing"},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            created_category_id = data.get("id")
            test_results.log_test("Create new category", True, f"Created category: {data.get('name')}")
        else:
            test_results.log_test("Create new category", False, f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        test_results.log_test("Create new category", False, f"Request failed: {str(e)}")

    # Test deleting the created category
    if created_category_id:
        try:
            response = requests.delete(f"{BACKEND_URL}/categories/{created_category_id}")
            
            if response.status_code == 200:
                test_results.log_test("Delete category", True, "Category deleted successfully")
            else:
                test_results.log_test("Delete category", False, f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            test_results.log_test("Delete category", False, f"Request failed: {str(e)}")

def test_videos():
    """Test videos functionality"""
    print("\n🎬 Testing Videos...")
    
    # Test getting all videos
    try:
        response = requests.get(f"{BACKEND_URL}/videos")
        
        if response.status_code == 200:
            videos = response.json()
            test_results.log_test("Get all videos", True, f"Retrieved {len(videos)} videos")
        else:
            test_results.log_test("Get all videos", False, f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        test_results.log_test("Get all videos", False, f"Request failed: {str(e)}")

    # Test video file upload (create a small test video file)
    try:
        # Create a minimal video file for testing
        test_video_content = b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom'  # Minimal MP4 header
        
        files = {
            'file': ('test_video.mp4', BytesIO(test_video_content), 'video/mp4')
        }
        data = {
            'title': 'Test Aviation Video',
            'description': 'Test video for API testing',
            'category': 'General',
            'auto_transcribe': 'false'  # Disable auto-transcription for test
        }
        
        response = requests.post(
            f"{BACKEND_URL}/videos",
            files=files,
            data=data
        )
        
        if response.status_code == 200:
            video_data = response.json()
            video_id = video_data.get("id")
            test_results.log_test("Upload video file", True, f"Video uploaded successfully: {video_data.get('title')}")
            
            # Test getting the specific video
            if video_id:
                get_response = requests.get(f"{BACKEND_URL}/videos/{video_id}")
                if get_response.status_code == 200:
                    test_results.log_test("Get specific video", True, "Video retrieved successfully")
                else:
                    test_results.log_test("Get specific video", False, f"HTTP {get_response.status_code}")
                
                # Clean up - delete the test video
                try:
                    delete_response = requests.delete(f"{BACKEND_URL}/videos/{video_id}")
                    if delete_response.status_code == 200:
                        test_results.log_test("Delete test video", True, "Test video cleaned up")
                    else:
                        test_results.log_test("Delete test video", False, f"HTTP {delete_response.status_code}")
                except:
                    pass  # Not critical if cleanup fails
        else:
            test_results.log_test("Upload video file", False, f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        test_results.log_test("Upload video file", False, f"Request failed: {str(e)}")

def test_user_progress():
    """Test user progress functionality"""
    print("\n📊 Testing User Progress...")
    
    # Test getting progress for TEST1234 user
    try:
        response = requests.get(f"{BACKEND_URL}/progress/{TEST_ACCESS_CODE}")
        
        if response.status_code == 200:
            progress = response.json()
            test_results.log_test("Get user progress", True, f"Retrieved progress data: {len(progress)} items")
        else:
            test_results.log_test("Get user progress", False, f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        test_results.log_test("Get user progress", False, f"Request failed: {str(e)}")

    # Test updating progress (need a video ID, using dummy for test)
    try:
        test_video_id = "test-video-123"
        response = requests.post(
            f"{BACKEND_URL}/progress/{TEST_ACCESS_CODE}/{test_video_id}",
            json={
                "watched_count": 1,
                "last_position": 30.5,
                "is_favorite": True,
                "completed": False
            },
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            progress_data = response.json()
            test_results.log_test("Update user progress", True, "Progress updated successfully")
        elif response.status_code == 401:
            test_results.log_test("Update user progress", False, "Access code validation failed - this might indicate the TEST1234 code is not active")
        else:
            test_results.log_test("Update user progress", False, f"HTTP {response.status_code}: {response.text}")
            
    except Exception as e:
        test_results.log_test("Update user progress", False, f"Request failed: {str(e)}")

def test_transcription():
    """Test auto transcription functionality (Whisper integration)"""
    print("\n🎤 Testing Auto Transcription...")
    
    # Check if Emergent LLM key is available
    try:
        # This is indirect testing since actual transcription requires valid video upload
        # We'll check if the transcription endpoint is reachable through video API
        
        # Just verify the transcription library can be imported
        import subprocess
        result = subprocess.run(['python3', '-c', 'from emergentintegrations.llm.openai import OpenAISpeechToText; print("OK")'], 
                              capture_output=True, text=True, cwd='/app/backend')
        
        if result.returncode == 0 and "OK" in result.stdout:
            test_results.log_test("Transcription library available", True, "OpenAI Speech-to-Text library imported successfully")
        else:
            test_results.log_test("Transcription library available", False, f"Import failed: {result.stderr}")
            
    except Exception as e:
        test_results.log_test("Transcription library available", False, f"Check failed: {str(e)}")
    
    # Check if EMERGENT_LLM_KEY is configured
    try:
        response = requests.get(f"{BACKEND_URL}/")  # Basic endpoint check
        if response.status_code == 200:
            test_results.log_test("Backend service responding", True, "Backend API is accessible")
            
            # Check if environment is set up for transcription
            with open('/app/backend/.env', 'r') as f:
                env_content = f.read()
                if 'EMERGENT_LLM_KEY' in env_content:
                    test_results.log_test("Transcription API key configured", True, "EMERGENT_LLM_KEY found in environment")
                else:
                    test_results.log_test("Transcription API key configured", False, "EMERGENT_LLM_KEY not found in environment")
        else:
            test_results.log_test("Backend service responding", False, f"HTTP {response.status_code}")
            
    except Exception as e:
        test_results.log_test("Backend service responding", False, f"Request failed: {str(e)}")

def main():
    """Run all API tests"""
    print(f"🚀 Starting AeroEnglish Backend API Tests")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Testing with admin password: {ADMIN_PASSWORD}")
    print(f"Testing with access code: {TEST_ACCESS_CODE}")
    
    # Run all test suites
    test_admin_login()
    test_access_codes()
    test_categories()
    test_videos()
    test_user_progress()
    test_transcription()
    
    # Print final summary
    test_results.print_summary()
    
    # Return exit code based on test results
    return 0 if len(test_results.failed_tests) == 0 else 1

if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)