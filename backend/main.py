from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import io
import json
import zipfile
import os
import pdfplumber
from pypdf import PdfReader, PdfWriter
from pydantic import BaseModel

from database import SessionLocal, init_db, LayoutSetting

app = FastAPI()

# Initialize Database
init_db()

# CORS settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for simplicity in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def clean_text(text: str) -> str:
    """Removes CIDs and other noise from text, handles whitespace for filenames."""
    if not text:
        return ""
    
    # Replace known faulty CIDs
    # (cid:16126) -> R (Example provided by user)
    text = text.replace("(cid:16126)", "R")
    
    # Generic CID removal (if any other remains, maybe replace with '?' or ''?)
    # CID usually looks like (cid:xxxx)
    import re
    text = re.sub(r'\(cid:\d+\)', '', text)
    
    return text.strip()

def normalize_text(text: str) -> str:
    """Removes all whitespace characters from text for loose matching."""
    if not text:
        return ""
    # Remove space, tab, newline, carriage return, full-width space
    return text.translate(str.maketrans('', '', ' \t\n\r\u3000'))

def remove_whitespace(text: str) -> str:
    """Removes all whitespace for filename usage."""
    if not text:
        return ""
    return "".join(text.split())

# Models
class ScanResultItem(BaseModel):
    page_number: int
    extracted_text: str
    layout_name: str
    confirmed_name: str
    should_merge: bool

# API Endpoints

