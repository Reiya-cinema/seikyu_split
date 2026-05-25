import requests
import os

url = "http://127.0.0.1:8000/api/scan"
file_path = "sample/huge_test.pdf"

if not os.path.exists(file_path):
    print(f"Error: {file_path} not found.")
else:
    with open(file_path, "rb") as f:
        files = {"file": (os.path.basename(file_path), f, "application/pdf")}
        print(f"Sending {file_path} to {url}...")
        try:
            response = requests.post(url, files=files)
            print(f"Status Code: {response.status_code}")
            if response.status_code == 200:
                print("Success! Check server logs for memory usage.")
            else:
                print(f"Error: {response.text}")
        except Exception as e:
            print(f"Request failed: {e}")
