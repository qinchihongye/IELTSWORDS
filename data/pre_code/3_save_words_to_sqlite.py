import sqlite3
import pandas as pd
from pathlib import Path

# 连接数据库
db_path = Path('db/ielts_words.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 创建words表
cursor.execute('''
CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    chapterNo TEXT NOT NULL,
    chapterName TEXT NOT NULL,
    groupId TEXT NOT NULL,
    groupTheme TEXT NOT NULL,
    wordNo TEXT,
    explanation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

# 创建索引以提高查询性能
cursor.execute('CREATE INDEX IF NOT EXISTS idx_word ON words(word)')
cursor.execute('CREATE INDEX IF NOT EXISTS idx_word_chapter ON words(chapterNo)')
cursor.execute('CREATE INDEX IF NOT EXISTS idx_word_group ON words(groupId)')

conn.commit()

# 读取Excel数据
df = pd.read_excel('词汇真经_配图_462.xlsx')

print(f"开始插入单词数据到数据库...")
inserted_count = 0

# 遍历DataFrame并插入数据库
for idx, row in df.iterrows():
    word = row['word']
    chapter_no = row['chapterNo']
    chapter_name = row['chapterName']
    group_id = row['groupId']
    group_theme = row['groupTheme']
    word_no = row['wordNo']
    explanation = row['explanation']

    # 检查word是否有效
    if pd.notna(word) and word:
        cursor.execute('''
            INSERT INTO words (word, chapterNo, chapterName, groupId, groupTheme, wordNo, explanation)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (word, chapter_no, chapter_name, group_id, group_theme, word_no, explanation))

        inserted_count += 1

        if inserted_count % 100 == 0:
            print(f"已插入 {inserted_count} 条记录...")
            conn.commit()

# 最终提交
conn.commit()

# 统计信息
cursor.execute('SELECT COUNT(*) FROM words')
total_count = cursor.fetchone()[0]

cursor.execute('SELECT COUNT(DISTINCT chapterNo) FROM words')
chapter_count = cursor.fetchone()[0]

cursor.execute('SELECT COUNT(DISTINCT groupId) FROM words')
group_count = cursor.fetchone()[0]

print(f"\n单词表创建完成！")
print(f"总单词数: {total_count}")
print(f"插入成功: {inserted_count}")
print(f"章节数: {chapter_count}")
print(f"分组数: {group_count}")

conn.close()
