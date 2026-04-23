from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session
from typing import List, Optional
import io
import json
import zipfile
import os
import re
import gc
import tempfile
import shutil
import pdfplumber
from pypdf import PdfReader, PdfWriter
import ctypes
from pydantic import BaseModel

from database import SessionLocal, init_db, LayoutSetting

# Memory management helper
try:
    libc = ctypes.CDLL("libc.so.6")
except Exception:
    libc = None

def trim_memory():
    gc.collect()
    if libc:
        try:
            libc.malloc_trim(0)
        except Exception:
            pass

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
    """Handles whitespace for filenames, keeping original text as much as possible."""
    if not text:
        return ""
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

def process_extracted_text(parts: List[str], options: dict) -> str:
    separator = options.get('concat_separator', '_')
    if separator is None: separator = ''

    # Join
    text = separator.join([p for p in parts if p])
    
    # Process
    if options.get('remove_whitespace'):
        text = "".join(text.split())
        
    if options.get('uppercase'):
        text = text.upper()
        
    pattern = options.get('remove_pattern')
    if pattern:
        try:
            text = re.sub(pattern, "", text)
        except re.error:
            pass # Invalid regex
            
    return text

def extract_from_step(page, step: dict, scale: float = 2.83465):
    """
    Extracts text based on a single step configuration.
    Returns a dict with 'text' and 'bbox' (if applicable).
    bbox format: [x0, top, x1, bottom] in points (pdfplumber native)
    """
    step_type = step.get('type')
    result = {"text": "", "bbox": None}
    
    if step_type == 'coordinate':
        try:
            x0 = float(step.get('x0', 0))
            y0 = float(step.get('y0', 0))
            x1 = float(step.get('x1', 0))
            y1 = float(step.get('y1', 0))
            
            if x1 > x0 and y1 > y0:
                area = (x0 * scale, y0 * scale, x1 * scale, y1 * scale)
                cropped = page.crop(bbox=area)
                result["text"] = (cropped.extract_text() or "").strip()
                result["bbox"] = area
                return result
        except Exception:
            pass

    elif step_type == 'const':
        val = step.get('value', '')
        try:
            offset = int(step.get('offset', 0))
        except (ValueError, TypeError):
            offset = 0

        if not val:
            return result

        try:
            # Use extract_words to get text elements in reading order
            # x_tolerance and y_tolerance help group characters into words
            words = page.extract_words(x_tolerance=3, y_tolerance=3)
            
            # Find the first word that contains the anchor text
            anchor_idx = -1
            for i, w in enumerate(words):
                if val in w['text']:
                    anchor_idx = i
                    break
            
            # If anchor found, apply offset to the index
            if anchor_idx != -1:
                target_idx = anchor_idx + offset
                
                # Check boundaries
                if 0 <= target_idx < len(words):
                    target_word = words[target_idx]
                    result["text"] = target_word['text']
                    result["bbox"] = (
                        target_word['x0'], 
                        target_word['top'], 
                        target_word['x1'], 
                        target_word['bottom']
                    )
        except Exception:
            pass

    return result

def extract_from_pipeline(page, pipeline_config: dict, scale: float = 2.83465) -> str:
    extracted_parts = []
    
    extractions = pipeline_config.get('extractions', [])
    if not extractions:
        return ""
        
    for step in extractions:
        # We only need the text part here for the main pipeline logic
        res = extract_from_step(page, step, scale)
        extracted_parts.append(res["text"])
        
    return process_extracted_text(extracted_parts, pipeline_config.get('processing', {}))

# Models
class ScanResultItem(BaseModel):
    page_number: int
    # extracted_text: str
    layout_name: str
    confirmed_name: str
    should_merge: bool
    found_keyword_text: str
    # Add history field to store all checked layouts up to success or failure
    detection_log: List[str]

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
    
    extracted_text = ""
    
    # Create a temporary file to avoid loading everything into memory
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        try:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        finally:
            tmp.close()

    try:
        with pdfplumber.open(tmp_path) as pdf:
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
                extracted_text = remove_whitespace(extracted_text) # Apply same whitespace removal as production scan
            except ValueError:
                # This usually happens if the crop area is completely outside the page bounds
                extracted_text = "指定範囲がページ外です"
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting text: {str(e)}")
    finally:
        # Ensure the temp file is deleted
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        trim_memory()

    return {"text": extracted_text.strip()}

