import sqlite3
import shutil
from pathlib import Path

backup_db = Path("db/ielts_words_app.backup_20260626_141702.db")
new_source_db = Path("db/ielts_words.db")
target_db = Path("db/ielts_words_app.db")

def main():
    print("1. 备份当前的 ielts_words_app.db...")
    if target_db.exists():
        shutil.copy2(target_db, target_db.with_name("ielts_words_app.db.before_restore"))

    print("2. 从备份还原用户数据...")
    shutil.copy2(backup_db, target_db)

    print("3. 连接数据库并读取映射关系...")
    conn_target = sqlite3.connect(target_db)
    cursor_target = conn_target.cursor()

    # 读取旧 word_details 的 id -> (word, chapterNo) 映射
    cursor_target.execute("SELECT id, word, chapterNo FROM word_details")
    old_words = {row[0]: (row[1], row[2]) for row in cursor_target.fetchall()}

    # 连接新数据库，获取新 word_details 的 (word, chapterNo) -> id 映射
    conn_new = sqlite3.connect(new_source_db)
    cursor_new = conn_new.cursor()
    cursor_new.execute("SELECT id, word, chapterNo FROM word_details")
    new_words = {}
    for row in cursor_new.fetchall():
        new_words[(row[1], row[2])] = row[0]

    print("4. 清空并替换 words, word_details, images 表...")
    cursor_target.execute("DELETE FROM words")
    cursor_target.execute("DELETE FROM word_details")
    cursor_target.execute("DELETE FROM images")

    # 复制新数据到 target
    cursor_new.execute("SELECT word, chapterNo, chapterName, groupId, groupTheme, wordNo, explanation FROM words")
    target_words = cursor_new.fetchall()
    cursor_target.executemany("""
        INSERT INTO words (word, chapterNo, chapterName, groupId, groupTheme, wordNo, explanation)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, target_words)

    cursor_new.execute("""
        SELECT chapterNo, chapterName, groupId, groupTheme, wordNo, word,
               explanation, candidateWords, json, roots_affixes, derivatives,
               exampleSentence, sentenceMeaning, "group", photo_prompt,
               new_prompt, group_words, "单词备注"
        FROM word_details
    """)
    target_details = cursor_new.fetchall()
    cursor_target.executemany("""
        INSERT INTO word_details (
            chapterNo, chapterName, groupId, groupTheme, wordNo, word,
            explanation, candidateWords, json, roots_affixes, derivatives,
            exampleSentence, sentenceMeaning, "group", photo_prompt,
            new_prompt, group_words, "单词备注"
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, target_details)

    cursor_new.execute('SELECT chapterNo, chapterName, groupId, groupTheme, "配图number" FROM images')
    target_images = cursor_new.fetchall()
    cursor_target.executemany("""
        INSERT INTO images (chapterNo, chapterName, groupId, groupTheme, "配图number", image_data)
        VALUES (?, ?, ?, ?, ?, zeroblob(0))
    """, target_images)

    print("5. 更新 learning_progress 的 word_id 关联关系...")
    cursor_target.execute("SELECT id, word_id FROM learning_progress")
    progress_records = cursor_target.fetchall()

    updated_count = 0
    deleted_count = 0

    for progress_id, old_word_id in progress_records:
        if old_word_id in old_words:
            word, chapter_no = old_words[old_word_id]
            if (word, chapter_no) in new_words:
                new_word_id = new_words[(word, chapter_no)]
                try:
                    cursor_target.execute(
                        "UPDATE learning_progress SET word_id = ? WHERE id = ?",
                        (new_word_id, progress_id)
                    )
                    updated_count += 1
                except sqlite3.IntegrityError:
                    # Duplicate entry for this user and new word ID, delete the duplicate progress record
                    cursor_target.execute("DELETE FROM learning_progress WHERE id = ?", (progress_id,))
                    deleted_count += 1
            else:
                # 单词在新版本中被删除了，清除该条学习进度
                cursor_target.execute("DELETE FROM learning_progress WHERE id = ?", (progress_id,))
                deleted_count += 1

    print(f"成功更新 {updated_count} 条学习记录，清除了 {deleted_count} 条已不存在词汇的学习记录")

    conn_target.commit()
    conn_target.close()
    conn_new.close()
    print("🎉 还原并更新完成！用户和进度数据已安全保留。")

if __name__ == "__main__":
    main()
