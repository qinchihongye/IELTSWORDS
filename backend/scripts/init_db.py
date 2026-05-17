"""
数据库初始化脚本
功能：
1. 复制原数据库到新数据库 (ielts_words_app.db)
2. 在新数据库中创建users表
3. 在新数据库中创建learning_progress表
4. 创建必要的索引
"""

import os
import sqlite3
import shutil
from datetime import datetime
from pathlib import Path

# 数据库路径
BASE_DIR = Path(__file__).resolve().parent.parent.parent
SOURCE_DB = BASE_DIR / "db" / "ielts_words.db"
TARGET_DB = BASE_DIR / "db" / "ielts_words_app.db"
LOCAL_IMAGE_DIR = BASE_DIR / "data" / "images"


def backup_existing_target() -> Path:
    """为现有目标数据库创建带时间戳的备份。"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = TARGET_DB.with_name(f"{TARGET_DB.stem}.backup_{timestamp}{TARGET_DB.suffix}")
    shutil.copy2(TARGET_DB, backup_path)
    return backup_path


def count_local_images() -> int:
    """统计 data/images 下的图片文件数量。"""
    if not LOCAL_IMAGE_DIR.exists():
        return 0

    allowed_suffixes = {".png", ".jpg", ".jpeg", ".webp"}
    return sum(
        1
        for path in LOCAL_IMAGE_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in allowed_suffixes
    )


def init_database():
    """初始化数据库"""

    # 检查源数据库是否存在
    if not SOURCE_DB.exists():
        print(f"❌ 错误: 源数据库不存在: {SOURCE_DB}")
        return False

    print(f"📦 开始初始化数据库...")

    if TARGET_DB.exists():
        backup_path = backup_existing_target()
        print(f"🛟 已为现有目标库创建备份: {backup_path}")
        if os.getenv("INIT_DB_OVERWRITE") != "1":
            print(f"⚠️ 检测到目标数据库已存在: {TARGET_DB}")
            print("为避免覆盖现有用户和学习数据，本次初始化已停止。")
            print("如确认需要覆盖，请先检查备份文件，然后使用 INIT_DB_OVERWRITE=1 重新执行。")
            return False

    # 1. 复制原数据库
    print(f"📋 复制数据库: {SOURCE_DB} -> {TARGET_DB}")
    try:
        shutil.copy2(SOURCE_DB, TARGET_DB)
        print(f"✅ 数据库复制成功")
    except Exception as e:
        print(f"❌ 数据库复制失败: {e}")
        return False

    # 2. 连接到新数据库
    print(f"🔌 连接到新数据库: {TARGET_DB}")
    conn = sqlite3.connect(TARGET_DB)
    cursor = conn.cursor()

    try:
        # 3. 创建users表
        print("📝 创建users表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uid TEXT UNIQUE,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        """)

        # 创建users表的索引
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_username ON users(username)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_email ON users(email)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_uid ON users(uid)")
        print("✅ users表创建成功")

        # 4. 创建learning_progress表
        print("📝 创建learning_progress表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learning_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                word_id INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('unlearned', 'learning', 'mastered')),
                last_reviewed TIMESTAMP,
                review_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (word_id) REFERENCES word_details(id),
                UNIQUE(user_id, word_id)
            )
        """)

        # 创建learning_progress表的索引
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_word ON learning_progress(user_id, word_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_status ON learning_progress(user_id, status)")
        print("✅ learning_progress表创建成功")

        print("📝 创建quiz_sessions表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS quiz_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                quiz_type TEXT NOT NULL,
                total_questions INTEGER DEFAULT 0,
                correct_answers INTEGER DEFAULT 0,
                score INTEGER DEFAULT 0,
                question_payload TEXT,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_quiz_user ON quiz_sessions(user_id)")
        print("✅ quiz_sessions表创建成功")

        # 5. 提交更改
        conn.commit()
        print("💾 数据库更改已提交")

        # 6. 验证表是否创建成功
        print("\n📊 验证数据库表...")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = cursor.fetchall()
        print(f"数据库中的表: {[table[0] for table in tables]}")

        # 检查原有表的数据
        cursor.execute("SELECT COUNT(*) FROM words")
        word_count = cursor.fetchone()[0]
        print(f"  - words表: {word_count} 条记录")

        cursor.execute("SELECT COUNT(*) FROM word_details")
        detail_count = cursor.fetchone()[0]
        print(f"  - word_details表: {detail_count} 条记录")

        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        print(f"  - users表: {user_count} 条记录")

        cursor.execute("SELECT COUNT(*) FROM learning_progress")
        progress_count = cursor.fetchone()[0]
        print(f"  - learning_progress表: {progress_count} 条记录")

        local_image_count = count_local_images()
        print(f"  - data/images: {local_image_count} 个文件")

        print("\n✅ 数据库初始化完成!")
        print(f"📁 新数据库位置: {TARGET_DB}")

        return True

    except Exception as e:
        print(f"❌ 数据库初始化失败: {e}")
        conn.rollback()
        return False

    finally:
        conn.close()


if __name__ == "__main__":
    print("=" * 60)
    print("IELTS单词背诵应用 - 数据库初始化")
    print("=" * 60)
    print()

    success = init_database()

    print()
    if success:
        print("🎉 数据库初始化成功!")
        print("现在可以启动后端服务了。")
    else:
        print("❌ 数据库初始化失败，请检查错误信息。")
    print()
