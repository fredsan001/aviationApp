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

async def transcribe_video_audio(video_id: str, video_path: str):
    """Background task to transcribe video audio using OpenAI Whisper"""
    try:
        logger.info(f"Starting transcription for video {video_id}")
        
        # Update status to processing
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {"is_processing": True, "processing_status": "Extracting audio..."}}
        )
        
        # Extract audio from video using ffmpeg
        audio_path = str(video_path).replace('.mp4', '.mp3').replace('.mov', '.mp3').replace('.webm', '.mp3')
        
        # Use ffmpeg to extract audio
        import subprocess
        process = await asyncio.create_subprocess_exec(
            'ffmpeg', '-i', video_path, '-vn', '-acodec', 'libmp3lame', '-y', audio_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await process.communicate()
        
        if not os.path.exists(audio_path):
            raise Exception("Failed to extract audio from video")
        
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {"processing_status": "Transcribing with AI..."}}
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
                    "processing_status": "Completed"
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

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

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
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    # Get video duration using ffprobe
    duration = 0
    try:
        import subprocess
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', 
             '-of', 'default=noprint_wrappers=1:nokey=1', str(file_path)],
            capture_output=True, text=True
        )
        duration = float(result.stdout.strip()) if result.stdout.strip() else 0
    except Exception as e:
        logger.warning(f"Could not get video duration: {e}")
    
    # Create video record
    video = Video(
        title=title,
        description=description,
        category=category,
        categories=categories_list,  # Multiple categories
        video_filename=unique_filename,
        duration=duration,
        is_processing=should_transcribe,
        processing_status="Queued for transcription" if should_transcribe else ""
    )
    
    await db.videos.insert_one(video.dict())
    
    # Start transcription in background
    if should_transcribe:
        background_tasks.add_task(transcribe_video_audio, video.id, str(file_path))
    
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
    if not code:
        raise HTTPException(status_code=401, detail="Invalid or inactive access code")
    
    # Check expiration
    if code.get('expires_at'):
        if datetime.utcnow() > code['expires_at']:
            raise HTTPException(status_code=401, detail="Access code has expired")
    
    return {"valid": True, "client_name": code['client_name']}

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
    }
}

ATC_SYSTEM_PROMPT = """You are a highly realistic Air Traffic Controller (ATC) simulator. Your role is to provide authentic, professional ATC communications exactly as they would sound in real aviation.

CRITICAL RULES:
1. Use ONLY standard FAA/ICAO phraseology
2. Keep responses brief and professional - real ATC communications are short
3. Use proper phonetic alphabet (Alpha, Bravo, Charlie, etc.)
4. Include realistic callsigns, altimeter settings, runway numbers
5. Add natural radio artifacts in your responses like "uhh" occasionally
6. If pilot makes mistakes, correct them professionally
7. Respond contextually to the flight phase and situation
8. Use numbers pronounced individually (runway "three one left" not "thirty-one left")
9. Include squawk codes, frequencies, and headings when appropriate

CURRENT SCENARIO:
Airport/Location: {airport}
ATC Facility: {atc_facility}  
Frequency: {frequency} MHz
Flight Phase: {phase}
Situation: {initial_situation}

Aircraft: Cessna 172, Callsign November One Two Three Four Five (N12345)

Respond ONLY as the ATC controller. Keep responses under 50 words typically. Be realistic and professional."""

class ATCSimulationRequest(BaseModel):
    scenario_id: str
    pilot_message: str
    session_id: str

class ATCSimulationResponse(BaseModel):
    atc_response: str
    audio_base64: Optional[str] = None
    frequency: str
    atc_facility: str

