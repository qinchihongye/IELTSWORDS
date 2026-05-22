# IELTS Words 数据库文档

## 当前说明

当前项目已经改为使用 `data/images` 作为配图的真实存储位置。数据库里的 `images` 表主要保留章节、分组、编号等元数据，`image_data` 字段目前只作为历史兼容字段，不再作为运行时图片来源。

目前仓库会跟踪两个主库文件：`db/ielts_words.db` 和 `db/ielts_words_app.db`。运行时生成的 `*.db-wal`、`*.db-shm`、备份库和 `safe_*` 文件仍然保持忽略，不提交到 Git。

## 1. 表结构

### 1.1 images 表

存储IELTS词汇配图的元数据。当前运行时图片内容来自 `data/images`，数据库不再依赖 `image_data` 作为主要图片来源。

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| id | INTEGER | 主键ID | PRIMARY KEY AUTOINCREMENT |
| chapterNo | TEXT | 章节编号 | NOT NULL |
| chapterName | TEXT | 章节名称 | NOT NULL |
| groupId | TEXT | 分组ID | NOT NULL |
| groupTheme | TEXT | 分组主题 | NOT NULL |
| 配图number | INTEGER | 配图编号(1-4) | NOT NULL |
| image_data | BLOB | 历史兼容字段，当前通常为空 | NOT NULL |
| created_at | TIMESTAMP | 创建时间 | DEFAULT CURRENT_TIMESTAMP |

**索引:**
- `idx_chapter`: chapterNo
- `idx_group`: groupId

### 1.2 words 表

存储单词与章节、分组的关联关系，用于通过单词查询所属章节和分组。

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| id | INTEGER | 主键ID | PRIMARY KEY AUTOINCREMENT |
| word | TEXT | 单词 | NOT NULL |
| chapterNo | TEXT | 章节编号 | NOT NULL |
| chapterName | TEXT | 章节名称 | NOT NULL |
| groupId | TEXT | 分组ID | NOT NULL |
| groupTheme | TEXT | 分组主题 | NOT NULL |
| wordNo | TEXT | 单词编号 | |
| explanation | TEXT | 释义 | |
| created_at | TIMESTAMP | 创建时间 | DEFAULT CURRENT_TIMESTAMP |

**索引:**
- `idx_word`: word
- `idx_word_chapter`: chapterNo
- `idx_word_group`: groupId

**说明:** 同一个单词可能出现在多个章节中，因此word字段不设置唯一约束。

**重要:** 图片是按分组(groupId)生成的，不是按单词生成的。当前查询图片内容时，应先通过 `chapterNo + groupId + 配图number` 定位本地文件，再由后端接口返回图片流；数据库仅用于保存该分组有哪些配图的元信息。

### 1.3 word_details 表

存储单词的完整详细信息，包含 xlsx 文件中除配图外的所有字段。

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| id | INTEGER | 主键ID | PRIMARY KEY AUTOINCREMENT |
| chapterNo | TEXT | 章节编号 | NOT NULL |
| chapterName | TEXT | 章节名称 | NOT NULL |
| groupId | TEXT | 分组ID | NOT NULL |
| groupTheme | TEXT | 分组主题 | NOT NULL |
| wordNo | TEXT | 单词编号 | |
| word | TEXT | 单词 | NOT NULL |
| explanation | TEXT | 释义 | |
| candidateWords | TEXT | 候选词 | |
| json | TEXT | JSON数据 | |
| roots_affixes | TEXT | 词根词缀 | |
| derivatives | TEXT | 派生词 | |
| exampleSentence | TEXT | 例句 | |
| sentenceMeaning | TEXT | 例句释义 | |
| group | TEXT | 分组信息 | |
| photo_prompt | TEXT | 图片提示词 | |
| new_prompt | TEXT | 新提示词 | |
| group_words | TEXT | 分组单词 | |
| 单词备注 | TEXT | 备注 | |
| created_at | TIMESTAMP | 创建时间 | DEFAULT CURRENT_TIMESTAMP |

**索引:**
- `idx_detail_word`: word
- `idx_detail_chapter`: chapterNo
- `idx_detail_group`: groupId

---

## 2. 查询SQL示例

### 2.1 images 表查询

#### 查询特定章节的所有图片
```sql
SELECT id, chapterNo, chapterName, groupId, groupTheme, 配图number
FROM images
WHERE chapterNo = '1';
```

#### 查询特定分组的图片
```sql
SELECT id, chapterName, groupId, groupTheme, 配图number
FROM images
WHERE groupId = 'group1';
```

#### 导出图片元数据
```sql
SELECT chapterNo, chapterName, groupId, groupTheme, 配图number
FROM images
WHERE id = 1;
```

