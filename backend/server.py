from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi.responses import StreamingResponse, Response
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import base64
import aiofiles
import asyncio
import time

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create uploads directory
UPLOADS_DIR = ROOT_DIR / 'uploads'
UPLOADS_DIR.mkdir(exist_ok=True)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== Models ==============

class Subtitle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    start_time: float  # seconds
    end_time: float  # seconds
    text: str

class Video(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    category: str = "General"
    video_filename: str  # Stored filename
    duration: float = 0  # seconds
    subtitles: List[Subtitle] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_processing: bool = False
    processing_status: str = ""
    categories: List[str] = []  # Multiple categories support

class VideoCreate(BaseModel):
    title: str
    description: str = ""
    category: str = "General"
    categories: List[str] = []

class VideoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    categories: Optional[List[str]] = None
    subtitles: Optional[List[dict]] = None

class SubtitleCreate(BaseModel):
    start_time: float
    end_time: float
    text: str

class AccessCode(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    client_name: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None

class AccessCodeCreate(BaseModel):
    client_name: str
    code: Optional[str] = None  # If not provided, will be auto-generated
    expires_at: Optional[datetime] = None

class AccessCodeVerify(BaseModel):
    code: str
    device_id: Optional[str] = None  # Unique device identifier

class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CategoryCreate(BaseModel):
    name: str
    description: str = ""

class UserProgress(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    access_code: str
    video_id: str
    watched_count: int = 0
    last_position: float = 0
    is_favorite: bool = False
    completed: bool = False
    ready_for_evaluation: bool = False
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserProgressUpdate(BaseModel):
    watched_count: Optional[int] = None
    last_position: Optional[float] = None
    is_favorite: Optional[bool] = None
    completed: Optional[bool] = None
    ready_for_evaluation: Optional[bool] = None

# ============== Helper Functions ==============

def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable format"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if key == '_id':
                continue  # Skip MongoDB _id field
            elif hasattr(value, 'isoformat'):  # datetime
                result[key] = value.isoformat()
            elif isinstance(value, list):
                result[key] = serialize_doc(value)
            elif isinstance(value, dict):
                result[key] = serialize_doc(value)
            else:
                result[key] = value
        return result
    return doc

def generate_access_code():
    """Generate a unique access code"""
    import random
    import string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

async def compress_video(input_path: str, output_path: str, video_id: str) -> bool:
    """Compress video to 720p resolution with optimized settings"""
    try:
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {"processing_status": "Compressing video...", "processing_progress": 5}}
        )
        
        # Compress to 720p, use H.264 codec with reasonable quality
        # -crf 23 is good quality, -preset fast is reasonable speed
        process = await asyncio.create_subprocess_exec(
            '/usr/bin/ffmpeg', '-i', input_path,
            '-vf', 'scale=-2:720',  # Scale to 720p height, maintain aspect ratio
            '-c:v', 'libx264',
            '-crf', '23',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',  # Enable streaming
            '-y', output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            logger.error(f"Video compression failed: {stderr.decode()[:200]}")
            return False
        
        return os.path.exists(output_path)
    except Exception as e:
        logger.error(f"Video compression error: {e}")
        return False

async def transcribe_video_audio(video_id: str, video_path: str):
    """Background task to transcribe video audio using OpenAI Whisper"""
    try:
        logger.info(f"Starting transcription for video {video_id}")
        
        # Update status to processing
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {"is_processing": True, "processing_status": "Extracting audio...", "processing_progress": 10}}
        )
        
        # Extract audio from video using ffmpeg
        audio_path = str(video_path).replace('.mp4', '.mp3').replace('.mov', '.mp3').replace('.webm', '.mp3')
        if audio_path == video_path:
            audio_path = video_path + '.mp3'
        
        # Use ffmpeg to extract audio
        process = await asyncio.create_subprocess_exec(
            '/usr/bin/ffmpeg', '-i', video_path, '-vn', '-acodec', 'libmp3lame', '-y', audio_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise Exception(f"FFmpeg audio extraction failed: {stderr.decode()[:200]}")
        
        if not os.path.exists(audio_path):
            raise Exception("Failed to extract audio from video")
        
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {"processing_status": "Transcribing with AI...", "processing_progress": 40}}
        )
        
        # Transcribe using OpenAI Whisper
        from emergentintegrations.llm.openai import OpenAISpeechToText
        
        stt = OpenAISpeechToText(api_key=os.getenv("EMERGENT_LLM_KEY"))
        
        with open(audio_path, "rb") as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="verbose_json",
                language="en",
                prompt="This is aviation radio communication in English. Include technical aviation terminology.",
                timestamp_granularities=["segment"]
            )
        
        # Parse subtitles from segments
        subtitles = []
        if hasattr(response, 'segments') and response.segments:
            for segment in response.segments:
                subtitle = Subtitle(
                    start_time=segment.start if hasattr(segment, 'start') else segment.get('start', 0),
                    end_time=segment.end if hasattr(segment, 'end') else segment.get('end', 0),
                    text=segment.text if hasattr(segment, 'text') else segment.get('text', '')
                )
                subtitles.append(subtitle.dict())
        else:
            # If no segments, create a single subtitle with the full text
            subtitles.append(Subtitle(
                start_time=0,
                end_time=60,  # Default
                text=response.text if hasattr(response, 'text') else str(response)
            ).dict())
        
        # Update video with subtitles
        await db.videos.update_one(
            {"id": video_id},
            {
                "$set": {
                    "subtitles": subtitles,
                    "is_processing": False,
                    "processing_status": "Completed",
                    "processing_progress": 100
                }
            }
        )
        
        # Clean up audio file
        if os.path.exists(audio_path):
            os.remove(audio_path)
        
        logger.info(f"Transcription completed for video {video_id}")
        
    except Exception as e:
        logger.error(f"Transcription failed for video {video_id}: {str(e)}")
        await db.videos.update_one(
            {"id": video_id},
            {
                "$set": {
                    "is_processing": False,
                    "processing_status": f"Error: {str(e)}"
                }
            }
        )

# ============== API Routes ==============

@api_router.get("/")
async def root():
    return {"message": "AeroEnglish API - Aviation Communication Learning Platform"}

# ------------ Admin Auth (Simple) ------------

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "aero2024admin")

class AdminLogin(BaseModel):
    password: str

@api_router.post("/admin/login")
async def admin_login(login: AdminLogin):
    if login.password == ADMIN_PASSWORD:
        return {"success": True, "message": "Admin authenticated"}
    raise HTTPException(status_code=401, detail="Invalid admin password")

# ------------ Categories ------------

@api_router.post("/categories", response_model=Category)
async def create_category(category: CategoryCreate):
    category_obj = Category(**category.dict())
    await db.categories.insert_one(category_obj.dict())
    return category_obj

@api_router.get("/categories", response_model=List[Category])
async def get_categories():
    categories = await db.categories.find().to_list(100)
    return [Category(**cat) for cat in categories]

class CategoryOrderUpdate(BaseModel):
    categories: List[dict]  # List of {id, order}

# IMPORTANT: This route MUST be defined BEFORE the dynamic /{category_id} route
@api_router.put("/categories/order")
async def update_category_order(data: CategoryOrderUpdate):
    """Update the order of all categories"""
    for cat in data.categories:
        await db.categories.update_one(
            {"id": cat["id"]},
            {"$set": {"order": cat["order"]}}
        )
    return {"message": "Category order updated"}

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

