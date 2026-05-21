#!/usr/bin/env python3
"""
自动应用代码审查中发现的关键修复
使用方法: python apply_fixes.py
"""

import os
import sys
import re
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent

def backup_file(file_path):
    """备份文件"""
    backup_path = f"{file_path}.backup"
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        with open(backup_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✅ 已备份: {file_path} -> {backup_path}")
        return True
    return False

def fix_auth_password_verification():
    """修复 1: 密码验证逻辑"""
    file_path = PROJECT_ROOT / "backend" / "app" / "auth.py"

    if not os.path.exists(file_path):
        print(f"❌ 文件不存在: {file_path}")
        return False

    backup_file(file_path)

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 替换 verify_password 函数
    old_pattern = r'def verify_password\(plain_password: str, hashed_password: str\) -> bool:\s*"""[^"]*"""\s*try:\s*return bcrypt\.checkpw\(plain_password\.encode\(\'utf-8\'\), hashed_password\.encode\(\'utf-8\'\)\)\s*except Exception:\s*return False'

    new_code = '''def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码 - 使用bcrypt"""
    try:
        # 确保 hashed_password 是 bytes 类型
        hashed_bytes = hashed_password.encode('utf-8') if isinstance(hashed_password, str) else hashed_password
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_bytes)
    except (ValueError, TypeError) as e:
        # 只捕获特定异常，便于调试
        return False'''

    content = re.sub(old_pattern, new_code, content, flags=re.DOTALL)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"✅ 修复 1 完成: {file_path}")
    return True

def fix_auth_timezone():
    """修复 2: 时区问题"""
    file_path = PROJECT_ROOT / "backend" / "app" / "auth.py"

    if not os.path.exists(file_path):
        print(f"❌ 文件不存在: {file_path}")
        return False

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 添加 timezone 导入
    if 'from datetime import datetime, timedelta, timezone' not in content:
        content = content.replace(
            'from datetime import datetime, timedelta',
            'from datetime import datetime, timedelta, timezone'
        )

    # 替换 datetime.utcnow()
    content = content.replace('datetime.utcnow()', 'datetime.now(timezone.utc)')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"✅ 修复 2a 完成: {file_path}")

    # 修复 routers/auth.py
    file_path2 = PROJECT_ROOT / "backend" / "app" / "routers" / "auth.py"

    if os.path.exists(file_path2):
        backup_file(file_path2)

        with open(file_path2, 'r', encoding='utf-8') as f:
            content2 = f.read()

        # 添加 timezone 导入
        if 'from datetime import datetime, timezone' not in content2:
            if 'from datetime import datetime' in content2:
                content2 = content2.replace(
                    'from datetime import datetime',
                    'from datetime import datetime, timezone'
                )
            else:
                # 在文件开头添加导入
                content2 = 'from datetime import datetime, timezone\n' + content2

        # 替换 datetime.utcnow()
        content2 = content2.replace('datetime.utcnow()', 'datetime.now(timezone.utc)')

        with open(file_path2, 'w', encoding='utf-8') as f:
            f.write(content2)

        print(f"✅ 修复 2b 完成: {file_path2}")

    return True

def fix_secret_key_check():
    """修复 3: 环境变量强制检查"""
    file_path = PROJECT_ROOT / "backend" / "app" / "config" / "settings.py"

    if not os.path.exists(file_path):
        print(f"❌ 文件不存在: {file_path}")
        return False

    backup_file(file_path)

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 替换 SECRET_KEY 配置
    old_line = 'SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here-change-in-production")'
    new_lines = '''SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable must be set. "
        "Please add it to your .env file or set it in your environment."
    )'''

    content = content.replace(old_line, new_lines)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"✅ 修复 3 完成: {file_path}")

    # 检查 .env 文件
    env_path = PROJECT_ROOT / "backend" / ".env"
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            env_content = f.read()

        if 'SECRET_KEY=' not in env_content:
            print("⚠️  警告: .env 文件中没有 SECRET_KEY，请手动添加")
            print("   可以运行: python -c 'import secrets; print(secrets.token_urlsafe(32))'")
    else:
        print("⚠️  警告: .env 文件不存在，请创建并添加 SECRET_KEY")

    return True

