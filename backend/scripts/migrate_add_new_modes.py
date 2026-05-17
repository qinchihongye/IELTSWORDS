"""
数据库迁移脚本 - 添加新学习模式支持
为现有数据库添加新的表和字段
"""

import sqlite3
import sys
from pathlib import Path

# 获取数据库路径
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "db" / "ielts_words_app.db"

def migrate():
    """执行数据库迁移"""
    print("=" * 60)
    print("开始数据库迁移 - 添加新学习模式支持")
    print("=" * 60)
    print(f"数据库路径: {DB_PATH}")

    if not DB_PATH.exists():
        print(f"❌ 错误: 数据库文件不存在: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # 1. 为 learning_progress 表添加新字段
        print("\n📝 步骤 1: 扩展 learning_progress 表...")

        # 检查字段是否已存在
        cursor.execute("PRAGMA table_info(learning_progress)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'next_review_date' not in columns:
            cursor.execute("""
                ALTER TABLE learning_progress
                ADD COLUMN next_review_date TIMESTAMP
            """)
            print("  ✅ 添加字段: next_review_date")
        else:
            print("  ⏭️  字段已存在: next_review_date")

        if 'difficulty_level' not in columns:
            cursor.execute("""
                ALTER TABLE learning_progress
                ADD COLUMN difficulty_level INTEGER DEFAULT 3
            """)
            print("  ✅ 添加字段: difficulty_level")
        else:
            print("  ⏭️  字段已存在: difficulty_level")

        if 'is_mistake_marked' not in columns:
            cursor.execute("""
                ALTER TABLE learning_progress
                ADD COLUMN is_mistake_marked BOOLEAN DEFAULT 0
            """)
            print("  ✅ 添加字段: is_mistake_marked")
        else:
            print("  ⏭️  字段已存在: is_mistake_marked")

        # 2. 创建 check_in_streaks 表
        print("\n📝 步骤 2: 创建 check_in_streaks 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS check_in_streaks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                current_streak INTEGER DEFAULT 0,
                longest_streak INTEGER DEFAULT 0,
                last_check_in_date TIMESTAMP,
                total_check_ins INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_streak_user ON check_in_streaks(user_id)")
        print("  ✅ 表创建成功: check_in_streaks")

        # 3. 创建 daily_check_ins 表
        print("\n📝 步骤 3: 创建 daily_check_ins 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_check_ins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                check_in_date TIMESTAMP NOT NULL,
                words_learned INTEGER DEFAULT 0,
                words_reviewed INTEGER DEFAULT 0,
                quiz_score INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_date ON daily_check_ins(user_id, check_in_date)")
        print("  ✅ 表创建成功: daily_check_ins")

        # 4. 创建 quiz_sessions 表
        print("\n📝 步骤 4: 创建 quiz_sessions 表...")
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
        print("  ✅ 表创建成功: quiz_sessions")

        cursor.execute("PRAGMA table_info(quiz_sessions)")
        quiz_columns = [col[1] for col in cursor.fetchall()]
        if 'question_payload' not in quiz_columns:
            cursor.execute("""
                ALTER TABLE quiz_sessions
                ADD COLUMN question_payload TEXT
            """)
            print("  ✅ 添加字段: question_payload")
        else:
            print("  ⏭️  字段已存在: question_payload")

        # 5. 创建 quiz_answers 表
        print("\n📝 步骤 5: 创建 quiz_answers 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS quiz_answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                word_id INTEGER NOT NULL,
                user_answer TEXT,
                is_correct BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES quiz_sessions(id),
                FOREIGN KEY (word_id) REFERENCES word_details(id)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_answer_session ON quiz_answers(session_id)")
        print("  ✅ 表创建成功: quiz_answers")

        # 提交更改
        conn.commit()

        # 验证迁移
        print("\n📊 验证迁移结果...")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [row[0] for row in cursor.fetchall()]

        required_tables = ['check_in_streaks', 'daily_check_ins', 'quiz_sessions', 'quiz_answers']
        for table in required_tables:
            if table in tables:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                print(f"  ✅ {table}: {count} 条记录")
            else:
                print(f"  ❌ {table}: 表不存在")

        print("\n" + "=" * 60)
        print("✅ 数据库迁移完成！")
        print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ 迁移失败: {e}")
        sys.exit(1)

    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
