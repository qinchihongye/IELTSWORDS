from datetime import datetime, timedelta

def calculate_sm2(quality: int, repetitions: int, easiness_factor: float, interval: int) -> tuple[int, float, int]:
    """
    计算基于 SM-2 算法的单词下一次复习参数。
    
    参数:
        quality: 记忆质量分数 (0-5)
            0 - 彻底忘记
            1 - 回忆错误，但在提醒后想起来了
            2 - 回忆错误，但感觉很容易记住
            3 - 回忆正确，但非常费力
            4 - 回忆正确，稍微有些犹豫
            5 - 完美回忆，毫不犹豫
        repetitions: 连续正确回忆的次数
        easiness_factor: 容易度因子，初始值为 2.5
        interval: 当前复习间隔（天）
        
    返回:
        (new_repetitions, new_easiness_factor, new_interval)
    """
    if quality >= 3:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * easiness_factor)
        repetitions += 1
    else:
        repetitions = 0
        interval = 1

    easiness_factor = easiness_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    
    # 限制 EF 的下限
    if easiness_factor < 1.3:
        easiness_factor = 1.3

    return repetitions, easiness_factor, interval
