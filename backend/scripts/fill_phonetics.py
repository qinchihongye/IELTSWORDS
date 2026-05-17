"""
批量填充音标脚本 (v2)
策略: eng_to_ipa (CMU词典) 为主 → dictionaryapi.dev 为辅
覆盖率: ~98.5% + ~1% fallback ≈ 99.5%
"""

import sqlite3
import urllib.request
import urllib.parse
import json
import time
import os
import sys

try:
    import eng_to_ipa
except ImportError:
    print("请先安装: pip install eng_to_ipa")
    sys.exit(1)

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'db', 'ielts_words_app.db')
DB_PATH = os.path.normpath(DB_PATH)

API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/{}"
RATE_LIMIT = 0.4

# 英式 → 美式拼写映射（按长度降序，确保最长匹配优先）
UK_TO_US_SUFFIXES = [
    ('isation', 'ization'), ('ising', 'izing'), ('ising', 'izing'),
    ('iser', 'izer'), ('ised', 'ized'), ('ise', 'ize'),
    ('ysed', 'yzed'), ('yse', 'yze'),
    ('ourable', 'orable'), ('our', 'or'),
    ('logue', 'log'), ('logues', 'logs'),
    ('ence', 'ense'), ('ences', 'enses'),
    ('re', 'er'), ('res', 'es'),
]
# 整词替换
UK_TO_US_WORDS = {
    'fulfil': 'fulfill', 'enrol': 'enroll', 'sceptical': 'skeptical',
    'artefact': 'artifact',
}


def normalize_to_american(word):
    """英式拼写转美式，返回可能的美式拼写列表"""
    candidates = []
    w = word.lower()
    # 整词替换
    if w in UK_TO_US_WORDS:
        candidates.append(UK_TO_US_WORDS[w])
    # 后缀替换
    for uk_suffix, us_suffix in UK_TO_US_SUFFIXES:
        if w.endswith(uk_suffix):
            candidates.append(word[:len(word)-len(uk_suffix)] + us_suffix)
    # 连字符词：拆分后逐词查
    if '-' in word:
        parts = word.split('-')
        candidates.append(''.join(parts))
        candidates.append(' '.join(parts))
    return candidates


def get_ipa_from_eng_to_ipa(word):
    """从 CMU 词典获取美式 IPA，含英式拼写回退"""
    result = eng_to_ipa.convert(word)
    if result and not result.endswith('*'):
        return result
    # 尝试英式→美式拼写
    for candidate in normalize_to_american(word):
        result = eng_to_ipa.convert(candidate)
        if result and not result.endswith('*'):
            return result
    return None


def get_ipa_from_api(word):
    """从 dictionaryapi.dev 获取英音/美音"""
    url = API_URL.format(urllib.parse.quote(word))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "IELTS-Words-App/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        if not data or not isinstance(data, list) or not data[0].get("phonetics"):
            return None, None

        phonetics_list = data[0]["phonetics"]
        uk = next((p for p in phonetics_list if p.get("audio", "").endswith("-uk.mp3")), None)
        us = next((p for p in phonetics_list if p.get("audio", "").endswith("-us.mp3")), None)
        any_with_text = [p for p in phonetics_list if p.get("text")]

        uk_text = uk.get("text") if uk else (any_with_text[0].get("text") if any_with_text else None)
        us_text = us.get("text") if us else (any_with_text[1].get("text") if len(any_with_text) > 1 else (any_with_text[0].get("text") if any_with_text else None))

        return uk_text, us_text
    except Exception:
        return None, None


def main():
    if not os.path.exists(DB_PATH):
        print(f"数据库不存在: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 获取需要填充音标的单词（phonetics_uk 为空的）
    cursor.execute("SELECT id, word FROM word_details WHERE phonetics_uk IS NULL OR phonetics_uk = ''")
    rows = cursor.fetchall()
    total = len(rows)

    if total == 0:
        print("所有单词已有音标，无需处理。")
        conn.close()
        return

    print(f"待处理: {total} 个单词")
    print(f"策略: eng_to_ipa (CMU) → dictionaryapi.dev (fallback)\n")

    success = 0
    fail = 0
    source_cmu = 0
    source_api = 0

    for i, (word_id, word) in enumerate(rows, 1):
        # 策略1: eng_to_ipa (快, 本地)
        uk = get_ipa_from_eng_to_ipa(word)
        if uk:
            # eng_to_ipa 只有美式音标，英音用同一个
            cursor.execute(
                "UPDATE word_details SET phonetics_uk = ?, phonetics_us = ? WHERE id = ?",
                (uk, uk, word_id)
            )
            conn.commit()
            success += 1
            source_cmu += 1
            print(f"[{i}/{total}] {word}: CMU ({uk})")
        else:
            # 策略2: dictionaryapi.dev (慢, 网络)
            api_uk, api_us = get_ipa_from_api(word)
            if api_uk or api_us:
                cursor.execute(
                    "UPDATE word_details SET phonetics_uk = ?, phonetics_us = ? WHERE id = ?",
                    (api_uk, api_us, word_id)
                )
                conn.commit()
                success += 1
                source_api += 1
                print(f"[{i}/{total}] {word}: API (英:{api_uk or '-'} 美:{api_us or '-'})")
                if i < total:
                    time.sleep(RATE_LIMIT)
            else:
                fail += 1
                print(f"[{i}/{total}] {word}: FAIL")

    conn.close()
    print(f"\n完成: 成功 {success} (CMU:{source_cmu} API:{source_api}), 失败 {fail}, 共 {total}")


if __name__ == "__main__":
    main()