def fix_random_word_query():
    """修复 4: 随机查询优化"""
    file_path = PROJECT_ROOT / "backend" / "app" / "crud.py"

    if not os.path.exists(file_path):
        print(f"❌ 文件不存在: {file_path}")
        return False

    backup_file(file_path)

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 查找并替换 get_random_word 函数
    old_pattern = r'def get_random_word\(db: Session, user_id: int\) -> Optional\[models\.WordDetail\]:.*?(?=\ndef |\Z)'

    new_code = '''def get_random_word(db: Session, user_id: int) -> Optional[models.WordDetail]:
    """随机获取单词，优先返回未学过的 - 使用数据库层面随机"""
    # 使用数据库的 RANDOM() 函数，避免加载所有数据到内存
    unlearned_word = db.query(models.WordDetail).outerjoin(
        models.LearningProgress,
        and_(
            models.LearningProgress.word_id == models.WordDetail.id,
            models.LearningProgress.user_id == user_id
        )
    ).filter(
        or_(
            models.LearningProgress.id == None,
            models.LearningProgress.status == 'unlearned'
        )
    ).order_by(func.random()).first()

    if unlearned_word:
        return unlearned_word

    # 如果没有未学单词，从所有单词中随机选择
    return db.query(models.WordDetail).order_by(func.random()).first()

'''

    content = re.sub(old_pattern, new_code, content, flags=re.DOTALL)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"✅ 修复 4 完成: {file_path}")
    return True

def create_index_script():
    """创建索引添加脚本"""
    script_path = PROJECT_ROOT / "backend" / "scripts" / "add_indexes.py"

    script_content = '''"""
添加数据库索引
"""
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.append(str(Path(__file__).parent.parent.parent))

from sqlalchemy import create_engine, text
from backend.app.config.settings import DATABASE_URL

def add_indexes():
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        # 检查索引是否已存在
        result = conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_user_word'"
        ))

        if not result.fetchone():
            print("创建索引 idx_user_word...")
            conn.execute(text(
                "CREATE INDEX idx_user_word ON learning_progress(user_id, word_id)"
            ))
            conn.commit()
            print("✅ 索引 idx_user_word 创建成功")
        else:
            print("索引 idx_user_word 已存在")

        result = conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_user_status'"
        ))

        if not result.fetchone():
            print("创建索引 idx_user_status...")
            conn.execute(text(
                "CREATE INDEX idx_user_status ON learning_progress(user_id, status)"
            ))
            conn.commit()
            print("✅ 索引 idx_user_status 创建成功")
        else:
            print("索引 idx_user_status 已存在")

if __name__ == "__main__":
    print("开始添加数据库索引...")
    add_indexes()
    print("完成！")
'''

    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(script_content)

    print(f"✅ 创建索引脚本: {script_path}")
    return True

def main():
    print("=" * 60)
    print("IELTS 单词应用 - 自动修复脚本")
    print("=" * 60)
    print()

    print("⚠️  警告: 此脚本将修改源代码文件")
    print("   原文件将备份为 .backup 后缀")
    print()

    response = input("是否继续? (y/n): ")
    if response.lower() != 'y':
        print("已取消")
        return

    print()
    print("开始应用修复...")
    print()

    # 应用修复
    fixes = [
        ("修复 1: 密码验证逻辑", fix_auth_password_verification),
        ("修复 2: 时区问题", fix_auth_timezone),
        ("修复 3: 环境变量强制检查", fix_secret_key_check),
        ("修复 4: 随机查询优化", fix_random_word_query),
        ("创建索引脚本", create_index_script),
    ]

    success_count = 0
    for name, fix_func in fixes:
        print(f"\n执行: {name}")
        try:
            if fix_func():
                success_count += 1
        except Exception as e:
            print(f"❌ 错误: {e}")

    print()
    print("=" * 60)
    print(f"完成! 成功应用 {success_count}/{len(fixes)} 个修复")
    print("=" * 60)
    print()
    print("下一步:")
    print("1. 检查 backend/.env 文件，确保有 SECRET_KEY")
    print("2. 运行: python backend/scripts/add_indexes.py")
    print("3. 重启后端服务器测试")
    print()

if __name__ == "__main__":
    main()
