import pdfplumber
import os

file_path = "sample/末締め請求書 分割前.pdf"
if os.path.exists(file_path):
    with pdfplumber.open(file_path) as pdf:
        print(f"File: {file_path}")
        print(f"Total Pages: {len(pdf.pages)}")
else:
    print(f"Error: {file_path} not found.")
