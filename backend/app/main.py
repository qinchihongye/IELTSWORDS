"""
FastAPI主应用
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .config.settings import (
    BASE_DIR,
    CORS_MAX_AGE,
    CORS_ORIGINS,
    SERVER_ACCESS_LOG,
    SERVER_HOST,
    SERVER_PORT,
    SERVER_RELOAD,
    print_config,
)
from .database import engine, ensure_runtime_schema
from .logging_config import get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_runtime_schema()
    yield


# 创建FastAPI应用
app = FastAPI(
    title="IELTS单词背诵API",
    description="基于配图记忆的雅思单词学习应用后端API",
    version="1.0.0",
    lifespan=lifespan,
)

UPLOADS_DIR = BASE_DIR / "data" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

BUILTIN_AVATARS_DIR = BASE_DIR / "data" / "builtin-avatars"
BUILTIN_AVATARS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/builtin-avatars", StaticFiles(directory=str(BUILTIN_AVATARS_DIR)), name="builtin-avatars")

PRESET_AVATARS_DIR = BASE_DIR / "预设头像"
if PRESET_AVATARS_DIR.exists():
    app.mount("/preset-avatars", StaticFiles(directory=str(PRESET_AVATARS_DIR)), name="preset-avatars")

# [警告] 开放数据库目录，仅供本地开发调试时下载使用
# 如果要部署到公网，请务必删除或加权限控制，否则会导致数据库泄漏！
DB_DIR = BASE_DIR / "db"
if DB_DIR.exists():
    app.mount("/db", StaticFiles(directory=str(DB_DIR)), name="db")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=CORS_MAX_AGE,
)

# 根路由
@app.get("/")
async def root():
    return {
        "message": "IELTS单词背诵API",
        "version": "1.0.0",
        "docs": "/docs"
    }

# 健康检查
@app.get("/health")
async def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "ok"}
    except Exception:
        return {"status": "unhealthy", "database": "error"}

# 导入路由
from .routers import auth, avatars, chapters, groups, words, images, progress, review, mistakes, checkin, quiz, admin, ai, custom_books

# 注册路由
app.include_router(avatars.router, prefix="/api/avatars", tags=["头像"])
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(chapters.router, prefix="/api/chapters", tags=["章节"])
app.include_router(groups.router, prefix="/api/groups", tags=["分组"])
app.include_router(words.router, prefix="/api/words", tags=["单词"])
app.include_router(images.router, prefix="/api/images", tags=["图片"])
app.include_router(progress.router, prefix="/api/progress", tags=["学习进度"])
app.include_router(review.router, prefix="/api/review", tags=["复习模式"])
app.include_router(mistakes.router, prefix="/api/mistakes", tags=["错题本"])
app.include_router(checkin.router, prefix="/api/checkin", tags=["打卡"])
app.include_router(quiz.router, prefix="/api/quiz", tags=["测试"])
app.include_router(admin.router, prefix="/api/admin", tags=["管理员"])
app.include_router(ai.router, prefix="/api/ai", tags=["Berry"])
app.include_router(custom_books.router, prefix="/api/custom-books", tags=["自定义词书"])

if __name__ == "__main__":
    import uvicorn
    print_config()
    logger.info("启动FastAPI服务器...")
    uvicorn.run(
        "app.main:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=SERVER_RELOAD,
        access_log=SERVER_ACCESS_LOG,
    )
