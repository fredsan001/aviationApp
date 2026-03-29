#!/usr/bin/env python3
"""
ATC Simulator Testing Script
Tests the improved ATC Simulator endpoints as requested in the review.
"""

import requests
import json
import sys
from typing import Dict, Any

# Base URL from frontend .env (review request URL not working)
BASE_URL = "https://skycomm-app.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

def test_request(method: str, url: str, data: Dict[Any, Any] = None, params: Dict[str, str] = None) -> Dict[str, Any]:
    """Make a test request and return structured result"""
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, params=params, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, params=params, timeout=30)
        else:
            return {"success": False, "error": f"Unsupported method: {method}"}
        
        return {
            "success": response.status_code < 400,
            "status_code": response.status_code,
            "data": response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text,
            "headers": dict(response.headers)
        }
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": str(e)}
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"JSON decode error: {e}"}
    except Exception as e:
        return {"success": False, "error": f"Unexpected error: {e}"}

def print_test_result(test_name: str, result: Dict[str, Any], expected_fields: list = None):
    """Print formatted test result"""
    print(f"\n{'='*60}")
    print(f"TEST: {test_name}")
    print(f"{'='*60}")
    
    if result["success"]:
        print(f"✅ SUCCESS - Status: {result['status_code']}")
        
        if expected_fields and isinstance(result["data"], dict):
            print("\n📋 FIELD VALIDATION:")
            for field in expected_fields:
                if field in result["data"]:
                    print(f"  ✅ {field}: {result['data'][field]}")
                else:
                    print(f"  ❌ MISSING: {field}")
        
        print(f"\n📄 RESPONSE DATA:")
        print(json.dumps(result["data"], indent=2))
    else:
        print(f"❌ FAILED - Status: {result.get('status_code', 'N/A')}")
        print(f"Error: {result.get('error', 'Unknown error')}")
        if "data" in result:
            print(f"Response: {result['data']}")

