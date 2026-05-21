#!/usr/bin/env python3
"""
修复随机单词模式没有配图的问题
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent

def fix_random_word_images():
    """修复前端代码，让随机单词模式也加载配图"""

    file_path = PROJECT_ROOT / "frontend" / "src" / "pages" / "Learning.jsx"

    if not os.path.exists(file_path):
        print(f"❌ 文件不存在: {file_path}")
        return False

    # 备份文件
    backup_path = f"{file_path}.backup"
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    with open(backup_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✅ 已备份: {file_path} -> {backup_path}")

    # 查找并替换 loadRandomWordContent 函数
    old_code = """  const loadRandomWordContent = async () => {
    setLoading(true);
    setCurrentWord(null);
    setCurrentGroup(null);
    setWords([]);
    setCurrentIndex(0);
    setImages([]);

    const word = await fetchRandomWord();
    setCurrentWord(word);
    setLoading(false);
  };"""

    new_code = """  const loadRandomWordContent = async () => {
    setLoading(true);
    setCurrentWord(null);
    setCurrentGroup(null);
    setWords([]);
    setCurrentIndex(0);
    setImages([]);

    const word = await fetchRandomWord();
    setCurrentWord(word);

    // 尝试加载该单词所属分组的配图
    if (word && word.chapterNo && word.groupId) {
      await fetchImagesByGroup(word.chapterNo, word.groupId);
    }

    setLoading(false);
  };"""

    if old_code in content:
        content = content.replace(old_code, new_code)

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        print(f"✅ 修复完成: {file_path}")
        print("   随机单词模式现在会尝试加载配图")
        return True
    else:
        print("⚠️  警告: 未找到需要修复的代码段")
        print("   可能代码已经被修改过了")
        return False

def fix_database_typo():
    """修复数据库中的 groupId 拼写错误"""
    import sqlite3

    db_path = PROJECT_ROOT / "db" / "ielts_words_app.db"

    if not os.path.exists(db_path):
        print(f"❌ 数据库不存在: {db_path}")
        return False

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 检查是否存在拼写错误
        cursor.execute("SELECT COUNT(*) FROM word_details WHERE groupId = 'gtoup8'")
        count = cursor.fetchone()[0]

        if count > 0:
            print(f"发现 {count} 个单词的 groupId 拼写错误 (gtoup8)")

            # 修复 word_details 表
            cursor.execute("UPDATE word_details SET groupId = 'group8' WHERE groupId = 'gtoup8'")

            # 修复 images 表（如果有的话）
            cursor.execute("UPDATE images SET groupId = 'group8' WHERE groupId = 'gtoup8'")

            conn.commit()
            print("✅ 已修复数据库中的拼写错误: gtoup8 -> group8")
        else:
            print("✅ 数据库中没有拼写错误")

        conn.close()
        return True

    except Exception as e:
        print(f"❌ 修复数据库时出错: {e}")
        return False

def show_groups_without_images():
    """显示没有配图的分组"""
    import sqlite3

    db_path = PROJECT_ROOT / "db" / "ielts_words_app.db"

    if not os.path.exists(db_path):
        print(f"❌ 数据库不存在: {db_path}")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        query = """
        SELECT
            w.chapterNo,
            w.chapterName,
            w.groupId,
            w.groupTheme,
            COUNT(DISTINCT w.word) as word_count
        FROM word_details w
        WHERE NOT EXISTS (
            SELECT 1 FROM images i
            WHERE i.chapterNo = w.chapterNo AND i.groupId = w.groupId
        )
        GROUP BY w.chapterNo, w.groupId
        ORDER BY w.chapterNo, w.groupId
        """

        cursor.execute(query)
        results = cursor.fetchall()

        if results:
            print("\n📊 没有配图的分组:")
            print("-" * 80)
            for row in results:
                chapter_no, chapter_name, group_id, group_theme, word_count = row
                print(f"  第{chapter_no}章 {chapter_name} - {group_id} ({group_theme}) - {word_count}个单词")
            print("-" * 80)
        else:
            print("\n✅ 所有分组都有配图")

        conn.close()

    except Exception as e:
        print(f"❌ 查询数据库时出错: {e}")

def main():
    print("=" * 60)
    print("修复随机单词模式配图问题")
    print("=" * 60)
    print()

    # 显示没有配图的分组
    show_groups_without_images()
    print()

    response = input("是否继续修复? (y/n): ")
    if response.lower() != 'y':
        print("已取消")
        return

    print()
    print("开始修复...")
    print()

    # 修复 1: 前端代码
    print("修复 1: 让随机单词模式加载配图")
    fix_random_word_images()
    print()

    # 修复 2: 数据库拼写错误
    print("修复 2: 修复数据库中的拼写错误")
    fix_database_typo()
    print()

    print("=" * 60)
    print("修复完成！")
    print("=" * 60)
    print()
    print("下一步:")
    print("1. 重启前端开发服务器")
    print("2. 测试随机单词模式")
    print("3. 检查是否能看到配图")
    print()

if __name__ == "__main__":
    main()
