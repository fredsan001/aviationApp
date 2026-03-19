from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi.responses import StreamingResponse, Response
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import base64
import aiofiles
import asyncio

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

class VideoCreate(BaseModel):
    title: str
    description: str = ""
    category: str = "General"

class VideoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None

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
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserProgressUpdate(BaseModel):
    watched_count: Optional[int] = None
    last_position: Optional[float] = None
    is_favorite: Optional[bool] = None
    completed: Optional[bool] = None

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

ADMIN_PASSWORD = "aero2024admin"  # Simple admin password

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
    auto_transcribe: str = Form("true"),
    file: UploadFile = File(...)
):
    """Upload a video with optional automatic transcription"""
    
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
        update_data = {k: v for k, v in update.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        await db.user_progress.update_one(
            {"access_code": access_code, "video_id": video_id},
            {"$set": update_data}
        )
    else:
        new_progress = UserProgress(
            access_code=access_code,
            video_id=video_id,
            watched_count=update.watched_count or 0,
            last_position=update.last_position or 0,
            is_favorite=update.is_favorite or False,
            completed=update.completed or False
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
