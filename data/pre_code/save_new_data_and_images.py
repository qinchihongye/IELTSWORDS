import os
import re
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
import pandas as pd

# Files & Paths
xlsx_file = '词汇真经_new_group.xlsx'
db_path = Path('db/ielts_words.db')

group_output_dir = Path('data/images/group')
word_output_dir = Path('data/images/word')

group_output_dir.mkdir(parents=True, exist_ok=True)
word_output_dir.mkdir(parents=True, exist_ok=True)


def clean_filename(name):
    # Remove characters invalid in Windows/Mac/Linux filenames
    s = str(name).strip()
    s = re.sub(r'[\\/*?:"<>|]', '-', s)
    return s


def extract_image_mappings(xlsx_path):
    print("解析 Excel 中的图片映射关系...")
    with ZipFile(xlsx_path, 'r') as zip_ref:
        # Check if cellimages.xml exists
        try:
            cellimages_xml = zip_ref.read('xl/cellimages.xml')
        except KeyError:
            print("⚠️ 未在 Excel 中找到 xl/cellimages.xml，请确认是否有嵌入式图片")
            return {}

        root = ET.fromstring(cellimages_xml)

        namespaces = {
            'etc': 'http://www.wps.cn/officeDocument/2017/etCustomData',
            'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
            'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
            'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
        }

        # 读取 relationships
        rels_xml = zip_ref.read('xl/_rels/cellimages.xml.rels')
        rels_root = ET.fromstring(rels_xml)

        rid_to_file = {}
        for rel in rels_root.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
            rel_id = rel.get('Id')
            target = rel.get('Target')
            if target:
                filename = target.split('/')[-1]
                rid_to_file[rel_id] = filename

        image_id_to_file = {}
        cell_images = root.findall('.//etc:cellImage', namespaces)

        for cell_image in cell_images:
            cNvPr = cell_image.find('.//xdr:cNvPr', namespaces)
            if cNvPr is not None:
                image_id = cNvPr.get('name')
                blip = cell_image.find('.//a:blip', namespaces)
                if blip is not None:
                    rid = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                    if rid in rid_to_file:
                        image_id_to_file[image_id] = rid_to_file[rid]

        print(f"解析完成，共找到 {len(image_id_to_file)} 个图片映射。")
        return image_id_to_file


def save_image_from_formula(zip_ref, formula, image_id_to_file, dest_path_without_ext):
    if not isinstance(formula, str):
        return None

    match = re.search(r'DISPIMG\("([^"]+)"', formula)
    if not match:
        return None

    image_id = match.group(1)
    if image_id not in image_id_to_file:
        return None

    source_filename = image_id_to_file[image_id]
    ext = Path(source_filename).suffix.lower() or '.png'
    dest_path = dest_path_without_ext.with_suffix(ext)

    try:
        image_data = zip_ref.read(f'xl/media/{source_filename}')
        with open(dest_path, 'wb') as f:
            f.write(image_data)
        return dest_path.name
    except Exception as e:
        print(f"❌ 提取/保存图片失败 ({source_filename} -> {dest_path.name}): {e}")
        return None


