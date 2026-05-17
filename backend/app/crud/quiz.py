"""
CRUD操作模块
数据库操作的封装
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import random
import re
from .. import models, schemas, auth


from sqlalchemy import desc

# ============ 测试相关 ============

def create_quiz_session(
    db: Session,
    user_id: int,
    quiz_type: str,
    total_questions: int,
    question_payload: Optional[str] = None,
) -> models.QuizSession:
    """创建测试会话"""
    session = models.QuizSession(
        user_id=user_id,
        quiz_type=quiz_type,
        total_questions=total_questions,
        question_payload=question_payload,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

def get_active_quiz_session(db: Session, user_id: int) -> Optional[models.QuizSession]:
    """获取用户最近一个未完成的测试会话。"""
    return db.query(models.QuizSession).filter(
        models.QuizSession.user_id == user_id,
        models.QuizSession.completed_at.is_(None)
    ).order_by(models.QuizSession.created_at.desc(), models.QuizSession.id.desc()).first()

def get_quiz_answers(db: Session, session_id: int) -> List[models.QuizAnswer]:
    """获取指定测试会话已保存的答案。"""
    return db.query(models.QuizAnswer).filter(
        models.QuizAnswer.session_id == session_id
    ).order_by(models.QuizAnswer.created_at.asc(), models.QuizAnswer.id.asc()).all()

def generate_quiz_questions(db: Session, user_id: int, quiz_type: str, count: int = 10) -> List[dict]:
    """生成测试题目"""
    # 优先选择学习中的单词，然后是已掌握的
    learned_words = db.query(models.WordDetail).join(
        models.LearningProgress,
        models.LearningProgress.word_id == models.WordDetail.id
    ).filter(
        models.LearningProgress.user_id == user_id
    ).order_by(
        func.random()
    ).limit(count).all()

    words = []
    selected_ids = set()
    for word in learned_words:
        if word.id not in selected_ids:
            words.append(word)
            selected_ids.add(word.id)

    # 如果学习的单词不够，从所有单词中随机选择
    if len(words) < count:
        additional_query = db.query(models.WordDetail)
        if selected_ids:
            additional_query = additional_query.filter(models.WordDetail.id.notin_(selected_ids))

        additional_words = additional_query.order_by(
            func.random()
        ).limit(count - len(words)).all()
        for word in additional_words:
            if word.id not in selected_ids:
                words.append(word)
                selected_ids.add(word.id)

    questions = []
    for word in words:
        if quiz_type == 'multiple_choice':
            # 生成选择题
            # 获取3个错误选项
            wrong_options = db.query(models.WordDetail.explanation).filter(
                models.WordDetail.id != word.id
            ).order_by(func.random()).limit(3).all()

            options = [word.explanation] + [opt[0] for opt in wrong_options]
            random.shuffle(options)

            questions.append({
                "word_id": word.id,
                "question_type": "multiple_choice",
                "question_text": f"单词 '{word.word}' 的释义是？",
                "options": options,
                "correct_answer": word.explanation
            })
        elif quiz_type.startswith('spelling'):
            # 生成拼写题
            word_str = word.word.lower()
            length = len(word_str)
            
            def mask(w, reveal_indices):
                return ''.join([w[i] if not w[i].isalpha() or i in reveal_indices else '_' for i in range(len(w))])

            hint_easy = mask(word_str, [0]) if length > 0 else ""
            if length <= 3:
                hint_medium = hint_easy
            else:
                hint_medium = mask(word_str, [0, 1, length - 1])
            hint_hard = mask(word_str, []) if length > 0 else ""
                
            if quiz_type == 'spelling_easy':
                hint = hint_easy
            elif quiz_type == 'spelling_medium':
                hint = hint_medium
            else:
                hint = hint_hard

            questions.append({
                "word_id": word.id,
                "question_type": quiz_type,
                "question_text": f"请拼写释义为 '{word.explanation}' 的单词",
                "hint": hint,
                "options": None,
                "correct_answer": word_str
            })

    return questions

def save_quiz_answer(db: Session, session_id: int, word_id: int, user_answer: str, is_correct: bool):
    """保存测试答案"""
    answer = db.query(models.QuizAnswer).filter(
        models.QuizAnswer.session_id == session_id,
        models.QuizAnswer.word_id == word_id
    ).first()

    if not answer:
        answer = models.QuizAnswer(
            session_id=session_id,
            word_id=word_id,
            user_answer=user_answer,
            is_correct=is_correct
        )
        db.add(answer)
    else:
        answer.user_answer = user_answer
        answer.is_correct = is_correct

    db.commit()
    db.refresh(answer)
    return answer

def complete_quiz_session(db: Session, session_id: int) -> models.QuizSession:
    """完成测试并计算得分"""
    session = db.query(models.QuizSession).filter(
        models.QuizSession.id == session_id
    ).first()

    if not session:
        return None

    if session.completed_at is not None:
        return session

    # 统计正确答案数
    correct_count = db.query(func.count(models.QuizAnswer.id)).filter(
        models.QuizAnswer.session_id == session_id,
        models.QuizAnswer.is_correct == True
    ).scalar()

    session.correct_answers = correct_count or 0
    session.score = int((session.correct_answers / session.total_questions) * 100) if session.total_questions > 0 else 0
    session.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(session)
    return session

def get_quiz_history(db: Session, user_id: int, limit: int = 10) -> List[models.QuizSession]:
    """获取测试历史"""
    return db.query(models.QuizSession).filter(
        models.QuizSession.user_id == user_id,
        models.QuizSession.completed_at.isnot(None)
    ).order_by(models.QuizSession.completed_at.desc()).limit(limit).all()