# Store for ATC chat sessions
atc_sessions: dict = {}

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
        
        if session_key not in atc_sessions:
            system_message = ATC_SYSTEM_PROMPT.format(
                airport=scenario["airport"],
                atc_facility=scenario["atc_facility"],
                frequency=scenario["frequency"],
                phase=scenario["phase"],
                initial_situation=scenario["initial_situation"]
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
        
        # Generate audio with TTS
        audio_base64 = None
        try:
            tts = OpenAITextToSpeech(api_key=api_key)
            audio_bytes = await tts.generate_speech(
                text=atc_response,
                model="tts-1",
                voice="onyx",  # Deep, authoritative voice for ATC
                speed=1.1  # Slightly faster like real ATC
            )
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"TTS generation failed: {e}")
        
        return ATCSimulationResponse(
            atc_response=atc_response,
            audio_base64=audio_base64,
            frequency=scenario["frequency"],
            atc_facility=scenario["atc_facility"]
        )
        
    except Exception as e:
        logger.error(f"ATC simulation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/atc/reset-session")
async def reset_atc_session(session_id: str, scenario_id: str):
    """Reset an ATC simulation session"""
    session_key = f"{session_id}_{scenario_id}"
    if session_key in atc_sessions:
        del atc_sessions[session_key]
    return {"message": "Session reset"}

@api_router.get("/atc/initial-contact/{scenario_id}")
async def get_initial_contact(scenario_id: str):
    """Get the initial ATC contact for a scenario"""
    scenario = ATC_SCENARIOS.get(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    # Initial ATC greeting based on scenario
    initial_messages = {
        "startup": f"{scenario['atc_facility']}, {scenario['frequency']}, ATIS information Alpha current.",
        "takeoff": f"N12345, {scenario['atc_facility']}, runway 25L, cleared for takeoff, wind 270 at 8.",
        "cruise": f"N12345, Oakland Center, radar contact, 8,500, squawk 4521.",
        "approach": f"N12345, NorCal Approach, squawk 0425, report airport in sight.",
        "pattern": f"Palo Alto Traffic, Cessna 12345, 5 miles south, inbound for landing runway 31.",
        "emergency_engine": f"All aircraft, maintain current altitude and heading. Emergency aircraft has priority.",
        "emergency_lost": f"Aircraft calling, say again callsign and souls on board."
    }
    
    initial_msg = initial_messages.get(scenario_id, f"{scenario['atc_facility']}, standby.")
    
    # Generate audio for initial contact
    api_key = os.getenv("EMERGENT_LLM_KEY")
    audio_base64 = None
    
    if api_key:
        try:
            tts = OpenAITextToSpeech(api_key=api_key)
            audio_bytes = await tts.generate_speech(
                text=initial_msg,
                model="tts-1",
                voice="onyx",
                speed=1.1
            )
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"Initial contact TTS failed: {e}")
    
    return {
        "message": initial_msg,
        "audio_base64": audio_base64,
        "scenario": scenario
    }

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
async def get_random_listening_segment(access_code: str):
    """Get a random audio segment from videos marked as ready for evaluation"""
    import random
    
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
    
    # Collect all subtitles from all ready videos with their video info
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
    
    # Sort by duration (shortest first) and pick from the shortest ones
    all_segments.sort(key=lambda x: x['duration'])
    
    # Take from the shortest 50% of segments to prioritize shorter ones
    short_segments = all_segments[:max(1, len(all_segments) // 2)]
    
    # Select random segment from the short ones
    selected = random.choice(short_segments)
    video = selected['video']
    subtitle = selected['subtitle']
    
    return {
        "video_id": video['id'],
        "video_title": video['title'],
        "subtitle_id": subtitle.get('id', str(uuid.uuid4())),
        "start_time": subtitle['start_time'],
        "end_time": subtitle['end_time'],
        "duration": selected['duration'],
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
                language="en"  # ATC communications are in English
            )
        
        # Clean up
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        
        # Extract text from response
        transcription_text = response.text if hasattr(response, 'text') else str(response)
        
        logger.info(f"Transcription successful: {transcription_text[:100]}...")
        
        return {"transcription": transcription_text}
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        # Clean up on error
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))

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