@app.post("/api/preview_layout")
async def preview_layout_analysis(
    file: UploadFile = File(...),
    layout_json: str = Form(...),
    page_number: int = Form(1)
):
    try:
        layout_data = json.loads(layout_json)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid layout JSON")

    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    # Create a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        try:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        finally:
            tmp.close()
    
    response = {
        "validation": [],
        "extractions": [],
        "validation_text": "",
        "extraction_text": ""
    }
    
    try:
        with pdfplumber.open(tmp_path) as pdf:
            if not pdf.pages:
                return response
            
            # Ensure page_number is within valid range
            target_page_index = max(0, min(page_number - 1, len(pdf.pages) - 1))
            page = pdf.pages[target_page_index]
            
            scale = 2.83465
            
            # --- Validation Steps Analysis ---
            pipeline_config = {}
            if layout_data.get('pipeline_config'):
                try:
                    pipeline_config = json.loads(layout_data['pipeline_config'])
                except:
                    pass
            
            # 1. Validation Steps
            validation_steps = pipeline_config.get('validation', {}).get('steps', [])
            val_texts = []
            
            if validation_steps:
                for step in validation_steps:
                    res = extract_from_step(page, step, scale)
                    val_texts.append(res['text'])
                    response['validation'].append({
                        "id": step.get('id'),
                        "bbox": res.get('bbox'), # [x0, top, x1, bottom]
                        "text": res.get('text')
                    })
            else:
                # Legacy Validation (Single Area)
                kw_x0 = float(layout_data.get('keyword_x0', 0))
                kw_x1 = float(layout_data.get('keyword_x1', 0))
                if kw_x1 > kw_x0:
                     # Simulate a step
                     dummy_step = {
                         "type": "coordinate",
                         "x0": layout_data.get('keyword_x0'),
                         "y0": layout_data.get('keyword_y0'),
                         "x1": layout_data.get('keyword_x1'),
                         "y1": layout_data.get('keyword_y1')
                     }
                     res = extract_from_step(page, dummy_step, scale)
                     val_texts.append(res['text'])
                     response['validation'].append({
                        "id": "legacy_validation",
                        "bbox": res.get('bbox'),
                        "text": res.get('text')
                    })
            
            response['validation_text'] = "".join(val_texts) # Simple join for preview

            # 2. Extraction Steps
            extraction_steps = pipeline_config.get('extractions', [])
            ext_texts = []
            
            if extraction_steps:
                for step in extraction_steps:
                    res = extract_from_step(page, step, scale)
                    ext_texts.append(res['text'])
                    response['extractions'].append({
                        "id": step.get('id'),
                        "bbox": res.get('bbox'),
                        "text": res.get('text')
                    })
            else:
                # Legacy Extraction
                ex_x0 = float(layout_data.get('extract_x0', 0))
                ex_x1 = float(layout_data.get('extract_x1', 0))
                if ex_x1 > ex_x0:
                     dummy_step = {
                         "type": "coordinate",
                         "x0": layout_data.get('extract_x0'),
                         "y0": layout_data.get('extract_y0'),
                         "x1": layout_data.get('extract_x1'),
                         "y1": layout_data.get('extract_y1')
                     }
                     res = extract_from_step(page, dummy_step, scale)
                     ext_texts.append(res['text'])
                     response['extractions'].append({
                        "id": "legacy_extraction",
                        "bbox": res.get('bbox'),
                        "text": res.get('text')
                    })
            
            # Use processing rules for final text
            response['extraction_text'] = process_extracted_text(ext_texts, pipeline_config.get('processing', {}))
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error previewing layout: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        trim_memory()
        
    return response

