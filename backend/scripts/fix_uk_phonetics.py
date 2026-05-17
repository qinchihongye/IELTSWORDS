"""
从 Wiktionary 获取英式音标，修正英音=美音的词
"""

import sqlite3
import urllib.request
import urllib.parse
import json
import re
import time
import sys
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'db', 'ielts_words_app.db')
DB_PATH = os.path.normpath(DB_PATH)


def fetch_wiktionary_ipa(word, retries=3):
    """从 Wiktionary 获取该词的所有 IPA，含重试"""
    encoded = urllib.parse.quote(word, safe='')
    url = f"https://en.wiktionary.org/w/api.php?action=parse&page={encoded}&prop=wikitext&format=json"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "IELTS-Words-App/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
            wikitext = data.get('parse', {}).get('wikitext', {}).get('*', '')
            return re.findall(r'\{\{IPA\|en\|(/[^/\}]+/)', wikitext)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise


def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT id, word, phonetics_uk FROM word_details WHERE phonetics_uk = phonetics_us AND phonetics_uk IS NOT NULL")
    rows = cursor.fetchall()
    total = len(rows)
    print(f"待检查: {total} 个词", flush=True)

    updated = 0
    no_diff = 0
    errors = 0

    for i, (wid, word, current_us) in enumerate(rows, 1):
        try:
            ipa_list = fetch_wiktionary_ipa(word)

            if len(ipa_list) >= 2:
                uk_ipa = ipa_list[0]  # Wiktionary 通常第一个是 UK
                if uk_ipa != current_us:
                    cursor.execute("UPDATE word_details SET phonetics_uk = ? WHERE id = ?", (uk_ipa, wid))
                    updated += 1
                    print(f"[{i}/{total}] {word}: UK {current_us} → {uk_ipa}", flush=True)
                else:
                    no_diff += 1
            elif len(ipa_list) == 1:
                if ipa_list[0] != current_us:
                    cursor.execute("UPDATE word_details SET phonetics_uk = ? WHERE id = ?", (ipa_list[0], wid))
                    updated += 1
                    print(f"[{i}/{total}] {word}: UK {current_us} → {ipa_list[0]}", flush=True)
                else:
                    no_diff += 1
            else:
                no_diff += 1

            if i % 200 == 0:
                conn.commit()
                print(f"  进度: {i}/{total}, 已更新 {updated}", flush=True)

            time.sleep(0.6)
        except Exception as e:
            errors += 1
            if errors <= 10:
                print(f"[{i}/{total}] {word}: ERROR ({e})", flush=True)
            time.sleep(1)

    conn.commit()
    conn.close()
    print(f"\n完成: 更新 {updated}, 无差异 {no_diff}, 错误 {errors}, 共 {total}", flush=True)


if __name__ == "__main__":
    main()
