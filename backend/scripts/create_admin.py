"""
创建管理员账户
用法: python create_admin.py <用户名> <邮箱> <密码> [角色]
示例: python create_admin.py admin admin@example.com MySecurePass123 super_admin
"""

import sys
import getpass
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from app import models
from app.auth import get_password_hash
from app.database import SessionLocal, ensure_runtime_schema
from app.config.settings import DATABASE_URL

ADMIN_ROLES = {"admin", "super_admin"}

def create_admin_user(username: str, email: str, password: str, role: str = "super_admin"):
    """创建管理员账户"""
    if len(password) < 8:
        print("❌ 密码长度至少为8位")
        return

    if role not in ADMIN_ROLES:
        print("❌ 管理员脚本只允许创建 admin 或 super_admin")
        return

    ensure_runtime_schema()
    db = SessionLocal()

    try:
        existing_user = db.query(models.User).filter(models.User.username == username).first()
        if existing_user:
            print(f"❌ 用户 '{username}' 已存在")
            return

        existing_email = db.query(models.User).filter(models.User.email == email).first()
        if existing_email:
            print(f"❌ 邮箱 '{email}' 已被注册")
            return

        hashed_password = get_password_hash(password)

        admin_user = models.User(
            username=username,
            email=email,
            hashed_password=hashed_password,
            role=role,
            is_active=True
        )

        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

        print("=" * 60)
        print("✅ 管理员账户创建成功！")
        print("=" * 60)
        print(f"数据库: {DATABASE_URL}")
        print(f"用户名: {username}")
        print(f"邮箱: {email}")
        print(f"角色: {role}")
        print(f"用户ID: {admin_user.id}")
        print("=" * 60)

    except Exception as e:
        print(f"❌ 创建用户失败: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    role = "super_admin"
    if len(sys.argv) in (4, 5):
        username, email, password = sys.argv[1], sys.argv[2], sys.argv[3]
        if len(sys.argv) == 5:
            role = sys.argv[4]
    elif len(sys.argv) == 1:
        username = input("用户名: ").strip()
        email = input("邮箱: ").strip()
        password = getpass.getpass("密码 (至少8位): ").strip()
        confirm = getpass.getpass("确认密码: ").strip()
        if password != confirm:
            print("❌ 两次输入的密码不一致")
            sys.exit(1)
        role_input = input("角色 admin/super_admin (默认 super_admin): ").strip()
        role = role_input or role
    else:
        print("用法: python create_admin.py <用户名> <邮箱> <密码> [角色]")
        print("或直接运行脚本以交互式输入")
        sys.exit(1)

    create_admin_user(username, email, password, role)
