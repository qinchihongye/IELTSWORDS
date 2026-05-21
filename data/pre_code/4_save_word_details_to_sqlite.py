import sqlite3
import pandas as pd
from pathlib import Path

# 连接数据库
db_path = Path('db/ielts_words.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 创建word_details表
cursor.execute('''
CREATE TABLE IF NOT EXISTS word_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapterNo TEXT NOT NULL,
    chapterName TEXT NOT NULL,
    groupId TEXT NOT NULL,
    groupTheme TEXT NOT NULL,
    wordNo TEXT,
    word TEXT NOT NULL,
    explanation TEXT,
    candidateWords TEXT,
    json TEXT,
    roots_affixes TEXT,
    derivatives TEXT,
    exampleSentence TEXT,
    sentenceMeaning TEXT,
    "group" TEXT,
    photo_prompt TEXT,
    new_prompt TEXT,
    group_words TEXT,
    单词备注 TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

# 创建索引
cursor.execute('CREATE INDEX IF NOT EXISTS idx_detail_word ON word_details(word)')
cursor.execute('CREATE INDEX IF NOT EXISTS idx_detail_chapter ON word_details(chapterNo)')
cursor.execute('CREATE INDEX IF NOT EXISTS idx_detail_group ON word_details(groupId)')

conn.commit()

# 读取Excel数据
df = pd.read_excel('词汇真经_配图_462.xlsx')

print(f"开始插入单词详细数据到数据库...")
inserted_count = 0

# 遍历DataFrame并插入数据库
for idx, row in df.iterrows():
    # 检查word是否有效
    if pd.notna(row['word']) and row['word']:
        cursor.execute('''
            INSERT INTO word_details (
                chapterNo, chapterName, groupId, groupTheme, wordNo, word,
                explanation, candidateWords, json, roots_affixes, derivatives,
                exampleSentence, sentenceMeaning, "group", photo_prompt,
                new_prompt, group_words, 单词备注
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            row['chapterNo'], row['chapterName'], row['groupId'], row['groupTheme'],
            row['wordNo'], row['word'], row['explanation'], row['candidateWords'],
            row['json'], row['roots_affixes'], row['derivatives'],
            row['exampleSentence'], row['sentenceMeaning'], row['group'],
            row['photo_prompt'], row['new_prompt'], row['group_words'], row['单词备注']
        ))

        inserted_count += 1

        if inserted_count % 100 == 0:
            print(f"已插入 {inserted_count} 条记录...")
            conn.commit()

# 最终提交
conn.commit()

# 统计信息
cursor.execute('SELECT COUNT(*) FROM word_details')
total_count = cursor.fetchone()[0]

cursor.execute('SELECT COUNT(DISTINCT chapterNo) FROM word_details')
chapter_count = cursor.fetchone()[0]

cursor.execute('SELECT COUNT(DISTINCT groupId) FROM word_details')
group_count = cursor.fetchone()[0]

print(f"\n单词详细表创建完成！")
print(f"总记录数: {total_count}")
print(f"插入成功: {inserted_count}")
print(f"章节数: {chapter_count}")
print(f"分组数: {group_count}")

conn.close()
