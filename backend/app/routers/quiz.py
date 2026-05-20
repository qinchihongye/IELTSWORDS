"""
测试相关API
"""

import json

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from .. import schemas, crud
from ..database import get_db
from ..dependencies import get_current_user
from .. import models

router = APIRouter()


def load_session_questions(session: models.QuizSession) -> List[dict]:
    try:
        return json.loads(session.question_payload or "[]")
    except json.JSONDecodeError:
        return []


def sanitize_questions_for_client(questions: List[dict]) -> List[dict]:
    sanitized = []
    for question in questions:
        sanitized_question = dict(question)
        sanitized_question.pop('correct_answer', None)
        sanitized.append(sanitized_question)
    return sanitized


def build_saved_answers(session: models.QuizSession, db: Session) -> List[dict]:
    question_map = {
        int(question["word_id"]): question
        for question in load_session_questions(session)
        if "word_id" in question
    }

    return [
        {
            "word_id": answer.word_id,
            "user_answer": answer.user_answer,
            "is_correct": answer.is_correct,
            "correct_answer": question_map.get(answer.word_id, {}).get("correct_answer", ""),
        }
        for answer in crud.get_quiz_answers(db, session.id)
    ]


@router.get("/active", response_model=schemas.QuizSessionSnapshot)
async def get_active_quiz_session(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取当前用户未完成的测试快照
    """
    session = crud.get_active_quiz_session(db, current_user.id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="当前没有未完成的测试"
        )

    questions = load_session_questions(session)
    if not questions:
        questions = crud.generate_quiz_questions(
            db, current_user.id, session.quiz_type, session.total_questions
        )
        session.question_payload = json.dumps(questions, ensure_ascii=False)
        session.total_questions = len(questions)
        db.commit()
        db.refresh(session)

    return {
        "session": session,
        "questions": sanitize_questions_for_client(questions),
        "answers": build_saved_answers(session, db),
    }

@router.post("/start", response_model=schemas.QuizSessionResult)
async def start_quiz(
    quiz_request: schemas.QuizStartRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    开始新的测试会话
    quiz_type: 'multiple_choice' 或 'spelling'
    count: 题目数量 (1-50)
    """
    valid_types = ['multiple_choice', 'spelling', 'spelling_easy', 'spelling_medium', 'spelling_hard']
    if quiz_request.quiz_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的测试类型"
        )

    if quiz_request.count < 1 or quiz_request.count > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="题目数量必须在 1-50 之间"
        )

    # 启动新测试前，清除该用户以前所有未完成的残留测试会话，确保状态唯一且干净
    old_sessions = db.query(models.QuizSession).filter(
        models.QuizSession.user_id == current_user.id,
        models.QuizSession.completed_at.is_(None)
    ).all()
    if old_sessions:
        old_ids = [s.id for s in old_sessions]
        db.query(models.QuizAnswer).filter(models.QuizAnswer.session_id.in_(old_ids)).delete(synchronize_session=False)
        db.query(models.QuizSession).filter(models.QuizSession.id.in_(old_ids)).delete(synchronize_session=False)
        db.commit()

    questions = crud.generate_quiz_questions(
        db, current_user.id, quiz_request.quiz_type, quiz_request.count
    )

    # 创建测试会话
    session = crud.create_quiz_session(
        db,
        current_user.id,
        quiz_request.quiz_type,
        len(questions),
        question_payload=json.dumps(questions, ensure_ascii=False),
    )

    return session

@router.get("/session/{session_id}/questions", response_model=List[schemas.QuizQuestion])
async def get_quiz_questions(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取测试题目
    """
    # 验证会话是否存在且属于当前用户
    session = db.query(models.QuizSession).filter(
        models.QuizSession.id == session_id,
        models.QuizSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="测试会话不存在"
        )

    questions = load_session_questions(session)
    if not questions:
        questions = crud.generate_quiz_questions(
            db, current_user.id, session.quiz_type, session.total_questions
        )
        session.question_payload = json.dumps(questions, ensure_ascii=False)
        session.total_questions = len(questions)
        db.commit()

    return sanitize_questions_for_client(questions)

@router.post("/session/{session_id}/answer", response_model=schemas.QuizAnswerResponse)
async def submit_quiz_answer(
    session_id: int,
    answer: schemas.QuizAnswerRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    提交答案并获取即时反馈
    """
    # 验证会话
    session = db.query(models.QuizSession).filter(
        models.QuizSession.id == session_id,
        models.QuizSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="测试会话不存在"
        )

    if session.completed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该测试会话已经结束，不能继续答题"
        )

    questions = load_session_questions(session)
    question_map = {
        int(question["word_id"]): question
        for question in questions
        if "word_id" in question
    }
    question = question_map.get(answer.word_id)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该单词不属于当前测试会话"
        )

    # 判断答案是否正确
    if session.quiz_type == 'multiple_choice':
        correct_answer = question["correct_answer"]
        is_correct = answer.user_answer.strip() == correct_answer.strip()
    elif session.quiz_type.startswith('spelling'):
        correct_answer = question["correct_answer"]
        is_correct = answer.user_answer.strip().lower() == correct_answer.strip().lower()
    else:
        is_correct = False
        correct_answer = ""

    # 保存答案
    crud.save_quiz_answer(db, session_id, answer.word_id, answer.user_answer, is_correct)

    return {
        "is_correct": is_correct,
        "correct_answer": correct_answer
    }

@router.post("/session/{session_id}/complete", response_model=schemas.QuizSessionResult)
async def complete_quiz(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    完成测试并获取结果
    """
    # 验证会话
    session = db.query(models.QuizSession).filter(
        models.QuizSession.id == session_id,
        models.QuizSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="测试会话不存在"
        )

    # 完成测试并计算得分
    session = crud.complete_quiz_session(db, session_id)

    return session

@router.get("/history", response_model=List[schemas.QuizSessionResult])
async def get_quiz_history(
    limit: int = Query(10, ge=1, le=50, description="返回的记录数"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    获取测试历史记录
    """
    history = crud.get_quiz_history(db, current_user.id, limit)
    return history

@router.delete("/session/{session_id}")
async def delete_quiz_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    删除未完成的测试会话以退出，不保留测试状态
    """
    # 查找属于该用户的所有未完成会话，确保彻底清除所有残留以防再次恢复
    uncompleted_sessions = db.query(models.QuizSession).filter(
        models.QuizSession.user_id == current_user.id,
        models.QuizSession.completed_at.is_(None)
    ).all()

    if not uncompleted_sessions:
        return {"message": "没有未完成的测试会话需要删除"}

    session_ids = [s.id for s in uncompleted_sessions]

    # 先删除关联的答案
    db.query(models.QuizAnswer).filter(models.QuizAnswer.session_id.in_(session_ids)).delete(synchronize_session=False)
    # 再删除会话
    db.query(models.QuizSession).filter(models.QuizSession.id.in_(session_ids)).delete(synchronize_session=False)
    db.commit()

    return {"message": f"成功删除 {len(session_ids)} 个未完成的测试会话"}
