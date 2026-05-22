"""
数据库连接配置
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .avatar_storage import (
    DEFAULT_BUILTIN_AVATAR_KEY,
    delete_uploaded_avatar_file,
    LEGACY_BUILTIN_AVATAR_KEY_MAP,
    RENAMED_BUILTIN_AVATAR_KEY_MAP,
    VALID_BUILTIN_AVATAR_KEYS,
    VIP_ONLY_BUILTIN_AVATAR_KEYS,
)
from .config.settings import DATABASE_URL

# 创建数据库引擎
engine_kwargs = {"echo": False}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update(
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_size=1,
    )

engine = create_engine(DATABASE_URL, **engine_kwargs)

# 创建SessionLocal类
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建Base类
Base = declarative_base()


def normalize_builtin_avatar_value(avatar_value: str | None) -> str:
    value = (avatar_value or "").strip()
    if not value:
        return DEFAULT_BUILTIN_AVATAR_KEY

    if value in VALID_BUILTIN_AVATAR_KEYS:
        return value

    renamed_value = RENAMED_BUILTIN_AVATAR_KEY_MAP.get(value)
    if renamed_value:
        return renamed_value

    return LEGACY_BUILTIN_AVATAR_KEY_MAP.get(value, DEFAULT_BUILTIN_AVATAR_KEY)


def ensure_runtime_schema():
    """为已有数据库补齐当前运行所需的表和字段。"""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    statements = []
    uploaded_avatar_values_to_delete: list[str] = []

    if "users" not in existing_tables:
        statements.append(f"""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            is_active BOOLEAN NOT NULL DEFAULT 1,
            avatar_type TEXT NOT NULL DEFAULT 'builtin',
            avatar_value TEXT NOT NULL DEFAULT '{DEFAULT_BUILTIN_AVATAR_KEY}',
            ai_base_url TEXT,
            ai_api_key_encrypted TEXT,
            ai_model TEXT,
            ai_model_display_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )
        """)
        statements.append("CREATE INDEX IF NOT EXISTS idx_username ON users(username)")
        statements.append("CREATE INDEX IF NOT EXISTS idx_email ON users(email)")
        statements.append("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_uid ON users(uid)")
    else:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "uid" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN uid TEXT")
        if "role" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
        if "is_active" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1")
        if "avatar_type" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN avatar_type TEXT NOT NULL DEFAULT 'builtin'")
        if "avatar_value" not in user_columns:
            statements.append(f"ALTER TABLE users ADD COLUMN avatar_value TEXT NOT NULL DEFAULT '{DEFAULT_BUILTIN_AVATAR_KEY}'")
        if "ai_base_url" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN ai_base_url TEXT")
        if "ai_api_key_encrypted" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN ai_api_key_encrypted TEXT")
        if "ai_model" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN ai_model TEXT")
        if "ai_model_display_name" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN ai_model_display_name TEXT")
        if "updated_at" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP")
        statements.append("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_uid ON users(uid)")
        statements.append("UPDATE users SET avatar_type = 'builtin' WHERE avatar_type IS NULL OR TRIM(avatar_type) = ''")
        statements.append(f"UPDATE users SET avatar_value = '{DEFAULT_BUILTIN_AVATAR_KEY}' WHERE avatar_value IS NULL OR TRIM(avatar_value) = ''")

    if "learning_progress" not in existing_tables:
        statements.append("""
        CREATE TABLE learning_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            word_id INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('unlearned', 'learning', 'mastered')),
            last_reviewed TIMESTAMP,
            review_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            next_review_date TIMESTAMP,
            difficulty_level INTEGER DEFAULT 3,
            is_mistake_marked BOOLEAN DEFAULT 0,
            easiness_factor REAL DEFAULT 2.5 NOT NULL,
            interval INTEGER DEFAULT 0 NOT NULL,
            repetitions INTEGER DEFAULT 0 NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (word_id) REFERENCES word_details(id),
            UNIQUE(user_id, word_id)
        )
        """)
        statements.append("CREATE INDEX IF NOT EXISTS idx_user_word ON learning_progress(user_id, word_id)")
        statements.append("CREATE INDEX IF NOT EXISTS idx_user_status ON learning_progress(user_id, status)")
    else:
        progress_columns = {column["name"] for column in inspector.get_columns("learning_progress")}
        if "next_review_date" not in progress_columns:
            statements.append("ALTER TABLE learning_progress ADD COLUMN next_review_date TIMESTAMP")
        if "difficulty_level" not in progress_columns:
            statements.append("ALTER TABLE learning_progress ADD COLUMN difficulty_level INTEGER DEFAULT 3")
        if "is_mistake_marked" not in progress_columns:
            statements.append("ALTER TABLE learning_progress ADD COLUMN is_mistake_marked BOOLEAN DEFAULT 0")
        if "easiness_factor" not in progress_columns:
            statements.append("ALTER TABLE learning_progress ADD COLUMN easiness_factor REAL NOT NULL DEFAULT 2.5")
        if "interval" not in progress_columns:
            statements.append("ALTER TABLE learning_progress ADD COLUMN interval INTEGER NOT NULL DEFAULT 0")
        if "repetitions" not in progress_columns:
            statements.append("ALTER TABLE learning_progress ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0")

    if "check_in_streaks" not in existing_tables:
        statements.append("""
        CREATE TABLE check_in_streaks (
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
        statements.append("CREATE INDEX IF NOT EXISTS idx_streak_user ON check_in_streaks(user_id)")

    if "daily_check_ins" not in existing_tables:
        statements.append("""
        CREATE TABLE daily_check_ins (
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
        statements.append("CREATE INDEX IF NOT EXISTS idx_user_date ON daily_check_ins(user_id, check_in_date)")

    if "quiz_sessions" not in existing_tables:
        statements.append("""
        CREATE TABLE quiz_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            quiz_type TEXT NOT NULL,
            total_questions INTEGER DEFAULT 0,
            correct_answers INTEGER DEFAULT 0,
            score INTEGER DEFAULT 0,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            question_payload TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """)
        statements.append("CREATE INDEX IF NOT EXISTS idx_quiz_user ON quiz_sessions(user_id)")
    else:
        quiz_columns = {column["name"] for column in inspector.get_columns("quiz_sessions")}
        if "question_payload" not in quiz_columns:
            statements.append("ALTER TABLE quiz_sessions ADD COLUMN question_payload TEXT")

    if "quiz_answers" not in existing_tables:
        statements.append("""
        CREATE TABLE quiz_answers (
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
        statements.append("CREATE INDEX IF NOT EXISTS idx_answer_session ON quiz_answers(session_id)")

    # word_details: 音标字段
    if "word_details" in existing_tables:
        wd_columns = {column["name"] for column in inspector.get_columns("word_details")}
        if "phonetics_uk" not in wd_columns:
            statements.append("ALTER TABLE word_details ADD COLUMN phonetics_uk TEXT")
        if "phonetics_us" not in wd_columns:
            statements.append("ALTER TABLE word_details ADD COLUMN phonetics_us TEXT")

    if "custom_books" not in existing_tables:
        statements.append("""
        CREATE TABLE custom_books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            source_filename TEXT,
            source_format TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """)
        statements.append("CREATE INDEX IF NOT EXISTS idx_custom_books_user ON custom_books(user_id)")
    else:
        custom_books_columns = {column["name"] for column in inspector.get_columns("custom_books")}
        if "description" not in custom_books_columns:
            statements.append("ALTER TABLE custom_books ADD COLUMN description TEXT")
        if "source_filename" not in custom_books_columns:
            statements.append("ALTER TABLE custom_books ADD COLUMN source_filename TEXT")
        if "source_format" not in custom_books_columns:
            statements.append("ALTER TABLE custom_books ADD COLUMN source_format TEXT")
        if "updated_at" not in custom_books_columns:
            statements.append("ALTER TABLE custom_books ADD COLUMN updated_at TIMESTAMP")

    if "custom_book_groups" not in existing_tables:
        statements.append("""
        CREATE TABLE custom_book_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            group_key TEXT NOT NULL,
            group_name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES custom_books(id),
            UNIQUE(book_id, group_key)
        )
        """)
        statements.append("CREATE INDEX IF NOT EXISTS idx_custom_book_groups_book ON custom_book_groups(book_id)")
    else:
        custom_book_groups_columns = {column["name"] for column in inspector.get_columns("custom_book_groups")}
        if "sort_order" not in custom_book_groups_columns:
            statements.append("ALTER TABLE custom_book_groups ADD COLUMN sort_order INTEGER DEFAULT 0")
        if "created_at" not in custom_book_groups_columns:
            statements.append("ALTER TABLE custom_book_groups ADD COLUMN created_at TIMESTAMP")

    if "custom_book_words" not in existing_tables:
        statements.append("""
        CREATE TABLE custom_book_words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            word TEXT NOT NULL,
            explanation TEXT NOT NULL,
            wordNo TEXT,
            candidateWords TEXT,
            roots_affixes TEXT,
            derivatives TEXT,
            exampleSentence TEXT,
            sentenceMeaning TEXT,
            word_note TEXT,
            phonetics_uk TEXT,
            phonetics_us TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES custom_books(id),
            FOREIGN KEY (group_id) REFERENCES custom_book_groups(id)
        )
        """)
        statements.append("CREATE INDEX IF NOT EXISTS idx_custom_book_words_book ON custom_book_words(book_id)")
        statements.append("CREATE INDEX IF NOT EXISTS idx_custom_book_words_group ON custom_book_words(group_id)")
        statements.append("CREATE INDEX IF NOT EXISTS idx_custom_book_words_word ON custom_book_words(word)")
    else:
        custom_book_words_columns = {column["name"] for column in inspector.get_columns("custom_book_words")}
        if "candidateWords" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN candidateWords TEXT")
        if "roots_affixes" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN roots_affixes TEXT")
        if "derivatives" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN derivatives TEXT")
        if "exampleSentence" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN exampleSentence TEXT")
        if "sentenceMeaning" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN sentenceMeaning TEXT")
        if "word_note" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN word_note TEXT")
        if "phonetics_uk" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN phonetics_uk TEXT")
        if "phonetics_us" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN phonetics_us TEXT")
        if "sort_order" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN sort_order INTEGER DEFAULT 0")
        if "created_at" not in custom_book_words_columns:
            statements.append("ALTER TABLE custom_book_words ADD COLUMN created_at TIMESTAMP")

    if "custom_book_progress" not in existing_tables:
        statements.append("""
        CREATE TABLE custom_book_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            book_word_id INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('unlearned', 'learning', 'mastered')),
            last_reviewed TIMESTAMP,
            review_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            next_review_date TIMESTAMP,
            easiness_factor REAL DEFAULT 2.5 NOT NULL,
            interval INTEGER DEFAULT 0 NOT NULL,
            repetitions INTEGER DEFAULT 0 NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (book_word_id) REFERENCES custom_book_words(id),
            UNIQUE(user_id, book_word_id)
        )
        """)
        statements.append("CREATE INDEX IF NOT EXISTS idx_custom_book_progress_user ON custom_book_progress(user_id)")
        statements.append("CREATE INDEX IF NOT EXISTS idx_custom_book_progress_word ON custom_book_progress(book_word_id)")
        statements.append("CREATE INDEX IF NOT EXISTS idx_custom_book_progress_user_status ON custom_book_progress(user_id, status)")
    else:
        custom_book_progress_columns = {column["name"] for column in inspector.get_columns("custom_book_progress")}
        if "review_count" not in custom_book_progress_columns:
            statements.append("ALTER TABLE custom_book_progress ADD COLUMN review_count INTEGER DEFAULT 0")
        if "updated_at" not in custom_book_progress_columns:
            statements.append("ALTER TABLE custom_book_progress ADD COLUMN updated_at TIMESTAMP")
        if "next_review_date" not in custom_book_progress_columns:
            statements.append("ALTER TABLE custom_book_progress ADD COLUMN next_review_date TIMESTAMP")
        if "easiness_factor" not in custom_book_progress_columns:
            statements.append("ALTER TABLE custom_book_progress ADD COLUMN easiness_factor REAL NOT NULL DEFAULT 2.5")
        if "interval" not in custom_book_progress_columns:
            statements.append("ALTER TABLE custom_book_progress ADD COLUMN interval INTEGER NOT NULL DEFAULT 0")
        if "repetitions" not in custom_book_progress_columns:
            statements.append("ALTER TABLE custom_book_progress ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

        if "users" in existing_tables or any("CREATE TABLE users" in statement for statement in statements):
            rows = connection.execute(
                text("SELECT id, role, avatar_type, avatar_value FROM users")
            ).mappings().all()
            for row in rows:
                if row["avatar_type"] == "upload" and row["role"] not in {"premium_user", "admin", "super_admin"}:
                    if row["avatar_value"]:
                        uploaded_avatar_values_to_delete.append(row["avatar_value"])
                    connection.execute(
                        text("""
                        UPDATE users
                        SET avatar_type = 'builtin', avatar_value = :avatar_value
                        WHERE id = :user_id
                        """),
                        {
                            "avatar_value": DEFAULT_BUILTIN_AVATAR_KEY,
                            "user_id": row["id"],
                        },
                    )
                    continue

                if row["avatar_type"] != "builtin":
                    continue

                normalized_value = normalize_builtin_avatar_value(row["avatar_value"])
                if normalized_value == row["avatar_value"]:
                    continue

                connection.execute(
                    text("UPDATE users SET avatar_value = :avatar_value WHERE id = :user_id"),
                    {
                        "avatar_value": normalized_value,
                        "user_id": row["id"],
                    },
                )

            vip_only_keys = tuple(VIP_ONLY_BUILTIN_AVATAR_KEYS)
            if vip_only_keys:
                placeholders = ", ".join(f":vip_only_avatar_{index}" for index, _ in enumerate(vip_only_keys))
                params = {
                    "default_avatar": DEFAULT_BUILTIN_AVATAR_KEY,
                }
                params.update(
                    {
                        f"vip_only_avatar_{index}": avatar_key
                        for index, avatar_key in enumerate(vip_only_keys)
                    }
                )
                connection.execute(
                    text(f"""
                    UPDATE users
                    SET avatar_value = :default_avatar
                    WHERE avatar_type = 'builtin'
                      AND avatar_value IN ({placeholders})
                      AND role NOT IN ('premium_user', 'admin', 'super_admin')
                    """),
                    params,
                )

    for avatar_value in uploaded_avatar_values_to_delete:
        delete_uploaded_avatar_file(avatar_value)

# 依赖注入：获取数据库会话
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