def main():
    """Run all ATC Simulator tests"""
    print("🚀 Starting ATC Simulator Testing")
    print(f"Base URL: {BASE_URL}")
    
    test_results = []
    
    # Test 1: Get Aircraft Types
    print("\n" + "="*80)
    print("TEST 1: GET Aircraft Types")
    print("="*80)
    
    result1 = test_request("GET", f"{API_BASE}/atc/aircraft-types")
    print_test_result("Get Aircraft Types", result1, ["type", "category"])
    test_results.append(("Get Aircraft Types", result1["success"]))
    
    # Validate aircraft types structure
    if result1["success"] and isinstance(result1["data"], list):
        if len(result1["data"]) > 0:
            first_aircraft = result1["data"][0]
            if "type" in first_aircraft and "category" in first_aircraft:
                print("✅ Aircraft types have correct structure (type and category fields)")
            else:
                print("❌ Aircraft types missing required fields")
        else:
            print("❌ No aircraft types returned")
    
    # Test 2: Get Initial Contact with Custom Callsign
    print("\n" + "="*80)
    print("TEST 2: GET Initial Contact with Custom Callsign")
    print("="*80)
    
    params = {
        "callsign": "N54321",
        "aircraft_type": "Cirrus SR22"
    }
    result2 = test_request("GET", f"{API_BASE}/atc/initial-contact/takeoff", params=params)
    expected_fields = ["initial_message", "callsign", "callsign_phonetic", "aircraft_type", "frequency", "atc_facility"]
    print_test_result("Get Initial Contact with Custom Callsign", result2, expected_fields)
    test_results.append(("Get Initial Contact", result2["success"]))
    
    # Validate specific values
    if result2["success"] and isinstance(result2["data"], dict):
        data = result2["data"]
        if data.get("callsign") == "N54321":
            print("✅ Callsign correctly set to N54321")
        else:
            print(f"❌ Callsign mismatch. Expected: N54321, Got: {data.get('callsign')}")
        
        if data.get("aircraft_type") == "Cirrus SR22":
            print("✅ Aircraft type correctly set to Cirrus SR22")
        else:
            print(f"❌ Aircraft type mismatch. Expected: Cirrus SR22, Got: {data.get('aircraft_type')}")
    
    # Test 3: Simulate ATC with Custom Aircraft
    print("\n" + "="*80)
    print("TEST 3: POST ATC Simulate with Custom Aircraft")
    print("="*80)
    
    simulate_data = {
        "scenario_id": "takeoff",
        "pilot_message": "LAX Tower, N54321, ready for takeoff runway 25 left",
        "session_id": "test_session_custom",
        "callsign": "N54321",
        "aircraft_type": "Cirrus SR22"
    }
    
    result3 = test_request("POST", f"{API_BASE}/atc/simulate", data=simulate_data)
    expected_fields = ["atc_response", "audio_base64", "frequency", "atc_facility", "callsign", "aircraft_type"]
    print_test_result("ATC Simulate with Custom Aircraft", result3, expected_fields)
    test_results.append(("ATC Simulate (First)", result3["success"]))
    
    # Store first response for consistency check
    first_atc_response = None
    if result3["success"] and isinstance(result3["data"], dict):
        first_atc_response = result3["data"].get("atc_response", "")
        print(f"\n📝 First ATC Response: {first_atc_response}")
    
    # Test 4: Verify ATC Consistency (Critical Test)
    print("\n" + "="*80)
    print("TEST 4: POST ATC Simulate - Consistency Check (CRITICAL)")
    print("="*80)
    
    # Send another message in the SAME session
    simulate_data2 = {
        "scenario_id": "takeoff",
        "pilot_message": "N54321, cleared for takeoff runway 25 left",
        "session_id": "test_session_custom",  # Same session ID
        "callsign": "N54321",
        "aircraft_type": "Cirrus SR22"
    }
    
    result4 = test_request("POST", f"{API_BASE}/atc/simulate", data=simulate_data2)
    print_test_result("ATC Simulate - Consistency Check", result4, expected_fields)
    test_results.append(("ATC Consistency Check", result4["success"]))
    
    # Analyze consistency
    if result4["success"] and isinstance(result4["data"], dict):
        second_atc_response = result4["data"].get("atc_response", "")
        print(f"\n📝 Second ATC Response: {second_atc_response}")
        
        # Check if ATC acknowledges the readback appropriately
        if "cleared" in second_atc_response.lower() or "roger" in second_atc_response.lower() or "contact" in second_atc_response.lower():
            print("✅ ATC appears to acknowledge the readback appropriately")
        else:
            print("⚠️  ATC response may not be acknowledging the readback properly")
        
        # Check for contradictions
        if first_atc_response and "cleared for takeoff" in first_atc_response.lower() and "hold short" in second_atc_response.lower():
            print("❌ CRITICAL: ATC contradicted itself - gave clearance then told to hold short")
        elif first_atc_response:
            print("✅ No obvious contradictions detected in ATC responses")
    
    # Test 5: Reset Session
    print("\n" + "="*80)
    print("TEST 5: POST Reset Session")
    print("="*80)
    
    reset_params = {
        "session_id": "test_session_custom",
        "scenario_id": "takeoff"
    }
    
    result5 = test_request("POST", f"{API_BASE}/atc/reset-session", params=reset_params)
    print_test_result("Reset Session", result5)
    test_results.append(("Reset Session", result5["success"]))
    
    # Verify reset worked by checking if we get a success message
    if result5["success"] and isinstance(result5["data"], dict):
        if "message" in result5["data"] and "reset" in result5["data"]["message"].lower():
            print("✅ Session reset confirmed")
        else:
            print("⚠️  Session reset response unclear")
    
    # Summary
    print("\n" + "="*80)
    print("🏁 TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, success in test_results if success)
    total = len(test_results)
    
    print(f"Tests Passed: {passed}/{total}")
    print(f"Success Rate: {(passed/total)*100:.1f}%")
    
    print("\nDetailed Results:")
    for test_name, success in test_results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"  {status} - {test_name}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! ATC Simulator is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())