#### 统计每个章节的图片数量
```sql
SELECT chapterNo, chapterName, COUNT(*) as 图片数量
FROM images
GROUP BY chapterNo, chapterName
ORDER BY chapterNo;
```

#### 查询所有分组主题
```sql
SELECT DISTINCT groupId, groupTheme, chapterName
FROM images
ORDER BY chapterNo, groupId;
```

### 2.2 words 表查询

#### 通过单词查询所属章节和分组
```sql
SELECT word, chapterNo, chapterName, groupId, groupTheme
FROM words
WHERE word = 'atmosphere';
```

#### 查询单词在所有章节中的出现情况
```sql
SELECT word, chapterNo, chapterName, groupId, groupTheme, explanation
FROM words
WHERE word = 'atmosphere'
ORDER BY chapterNo;
```

#### 查询特定章节的所有单词
```sql
SELECT word, groupId, groupTheme, explanation
FROM words
WHERE chapterNo = '1'
ORDER BY wordNo;
```

#### 查询特定分组的所有单词
```sql
SELECT word, chapterName, explanation
FROM words
WHERE groupId = 'group1'
ORDER BY wordNo;
```

#### 统计每个章节的单词数量
```sql
SELECT chapterNo, chapterName, COUNT(*) as 单词数量
FROM words
GROUP BY chapterNo, chapterName
ORDER BY chapterNo;
```

#### 查询重复出现在多个章节的单词
```sql
SELECT word, COUNT(DISTINCT chapterNo) as 出现章节数
FROM words
GROUP BY word
HAVING COUNT(DISTINCT chapterNo) > 1
ORDER BY 出现章节数 DESC;
```

### 2.3 联合查询

#### 通过单词查询对应的配图
```sql
SELECT 
    w.word,
    w.chapterNo,
    w.chapterName,
    w.groupId,
    w.groupTheme,
    i.配图number
FROM words w
JOIN images i ON w.chapterNo = i.chapterNo 
    AND w.groupId = i.groupId
WHERE w.word = 'atmosphere';
```

#### 查询特定单词的所有配图（包含多个章节）
```sql
SELECT 
    w.word,
    w.chapterNo,
    w.chapterName,
    w.groupId,
    i.配图number
FROM words w
JOIN images i ON w.chapterNo = i.chapterNo 
    AND w.groupId = i.groupId
WHERE w.word = 'atmosphere'
ORDER BY w.chapterNo, i.配图number;
```

#### 查询某个分组的单词及其配图数量
```sql
SELECT 
    w.groupId,
    w.groupTheme,
    COUNT(DISTINCT w.word) as 单词数,
    COUNT(DISTINCT i.id) as 配图数
FROM words w
LEFT JOIN images i ON w.groupId = i.groupId
WHERE w.groupId = 'group1'
GROUP BY w.groupId, w.groupTheme;
```

### 2.4 word_details 表查询

#### 查询单词的完整详细信息
```sql
SELECT *
FROM word_details
WHERE word = 'atmosphere';
```

#### 查询单词的词根词缀和派生词
```sql
SELECT word, roots_affixes, derivatives
FROM word_details
WHERE word = 'atmosphere';
```

#### 查询单词的例句和释义
```sql
SELECT word, exampleSentence, sentenceMeaning, explanation
FROM word_details
WHERE word = 'atmosphere';
```

#### 查询特定章节的所有单词详细信息
```sql
SELECT word, explanation, exampleSentence, roots_affixes
FROM word_details
WHERE chapterNo = '1'
ORDER BY wordNo;
```

#### 查询包含特定词根的单词
```sql
SELECT word, roots_affixes, explanation
FROM word_details
WHERE roots_affixes LIKE '%sphere%';
```

#### 查询有候选词的单词
```sql
SELECT word, candidateWords, explanation
FROM word_details
WHERE candidateWords IS NOT NULL AND candidateWords != '';
```

### 2.5 word_details 与其他表的联合查询

#### 查询单词的完整信息及配图元信息
```sql
SELECT 
    wd.*,
    i.配图number
FROM word_details wd
JOIN images i ON wd.chapterNo = i.chapterNo 
    AND wd.groupId = i.groupId
WHERE wd.word = 'atmosphere';
```

#### 查询单词的详细信息和所有配图
```sql
SELECT 
    wd.word,
    wd.explanation,
    wd.exampleSentence,
    wd.roots_affixes,
    i.配图number
FROM word_details wd
LEFT JOIN images i ON wd.chapterNo = i.chapterNo 
    AND wd.groupId = i.groupId
WHERE wd.word = 'atmosphere'
ORDER BY i.配图number;
```

#### 查看某分组在本地文件中的实际配图
```text
data/images 目录下按 chapterNo / groupId / 配图number 命名存放。
```
