import sqlite3
import pandas as pd
from pathlib import Path
import re
from zipfile import ZipFile
import xml.etree.ElementTree as ET

# 创建db目录
db_dir = Path('db')
db_dir.mkdir(parents=True, exist_ok=True)

# 连接数据库
db_path = db_dir / 'ielts_words.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 创建表
cursor.execute('''
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapterNo TEXT NOT NULL,
    chapterName TEXT NOT NULL,
    groupId TEXT NOT NULL,
    groupTheme TEXT NOT NULL,
    配图number INTEGER NOT NULL,
    image_data BLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

# 创建索引以提高查询性能
cursor.execute('CREATE INDEX IF NOT EXISTS idx_chapter ON images(chapterNo)')
cursor.execute('CREATE INDEX IF NOT EXISTS idx_group ON images(groupId)')

conn.commit()

# 读取Excel数据
df = pd.read_excel('词汇真经_配图_462.xlsx')
xlsx_file = '词汇真经_配图_462.xlsx'

with ZipFile(xlsx_file, 'r') as zip_ref:
    # 读取cellimages.xml
    cellimages_xml = zip_ref.read('xl/cellimages.xml')
    root = ET.fromstring(cellimages_xml)

    namespaces = {
        'etc': 'http://www.wps.cn/officeDocument/2017/etCustomData',
        'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    }

    # 读取cellimages.xml.rels
    rels_xml = zip_ref.read('xl/_rels/cellimages.xml.rels')
    rels_root = ET.fromstring(rels_xml)

    rid_to_file = {}
    for rel in rels_root.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
        rel_id = rel.get('Id')
        target = rel.get('Target')
        if target:
            filename = target.split('/')[-1]
            rid_to_file[rel_id] = filename

    # 创建图片ID到文件名的映射
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

    print(f"开始插入数据到数据库...")
    inserted_count = 0

    # 遍历DataFrame并插入数据库
    for idx, row in df.iterrows():
        chapter_num = row['chapterNo']
        chapter_name = row['chapterName']
        group_id = row['groupId']
        group_theme = row['groupTheme']

        # 处理4张配图
        for pic_num in range(1, 5):
            col_name = f'配图{pic_num}'
            cell_value = row[col_name]

            if pd.notna(cell_value) and isinstance(cell_value, str):
                match = re.search(r'DISPIMG\("([^"]+)"', cell_value)
                if match:
                    image_id = match.group(1)

                    if image_id in image_id_to_file:
                        source_filename = image_id_to_file[image_id]

                        # 从zip中读取图片二进制数据
                        image_data = zip_ref.read(f'xl/media/{source_filename}')

                        # 插入数据库
                        cursor.execute('''
                            INSERT INTO images (chapterNo, chapterName, groupId, groupTheme, 配图number, image_data)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (chapter_num, chapter_name, group_id, group_theme, pic_num, image_data))

                        inserted_count += 1

                        if inserted_count % 50 == 0:
                            print(f"已插入 {inserted_count} 条记录...")
                            conn.commit()

# 最终提交
conn.commit()

# 统计信息
cursor.execute('SELECT COUNT(*) FROM images')
total_count = cursor.fetchone()[0]

cursor.execute('SELECT SUM(LENGTH(image_data)) FROM images')
total_size = cursor.fetchone()[0]

print(f"\n数据库创建完成！")
print(f"数据库路径: {db_path}")
print(f"总记录数: {total_count}")
print(f"数据库大小: {total_size / 1024 / 1024:.2f} MB")

conn.close()