@api_router.put("/categories/{category_id}")
async def update_category(category_id: str, data: dict):
    """Update a category's name and description"""
    update_data = {}
    if "name" in data:
        update_data["name"] = data["name"]
    if "description" in data:
        update_data["description"] = data["description"]
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.categories.update_one(
        {"id": category_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    updated = await db.categories.find_one({"id": category_id})
    return Category(**updated)

# ------------ Videos ------------

@api_router.post("/videos")
async def create_video(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form("General"),
    categories: str = Form("[]"),  # JSON string of categories array
    auto_transcribe: str = Form("true"),
    file: UploadFile = File(...)
):
    """Upload a video with optional automatic transcription"""
    
    # Parse categories from JSON string
    try:
        categories_list = json.loads(categories) if categories else []
    except:
        categories_list = [category] if category else []
    
    # Ensure at least one category
    if not categories_list and category:
        categories_list = [category]
    
    # Parse auto_transcribe as boolean
    should_transcribe = auto_transcribe.lower() in ['true', '1', 'yes']
    
    # Validate file type - be more flexible with content types
    allowed_types = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'application/octet-stream']
    allowed_extensions = ['.mp4', '.webm', '.mov', '.avi']
    
    file_ext = os.path.splitext(file.filename or '')[1].lower()
    content_type_valid = file.content_type in allowed_types
    extension_valid = file_ext in allowed_extensions
    
    if not (content_type_valid or extension_valid):
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Allowed: mp4, webm, mov, avi. Got: {file.content_type}, ext: {file_ext}"
        )
    
    # Use extension to determine actual type if content_type is generic
    if file_ext == '':
        file_ext = '.mp4'  # Default
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = UPLOADS_DIR / unique_filename
    temp_path = UPLOADS_DIR / f"temp_{unique_filename}"
    
    # Save file temporarily first
    async with aiofiles.open(temp_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    # Create video record early to track progress
    video_id = str(uuid.uuid4())
    video = Video(
        id=video_id,
        title=title,
        description=description,
        category=category,
        categories=categories_list,
        video_filename=unique_filename,
        duration=0,
        is_processing=True,
        processing_status="Compressing video...",
        processing_progress=0
    )
    await db.videos.insert_one(video.dict())
    
    # Compress video in background
    async def process_video():
        try:
            # Compress the video
            compressed = await compress_video(str(temp_path), str(file_path), video_id)
            
            if compressed:
                # Remove temp file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            else:
                # If compression failed, just rename temp file
                import shutil
                shutil.move(str(temp_path), str(file_path))
            
            # Get video duration
            duration = 0
            try:
                result = await asyncio.create_subprocess_exec(
                    '/usr/bin/ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                    '-of', 'default=noprint_wrappers=1:nokey=1', str(file_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, _ = await result.communicate()
                duration = float(stdout.decode().strip()) if stdout.decode().strip() else 0
            except Exception as e:
                logger.warning(f"Could not get video duration: {e}")
            
            # Update video record
            await db.videos.update_one(
                {"id": video_id},
                {"$set": {"duration": duration}}
            )
            
            # Start transcription if requested
            if should_transcribe:
                await transcribe_video_audio(video_id, str(file_path))
            else:
                await db.videos.update_one(
                    {"id": video_id},
                    {"$set": {"is_processing": False, "processing_status": "", "processing_progress": 100}}
                )
        except Exception as e:
            logger.error(f"Video processing error: {e}")
            await db.videos.update_one(
                {"id": video_id},
                {"$set": {"is_processing": False, "processing_status": f"Error: {str(e)}", "processing_progress": 0}}
            )
    
    background_tasks.add_task(process_video)
    
    return video.dict()

@api_router.get("/videos", response_model=List[dict])
async def get_videos(category: Optional[str] = None):
    query = {}
    if category:
        query["category"] = category
    videos = await db.videos.find(query).sort("created_at", -1).to_list(1000)
    return serialize_doc(videos)

@api_router.get("/videos/{video_id}")
async def get_video(video_id: str):
    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return serialize_doc(video)

@api_router.put("/videos/{video_id}")
async def update_video(video_id: str, update: VideoUpdate):
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.videos.update_one({"id": video_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Video not found")
    
    video = await db.videos.find_one({"id": video_id})
    return serialize_doc(video)

@api_router.delete("/videos/{video_id}")
async def delete_video(video_id: str):
    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Delete file
    file_path = UPLOADS_DIR / video['video_filename']
    if file_path.exists():
        os.remove(file_path)
    
    await db.videos.delete_one({"id": video_id})
    return {"message": "Video deleted"}

@api_router.get("/videos/{video_id}/stream")
async def stream_video(video_id: str, request: Request):
    """Stream video file with proper Range Request support for iOS/Safari"""
    from fastapi.responses import Response
    
    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    file_path = UPLOADS_DIR / video['video_filename']
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
    
    # Determine content type
    ext = file_path.suffix.lower()
    content_types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo'
    }
    content_type = content_types.get(ext, 'video/mp4')
    
    # Get file size
    file_size = os.path.getsize(file_path)
    
    # Check for Range header (required for iOS video playback)
    range_header = request.headers.get('range')
    
    if range_header:
        # Parse range header
        range_match = range_header.replace('bytes=', '').split('-')
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] else file_size - 1
        
        # Ensure valid range
        if start >= file_size:
            start = 0
        if end >= file_size:
            end = file_size - 1
        
        content_length = end - start + 1
        
        # Read the requested range
        with open(file_path, 'rb') as f:
            f.seek(start)
            content = f.read(content_length)
        
        # Return 206 Partial Content
        return Response(
            content=content,
            status_code=206,
            media_type=content_type,
            headers={
                'Content-Range': f'bytes {start}-{end}/{file_size}',
                'Accept-Ranges': 'bytes',
                'Content-Length': str(content_length),
                'Content-Disposition': f'inline; filename="{video["video_filename"]}"',
                'Cache-Control': 'no-cache',
            }
        )
    else:
        # No range requested - return full file
        with open(file_path, 'rb') as f:
            content = f.read()
        
        return Response(
            content=content,
            media_type=content_type,
            headers={
                'Accept-Ranges': 'bytes',
                'Content-Length': str(file_size),
                'Content-Disposition': f'inline; filename="{video["video_filename"]}"',
                'Cache-Control': 'no-cache',
            }
        )

# ------------ Subtitles (Manual) ------------

@api_router.post("/videos/{video_id}/subtitles")
async def add_subtitle(video_id: str, subtitle: SubtitleCreate):
    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    subtitle_obj = Subtitle(**subtitle.dict())
    
    await db.videos.update_one(
        {"id": video_id},
        {"$push": {"subtitles": subtitle_obj.dict()}}
    )
    
    return subtitle_obj

# ------------ Video Thumbnail ------------

@api_router.get("/videos/{video_id}/thumbnail")
async def get_video_thumbnail(video_id: str):
    """Generate and return a thumbnail from the video"""
    import subprocess
    
    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    file_path = UPLOADS_DIR / video['video_filename']
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
    
    # Generate thumbnail path
    thumbnail_path = UPLOADS_DIR / f"{video_id}_thumb.jpg"
    
    # Generate thumbnail if it doesn't exist
    if not thumbnail_path.exists():
        try:
            # Extract frame at 1 second (or beginning if video is shorter)
            subprocess.run([
                'ffmpeg', '-i', str(file_path),
                '-ss', '00:00:01',
                '-vframes', '1',
                '-vf', 'scale=320:-1',
                '-y', str(thumbnail_path)
            ], capture_output=True, timeout=30)
        except Exception as e:
            logger.error(f"Error generating thumbnail: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate thumbnail")
    
    if not thumbnail_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not available")
    
    with open(thumbnail_path, 'rb') as f:
        content = f.read()
    
    return Response(
        content=content,
        media_type='image/jpeg',
        headers={'Cache-Control': 'max-age=86400'}
    )

# ------------ Subtitle Translation ------------

class TranslateRequest(BaseModel):
    target_language: str = "es"  # Default Spanish

@api_router.post("/videos/{video_id}/translate-subtitles")
async def translate_subtitles(video_id: str, req: TranslateRequest):
    """Translate subtitles to another language using AI"""
    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    if not video.get('subtitles') or len(video['subtitles']) == 0:
        raise HTTPException(status_code=400, detail="No subtitles to translate")
    
    try:
        from emergentintegrations.llm.openai import OpenAIChat, OpenAIModel
        
        chat = OpenAIChat(api_key=os.getenv("EMERGENT_LLM_KEY"))
        
        # Prepare subtitles for translation
        subtitles_text = "\n".join([
            f"{i+1}. {s['text']}" 
            for i, s in enumerate(video['subtitles'])
        ])
        
        language_names = {
            "es": "Spanish",
            "en": "English",
            "fr": "French",
            "de": "German",
            "pt": "Portuguese",
            "it": "Italian"
        }
        target_lang = language_names.get(req.target_language, "Spanish")
        
        prompt = f"""Translate the following aviation communication subtitles to {target_lang}. 
Keep the same numbering format. Only provide the translations, no explanations.

{subtitles_text}"""
        
        response = await chat.chat(
            model=OpenAIModel.GPT4O,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000
        )
        
        # Parse translated subtitles
        translated_lines = response.strip().split('\n')
        translated_subtitles = []
        
        for i, subtitle in enumerate(video['subtitles']):
            translated_text = subtitle['text']  # Default to original
            
            # Try to find matching translation
            for line in translated_lines:
                if line.startswith(f"{i+1}."):
                    translated_text = line.split('.', 1)[1].strip()
                    break
            
            translated_subtitles.append({
                **subtitle,
                'text_translated': translated_text,
                'original_text': subtitle['text']
            })
        
        # Update video with translations
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {
                "subtitles_translated": translated_subtitles,
                "translation_language": req.target_language
            }}
        )
        
        return {"message": "Subtitles translated successfully", "language": req.target_language}
        
    except Exception as e:
        logger.error(f"Translation error: {e}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

@api_router.put("/videos/{video_id}/subtitles/{subtitle_id}")
async def update_subtitle(video_id: str, subtitle_id: str, subtitle: SubtitleCreate):
    result = await db.videos.update_one(
        {"id": video_id, "subtitles.id": subtitle_id},
        {"$set": {
            "subtitles.$.start_time": subtitle.start_time,
            "subtitles.$.end_time": subtitle.end_time,
            "subtitles.$.text": subtitle.text
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Subtitle not found")
    return {"message": "Subtitle updated"}

@api_router.delete("/videos/{video_id}/subtitles/{subtitle_id}")
async def delete_subtitle(video_id: str, subtitle_id: str):
    result = await db.videos.update_one(
        {"id": video_id},
        {"$pull": {"subtitles": {"id": subtitle_id}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Video not found")
    return {"message": "Subtitle deleted"}

@api_router.post("/videos/{video_id}/retranscribe")
async def retranscribe_video(video_id: str, background_tasks: BackgroundTasks):
    """Retry transcription for a video"""
    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    file_path = UPLOADS_DIR / video['video_filename']
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
    
    # Clear existing subtitles and start new transcription
    await db.videos.update_one(
        {"id": video_id},
        {"$set": {
            "subtitles": [],
            "is_processing": True,
            "processing_status": "Queued for re-transcription"
        }}
    )
    
    background_tasks.add_task(transcribe_video_audio, video_id, str(file_path))
    return {"message": "Re-transcription started"}

# ------------ Access Codes ------------

@api_router.post("/access-codes", response_model=AccessCode)
async def create_access_code(code_data: AccessCodeCreate):
    code = code_data.code if code_data.code else generate_access_code()
    
    # Check if code already exists
    existing = await db.access_codes.find_one({"code": code})
    if existing:
        raise HTTPException(status_code=400, detail="Access code already exists")
    
    access_code = AccessCode(
        code=code,
        client_name=code_data.client_name,
        expires_at=code_data.expires_at
    )
    
    await db.access_codes.insert_one(access_code.dict())
    return access_code

@api_router.get("/access-codes", response_model=List[AccessCode])
async def get_access_codes():
    codes = await db.access_codes.find().to_list(1000)
    return [AccessCode(**code) for code in codes]

@api_router.post("/access-codes/verify")
async def verify_access_code(verify: AccessCodeVerify):
    code = await db.access_codes.find_one({"code": verify.code, "is_active": True})
    
    # Log login attempt
    login_record = {
        "id": str(uuid.uuid4()),
        "access_code": verify.code,
        "device_id": verify.device_id,
        "timestamp": datetime.utcnow(),
        "success": False,
        "failure_reason": None,
        "ip_address": None,  # Could be added via request headers
    }
    
    if not code:
        login_record["failure_reason"] = "Invalid or inactive access code"
        await db.login_history.insert_one(login_record)
        raise HTTPException(status_code=401, detail="Invalid or inactive access code")
    
    # Check expiration
    if code.get('expires_at'):
        if datetime.utcnow() > code['expires_at']:
            login_record["failure_reason"] = "Access code expired"
            await db.login_history.insert_one(login_record)
            raise HTTPException(status_code=401, detail="Access code has expired")
    
    # Single device enforcement
    if verify.device_id:
        registered_device = code.get('registered_device_id')
        
        if registered_device and registered_device != verify.device_id:
            # Different device trying to login - log as failed attempt
            login_record["failure_reason"] = f"Device blocked - registered: {registered_device[:8]}..., attempted: {verify.device_id[:8]}..."
            await db.login_history.insert_one(login_record)
            raise HTTPException(
                status_code=403, 
                detail="DEVICE_BLOCKED: Este código ya está registrado en otro dispositivo. Contacta al administrador para liberarlo."
            )
        
        # Register this device if not already registered
        if not registered_device:
            await db.access_codes.update_one(
                {"code": verify.code},
                {"$set": {
                    "registered_device_id": verify.device_id,
                    "device_registered_at": datetime.utcnow()
                }}
            )
    
    # Successful login
    login_record["success"] = True
    await db.login_history.insert_one(login_record)
    
    # Update last login time
    await db.access_codes.update_one(
        {"code": verify.code},
        {"$set": {"last_login_at": datetime.utcnow()}}
    )
    
    return {"valid": True, "client_name": code['client_name']}

@api_router.put("/access-codes/{code_id}/release-device")
async def release_device(code_id: str):
    """Admin: Release the registered device for an access code"""
    result = await db.access_codes.update_one(
        {"id": code_id},
        {"$unset": {"registered_device_id": "", "device_registered_at": ""}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Access code not found")
    return {"message": "Device released successfully"}

@api_router.put("/access-codes/{code_id}/toggle")
async def toggle_access_code(code_id: str):
    code = await db.access_codes.find_one({"id": code_id})
    if not code:
        raise HTTPException(status_code=404, detail="Access code not found")
    
    new_status = not code['is_active']
    await db.access_codes.update_one({"id": code_id}, {"$set": {"is_active": new_status}})
    return {"is_active": new_status}

@api_router.delete("/access-codes/{code_id}")
async def delete_access_code(code_id: str):
    result = await db.access_codes.delete_one({"id": code_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Access code not found")
    return {"message": "Access code deleted"}

# ------------ Student Profile & Login History ------------

class StudentProfileUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    full_name: Optional[str] = None

@api_router.get("/access-codes/{code_id}/details")
async def get_access_code_details(code_id: str):
    """Get detailed info about an access code including device and login history"""
    code = await db.access_codes.find_one({"id": code_id})
    if not code:
        raise HTTPException(status_code=404, detail="Access code not found")
    
    # Get login history
    login_history = await db.login_history.find(
        {"access_code": code["code"]}
    ).sort("timestamp", -1).limit(50).to_list(50)
    
    # Count successful vs failed
    total_logins = len(login_history)
    successful_logins = len([l for l in login_history if l.get("success")])
    failed_attempts = total_logins - successful_logins
    
    return {
        **serialize_doc(code),
        "login_history": serialize_doc(login_history),
        "stats": {
            "total_logins": total_logins,
            "successful_logins": successful_logins,
            "failed_attempts": failed_attempts
        }
    }

@api_router.put("/access-codes/{code_id}/profile")
async def update_student_profile(code_id: str, profile: StudentProfileUpdate):
    """Update student profile info (email, phone, notes)"""
    update_data = {}
    if profile.email is not None:
        update_data["student_email"] = profile.email
    if profile.phone is not None:
        update_data["student_phone"] = profile.phone
    if profile.notes is not None:
        update_data["student_notes"] = profile.notes
    if profile.full_name is not None:
        update_data["student_full_name"] = profile.full_name
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.access_codes.update_one(
        {"id": code_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Access code not found")
    
    return {"message": "Profile updated successfully"}

@api_router.get("/admin/login-history")
async def get_all_login_history(limit: int = 100):
    """Get recent login history across all users"""
    history = await db.login_history.find().sort("timestamp", -1).limit(limit).to_list(limit)
    return serialize_doc(history)

@api_router.get("/admin/failed-attempts")
async def get_failed_attempts(limit: int = 50):
    """Get recent failed login attempts"""
    history = await db.login_history.find(
        {"success": False}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    return serialize_doc(history)

# ------------ User Progress ------------

@api_router.get("/progress/{access_code}")
async def get_user_progress(access_code: str):
    progress = await db.user_progress.find({"access_code": access_code}).to_list(1000)
    return serialize_doc(progress)

@api_router.post("/progress/{access_code}/{video_id}")
async def update_user_progress(access_code: str, video_id: str, update: UserProgressUpdate):
    # First verify access code
    code = await db.access_codes.find_one({"code": access_code, "is_active": True})
    if not code:
        raise HTTPException(status_code=401, detail="Invalid access code")
    
    # Get or create progress
    progress = await db.user_progress.find_one({
        "access_code": access_code,
        "video_id": video_id
    })
    
    if progress:
        update_data = {}
        if update.last_position is not None:
            update_data["last_position"] = update.last_position
        if update.is_favorite is not None:
            update_data["is_favorite"] = update.is_favorite
        if update.completed is not None:
            update_data["completed"] = update.completed
        if update.ready_for_evaluation is not None:
            update_data["ready_for_evaluation"] = update.ready_for_evaluation
        if update.watched_count is not None:
            # Increment watched_count instead of replacing
            update_data["watched_count"] = progress.get("watched_count", 0) + update.watched_count
        update_data["updated_at"] = datetime.utcnow()
        
        await db.user_progress.update_one(
            {"access_code": access_code, "video_id": video_id},
            {"$set": update_data}
        )
    else:
        new_progress = UserProgress(
            access_code=access_code,
            video_id=video_id,
            watched_count=update.watched_count or 1,
            last_position=update.last_position or 0,
            is_favorite=update.is_favorite or False,
            completed=update.completed or False,
            ready_for_evaluation=update.ready_for_evaluation or False
        )
        await db.user_progress.insert_one(new_progress.dict())
    
    result = await db.user_progress.find_one({
        "access_code": access_code,
        "video_id": video_id
    })
    return serialize_doc(result)

@api_router.get("/favorites/{access_code}")
async def get_favorites(access_code: str):
    favorites = await db.user_progress.find({
        "access_code": access_code,
        "is_favorite": True
    }).to_list(1000)
    
    # Get video details for favorites
    video_ids = [f['video_id'] for f in favorites]
    videos = await db.videos.find({"id": {"$in": video_ids}}).to_list(1000)
    
    return serialize_doc(videos)

@api_router.get("/watched/{access_code}")
async def get_watched_videos(access_code: str):
    """Get all videos the user has watched (watched_count > 0 or completed)"""
    watched = await db.user_progress.find({
        "access_code": access_code,
        "$or": [
            {"watched_count": {"$gt": 0}},
            {"completed": True}
        ]
    }).to_list(1000)
    
    # Get video details for watched videos
    video_ids = [w['video_id'] for w in watched]
    videos = await db.videos.find({"id": {"$in": video_ids}}).to_list(1000)
    
    # Add progress info to each video
    progress_map = {w['video_id']: w for w in watched}
    result = []
    for video in videos:
        video_data = serialize_doc(video)
        progress = progress_map.get(video['id'], {})
        video_data['watched_count'] = progress.get('watched_count', 0)
        video_data['completed'] = progress.get('completed', False)
        video_data['last_position'] = progress.get('last_position', 0)
        result.append(video_data)
    
    return result

# ============== ATC Simulation ==============

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAITextToSpeech
from pydub import AudioSegment
from pydub.effects import low_pass_filter, high_pass_filter
import io
import random

def apply_radio_effect(audio_bytes: bytes) -> bytes:
    """Apply radio communication effect to audio (band-pass filter + compression)"""
    try:
        # Load audio from bytes
        audio = AudioSegment.from_mp3(io.BytesIO(audio_bytes))
        
        # Apply band-pass filter (300Hz - 3400Hz typical radio range)
        # High-pass to remove low frequencies
        audio = high_pass_filter(audio, cutoff=300)
        # Low-pass to remove high frequencies  
        audio = low_pass_filter(audio, cutoff=3400)
        
        # Reduce dynamic range (compression effect)
        audio = audio.compress_dynamic_range(threshold=-20.0, ratio=4.0, attack=5.0, release=50.0)
        
        # Add slight distortion by boosting then limiting
        audio = audio + 3  # Boost by 3dB
        audio = audio.normalize()
        
        # Add subtle noise floor
        noise_level = -40  # dB
        noise = AudioSegment.silent(duration=len(audio))
        # Add random crackles
        for _ in range(int(len(audio) / 500)):  # Occasional crackle
            pos = random.randint(0, max(0, len(audio) - 50))
            crackle = AudioSegment.silent(duration=20) + random.randint(-50, -35)
            noise = noise.overlay(crackle, position=pos)
        
        audio = audio.overlay(noise)
        
        # Export back to bytes
        buffer = io.BytesIO()
        audio.export(buffer, format="mp3")
        return buffer.getvalue()
    except Exception as e:
        logger.error(f"Radio effect failed: {e}")
        return audio_bytes  # Return original if processing fails

# ATC Simulation scenarios
ATC_SCENARIOS = {
    "startup": {
        "name": "Startup & Taxi",
        "description": "Solicita permiso de encendido y taxi hacia la pista",
        "phase": "ground",
        "airport": "KJFK",
        "initial_situation": "You are parked at Gate B7 at JFK International Airport. Your aircraft is a Cessna 172 with callsign N12345. You need to request startup clearance and taxi to runway 31L.",
        "atc_facility": "JFK Ground",
        "frequency": "121.900"
    },
    "takeoff": {
        "name": "Takeoff Clearance", 
        "description": "Solicita autorización de despegue",
        "phase": "departure",
        "airport": "KLAX",
        "initial_situation": "You are holding short of runway 25L at Los Angeles International. Your aircraft is a Cessna 172 with callsign N12345. You've completed your run-up and are ready for takeoff.",
        "atc_facility": "LAX Tower",
        "frequency": "133.900"
    },
    "cruise": {
        "name": "Cruise & Flight Following",
        "description": "Comunicaciones en ruta con ATC",
        "phase": "enroute", 
        "airport": "Enroute",
        "initial_situation": "You are cruising at 8,500 feet over the Central Valley, California. Your aircraft is a Cessna 172 with callsign N12345 receiving VFR flight following from Oakland Center.",
        "atc_facility": "Oakland Center",
        "frequency": "127.800"
    },
    "approach": {
        "name": "Approach & Landing",
        "description": "Aproximación y aterrizaje en aeropuerto controlado",
        "phase": "arrival",
        "airport": "KSFO",
        "initial_situation": "You are 15 miles southeast of San Francisco International at 4,500 feet. Your aircraft is a Cessna 172 with callsign N12345. You need to contact approach for landing clearance.",
        "atc_facility": "NorCal Approach", 
        "frequency": "135.650"
    },
    "pattern": {
        "name": "Traffic Pattern",
        "description": "Circuito de tráfico en aeropuerto no controlado",
        "phase": "pattern",
        "airport": "KPAO",
        "initial_situation": "You are 5 miles south of Palo Alto Airport at 1,500 feet. Your aircraft is a Cessna 172 with callsign N12345. This is a non-towered airport and you need to announce your intentions on CTAF.",
        "atc_facility": "Palo Alto Traffic (CTAF)",
        "frequency": "118.600"
    },
    "emergency_engine": {
        "name": "Engine Failure",
        "description": "Simulación de falla de motor",
        "phase": "emergency",
        "airport": "Enroute",
        "initial_situation": "You are at 6,000 feet over mountainous terrain when your engine begins to sputter and lose power. Your aircraft is a Cessna 172 with callsign N12345. You need to declare an emergency.",
        "atc_facility": "Seattle Center",
        "frequency": "128.950"
    },
    "emergency_lost": {
        "name": "Lost & Disoriented",
        "description": "Perdido y desorientado - solicitar asistencia",
        "phase": "emergency",
        "airport": "Unknown",
        "initial_situation": "You've become disoriented after encountering unexpected weather. Visibility has dropped and you're unsure of your position. Your aircraft is a Cessna 172 with callsign N12345.",
        "atc_facility": "Los Angeles Center",
        "frequency": "134.500"
    },
    "free_class": {
        "name": "Clase Libre",
        "description": "Practica cualquier escenario - el ATC se adapta a tu comunicación",
        "phase": "free",
        "airport": "Variable",
        "initial_situation": "Free practice mode. The pilot will initiate contact and the ATC will adapt to whatever facility or scenario the pilot communicates with.",
        "atc_facility": "ATC (Variable)",
        "frequency": "Variable"
    }
}

# Special system prompt for free class mode
ATC_FREE_CLASS_PROMPT = """You are a highly realistic Air Traffic Controller (ATC) simulator for free practice. Your role is to ADAPT to whatever the pilot says.

## CRITICAL RULES:
1. When the pilot calls ANY facility (Ground, Tower, Approach, Center, Traffic), YOU BECOME THAT FACILITY
2. NEVER say "I'm not that facility" - always adapt and respond appropriately
3. If pilot says "Miami Ground", you ARE Miami Ground. If they say "LAX Tower", you ARE LAX Tower.
4. Track all clearances you give and NEVER contradict yourself
5. If pilot reads back correctly = "readback correct". If incorrect, correct them.
6. Respond professionally with standard FAA/ICAO phraseology
7. Keep responses under 35 words typically

## AIRCRAFT INFO:
Type: {aircraft_type}
Callsign: {callsign} (phonetic: {callsign_phonetic})

## YOUR BEHAVIOR:
- Wait for pilot to initiate contact
- Identify which facility they're calling and BECOME that facility
- Use realistic altimeter settings (e.g., "altimeter two niner niner two")
- Include squawk codes when appropriate
- Reference winds for takeoff/landing
- Use proper phonetic alphabet and number pronunciation

## REMEMBER:
You adapt to the pilot's scenario. If they contact Ground for taxi, handle taxi clearances. If they contact Tower for takeoff, handle departure clearances. Be flexible but always professional and consistent."""

ATC_SYSTEM_PROMPT = """You are a highly realistic Air Traffic Controller (ATC) simulator for training pilots. Your primary goal is to maintain PERFECT CONSISTENCY and help pilots practice realistic radio communications.

## ABSOLUTE RULES (NEVER VIOLATE):
1. TRACK ALL CLEARANCES: Keep an internal log of every instruction you give (runway, taxi route, squawk, altitude, heading)
2. NEVER CONTRADICT: If you cleared someone for takeoff, NEVER say you didn't
3. ACKNOWLEDGE READBACKS: If pilot reads back correctly = "readback correct" or "correct"
4. CORRECT ERRORS: If pilot reads back incorrectly, say exactly what was wrong
5. STAY IN CHARACTER: You are ONLY the ATC controller. Never break character.

## RESPONSE FORMAT:
- Start OR end each transmission with the aircraft callsign
- Keep responses under 35 words typically
- Use standard FAA/ICAO phraseology ONLY
- Numbers spoken individually: runway "three one left", altitude "niner thousand five hundred"
- Use phonetic alphabet: Alpha, Bravo, Charlie, Delta, Echo, Foxtrot, Golf, Hotel, India, Juliet, Kilo, Lima, Mike, November, Oscar, Papa, Quebec, Romeo, Sierra, Tango, Uniform, Victor, Whiskey, X-ray, Yankee, Zulu

## CURRENT SESSION INFO:
Airport: {airport}
ATC Facility: {atc_facility}
Frequency: {frequency} MHz
Phase: {phase}
Situation: {initial_situation}
Aircraft Type: {aircraft_type}
Callsign: {callsign} (spoken as {callsign_phonetic})

## YOUR STATE TRACKING (update mentally after each exchange):
- Assigned Runway: [track this]
- Taxi Route: [track this]
- Assigned Squawk: [track this]
- Assigned Altitude: [track this]
- Assigned Heading: [track this]
- Clearance Status: [track this]

Respond ONLY as {atc_facility}. Be professional, concise, and absolutely consistent."""

# Aircraft types for variety
AIRCRAFT_TYPES = [
    {"type": "Cessna 172", "category": "light"},
    {"type": "Piper Cherokee", "category": "light"},
    {"type": "Cessna 182", "category": "light"},
    {"type": "Beechcraft Bonanza", "category": "light"},
    {"type": "Cirrus SR22", "category": "light"},
    {"type": "Piper Archer", "category": "light"},
]

# Initial ATC messages by scenario (randomized)
ATC_INITIAL_MESSAGES = {
    "startup": [
        "{callsign}, {facility}, runway {runway} in use, winds {wind}, altimeter {altimeter}. Advise when ready to copy taxi.",
        "{callsign}, {facility}, good morning. Information {atis} current, runway {runway} in use. State request.",
        "{facility}, {callsign} is with you at gate {gate}. Altimeter {altimeter}, runway {runway} active.",
    ],
    "takeoff": [
        "{callsign}, {facility}, winds {wind}, runway {runway}, cleared for takeoff.",
        "{callsign}, {facility}, traffic departing, runway {runway}, line up and wait.",
        "{callsign}, {facility}, hold short runway {runway}, traffic on final.",
    ],
    "cruise": [
        "{callsign}, {facility}, radar contact, {altitude}, squawk {squawk}.",
        "{callsign}, {facility}, traffic twelve o'clock, five miles, opposite direction, altitude indicates {alt_traffic}.",
        "{callsign}, {facility}, for traffic, turn right heading {heading}.",
    ],
    "approach": [
        "{callsign}, {facility}, expect vectors ILS runway {runway}, descend and maintain {altitude}.",
        "{callsign}, {facility}, radar contact, say intentions.",
        "{callsign}, {facility}, cleared visual approach runway {runway}, report field in sight.",
    ],
    "pattern": [
        "{callsign}, {airport} traffic, report midfield left downwind runway {runway}.",
        "{callsign}, traffic, extend downwind, traffic on base.",
        "{callsign}, cleared touch and go runway {runway}.",
    ],
    "emergency_engine": [
        "{callsign}, {facility}, roger mayday, say souls on board and fuel remaining.",
        "{callsign}, {facility}, emergency services notified, nearest airport {airport} at your twelve o'clock, {distance} miles.",
        "{callsign}, {facility}, squawk seven seven zero zero, radar contact.",
    ],
    "emergency_lost": [
        "{callsign}, {facility}, squawk seven seven zero zero and ident.",
        "{callsign}, {facility}, radar contact, say your altitude and heading.",
        "{callsign}, {facility}, turn left heading {heading} for vectors to nearest VFR airport.",
    ],
}

def generate_callsign():
    """Generate a random realistic callsign"""
    prefixes = ["N", "N"]  # US registration
    nums = ''.join([str(random.randint(0, 9)) for _ in range(random.randint(3, 5))])
    suffix = random.choice(["", "", "AB", "CD", "XY", "JK", "WR"])
    return f"{random.choice(prefixes)}{nums}{suffix}"

def callsign_to_phonetic(callsign: str) -> str:
    """Convert callsign to phonetic pronunciation"""
    phonetic = {
        '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
        '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'niner',
        'A': 'Alpha', 'B': 'Bravo', 'C': 'Charlie', 'D': 'Delta', 'E': 'Echo',
        'F': 'Foxtrot', 'G': 'Golf', 'H': 'Hotel', 'I': 'India', 'J': 'Juliet',
        'K': 'Kilo', 'L': 'Lima', 'M': 'Mike', 'N': 'November', 'O': 'Oscar',
        'P': 'Papa', 'Q': 'Quebec', 'R': 'Romeo', 'S': 'Sierra', 'T': 'Tango',
        'U': 'Uniform', 'V': 'Victor', 'W': 'Whiskey', 'X': 'X-ray', 'Y': 'Yankee',
        'Z': 'Zulu'
    }
    return ' '.join([phonetic.get(c.upper(), c) for c in callsign])

def generate_random_atc_elements():
    """Generate random realistic ATC elements"""
    runways = ["31L", "31R", "27L", "27R", "25L", "25R", "19L", "19R", "10L", "10R", "04", "22", "36", "18"]
    winds = [f"{random.randint(0, 36):02d}0 at {random.randint(3, 15)}" for _ in range(1)][0]
    altimeters = [f"two niner {random.randint(85, 99):02d}", f"three zero {random.randint(0, 15):02d}"]
    atis_letters = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']
    squawks = [f"{random.randint(1, 7)}{random.randint(0, 7)}{random.randint(0, 7)}{random.randint(0, 7)}" for _ in range(1)][0]
    
    return {
        "runway": random.choice(runways),
        "wind": winds,
        "altimeter": random.choice(altimeters),
        "atis": random.choice(atis_letters),
        "squawk": squawks,
        "gate": f"{random.choice(['A', 'B', 'C', 'D'])}{random.randint(1, 20)}",
        "altitude": f"{random.choice([3, 4, 5, 6, 7, 8, 9])} thousand",
        "heading": f"{random.randint(1, 36):03d}",
        "alt_traffic": f"{random.choice([4, 5, 6, 7, 8])} thousand five hundred",
        "distance": str(random.randint(5, 25)),
        "airport": random.choice(["Ontario", "Riverside", "Chino", "El Monte", "Burbank"]),
    }

class ATCSimulationRequest(BaseModel):
    scenario_id: str
    pilot_message: str
    session_id: str
    callsign: Optional[str] = None  # Custom callsign
    aircraft_type: Optional[str] = None  # Custom aircraft type

class ATCSimulationResponse(BaseModel):
    atc_response: str
    audio_base64: Optional[str] = None
    frequency: str
    atc_facility: str
    callsign: str
    aircraft_type: str

# Store for ATC chat sessions with their config
atc_sessions: dict = {}
atc_session_configs: dict = {}  # Store callsign/aircraft per session

@api_router.get("/atc/scenarios")
async def get_atc_scenarios():
    """Get all available ATC simulation scenarios"""
    scenarios = []
    for key, scenario in ATC_SCENARIOS.items():
        scenarios.append({
            "id": key,
            "name": scenario["name"],
            "description": scenario["description"],
            "phase": scenario["phase"],
            "airport": scenario["airport"],
            "atc_facility": scenario["atc_facility"],
            "frequency": scenario["frequency"]
        })
    return scenarios

@api_router.get("/atc/aircraft-types")
async def get_aircraft_types():
    """Get available aircraft types for simulation"""
    return AIRCRAFT_TYPES

@api_router.post("/atc/simulate")
async def simulate_atc(request: ATCSimulationRequest):
    """Process pilot communication and get ATC response"""
    try:
        scenario = ATC_SCENARIOS.get(request.scenario_id)
        if not scenario:
            raise HTTPException(status_code=404, detail="Scenario not found")
        
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="LLM API key not configured")
        
        # Create or get existing chat session
        session_key = f"{request.session_id}_{request.scenario_id}"
        
        # Get or create session config
        if session_key not in atc_session_configs:
            # Generate or use provided callsign/aircraft
            callsign = request.callsign or generate_callsign()
            aircraft = request.aircraft_type or random.choice(AIRCRAFT_TYPES)["type"]
            atc_session_configs[session_key] = {
                "callsign": callsign,
                "callsign_phonetic": callsign_to_phonetic(callsign),
                "aircraft_type": aircraft
            }
        
        config = atc_session_configs[session_key]
        
        if session_key not in atc_sessions:
            # Check if this is a free class scenario
            if request.scenario_id == "free_class":
                # Use the free class prompt
                system_message = ATC_FREE_CLASS_PROMPT.format(
                    aircraft_type=config["aircraft_type"],
                    callsign=config["callsign"],
                    callsign_phonetic=config["callsign_phonetic"]
                )
            else:
                # Build dynamic situation with callsign for regular scenarios
                situation = scenario["initial_situation"].replace(
                    "Your aircraft is a Cessna 172 with callsign N12345",
                    f"Your aircraft is a {config['aircraft_type']} with callsign {config['callsign']}"
                ).replace("N12345", config['callsign'])
                
                system_message = ATC_SYSTEM_PROMPT.format(
                    airport=scenario["airport"],
                    atc_facility=scenario["atc_facility"],
                    frequency=scenario["frequency"],
                    phase=scenario["phase"],
                    initial_situation=situation,
                    aircraft_type=config["aircraft_type"],
                    callsign=config["callsign"],
                    callsign_phonetic=config["callsign_phonetic"]
                )
            
            chat = LlmChat(
                api_key=api_key,
                session_id=session_key,
                system_message=system_message
            ).with_model("openai", "gpt-4.1")
            
            atc_sessions[session_key] = chat
        else:
            chat = atc_sessions[session_key]
        
        # Send pilot message and get ATC response
        user_message = UserMessage(text=f"Pilot transmission: {request.pilot_message}")
        atc_response = await chat.send_message(user_message)
        
        # Generate audio with TTS and apply radio effect
        audio_base64 = None
        try:
            tts = OpenAITextToSpeech(api_key=api_key)
            audio_bytes = await tts.generate_speech(
                text=atc_response,
                model="tts-1-hd",  # Higher quality model for better voice
                voice="echo",  # Different voice - more authoritative
                speed=1.15  # Faster like real ATC
            )
            
            # Apply radio communication effect
            radio_audio = apply_radio_effect(audio_bytes)
            audio_base64 = base64.b64encode(radio_audio).decode('utf-8')
        except Exception as e:
            logger.error(f"TTS generation failed: {e}")
        
        return ATCSimulationResponse(
            atc_response=atc_response,
            audio_base64=audio_base64,
            frequency=scenario["frequency"],
            atc_facility=scenario["atc_facility"],
            callsign=config["callsign"],
            aircraft_type=config["aircraft_type"]
        )
        
    except Exception as e:
        logger.error(f"ATC simulation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/atc/initial-contact/{scenario_id}")
async def get_initial_contact(scenario_id: str, callsign: Optional[str] = None, aircraft_type: Optional[str] = None):
    """Get a randomized initial ATC contact message for a scenario"""
    scenario = ATC_SCENARIOS.get(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    # Use provided or generate random callsign/aircraft
    cs = callsign or generate_callsign()
    aircraft = aircraft_type or random.choice(AIRCRAFT_TYPES)["type"]
    
    # Generate random ATC elements
    elements = generate_random_atc_elements()
    elements["callsign"] = cs
    elements["facility"] = scenario["atc_facility"]
    elements["airport"] = scenario["airport"]
    
    # Get random initial message for this scenario type
    messages = ATC_INITIAL_MESSAGES.get(scenario_id, ATC_INITIAL_MESSAGES["startup"])
    template = random.choice(messages)
    
    try:
        initial_message = template.format(**elements)
    except KeyError:
        initial_message = f"{cs}, {scenario['atc_facility']}, go ahead."
    
    return {
        "initial_message": initial_message,
        "callsign": cs,
        "callsign_phonetic": callsign_to_phonetic(cs),
        "aircraft_type": aircraft,
        "frequency": scenario["frequency"],
        "atc_facility": scenario["atc_facility"]
    }

@api_router.post("/atc/reset-session")
async def reset_atc_session(session_id: str, scenario_id: str):
    """Reset an ATC simulation session"""
    session_key = f"{session_id}_{scenario_id}"
    if session_key in atc_sessions:
        del atc_sessions[session_key]
    if session_key in atc_session_configs:
        del atc_session_configs[session_key]
    return {"message": "Session reset"}

# Evaluation prompt for pilot voice/text
EVALUATION_SYSTEM_PROMPT = """You are an expert ATC communication instructor evaluating a pilot's radio transmission. 
Analyze the transmission based on:
1. **Phraseology** (0-25 points): Use of standard aviation phraseology
2. **Structure** (0-25 points): Proper sequence (Who you're calling, Who you are, Where you are, What you want)
3. **Clarity** (0-25 points): Clear and concise communication
4. **Professionalism** (0-25 points): Professional tone and confidence

Provide feedback in Spanish and be encouraging but specific about improvements.

IMPORTANT: Always respond in the following JSON format:
{
    "total_score": <number 0-100>,
    "phraseology_score": <number 0-25>,
    "structure_score": <number 0-25>,
    "clarity_score": <number 0-25>,
    "professionalism_score": <number 0-25>,
    "feedback": "<detailed feedback in Spanish>",
    "suggestions": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"],
    "correct_version": "<how the transmission should ideally sound>"
}"""

class EvaluationRequest(BaseModel):
    pilot_message: str
    scenario_id: str
    expected_context: Optional[str] = None

@api_router.post("/atc/evaluate")
async def evaluate_pilot_transmission(request: EvaluationRequest):
    """Evaluate a pilot's radio transmission using AI"""
    try:
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="LLM API key not configured")
        
        scenario = ATC_SCENARIOS.get(request.scenario_id, {})
        
        # Build evaluation context
        context = f"""
        Scenario: {scenario.get('name', 'Unknown')}
        Phase: {scenario.get('phase', 'Unknown')}
        ATC Facility: {scenario.get('atc_facility', 'Unknown')}
        Situation: {scenario.get('initial_situation', 'Unknown')}
        
        Pilot Transmission to evaluate: "{request.pilot_message}"
        
        {f"Expected context: {request.expected_context}" if request.expected_context else ""}
        """
        
        # Use LlmChat for evaluation
        chat = LlmChat(
            api_key=api_key,
            session_id=f"eval_{request.scenario_id}_{int(time.time())}",
            system_message=EVALUATION_SYSTEM_PROMPT
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(text=context)
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        try:
            # Try to extract JSON from the response
            import re
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                evaluation = json.loads(json_match.group())
            else:
                # Fallback if no JSON found
                evaluation = {
                    "total_score": 70,
                    "phraseology_score": 17,
                    "structure_score": 18,
                    "clarity_score": 17,
                    "professionalism_score": 18,
                    "feedback": response,
                    "suggestions": ["Practica más la fraseología estándar"],
                    "correct_version": request.pilot_message
                }
        except json.JSONDecodeError:
            evaluation = {
                "total_score": 70,
                "feedback": response,
                "suggestions": [],
                "correct_version": request.pilot_message
            }
        
        return evaluation
        
    except Exception as e:
        logger.error(f"Evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== Listening Test ==============

class ListeningTestResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    access_code: str
    video_id: str
    subtitle_id: str
    original_text: str
    user_response: str
    score: float  # 0-100
    replay_count: int
    feedback: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ListeningTestSubmission(BaseModel):
    video_id: str
    subtitle_id: str
    original_text: str
    user_response: str
    replay_count: int

@api_router.get("/listening-test/random-segment/{access_code}")
async def get_random_listening_segment(access_code: str, level: int = 1):
    """Get a random audio segment from videos marked as ready for evaluation
    
    Levels:
    - Level 1: Shortest segments (0-5 seconds)
    - Level 2: Medium segments (5-10 seconds)
    - Level 3: Long segments (10+ seconds)
    """
    import random
    
    # Define duration ranges for each level (in seconds)
    level_ranges = {
        1: (0, 5),
        2: (5, 10),
        3: (10, 9999)  # 10+ seconds
    }
    
    # Validate level
    if level not in level_ranges:
        level = 1
    
    min_duration, max_duration = level_ranges[level]
    
    # Get videos that the student marked as ready for evaluation
    ready_progress = await db.user_progress.find({
        "access_code": access_code,
        "ready_for_evaluation": True
    }).to_list(100)
    
    ready_video_ids = [p['video_id'] for p in ready_progress]
    
    if not ready_video_ids:
        raise HTTPException(status_code=404, detail="No hay videos marcados como listos para evaluación. Marca algunos videos en la sección de Videos.")
    
    # Get videos with subtitles that are marked as ready
    videos = await db.videos.find({
        "id": {"$in": ready_video_ids},
        "subtitles": {"$exists": True, "$ne": []}
    }).to_list(100)
    
    if not videos:
        raise HTTPException(status_code=404, detail="Los videos marcados no tienen subtítulos disponibles")
    
    # Filter videos that have actual subtitle content
    videos_with_subtitles = [v for v in videos if v.get('subtitles') and len(v['subtitles']) > 0]
    
    if not videos_with_subtitles:
        raise HTTPException(status_code=404, detail="No hay segmentos de audio disponibles")
    
    # Collect all subtitles that match the level's duration range
    matching_segments = []
    for video in videos_with_subtitles:
        for subtitle in video['subtitles']:
            duration = subtitle.get('end_time', 0) - subtitle.get('start_time', 0)
            # Strict filtering by duration range
            if min_duration <= duration < max_duration:
                matching_segments.append({
                    'video': video,
                    'subtitle': subtitle,
                    'duration': duration
                })
    
    logger.info(f"Level {level}: Found {len(matching_segments)} segments in range {min_duration}-{max_duration}s")
    
    # If no segments match the level, try to find closest ones
    if not matching_segments:
        # Collect all segments and sort by duration
        all_segments = []
        for video in videos_with_subtitles:
            for subtitle in video['subtitles']:
                duration = subtitle.get('end_time', 0) - subtitle.get('start_time', 0)
                all_segments.append({
                    'video': video,
                    'subtitle': subtitle,
                    'duration': duration
                })
        
        if not all_segments:
            raise HTTPException(status_code=404, detail="No hay segmentos de audio disponibles")
        
        # Sort by duration
        all_segments.sort(key=lambda x: x['duration'])
        
        # Divide into thirds based on level
        total = len(all_segments)
        if level == 1:
            matching_segments = all_segments[:max(1, total // 3)]
        elif level == 2:
            matching_segments = all_segments[total // 3:2 * total // 3]
        else:  # level 3
            matching_segments = all_segments[2 * total // 3:]
        
        # Fallback if still empty
        if not matching_segments:
            matching_segments = all_segments
            
        logger.info(f"Level {level}: Using fallback - {len(matching_segments)} segments")
    
    # Select random segment from matching ones
    selected = random.choice(matching_segments)
    video = selected['video']
    subtitle = selected['subtitle']
    
    logger.info(f"Selected segment duration: {selected['duration']}s for level {level}")
    
    return {
        "video_id": video['id'],
        "video_title": video['title'],
        "subtitle_id": subtitle.get('id', str(uuid.uuid4())),
        "start_time": subtitle['start_time'],
        "end_time": subtitle['end_time'],
        "duration": round(selected['duration'], 1),
        "level": level,
        "text": subtitle['text'],
        "stream_url": f"/api/videos/{video['id']}/stream"
    }

@api_router.post("/listening-test/evaluate/{access_code}")
async def evaluate_listening_test(access_code: str, submission: ListeningTestSubmission):
    """Evaluate a listening test submission and save the result"""
    try:
        # Calculate similarity score
        original = submission.original_text.lower().strip()
        response = submission.user_response.lower().strip()
        
        # Use AI to evaluate the response
        api_key = os.getenv("EMERGENT_LLM_KEY")
        
        if api_key:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"listening_eval_{access_code}_{int(time.time())}",
                system_message="You are an expert aviation English instructor evaluating student transcriptions of ATC communications."
            ).with_model("openai", "gpt-4o")
            
            eval_prompt = f"""Evalúa qué tan bien el estudiante transcribió el audio de comunicación ATC.

Texto Original: "{submission.original_text}"
Respuesta del Estudiante: "{submission.user_response}"

Evalúa considerando:
1. Exactitud de las palabras (40%)
2. Términos de aviación correctos (30%)
3. Números y callsigns (20%)
4. Ortografía menor (10%)

Responde SOLO en este formato JSON:
{{
    "score": <número 0-100>,
    "feedback": "<retroalimentación breve en español, máximo 2 oraciones>",
    "corrections": "<correcciones específicas si las hay>"
}}"""
            
            user_message = UserMessage(text=eval_prompt)
            response_text = await chat.send_message(user_message)
            
            # Parse JSON response
            import re
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                eval_result = json.loads(json_match.group())
                score = eval_result.get('score', 70)
                feedback = eval_result.get('feedback', 'Evaluación completada')
                if eval_result.get('corrections'):
                    feedback += f" Correcciones: {eval_result['corrections']}"
            else:
                score = 70
                feedback = "Evaluación completada"
        else:
            # Simple similarity calculation without AI
            from difflib import SequenceMatcher
            score = int(SequenceMatcher(None, original, response).ratio() * 100)
            feedback = "Puntuación basada en similitud de texto"
        
        # Save the result
        result = ListeningTestResult(
            access_code=access_code,
            video_id=submission.video_id,
            subtitle_id=submission.subtitle_id,
            original_text=submission.original_text,
            user_response=submission.user_response,
            score=score,
            replay_count=submission.replay_count,
            feedback=feedback
        )
        
        await db.listening_test_results.insert_one(result.dict())
        
        return {
            "score": score,
            "feedback": feedback,
            "original_text": submission.original_text,
            "replay_count": submission.replay_count
        }
        
    except Exception as e:
        logger.error(f"Listening test evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/listening-test/history/{access_code}")
async def get_listening_test_history(access_code: str):
    """Get listening test history for a user"""
    results = await db.listening_test_results.find({
        "access_code": access_code
    }).sort("created_at", -1).to_list(50)
    
    return serialize_doc(results)

def clean_aviation_transcription(text: str) -> str:
    """Clean up Whisper transcription for aviation callsigns and numbers.
    
    Fixes common issues like:
    - "N1,2,3,4,5" -> "N12345"
    - "1, 2, 3" -> "123"  
    - Unnecessary commas in numeric sequences
    """
    import re
    
    # Pattern 1: Remove commas between digits (e.g., "1,2,3,4,5" -> "12345")
    text = re.sub(r'(\d),\s*(\d)', r'\1\2', text)
    
    # Apply multiple times to catch all sequential commas
    for _ in range(5):
        text = re.sub(r'(\d),\s*(\d)', r'\1\2', text)
    
    # Pattern 2: Fix aircraft callsigns with commas (e.g., "N 1, 2, 3, 4, 5" -> "N12345")
    # Match letter followed by comma-separated numbers
    def fix_callsign(match):
        prefix = match.group(1)
        numbers = re.sub(r'[,\s]+', '', match.group(2))
        return prefix + numbers
    
    text = re.sub(r'([A-Z])\s*((?:\d[,\s]*)+\d)', fix_callsign, text, flags=re.IGNORECASE)
    
    # Pattern 3: Remove spaces around hyphens in common ATC terms
    text = re.sub(r'\s*-\s*', '-', text)
    
    # Pattern 4: Fix runway numbers (e.g., "3-1 left" -> "31 left", "runway 3 1" -> "runway 31")
    text = re.sub(r'runway\s+(\d)\s*-?\s*(\d)', r'runway \1\2', text, flags=re.IGNORECASE)
    text = re.sub(r'(\d)\s*-\s*(\d)\s+(left|right|center)', r'\1\2 \3', text, flags=re.IGNORECASE)
    
    return text.strip()

@api_router.post("/transcribe-audio")
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio using OpenAI Whisper"""
    temp_path = None
    try:
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        # Get the original filename and extension
        original_filename = audio.filename or "audio.m4a"
        extension = original_filename.split('.')[-1] if '.' in original_filename else 'm4a'
        
        # Ensure extension is supported
        supported_formats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']
        if extension.lower() not in supported_formats:
            extension = 'm4a'  # Default to m4a for iOS recordings
        
        # Save audio to temp file with correct extension
        temp_path = f"/tmp/audio_{uuid.uuid4()}.{extension}"
        async with aiofiles.open(temp_path, 'wb') as f:
            content = await audio.read()
            await f.write(content)
        
        logger.info(f"Audio saved to {temp_path}, size: {len(content)} bytes")
        
        # Use OpenAI Whisper for transcription
        from emergentintegrations.llm.openai import OpenAISpeechToText
        
        stt = OpenAISpeechToText(api_key=api_key)
        
        # Open the file and transcribe
        with open(temp_path, "rb") as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                language="en",  # ATC communications are in English
                prompt="Aviation radio communication. Aircraft callsigns like N12345, N7890AB. Runway numbers like 31L, 27R."
            )
        
        # Clean up temp file
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        
        # Extract text from response
        transcription_text = response.text if hasattr(response, 'text') else str(response)
        
        # Clean up the transcription for aviation terminology
        transcription_text = clean_aviation_transcription(transcription_text)
        
        logger.info(f"Transcription successful: {transcription_text[:100]}...")
        
        return {"transcription": transcription_text}
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        # Clean up on error
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))

# ============== App Settings (Help & Intro Video) ==============

class AppSettings(BaseModel):
    help_content: str = ""
    intro_video_id: Optional[str] = None

@api_router.get("/settings")
async def get_app_settings():
    """Get app settings (help content and intro video)"""
    settings = await db.app_settings.find_one({"_id": "main"})
    if not settings:
        return {"help_content": "", "intro_video_id": None}
    return {
        "help_content": settings.get("help_content", ""),
        "intro_video_id": settings.get("intro_video_id")
    }

@api_router.put("/settings")
async def update_app_settings(settings: AppSettings):
    """Update app settings (admin only)"""
    await db.app_settings.update_one(
        {"_id": "main"},
        {"$set": {
            "help_content": settings.help_content,
            "intro_video_id": settings.intro_video_id
        }},
        upsert=True
    )
    return {"message": "Settings updated", **settings.dict()}

@api_router.get("/settings/intro-video")
async def get_intro_video():
    """Get intro video details"""
    settings = await db.app_settings.find_one({"_id": "main"})
    if not settings or not settings.get("intro_video_id"):
        return {"video": None}
    
    video = await db.videos.find_one({"id": settings["intro_video_id"]})
    if not video:
        return {"video": None}
    
    return {"video": serialize_doc(video)}

# ============== Learning Path ==============

class LearningPathItem(BaseModel):
    video_id: str
    order: int
    is_path_exclusive: bool = False  # True = only visible in Path mode, False = visible everywhere

class LearningPathUpdate(BaseModel):
    items: List[LearningPathItem]

@api_router.get("/learning-path")
async def get_learning_path():
    """Get the learning path configuration"""
    path = await db.learning_path.find().sort("order", 1).to_list(100)
    
    # Get video details for each path item
    result = []
    for item in path:
        video = await db.videos.find_one({"id": item["video_id"]})
        if video:
            result.append({
                "video_id": item["video_id"],
                "order": item["order"],
                "is_path_exclusive": item.get("is_path_exclusive", False),
                "video": serialize_doc(video)
            })
    
    return result

@api_router.put("/learning-path")
async def update_learning_path(data: LearningPathUpdate):
    """Update the entire learning path (admin only)"""
    # Clear existing path
    await db.learning_path.delete_many({})
    
    # Insert new path items
    for item in data.items:
        await db.learning_path.insert_one({
            "video_id": item.video_id,
            "order": item.order,
            "is_path_exclusive": item.is_path_exclusive
        })
    
    return {"message": "Learning path updated", "items_count": len(data.items)}

@api_router.get("/learning-path/videos/{access_code}")
async def get_learning_path_videos(access_code: str):
    """Get learning path videos with student progress"""
    # Get the learning path
    path = await db.learning_path.find().sort("order", 1).to_list(100)
    
    # Get student progress
    progress_list = await db.user_progress.find({"access_code": access_code}).to_list(1000)
    progress_map = {p["video_id"]: p for p in progress_list}
    
    result = []
    for item in path:
        video = await db.videos.find_one({"id": item["video_id"]})
        if video:
            video_data = serialize_doc(video)
            video_progress = progress_map.get(item["video_id"], {})
            video_data["watched_count"] = video_progress.get("watched_count", 0)
            video_data["completed"] = video_progress.get("completed", False)
            video_data["ready_for_evaluation"] = video_progress.get("ready_for_evaluation", False)
            video_data["path_order"] = item["order"]
            video_data["is_path_exclusive"] = item.get("is_path_exclusive", False)
            result.append(video_data)
    
    return result

# ============== Admin - Student Progress History ==============

@api_router.get("/admin/students")
async def get_all_students():
    """Get all students with their progress summary"""
    # Get all access codes (excluding admin codes)
    codes = await db.access_codes.find({"is_active": True}).to_list(100)
    
    students = []
    for code in codes:
        # Skip admin codes
        if 'admin' in code.get('code', '').lower():
            continue
            
        access_code = code['code']
        
        # Get progress for this student
        progress_list = await db.user_progress.find({"access_code": access_code}).to_list(1000)
        
        # Count watched videos
        watched_count = len([p for p in progress_list if p.get('watched_count', 0) > 0])
        ready_count = len([p for p in progress_list if p.get('ready_for_evaluation', False)])
        total_watches = sum([p.get('watched_count', 0) for p in progress_list])
        
        # Get last activity
        last_activity = None
        if progress_list:
            dates = [p.get('last_watched_at') or p.get('updated_at') for p in progress_list if p.get('last_watched_at') or p.get('updated_at')]
            if dates:
                last_activity = max(dates)
        
        students.append({
            "code_id": code['id'],
            "access_code": access_code,
            "client_name": code.get('client_name', 'Unknown'),
            "watched_videos": watched_count,
            "ready_for_evaluation": ready_count,
            "total_views": total_watches,
            "last_activity": last_activity,
            "device_registered": code.get('registered_device_id') is not None,
            "created_at": code.get('created_at')
        })
    
    return students

@api_router.get("/admin/students/{access_code}/progress")
async def get_student_progress_detail(access_code: str):
    """Get detailed progress for a specific student"""
    # Get all progress entries
    progress_list = await db.user_progress.find({"access_code": access_code}).sort("last_watched_at", -1).to_list(1000)
    
    # Get video details for each progress entry
    result = []
    for progress in progress_list:
        video = await db.videos.find_one({"id": progress['video_id']})
        if video:
            result.append({
                "video_id": progress['video_id'],
                "video_title": video.get('title', 'Unknown'),
                "video_duration": video.get('duration', 0),
                "watched_count": progress.get('watched_count', 0),
                "completed": progress.get('completed', False),
                "ready_for_evaluation": progress.get('ready_for_evaluation', False),
                "last_watched_at": progress.get('last_watched_at'),
                "last_position": progress.get('last_position', 0)
            })
    
    # Get learning path progress
    path = await db.learning_path.find().sort("order", 1).to_list(100)
    path_progress = {
        "total_videos": len(path),
        "completed_videos": 0
    }
    
    for item in path:
        progress = await db.user_progress.find_one({
            "access_code": access_code, 
            "video_id": item['video_id']
        })
        if progress and progress.get('watched_count', 0) > 0:
            path_progress['completed_videos'] += 1
    
    return {
        "videos": result,
        "path_progress": path_progress
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
