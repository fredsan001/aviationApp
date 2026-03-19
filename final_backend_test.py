#!/usr/bin/env python3
"""
Final comprehensive test for AeroEnglish Backend APIs
"""

import requests
import json

BACKEND_URL = "https://repeat-learn-speak.preview.emergentagent.com/api"
TEST_ACCESS_CODE = "TEST1234"

def test_endpoint(method, endpoint, data=None, files=None):
    """Test a specific endpoint and return result"""
    try:
        if method.upper() == 'GET':
            response = requests.get(f"{BACKEND_URL}{endpoint}")
        elif method.upper() == 'POST':
            if files:
                response = requests.post(f"{BACKEND_URL}{endpoint}", data=data, files=files)
            else:
                response = requests.post(f"{BACKEND_URL}{endpoint}", json=data)
        elif method.upper() == 'DELETE':
            response = requests.delete(f"{BACKEND_URL}{endpoint}")
        
        return {
            'status': response.status_code,
            'success': response.status_code < 400,
            'response': response.text[:200] if response.status_code >= 400 else 'OK'
        }
    except Exception as e:
        return {
            'status': 'ERROR',
            'success': False,
            'response': str(e)[:200]
        }

def main():
    print("🧪 Comprehensive Backend API Test Results")
    print("=" * 60)
    
    tests = [
        # Admin endpoints
        ('POST', '/admin/login', {'password': 'aero2024admin'}, None, "Admin login (valid)"),
        ('POST', '/admin/login', {'password': 'wrong'}, None, "Admin login (invalid)"),
        
        # Access codes
        ('GET', '/access-codes', None, None, "List access codes"),
        ('POST', '/access-codes/verify', {'code': 'TEST1234'}, None, "Verify valid code"),
        ('POST', '/access-codes/verify', {'code': 'INVALID'}, None, "Verify invalid code"),
        
        # Categories 
        ('GET', '/categories', None, None, "List categories"),
        ('POST', '/categories', {'name': 'Test Cat', 'description': 'Test'}, None, "Create category"),
        
        # Videos
        ('GET', '/videos', None, None, "List videos"),
        
        # User Progress - PROBLEMATIC
        ('GET', '/progress/TEST1234', None, None, "Get user progress"),
        ('POST', '/progress/TEST1234/test-vid', {'watched_count': 1}, None, "Update progress"),
    ]
    
    results = []
    for method, endpoint, data, files, description in tests:
        result = test_endpoint(method, endpoint, data, files)
        results.append((description, result))
        
        status_icon = "✅" if result['success'] else "❌"
        print(f"{status_icon} {description}: {result['status']}")
        if not result['success']:
            print(f"   Error: {result['response']}")
    
    print("\n" + "=" * 60)
    working = sum(1 for _, result in results if result['success'])
    total = len(results)
    print(f"SUMMARY: {working}/{total} endpoints working correctly")
    
    # Identify the critical issues
    critical_issues = []
    for desc, result in results:
        if not result['success'] and "progress" in desc.lower():
            critical_issues.append(f"• {desc}: MongoDB ObjectId serialization issue")
    
    if critical_issues:
        print("\n🚨 CRITICAL ISSUES FOUND:")
        for issue in critical_issues:
            print(issue)
    
    return len(critical_issues)

if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)