def main():
    if not os.path.exists(xlsx_file):
        print(f"❌ 未找到 Excel 文件: {xlsx_file}")
        return

    # 1. 解析图片关系
    image_id_to_file = extract_image_mappings(xlsx_file)

    # 2. 读取 Excel
    print("读取 Excel 数据...")
    df = pd.read_excel(xlsx_file)

    # 3. 连接并清空数据库中的表
    print(f"连接数据库: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Recreate tables to ensure they match exact schemas
    cursor.execute("DROP TABLE IF EXISTS words")
    cursor.execute("DROP TABLE IF EXISTS word_details")
    cursor.execute("DROP TABLE IF EXISTS images")

    cursor.execute('''
    CREATE TABLE words (
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

    cursor.execute('''
    CREATE TABLE word_details (
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
        "单词备注" TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chapterNo TEXT NOT NULL,
        chapterName TEXT NOT NULL,
        groupId TEXT NOT NULL,
        groupTheme TEXT NOT NULL,
        "配图number" INTEGER NOT NULL,
        image_data LargeBinary,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 创建索引
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_word ON words(word)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_word_chapter ON words(chapterNo)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_word_group ON words(groupId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_detail_word ON word_details(word)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_detail_chapter ON word_details(chapterNo)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_detail_group ON word_details(groupId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_img_chapter ON images(chapterNo)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_img_group ON images(groupId)')

    conn.commit()

    print("开始提取图片并同步到数据库中...")
    words_inserted = 0
    details_inserted = 0
    images_inserted = 0

    # 记录已经保存过配图的 groupId，避免重复提取 group photo
    saved_group_photos = set()

    with ZipFile(xlsx_file, 'r') as zip_ref:
        for idx, row in df.iterrows():
            word = row['word']
            if pd.isna(word) or not str(word).strip():
                continue

            chapter_no = str(row['chapterNo'])
            chapter_name = str(row['chapterName'])
            group_id = str(row['groupId'])
            group_theme = str(row['groupTheme'])
            word_no = str(row['wordNo'])
            explanation = str(row['explanation']) if pd.notna(row['explanation']) else ""

            # Clean name components for filesystem safety
            c_chap_no = clean_filename(chapter_no)
            c_chap_name = clean_filename(chapter_name)
            c_grp_id = clean_filename(group_id)
            c_grp_theme = clean_filename(group_theme)
            c_word_no = clean_filename(word_no)
            c_word = clean_filename(word)

            # 1. 提取组配图 (group_photo)
            group_photo_formula = row.get('group_photo')
            group_key = (chapter_no, group_id)
            if pd.notna(group_photo_formula) and group_key not in saved_group_photos:
                dest_base = group_output_dir / f"{c_chap_no}-{c_chap_name}-{c_grp_id}-{c_grp_theme}"
                saved_name = save_image_from_formula(zip_ref, group_photo_formula, image_id_to_file, dest_base)
                if saved_name:
                    saved_group_photos.add(group_key)
                    # 写入 images 表
                    cursor.execute('''
                        INSERT INTO images (chapterNo, chapterName, groupId, groupTheme, "配图number", image_data)
                        VALUES (?, ?, ?, ?, ?, zeroblob(0))
                    ''', (chapter_no, chapter_name, group_id, group_theme, 1))
                    images_inserted += 1

            # 2. 提取单词配图 (word_photo)
            word_photo_formula = row.get('word_photo')
            if pd.notna(word_photo_formula):
                dest_base = word_output_dir / f"{c_chap_no}-{c_chap_name}-{c_grp_id}-{c_grp_theme}-{c_word_no}-{c_word}"
                save_image_from_formula(zip_ref, word_photo_formula, image_id_to_file, dest_base)

            # 3. 写入 words 表
            cursor.execute('''
                INSERT INTO words (word, chapterNo, chapterName, groupId, groupTheme, wordNo, explanation)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (word, chapter_no, chapter_name, group_id, group_theme, word_no, explanation))
            words_inserted += 1

            # 4. 写入 word_details 表
            cursor.execute('''
                INSERT INTO word_details (
                    chapterNo, chapterName, groupId, groupTheme, wordNo, word,
                    explanation, candidateWords, json, roots_affixes, derivatives,
                    exampleSentence, sentenceMeaning, "group", photo_prompt,
                    new_prompt, group_words, "单词备注"
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            ''', (
                chapter_no, chapter_name, group_id, group_theme, word_no, word,
                explanation,
                str(row['candidateWords']) if pd.notna(row['candidateWords']) else None,
                str(row['json']) if pd.notna(row['json']) else None,
                str(row['roots_affixes']) if pd.notna(row['roots_affixes']) else None,
                str(row['derivatives']) if pd.notna(row['derivatives']) else None,
                str(row['exampleSentence']) if pd.notna(row['exampleSentence']) else None,
                str(row['sentenceMeaning']) if pd.notna(row['sentenceMeaning']) else None,
                str(row['group']) if pd.notna(row['group']) else None,
                str(row['photo_prompt']) if pd.notna(row['photo_prompt']) else None,
                str(row['word_image_prompt']) if pd.notna(row['word_image_prompt']) else None,
                str(row['group_words']) if pd.notna(row['group_words']) else None
            ))
            details_inserted += 1

            if words_inserted % 100 == 0:
                print(f"已同步 {words_inserted} 个单词...")
                conn.commit()

    conn.commit()
    conn.close()

    print("\n🎉 数据导入完成！")
    print(f"  - words 插入数: {words_inserted}")
    print(f"  - word_details 插入数: {details_inserted}")
    print(f"  - images (group) 关联记录插入数: {images_inserted}")


if __name__ == "__main__":
    main()

