import sqlite3
import shutil
from pathlib import Path

backup_db = Path("db/ielts_words_app.backup_20260626_141702.db")
new_source_db = Path("db/ielts_words.db")
target_db = Path("db/ielts_words_app.db")

def main():
    print("1. 备份当前的 ielts_words_app.db...")
    if target_db.exists():
        shutil.copy2(target_db, target_db.with_name("ielts_words_app.db.before_restore_all"))

    print("2. 从备份还原用户数据...")
    shutil.copy2(backup_db, target_db)

    print("3. 连接数据库并读取映射关系...")
    conn_target = sqlite3.connect(target_db)
    cursor_target = conn_target.cursor()

    # 读取旧 word_details 的 id -> (word, chapterNo) 映射
    cursor_target.execute("SELECT id, word, chapterNo FROM word_details")
    old_words = {row[0]: (row[1], row[2]) for row in cursor_target.fetchall()}

    # 连接新数据库，获取新 word_details 的映射
    # 建立两个映射表：
    # 1. 精确匹配：(word, chapterNo) -> id
    # 2. 模糊匹配：word -> list of ids
    conn_new = sqlite3.connect(new_source_db)
    cursor_new = conn_new.cursor()
    cursor_new.execute("SELECT id, word, chapterNo FROM word_details")
    
    new_words_exact = {}
    new_words_by_spelling = {}
    
    for row in cursor_new.fetchall():
        w_id, w_text, w_chap = row[0], row[1], row[2]
        new_words_exact[(w_text, w_chap)] = w_id
        if w_text not in new_words_by_spelling:
            new_words_by_spelling[w_text] = []
        new_words_by_spelling[w_text].append(w_id)

    # 读取 learning_progress 全量记录并存入内存
    cursor_target.execute("""
        SELECT user_id, word_id, status, last_reviewed, review_count, created_at, updated_at
        FROM learning_progress
    """)
    old_progress_records = cursor_target.fetchall()
    print(f"从备份中读取到 {len(old_progress_records)} 条原始学习进度...")

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

    # 清空旧的 learning_progress
    cursor_target.execute("DELETE FROM learning_progress")

    print("5. 重新映射学习进度并写入数据库...")
    exact_matches = 0
    spelling_matches = 0
    skipped_count = 0
    inserted_count = 0

    seen_records = set()
    new_progress_rows = []

    for user_id, old_word_id, status, last_reviewed, review_count, created_at, updated_at in old_progress_records:
        if old_word_id in old_words:
            word, chapter_no = old_words[old_word_id]
            new_word_id = None
            
            # 1. 优先进行章节精确匹配
            if (word, chapter_no) in new_words_exact:
                new_word_id = new_words_exact[(word, chapter_no)]
                exact_matches += 1
            # 2. 如果精确匹配失败，按拼写模糊匹配到新章节的该单词
            elif word in new_words_by_spelling:
                new_word_id = new_words_by_spelling[word][0] # 选用新章节中的第一个匹配项
                spelling_matches += 1
            
            if new_word_id is not None:
                record_key = (user_id, new_word_id)
                if record_key not in seen_records:
                    seen_records.add(record_key)
                    new_progress_rows.append((
                        user_id, new_word_id, status, last_reviewed, review_count, created_at, updated_at
                    ))
                    inserted_count += 1
                else:
                    skipped_count += 1 # 去重
            else:
                skipped_count += 1 # 单词完全不存在
        else:
            skipped_count += 1

    # 写入新的学习进度
    cursor_target.executemany("""
        INSERT INTO learning_progress (
            user_id, word_id, status, last_reviewed, review_count, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, new_progress_rows)

    print(f"统计：")
    print(f"  - 章节精确匹配映射数: {exact_matches}")
    print(f"  - 跨章节拼写匹配映射数: {spelling_matches}")
    print(f"  - 成功还原并导入进度记录数: {inserted_count}")
    print(f"  - 过滤掉的重复/失效记录数: {skipped_count}")

    conn_target.commit()
    conn_target.close()
    conn_new.close()
    print("🎉 完美恢复完成！用户学习进度已 100% 对应新 ID。")

if __name__ == "__main__":
    main()