@app.post("/api/scan")
async def scan_pdf(
    file: UploadFile = File(...), 
    layout_ids: Optional[str] = Form(None), # Comma-separated string of IDs
    db: Session = Depends(get_db)
):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    # Create a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        try:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        finally:
            tmp.close()
    
    results = []
    
    # Get layout settings based on selection or all
    if layout_ids:
        try:
            ids = [int(x) for x in layout_ids.split(",") if x.strip()]
            layouts = db.query(LayoutSetting).filter(LayoutSetting.id.in_(ids)).all()
        except ValueError:
            layouts = db.query(LayoutSetting).all()
    else:
        layouts = db.query(LayoutSetting).all()

    try:
        with pdfplumber.open(tmp_path) as pdf:
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text() or ""
                page_text_norm = normalize_text(page_text)
                detected_layout = "Unknown"
                extracted_name = ""
                found_keyword_text = ""
                detection_log = []

                # Layout detection logic
                for layout in layouts:
                    keyword_norm = normalize_text(layout.keyword)
                    if not keyword_norm:
                        continue

                    # Optimization: Check if keyword exists in page text first
                    if keyword_norm not in page_text_norm:
                        continue

                    # Parse Pipeline Config
                    try:
                        pipeline_cfg = json.loads(layout.pipeline_config or '{}')
                    except Exception:
                        pipeline_cfg = {}
                    
                    validation_steps = pipeline_cfg.get('validation', {}).get('steps', [])
                    scale = 2.83465
                    match_found = False
                    found_text_sample = ""

                    # 1. Validation via Steps (New)
                    if validation_steps:
                        # Use extraction logic to get text for validation
                        # Use a temporary config that just joins text
                        val_config = {
                            'extractions': validation_steps,
                            'processing': {'concat_separator': ''} 
                        }
                        
                        try:
                            extracted_val = extract_from_pipeline(page, val_config, scale)
                            extracted_val_norm = normalize_text(extracted_val)
                            
                            if keyword_norm in extracted_val_norm:
                                match_found = True
                                found_text_sample = extracted_val.strip()
                        except Exception:
                            pass

                    # 2. Validation via Coordinates (Legacy)
                    elif layout.keyword_x1 > 0 and layout.keyword_y1 > 0:
                        area = (
                            layout.keyword_x0 * scale,
                            layout.keyword_y0 * scale,
                            layout.keyword_x1 * scale,
                            layout.keyword_y1 * scale
                        )
                        try:
                            cropped = page.crop(area)
                            extracted_val = cropped.extract_text() or ""
                            extracted_val_norm = normalize_text(extracted_val)
                            
                            if keyword_norm in extracted_val_norm:
                                match_found = True
                                found_text_sample = extracted_val.strip()
                        except Exception:
                            pass

                    # 3. Text Match (Fallback / No-Coordinates)
                    else:
                        # Since we already checked page_text_norm, this is a match
                        match_found = True
                        found_text_sample = layout.keyword 

                    if match_found:
                        detected_layout = layout.name
                        found_keyword_text = found_text_sample
                        
                        # Perform Extraction (Filename)
                        extraction_steps = pipeline_cfg.get('extractions', [])
                        
                        if extraction_steps:
                             extracted_name = extract_from_pipeline(page, pipeline_cfg, scale)
                        
                        # Legacy extraction fallback
                        elif layout.extract_x1 > 0 and layout.extract_y1 > 0:
                             area = (
                                 layout.extract_x0 * scale, 
                                 layout.extract_y0 * scale, 
                                 layout.extract_x1 * scale, 
                                 layout.extract_y1 * scale
                             )
                             try:
                                 extracted_name = page.crop(area).extract_text() or ""
                             except:
                                 extracted_name = ""
                        
                        extracted_name = clean_text(extracted_name)
                        extracted_name = remove_whitespace(extracted_name)
                        
                        detection_log.append(f"SUCCESS: Layout '{layout.name}' matched. Found text: '{found_keyword_text}'")
                        break # Stop checking other layouts
                
                if detected_layout == "Unknown":
                   detection_log.append("No layout matched.")

                results.append({
                    "page_number": i + 1,
                    "extracted_text": extracted_name, 
                    "layout_name": detected_layout,
                    "confirmed_name": extracted_name,
                    "should_merge": False,
                    "found_keyword_text": found_keyword_text,
                    "detection_log": detection_log
                })
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        trim_memory()

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

    # Create a temporary file for the input
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        try:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        finally:
            tmp.close()
    
    # Create a temporary file for the ZIP output
    tmp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp_zip_path = tmp_zip.name
    tmp_zip.close() # Will reopen with zipfile

    try:
        reader = PdfReader(tmp_path)
        
        # Logic to group pages
        groups = []
        for item in items:
            page_index = item['page_number'] - 1
            
            if item.get('should_merge', False) and groups:
                groups[-1]['pages'].append(page_index)
            else:
                 groups.append({
                     "name": item.get('confirmed_name', 'Unknown'),
                     "pages": [page_index]
                 })

        with zipfile.ZipFile(tmp_zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for group in groups:
                writer = PdfWriter()
                for p_idx in group['pages']:
                    writer.add_page(reader.pages[p_idx])
                
                # Sanitized filename
                filename = "".join([c for c in group['name'] if c.isalnum() or c in (' ', '-', '_')]).strip()
                if not filename:
                    filename = f"document_{group['pages'][0]+1}"
                
                # Create a temporary file for each split PDF to avoid memory buildup
                with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as split_tmp:
                    try:
                        writer.write(split_tmp)
                        split_tmp_path = split_tmp.name
                    finally:
                        split_tmp.close()
                    
                    zip_file.write(split_tmp_path, f"{filename}.pdf")
                    os.remove(split_tmp_path)
                
                del writer

        # Cleanup function for background
        def cleanup():
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            if os.path.exists(tmp_zip_path):
                os.remove(tmp_zip_path)
            trim_memory()

        return FileResponse(
            tmp_zip_path, 
            media_type="application/zip", 
            filename="split_invoices.zip",
            background=BackgroundTask(cleanup)
        )

    except Exception as e:
        # Immediate cleanup on error
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if os.path.exists(tmp_zip_path):
            os.remove(tmp_zip_path)
        trim_memory()
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
    pipeline_config: Optional[str] = "{}"

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

@app.post("/api/settings/import")
def import_settings(settings: List[LayoutCreate], db: Session = Depends(get_db)):
    added_settings = []
    try:
        for s in settings:
            db_setting = LayoutSetting(**s.dict())
            db.add(db_setting)
            db.commit()
            db.refresh(db_setting)
            added_settings.append(db_setting)
        return added_settings
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

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
