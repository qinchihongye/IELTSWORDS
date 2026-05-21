from zipfile import ZipFile
import xml.etree.ElementTree as ET
import pandas as pd
from pathlib import Path
import re

# 读取Excel数据
df = pd.read_excel('词汇真经_配图_462.xlsx')

# 创建输出目录
output_dir = Path('data/images')
output_dir.mkdir(parents=True, exist_ok=True)

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
        # 获取图片名称（ID）
        cNvPr = cell_image.find('.//xdr:cNvPr', namespaces)
        if cNvPr is not None:
            image_id = cNvPr.get('name')

            # 获取rId
            blip = cell_image.find('.//a:blip', namespaces)
            if blip is not None:
                rid = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                if rid in rid_to_file:
                    image_id_to_file[image_id] = rid_to_file[rid]

    print(f"创建了 {len(image_id_to_file)} 个图片ID到文件名的映射")

    # 遍历DataFrame，提取DISPIMG公式中的ID并保存图片
    saved_count = 0

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
                # 提取DISPIMG公式中的ID
                match = re.search(r'DISPIMG\("([^"]+)"', cell_value)
                if match:
                    image_id = match.group(1)

                    if image_id in image_id_to_file:
                        source_filename = image_id_to_file[image_id]

                        # 构建目标文件名
                        filename = f"{chapter_num}-{chapter_name}-{group_id}-{group_theme}-配图{pic_num}.png"
                        filename = filename.replace('/', '-').replace('\\', '-').replace(':', '-')

                        filepath = output_dir / filename

                        # 从zip中提取并保存图片
                        image_data = zip_ref.read(f'xl/media/{source_filename}')
                        with open(filepath, 'wb') as f:
                            f.write(image_data)

                        saved_count += 1

print(f"\n总共保存了 {saved_count} 张图片到 {output_dir}")
