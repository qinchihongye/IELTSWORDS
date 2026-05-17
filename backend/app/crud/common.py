"""
CRUD 公共工具函数
"""

from datetime import datetime, timedelta


def calculate_next_review_date(review_count: int, difficulty: int, last_reviewed: datetime) -> datetime:
    """根据当前复习次数和难度安排下次复习时间（基于遗忘曲线）。
    difficulty: 1=简单, 3=中等, 5=困难
    """
    base_intervals = {
        1: [1, 4, 7, 15, 30, 60],
        3: [1, 3, 7, 14, 30, 60],
        5: [1, 2, 4, 7, 15, 30],
    }
    intervals = base_intervals.get(difficulty, base_intervals[3])
    index = max(0, min(max(review_count, 1) - 1, len(intervals) - 1))
    return last_reviewed + timedelta(days=intervals[index])
