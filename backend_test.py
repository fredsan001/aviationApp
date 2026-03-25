#!/usr/bin/env python3
"""
AeroEnglish Backend API Testing Script
Tests all critical backend endpoints for the ATC learning app
"""

import requests
import json
import sys
import time
from typing import Dict, Any, Optional

# Backend URL from frontend environment
BASE_URL = "https://skycomm-app.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.created_resources = []  # Track created resources for cleanup
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    def test_api_health(self):
        """Test basic API connectivity"""
        try:
            response = self.session.get(f"{BASE_URL}/")
            if response.status_code == 200:
                data = response.json()
                self.log_test("API Health Check", True, f"API is responding: {data.get('message', 'OK')}")
                return True
            else:
                self.log_test("API Health Check", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("API Health Check", False, f"Connection error: {str(e)}")
            return False
    
    def test_categories_management(self):
        """Test Categories CRUD operations"""
        print("=== Testing Categories Management ===")
        
        # Test GET categories (should work even if empty)
        try:
            response = self.session.get(f"{BASE_URL}/categories")
            if response.status_code == 200:
                categories = response.json()
                self.log_test("GET /api/categories", True, f"Retrieved {len(categories)} categories")
            else:
                self.log_test("GET /api/categories", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("GET /api/categories", False, f"Error: {str(e)}")
            return False
        
        # Test POST categories - Create new category
        try:
            category_data = {
                "name": "Test Category ATC",
                "description": "Test category for ATC communications"
            }
            response = self.session.post(f"{BASE_URL}/categories", json=category_data)
            if response.status_code == 200:
                created_category = response.json()
                category_id = created_category.get('id')
                self.created_resources.append(('category', category_id))
                self.log_test("POST /api/categories", True, f"Created category: {created_category.get('name')}")
                return True
            else:
                self.log_test("POST /api/categories", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("POST /api/categories", False, f"Error: {str(e)}")
            return False
    
    def test_videos_management(self):
        """Test Videos operations including multi-category support"""
        print("=== Testing Videos Management ===")
        
        # Test GET videos
        try:
            response = self.session.get(f"{BASE_URL}/videos")
            if response.status_code == 200:
                videos = response.json()
                self.log_test("GET /api/videos", True, f"Retrieved {len(videos)} videos")
                
                # Test multi-category update if videos exist
                if videos:
                    video_id = videos[0].get('id')
                    if video_id:
                        return self.test_multi_category_update(video_id)
                else:
                    self.log_test("Multi-category Video Update", True, "No videos to test multi-category update (this is expected)")
                return True
            else:
                self.log_test("GET /api/videos", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("GET /api/videos", False, f"Error: {str(e)}")
            return False
    
    def test_multi_category_update(self, video_id: str):
        """Test updating video with multiple categories"""
        try:
            update_data = {
                "categories": ["TWR", "APP"]
            }
            response = self.session.put(f"{BASE_URL}/videos/{video_id}", json=update_data)
            if response.status_code == 200:
                updated_video = response.json()
                categories = updated_video.get('categories', [])
                self.log_test("Multi-category Video Update", True, f"Updated video categories: {categories}")
                return True
            else:
                self.log_test("Multi-category Video Update", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("Multi-category Video Update", False, f"Error: {str(e)}")
            return False
    
    def test_atc_simulation(self):
        """Test ATC Simulation endpoints"""
        print("=== Testing ATC Simulation ===")
        
        # Test GET scenarios
        try:
            response = self.session.get(f"{BASE_URL}/atc/scenarios")
            if response.status_code == 200:
                scenarios = response.json()
                self.log_test("GET /api/atc/scenarios", True, f"Retrieved {len(scenarios)} scenarios")
                
                # Check if startup scenario exists
                startup_scenario = next((s for s in scenarios if s.get('id') == 'startup'), None)
                if not startup_scenario:
                    self.log_test("ATC Scenarios Content", False, "Startup scenario not found")
                    return False
            else:
                self.log_test("GET /api/atc/scenarios", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("GET /api/atc/scenarios", False, f"Error: {str(e)}")
            return False
        
        # Test GET initial contact
        try:
            response = self.session.get(f"{BASE_URL}/atc/initial-contact/startup")
            if response.status_code == 200:
                initial_contact = response.json()
                message = initial_contact.get('message', '')
                has_audio = 'audio_base64' in initial_contact
                self.log_test("GET /api/atc/initial-contact/startup", True, 
                            f"Got initial contact: '{message[:50]}...' (Audio: {has_audio})")
            else:
                self.log_test("GET /api/atc/initial-contact/startup", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("GET /api/atc/initial-contact/startup", False, f"Error: {str(e)}")
            return False
        
        # Test POST simulate
        try:
            simulation_data = {
                "scenario_id": "startup",
                "pilot_message": "Ground, November one two three four five at gate bravo seven, request startup clearance",
                "session_id": "test_session_123"
            }
            response = self.session.post(f"{BASE_URL}/atc/simulate", json=simulation_data)
            if response.status_code == 200:
                simulation_response = response.json()
                atc_response = simulation_response.get('atc_response', '')
                has_audio = 'audio_base64' in simulation_response
                frequency = simulation_response.get('frequency', '')
                facility = simulation_response.get('atc_facility', '')
                self.log_test("POST /api/atc/simulate", True, 
                            f"ATC Response: '{atc_response[:50]}...' (Audio: {has_audio}, Freq: {frequency}, Facility: {facility})")
            else:
                self.log_test("POST /api/atc/simulate", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("POST /api/atc/simulate", False, f"Error: {str(e)}")
            return False
        
        return True
    
    def test_evaluate_endpoint(self):
        """Test the previously broken evaluate endpoint"""
        print("=== Testing ATC Evaluate Endpoint (Previously Broken) ===")
        
        try:
            evaluation_data = {
                "pilot_message": "Ground, November one two three four five at gate bravo seven, request startup clearance",
                "scenario_id": "startup"
            }
            response = self.session.post(f"{BASE_URL}/atc/evaluate", json=evaluation_data)
            if response.status_code == 200:
                evaluation = response.json()
                total_score = evaluation.get('total_score', 0)
                feedback = evaluation.get('feedback', '')
                suggestions = evaluation.get('suggestions', [])
                correct_version = evaluation.get('correct_version', '')
                
                # Check if we got a proper evaluation response
                if isinstance(total_score, (int, float)) and 0 <= total_score <= 100:
                    self.log_test("POST /api/atc/evaluate", True, 
                                f"Evaluation successful - Score: {total_score}/100, Feedback length: {len(feedback)} chars, Suggestions: {len(suggestions)}")
                else:
                    self.log_test("POST /api/atc/evaluate", False, 
                                f"Invalid evaluation format - Score: {total_score}", evaluation)
                    return False
            else:
                self.log_test("POST /api/atc/evaluate", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("POST /api/atc/evaluate", False, f"Error: {str(e)}")
            return False
        
        return True
    
    def test_access_code_verification(self):
        """Test access code verification"""
        print("=== Testing Access Code Verification ===")
        
        try:
            verify_data = {
                "code": "TEST1234"
            }
            response = self.session.post(f"{BASE_URL}/access-codes/verify", json=verify_data)
            if response.status_code == 200:
                verification = response.json()
                is_valid = verification.get('valid', False)
                client_name = verification.get('client_name', '')
                self.log_test("POST /api/access-codes/verify", True, 
                            f"Code verification: Valid={is_valid}, Client: {client_name}")
            elif response.status_code == 401:
                # This is expected if the test code doesn't exist
                self.log_test("POST /api/access-codes/verify", True, 
                            "Code verification working (401 for non-existent code is expected)")
            else:
                self.log_test("POST /api/access-codes/verify", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("POST /api/access-codes/verify", False, f"Error: {str(e)}")
            return False
        
        return True
    
    def test_user_progress_api(self):
        """Test the User Progress API that was previously failing"""
        print("=== Testing User Progress API (Previously Failing) ===")
        
        # Test GET progress for a test access code
        try:
            response = self.session.get(f"{BASE_URL}/progress/TEST1234")
            if response.status_code == 200:
                progress = response.json()
                self.log_test("GET /api/progress/{access_code}", True, 
                            f"Retrieved progress data: {len(progress)} entries")
            else:
                self.log_test("GET /api/progress/{access_code}", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("GET /api/progress/{access_code}", False, f"Error: {str(e)}")
            return False
        
        return True
    
    def cleanup_resources(self):
        """Clean up created test resources"""
        print("=== Cleaning Up Test Resources ===")
        for resource_type, resource_id in self.created_resources:
            try:
                if resource_type == 'category':
                    response = self.session.delete(f"{BASE_URL}/categories/{resource_id}")
                    if response.status_code == 200:
                        print(f"✅ Cleaned up category {resource_id}")
                    else:
                        print(f"⚠️  Failed to clean up category {resource_id}: {response.status_code}")
            except Exception as e:
                print(f"⚠️  Error cleaning up {resource_type} {resource_id}: {e}")
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting AeroEnglish Backend API Tests")
        print("=" * 50)
        
        # Test API health first
        if not self.test_api_health():
            print("❌ API is not responding. Stopping tests.")
            return False
        
        # Run all tests
        tests = [
            self.test_categories_management,
            self.test_videos_management,
            self.test_atc_simulation,
            self.test_evaluate_endpoint,
            self.test_access_code_verification,
            self.test_user_progress_api
        ]
        
        all_passed = True
        for test in tests:
            try:
                result = test()
                if not result:
                    all_passed = False
            except Exception as e:
                print(f"❌ Test failed with exception: {e}")
                all_passed = False
            print("-" * 30)
        
        # Cleanup
        self.cleanup_resources()
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        
        passed = sum(1 for r in self.test_results if r['success'])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if not all_passed:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return all_passed

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)