@app.post("/api/extract_text")
async def extract_text_preview(
    x0: float = Form(...),
    y0: float = Form(...),
    x1: float = Form(...),
    y1: float = Form(...),
    file: UploadFile = File(...)
):
    """
    指定された座標範囲内のテキストを抽出して返すエンドポイント。
    プレビュー時の確認用。
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    contents = await file.read()
    pdf_file = io.BytesIO(contents)
    
    extracted_text = ""
    
    try:
        with pdfplumber.open(pdf_file) as pdf:
            if not pdf.pages:
                return {"text": ""}
            
            page = pdf.pages[0] # Preview usually shows the first page
            
            # Convert mm to points (1 mm = 2.83465 pt)
            scale = 2.83465
            
            # Area validation
            if x1 <= x0 or y1 <= y0:
                return {"text": "範囲指定が無効です (終了位置 > 開始位置)"}

            # pdfplumber uses (x0, top, x1, bottom)
            area = (
                x0 * scale,
                y0 * scale,
                x1 * scale,
                y1 * scale
            )
            
            try:
                cropped_page = page.crop(bbox=area)
                extracted_text_raw = cropped_page.extract_text() or ""
                extracted_text = clean_text(extracted_text_raw)
            except ValueError:
                # This usually happens if the crop area is completely outside the page bounds
                extracted_text = "指定範囲がページ外です"
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting text: {str(e)}")

    return {"text": extracted_text.strip()}

@app.post("/api/scan")
async def scan_pdf(
    file: UploadFile = File(...), 
    layout_ids: Optional[str] = Form(None), # Comma-separated string of IDs
    db: Session = Depends(get_db)
):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    contents = await file.read()
    pdf_file = io.BytesIO(contents)
    
    results = []
    
    # Get layout settings based on selection or all
    if layout_ids:
        try:
            ids = [int(x) for x in layout_ids.split(",") if x.strip()]
            layouts = db.query(LayoutSetting).filter(LayoutSetting.id.in_(ids)).all()
        except ValueError:
            # Fallback if parsing fails
            layouts = db.query(LayoutSetting).all()
    else:
        # If no specific IDs provided (e.g. from older clients, though here it's coupled), default to all checking?
        # Or maybe none? Let's default to all to be safe, but usually frontend sends empty string for none.
        # If frontend sends empty string "", ids list is empty, query returns empty list. Correct.
        # If frontend sends nothing (None), default to all.
        layouts = db.query(LayoutSetting).all()

    try:
        with pdfplumber.open(pdf_file) as pdf:
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text() or ""
                page_text_norm = normalize_text(page_text)
                detected_layout = "Unknown"
                extracted_name = ""
                found_keyword_text = ""

                # Layout detection logic
                for layout in layouts:
                    keyword_norm = normalize_text(layout.keyword)
                    if not keyword_norm:
                        continue

                    # Check if keyword exists in the page text first (optimization)
                    if keyword_norm in page_text_norm:
                        
                        # If keyword area is defined, check specifically in that area
                        if layout.keyword_x1 > 0 and layout.keyword_y1 > 0:
                            # Convert mm to points
                            scale = 2.83465
                            area = (
                                layout.keyword_x0 * scale,
                                layout.keyword_y0 * scale,
                                layout.keyword_x1 * scale,
                                layout.keyword_y1 * scale
                            )
                            try:
                                cropped_keyword_area = page.crop(area)
                                keyword_area_text = cropped_keyword_area.extract_text() or ""
                                keyword_area_text_norm = normalize_text(keyword_area_text)
                                
                                if keyword_norm not in keyword_area_text_norm:
                                    continue # Keyword not found in specific area, skip this layout
                                
                                # Store the actual text found in the keyword area for verification
                                found_keyword_text = keyword_area_text.strip()
                                
                            except Exception:
                                continue # Error cropping, skip
                        
                        detected_layout = layout.name
        
                        # Extract name based on coordinates
                        if layout.extract_x1 > 0 and layout.extract_y1 > 0:
                            # Convert mm to points (1 mm = 2.83465 pt)
                            scale = 2.83465
                            # pdfplumber uses (x0, top, x1, bottom)
                            area = (
                                layout.extract_x0 * scale, 
                                layout.extract_y0 * scale, 
                                layout.extract_x1 * scale, 
                                layout.extract_y1 * scale
                            )
                            try:
                                cropped_page = page.crop(area)
                                extracted_name_raw = cropped_page.extract_text() or ""
                                extracted_name = clean_text(extracted_name_raw)
                                extracted_name = remove_whitespace(extracted_name) # Ensure filename has no spaces
                            except Exception:
                                extracted_name = "" # Fallback
                        break
                
                # Default behavior if no layout detected or text extraction failed
                if detected_layout == "Unknown":
                   extracted_name = ""  # Force empty name for unknown layouts

                results.append({
                    "page_number": i + 1,
                    # extracted_text (for display/reference) can have spaces if desired, but user asked for "filename" space removal.
                    # Confirmed name is the one used for output filename.
                    "extracted_text": extracted_name, 
                    "layout_name": detected_layout,
                    "confirmed_name": extracted_name,
                    "should_merge": False, # Default to false
                    "found_keyword_text": found_keyword_text
                })
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

    return results

@app.post("/api/execute")
async def execute_split(
    file: UploadFile = File(...), 
    metadata: str = Form(...)  # JSON string of edited results
):
    try:
        items = json.loads(metadata)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid metadata JSON")

    contents = await file.read()
    input_pdf_stream = io.BytesIO(contents)
    
    try:
        reader = PdfReader(input_pdf_stream)
        
        # Logic to group pages
        # We need to iterate through items and group them.
        # If should_merge is true, it appends to the previous group.
        
        groups = []
        current_group = []
        
        # Sort items by page number just in case
        items.sort(key=lambda x: x['page_number'])

        for item in items:
            page_index = item['page_number'] - 1 # 0-based index for PdfReader
            
            if not item['should_merge'] or not groups: # If not merge or first item
                 # Start new group
                 current_group = {
                     "name": item['confirmed_name'],
                     "pages": [page_index]
                 }
                 groups.append(current_group)
            else:
                # Merge with previous group
                groups[-1]['pages'].append(page_index)

        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
            for group in groups:
                writer = PdfWriter()
                for p_idx in group['pages']:
                    writer.add_page(reader.pages[p_idx])
                
                # Sanitized filename
                filename = "".join([c for c in group['name'] if c.isalnum() or c in (' ', '-', '_')]).strip()
                if not filename:
                    filename = f"document_{group['pages'][0]+1}"
                
                pdf_out = io.BytesIO()
                writer.write(pdf_out)
                
                # Add to zip
                zip_file.writestr(f"{filename}.pdf", pdf_out.getvalue())

        zip_buffer.seek(0)
        
        return StreamingResponse(
            zip_buffer, 
            media_type="application/zip", 
            headers={"Content-Disposition": "attachment; filename=split_invoices.zip"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


# Settings API
class LayoutCreate(BaseModel):
    name: str
    keyword: str
    keyword_x0: float = 0.0
    keyword_y0: float = 0.0
    keyword_x1: float = 0.0
    keyword_y1: float = 0.0
    extract_x0: float = 0.0
    extract_y0: float = 0.0
    extract_x1: float = 0.0
    extract_y1: float = 0.0

@app.post("/api/settings")
def create_setting(setting: LayoutCreate, db: Session = Depends(get_db)):
    db_setting = LayoutSetting(**setting.dict())
    db.add(db_setting)
    db.commit()
    db.refresh(db_setting)
    return db_setting

@app.put("/api/settings/{setting_id}")
def update_setting(setting_id: int, setting: LayoutCreate, db: Session = Depends(get_db)):
    db_setting = db.query(LayoutSetting).filter(LayoutSetting.id == setting_id).first()
    if not db_setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    for key, value in setting.dict().items():
        setattr(db_setting, key, value)
    
    db.commit()
    db.refresh(db_setting)
    return db_setting

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    return db.query(LayoutSetting).all()

@app.delete("/api/settings/{setting_id}")
def delete_setting(setting_id: int, db: Session = Depends(get_db)):
    setting = db.query(LayoutSetting).filter(LayoutSetting.id == setting_id).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    db.delete(setting)
    db.commit()
    return {"message": "Deleted successfully"}

# Serve Frontend
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
