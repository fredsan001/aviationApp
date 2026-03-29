#!/usr/bin/env python3
"""
AeroEnglish ATC App Backend Testing
Testing single device login, device release, and ATC simulation features
"""

import requests
import json
import base64
import time
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://skycomm-app.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

class AeroEnglishTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "response_data": response_data,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"    Details: {details}")
        if not success and response_data:
            print(f"    Response: {response_data}")
        print()

    def test_single_device_login_first_time(self) -> Optional[str]:
        """Test 1: Single Device Login - First Login"""
        try:
            payload = {
                "code": "TEST1234",
                "device_id": "test_device_123"
            }
            
            response = self.session.post(f"{API_BASE}/access-codes/verify", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("valid") and "client_name" in data:
                    self.log_test(
                        "Single Device Login - First Login",
                        True,
                        f"Successfully logged in with client_name: {data.get('client_name')}"
                    )
                    return data.get('client_name')
                else:
                    self.log_test(
                        "Single Device Login - First Login",
                        False,
                        "Response missing required fields",
                        data
                    )
            else:
                self.log_test(
                    "Single Device Login - First Login",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
                
        except Exception as e:
            self.log_test(
                "Single Device Login - First Login",
                False,
                f"Exception: {str(e)}"
            )
        
        return None

    def test_single_device_login_same_device(self):
        """Test 2: Single Device Login - Same Device (should work)"""
        try:
            payload = {
                "code": "TEST1234",
                "device_id": "test_device_123"
            }
            
            response = self.session.post(f"{API_BASE}/access-codes/verify", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("valid"):
                    self.log_test(
                        "Single Device Login - Same Device",
                        True,
                        "Same device login successful as expected"
                    )
                else:
                    self.log_test(
                        "Single Device Login - Same Device",
                        False,
                        "Login failed unexpectedly",
                        data
                    )
            else:
                self.log_test(
                    "Single Device Login - Same Device",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
                
        except Exception as e:
            self.log_test(
                "Single Device Login - Same Device",
                False,
                f"Exception: {str(e)}"
            )

    def test_single_device_login_different_device(self):
        """Test 3: Single Device Login - Different Device (should fail)"""
        try:
            payload = {
                "code": "TEST1234",
                "device_id": "different_device_456"
            }
            
            response = self.session.post(f"{API_BASE}/access-codes/verify", json=payload)
            
            if response.status_code == 403:
                response_text = response.text
                if "DEVICE_BLOCKED" in response_text:
                    self.log_test(
                        "Single Device Login - Different Device",
                        True,
                        "Correctly blocked different device with DEVICE_BLOCKED message"
                    )
                else:
                    self.log_test(
                        "Single Device Login - Different Device",
                        False,
                        "Got 403 but missing DEVICE_BLOCKED message",
                        response_text
                    )
            else:
                self.log_test(
                    "Single Device Login - Different Device",
                    False,
                    f"Expected HTTP 403 but got {response.status_code}: {response.text}",
                    response.text
                )
                
        except Exception as e:
            self.log_test(
                "Single Device Login - Different Device",
                False,
                f"Exception: {str(e)}"
            )

    def get_access_code_id(self) -> Optional[str]:
        """Get the ID for TEST1234 access code"""
        try:
            response = self.session.get(f"{API_BASE}/access-codes")
            
            if response.status_code == 200:
                codes = response.json()
                for code in codes:
                    if code.get("code") == "TEST1234":
                        return code.get("id")
                        
                self.log_test(
                    "Get Access Code ID",
                    False,
                    "TEST1234 code not found in access codes list"
                )
            else:
                self.log_test(
                    "Get Access Code ID",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                
        except Exception as e:
            self.log_test(
                "Get Access Code ID",
                False,
                f"Exception: {str(e)}"
            )
        
        return None

    def test_release_device(self, code_id: str):
        """Test 4: Release Device - Admin Endpoint"""
        try:
            response = self.session.put(f"{API_BASE}/access-codes/{code_id}/release-device")
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "released" in data["message"].lower():
                    self.log_test(
                        "Release Device - Admin Endpoint",
                        True,
                        f"Device released successfully: {data.get('message')}"
                    )
                    return True
                else:
                    self.log_test(
                        "Release Device - Admin Endpoint",
                        False,
                        "Unexpected response format",
                        data
                    )
            else:
                self.log_test(
                    "Release Device - Admin Endpoint",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
                
        except Exception as e:
            self.log_test(
                "Release Device - Admin Endpoint",
                False,
                f"Exception: {str(e)}"
            )
        
        return False

    def test_login_after_release(self):
        """Test 5: Login After Release"""
        try:
            payload = {
                "code": "TEST1234",
                "device_id": "new_device_789"
            }
            
            response = self.session.post(f"{API_BASE}/access-codes/verify", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("valid"):
                    self.log_test(
                        "Login After Release",
                        True,
                        "Successfully logged in with new device after release"
                    )
                else:
                    self.log_test(
                        "Login After Release",
                        False,
                        "Login failed after device release",
                        data
                    )
            else:
                self.log_test(
                    "Login After Release",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
                
        except Exception as e:
            self.log_test(
                "Login After Release",
                False,
                f"Exception: {str(e)}"
            )

    def test_get_atc_scenarios(self) -> bool:
        """Test getting ATC scenarios"""
        try:
            response = self.session.get(f"{API_BASE}/atc/scenarios")
            
            if response.status_code == 200:
                scenarios = response.json()
                if isinstance(scenarios, list) and len(scenarios) > 0:
                    scenario_names = [s.get('name', 'Unknown') for s in scenarios]
                    self.log_test(
                        "Get ATC Scenarios",
                        True,
                        f"Retrieved {len(scenarios)} scenarios: {', '.join(scenario_names)}"
                    )
                    return True
                else:
                    self.log_test(
                        "Get ATC Scenarios",
                        False,
                        "No scenarios returned or invalid format",
                        scenarios
                    )
            else:
                self.log_test(
                    "Get ATC Scenarios",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
                
        except Exception as e:
            self.log_test(
                "Get ATC Scenarios",
                False,
                f"Exception: {str(e)}"
            )
        
        return False

    def test_atc_simulation_with_radio_effect(self):
        """Test 6: ATC Simulation with Radio Effect"""
        try:
            payload = {
                "scenario_id": "startup",
                "pilot_message": "Ground, November one two three four five, request taxi",
                "session_id": "test_session_1"
            }
            
            response = self.session.post(f"{API_BASE}/atc/simulate", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["atc_response", "frequency", "atc_facility"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test(
                        "ATC Simulation with Radio Effect",
                        False,
                        f"Missing required fields: {missing_fields}",
                        data
                    )
                    return
                
                # Check if audio is present and appears to be base64
                audio_base64 = data.get("audio_base64")
                audio_valid = False
                
                if audio_base64:
                    try:
                        # Try to decode base64 to verify it's valid
                        audio_bytes = base64.b64decode(audio_base64)
                        audio_valid = len(audio_bytes) > 0
                    except Exception:
                        audio_valid = False
                
                success_details = []
                success_details.append(f"ATC Response: {data['atc_response'][:100]}...")
                success_details.append(f"Frequency: {data['frequency']}")
                success_details.append(f"ATC Facility: {data['atc_facility']}")
                
                if audio_valid:
                    success_details.append(f"Audio: Valid base64 audio ({len(audio_base64)} chars)")
                    self.log_test(
                        "ATC Simulation with Radio Effect",
                        True,
                        "; ".join(success_details)
                    )
                else:
                    success_details.append("Audio: Missing or invalid")
                    self.log_test(
                        "ATC Simulation with Radio Effect",
                        False,
                        "; ".join(success_details),
                        {"audio_present": bool(audio_base64), "audio_length": len(audio_base64) if audio_base64 else 0}
                    )
                    
            else:
                self.log_test(
                    "ATC Simulation with Radio Effect",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
                
        except Exception as e:
            self.log_test(
                "ATC Simulation with Radio Effect",
                False,
                f"Exception: {str(e)}"
            )

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("=" * 60)
        print("AeroEnglish ATC App Backend Testing")
        print("=" * 60)
        print()
        
        # Test 1: First login
        client_name = self.test_single_device_login_first_time()
        
        # Test 2: Same device login
        self.test_single_device_login_same_device()
        
        # Test 3: Different device login (should fail)
        self.test_single_device_login_different_device()
        
        # Test 4: Get access code ID and release device
        code_id = self.get_access_code_id()
        if code_id:
            device_released = self.test_release_device(code_id)
            
            # Test 5: Login after release
            if device_released:
                self.test_login_after_release()
        else:
            self.log_test(
                "Release Device - Admin Endpoint",
                False,
                "Could not find TEST1234 access code ID"
            )
            self.log_test(
                "Login After Release",
                False,
                "Skipped due to missing access code ID"
            )
        
        # Test 6: ATC Scenarios
        scenarios_available = self.test_get_atc_scenarios()
        
        # Test 7: ATC Simulation
        if scenarios_available:
            self.test_atc_simulation_with_radio_effect()
        else:
            self.log_test(
                "ATC Simulation with Radio Effect",
                False,
                "Skipped due to no available scenarios"
            )
        
        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        print()
        
        # Show failed tests
        failed_tests = [result for result in self.test_results if not result["success"]]
        if failed_tests:
            print("FAILED TESTS:")
            for result in failed_tests:
                print(f"❌ {result['test']}: {result['details']}")
        else:
            print("🎉 ALL TESTS PASSED!")
        
        print()

if __name__ == "__main__":
    tester = AeroEnglishTester()
    tester.run_all_tests()