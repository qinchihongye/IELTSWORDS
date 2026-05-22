/**
 * 测试模式页面
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Typography, Spin, Radio, Progress, Switch, Modal, message } from 'antd';
import { ArrowLeftOutlined, MessageOutlined, TrophyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { useQuiz } from '../context/QuizContext';
import { useAIChat } from '../context/AIChatContext';
import QuizQuestion from '../components/QuizQuestion';
import { motion } from 'framer-motion';


const { Title, Text } = Typography;

const QUIZ_TYPE_OPTIONS = [
  {
    value: 'multiple_choice',
    title: '选择题',
    badge: '基础热身',
    badgeColor: '#6366f1',
    description: '根据单词选择正确的释义，适合快速过一轮单词理解。',
  },
  {
    value: 'spelling_easy',
    title: '拼写题',
    badge: '简单模式',
    badgeColor: '#10b981',
    description: '提供首字母提示，适合刚开始训练拼写回忆。',
  },
  {
    value: 'spelling_medium',
    title: '拼写题',
    badge: '中等模式',
    badgeColor: '#f59e0b',
    description: '提供首双字母与尾字母提示，难度更均衡。',
  },
  {
    value: 'spelling_hard',
    title: '拼写题',
    badge: '困难模式',
    badgeColor: '#ef4444',
    description: '不提供提示字符，更适合检验真正记住了没有。',
  },
];

const QUESTION_COUNT_OPTIONS = [10, 20, 30];

const quizPageCss = `
.quiz-home-shell {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.quiz-home-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.quiz-home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.9fr);
  gap: 24px;
  align-items: start;
}

.quiz-home-column {
  min-width: 0;
}

.quiz-home-section-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
}

.quiz-home-section-label {
  color: #374151;
  font-size: 13px;
  font-weight: 700;
}

.quiz-home-section-note {
  color: #94a3b8;
  font-size: 13px;
}

.quiz-home-option-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.quiz-home-option {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  transition: all 0.22s ease;
  box-sizing: border-box;
}

.quiz-home-option:hover {
  border-color: rgba(99, 102, 241, 0.28);
  box-shadow: 0 12px 30px rgba(99, 102, 241, 0.08);
  transform: translateY(-1px);
}

.quiz-home-option--active {
  border-color: rgba(99, 102, 241, 0.45);
  background: rgba(238, 242, 255, 0.8);
  box-shadow: 0 14px 34px rgba(99, 102, 241, 0.12);
}

.quiz-home-option .ant-radio-wrapper,
.quiz-home-option .ant-radio {
  margin-top: 2px;
}

.quiz-home-option__copy {
  flex: 1;
  min-width: 0;
}

.quiz-home-option__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.quiz-home-option__title.ant-typography {
  color: #111827;
  font-size: 16px;
  font-weight: 700;
}

.quiz-home-option__desc.ant-typography {
  display: block;
  margin-top: 8px;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.7;
}

.quiz-home-option__badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.quiz-home-side {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 100%;
  padding: 24px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, rgba(255, 255, 255, 0.72) 100%);
  border: 1px solid rgba(99, 102, 241, 0.12);
}

.quiz-home-summary {
  display: grid;
  gap: 12px;
}

.quiz-home-summary-item {
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.7);
}

.quiz-home-summary-label.ant-typography {
  display: block;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}

.quiz-home-summary-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.quiz-home-summary-value.ant-typography {
  color: #111827;
  font-size: 18px;
  font-weight: 700;
}

.quiz-home-count-group {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.quiz-home-count-group .ant-radio-button-wrapper {
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.82);
}

.quiz-home-count-group .ant-radio-button-wrapper:not(:first-child)::before {
  display: none;
}

.quiz-home-count-group .ant-radio-button-wrapper-checked {
  color: #4f46e5;
  border-color: rgba(99, 102, 241, 0.35);
  background: rgba(238, 242, 255, 0.9);
  box-shadow: 0 10px 24px rgba(99, 102, 241, 0.12);
}

.quiz-home-start-button.ant-btn {
  height: 56px;
  margin-top: auto;
  border: none;
  border-radius: 16px;
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  box-shadow: 0 16px 36px rgba(99, 102, 241, 0.28);
}

@media (max-width: 960px) {
  .quiz-home-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .quiz-home-option {
    padding: 16px;
  }

  .quiz-home-count-group {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .quiz-home-count-group .ant-radio-button-wrapper {
    border-radius: 12px;
  }
}
`;

const Quiz = () => {
  const navigate = useNavigate();
  const { setMode } = useLearning();
  const {
    startQuiz,
    fetchQuizQuestions,
    submitQuizAnswer,
    completeQuiz,
    fetchActiveQuizSession,
    deleteQuizSession,
    setQuizSession,
  } = useQuiz();
  const { setPageContext, clearPageContext, openWithPrompt } = useAIChat();

  const [loading, setLoading] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizType, setQuizType] = useState('multiple_choice');
  const [questionCount, setQuestionCount] = useState(10);
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [historyLog, setHistoryLog] = useState({});
  const [correctCount, setCorrectCount] = useState(0);
  const [result, setResult] = useState(null);
  
  const [isAutoAdvance, setIsAutoAdvance] = useState(true);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const currentQuestion = questions[currentQuestionIndex] || null;
  const currentHistory = historyLog[currentQuestionIndex] || null;

  useEffect(() => {
    setMode('quiz');
  }, [setMode]);

  const quizChatContext = useMemo(() => {
    const questionTypeLabel = quizType === 'multiple_choice'
      ? '选择题'
      : quizType === 'spelling_easy'
        ? '拼写题（简单）'
        : quizType === 'spelling_medium'
          ? '拼写题（中等）'
          : quizType === 'spelling_hard'
            ? '拼写题（困难）'
            : quizType || '测试';

    return {
      page: 'quiz',
      label: '测试助手',
      description: quizStarted
        ? `正在做第 ${currentQuestionIndex + 1} 题，可以让我讲题、提示思路或分析错因。`
        : '可以先帮你理解测试类型，也能在答题时讲题和复盘。',
      shortcuts: quizStarted
        ? [
            {
              key: 'quiz-explain',
              label: '讲解这题',
              prompt: currentQuestion
                ? `请结合下面这道测试题，给我讲清楚为什么正确答案是它，同时告诉我一个好记的判断方法。\n\n题目：${currentQuestion.question_text}`
                : '请结合我当前这道测试题，给我讲解解题思路。',
            },
            {
              key: 'quiz-hint',
              label: '给我提示',
              prompt: currentQuestion
                ? `请结合下面这道测试题，先不要直接剧透标准答案，只给我一个渐进式提示。\n\n题目：${currentQuestion.question_text}`
                : '请给我一点测试提示，但不要直接剧透答案。',
            },
            {
              key: 'quiz-review',
              label: '分析错因',
              prompt: currentHistory?.feedback && !currentHistory.feedback.is_correct
                ? `请结合这道测试题和我的作答，分析我为什么会错，并给我一个复习建议。\n\n题目：${currentQuestion?.question_text || ''}\n我的答案：${currentHistory.answer}\n正确答案：${currentHistory.feedback.correct_answer}`
                : '请结合我当前的测试上下文，给我一个简短的答题建议。',
            },
          ]
        : [
            {
              key: 'quiz-plan',
              label: '选测试建议',
              prompt: '请帮我快速对比这几种测试类型，告诉我适合先选哪一种。',
            },
          ],
      payload: {
        questionText: currentQuestion?.question_text,
        questionTypeLabel,
        hint: currentQuestion?.hint,
        selectedAnswer: currentHistory?.answer,
        correctAnswer: currentHistory?.feedback?.correct_answer,
        answerStatusText: currentHistory
          ? (currentHistory.feedback?.is_correct ? '我这题已经答对了' : '我这题答错了')
          : '这题还没有提交答案',
      },
    };
  }, [currentHistory, currentQuestion, currentQuestionIndex, quizStarted, quizType]);

  useEffect(() => {
    setPageContext(quizChatContext);
  }, [quizChatContext, setPageContext]);

  useEffect(() => () => {
    clearPageContext('quiz');
  }, [clearPageContext]);

  const returnToQuizHome = () => {
    if (quizStarted && !result && sessionId) {
      Modal.confirm({
        title: '确认退出测试？',
        content: '退出后将不保留当前的测试状态，本次答题进度将丢失。',
        okText: '确认退出',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await deleteQuizSession(sessionId);
          } catch (e) {
            console.error('删除测试会话失败:', e);
          }
          setQuizSession(null);
          setQuizStarted(false);
          setResult(null);
          setSessionId(null);
          setQuestions([]);
          setCurrentQuestionIndex(0);
          setHistoryLog({});
          setCorrectCount(0);
          setIsTimerRunning(false);
        }
      });
    } else {
      setQuizSession(null);
      setQuizStarted(false);
      setResult(null);
      setSessionId(null);
      setQuestions([]);
      setCurrentQuestionIndex(0);
      setHistoryLog({});
      setCorrectCount(0);
      setIsTimerRunning(false);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (quizStarted && !result) {
        e.preventDefault();
        e.returnValue = '测试正在进行中，退出将不保留测试状态，确定要离开吗？';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [quizStarted, result]);

  useEffect(() => {
    if (quizStarted && !result && sessionId) {
      // 写入一条历史记录以捕获浏览器的后退行为
      window.history.pushState({ isQuizActive: true }, '', window.location.pathname);

      const handlePopState = (e) => {
        if (quizStarted && !result) {
          // 重新写入以保持在当前测试页面
          window.history.pushState({ isQuizActive: true }, '', window.location.pathname);

          Modal.confirm({
            title: '确认退出测试？',
            content: '退出后将不保留当前的测试状态，本次答题进度将丢失。',
            okText: '确认退出',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: async () => {
              try {
                await deleteQuizSession(sessionId);
              } catch (e) {
                console.error('删除测试会话失败:', e);
              }
              setQuizSession(null);
              setQuizStarted(false);
              setResult(null);
              setSessionId(null);
              setQuestions([]);
              setCurrentQuestionIndex(0);
              setHistoryLog({});
              setCorrectCount(0);
              setIsTimerRunning(false);
              navigate('/home');
            }
          });
        }
      };

      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [quizStarted, result, sessionId, navigate, deleteQuizSession, setQuizSession]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(async () => {
      setLoading(true);
      const snapshot = await fetchActiveQuizSession();
      if (cancelled) {
        return;
      }

      if (snapshot) {
        const nextQuestions = snapshot.questions || [];

        if (nextQuestions.length === 0) {
          setLoading(false);
          return;
        }

        const answerByWordId = new Map(
          (snapshot.answers || []).map((item) => [item.word_id, item])
        );

        const nextHistoryLog = {};
        nextQuestions.forEach((question, index) => {
          const savedAnswer = answerByWordId.get(question.word_id);
          if (savedAnswer) {
            nextHistoryLog[index] = {
              answer: savedAnswer.user_answer,
              feedback: {
                is_correct: savedAnswer.is_correct,
                correct_answer: savedAnswer.correct_answer,
              },
            };
          }
        });

        const firstUnansweredIndex = nextQuestions.findIndex(
          (question) => !answerByWordId.has(question.word_id)
        );

        setSessionId(snapshot.session.id);
        setQuizSession(snapshot.session);
        setQuizType(snapshot.session.quiz_type);
        setQuestionCount(snapshot.session.total_questions);
        setQuestions(nextQuestions);
        setHistoryLog(nextHistoryLog);
        setCorrectCount((snapshot.answers || []).filter((item) => item.is_correct).length);
        setCurrentQuestionIndex(
          firstUnansweredIndex >= 0
            ? firstUnansweredIndex
            : Math.max(nextQuestions.length - 1, 0)
        );
        setQuizStarted(true);
        message.info('已恢复上次未完成的测试');
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchActiveQuizSession, setQuizSession]);

  const handleStartQuiz = async () => {
    setLoading(true);
    setResult(null);
    setCurrentQuestionIndex(0);
    setCorrectCount(0);
    setHistoryLog({});
    const session = await startQuiz(quizType, questionCount);
    if (session) {
      setSessionId(session.id);
      const questionsData = await fetchQuizQuestions(session.id);
      setQuestions(questionsData);
      setQuizStarted(true);
    }
    setLoading(false);
  };

  const handleSubmitAnswer = async (answer) => {
    const currentQuestion = questions[currentQuestionIndex];
    const response = await submitQuizAnswer(sessionId, currentQuestion.word_id, answer);

    if (response) {
      setHistoryLog(prev => ({
        ...prev,
        [currentQuestionIndex]: { answer, feedback: response }
      }));
      if (response.is_correct) {
        setCorrectCount(prev => prev + 1);
      }

      if (isAutoAdvance) {
        setIsTimerRunning(true);
      }
    }
  };

  const handleNextQuestion = () => {
    setIsTimerRunning(false);
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      handleCompleteQuiz();
    }
  };

  const handlePrevQuestion = () => {
    setIsTimerRunning(false);
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleCompleteQuiz = async () => {
    const resultData = await completeQuiz(sessionId);
    setResult(resultData);
  };

  const progressPercent = questions.length > 0
    ? Math.round(((currentQuestionIndex + 1) / questions.length) * 100)
    : 0;
  const selectedQuizType = QUIZ_TYPE_OPTIONS.find((item) => item.value === quizType) || QUIZ_TYPE_OPTIONS[0];
  const isQuizHome = !quizStarted && !result;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <motion.div className="page-wrapper" style={{ maxWidth: 1200, margin: '0 auto', height: "100%" }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
      <style>{quizPageCss}</style>
      <div className="page-subheader" style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={isQuizHome ? () => navigate('/home') : returnToQuizHome}
            style={{ borderRadius: '8px' }}
          >
            {isQuizHome ? '返回首页' : '返回测试首页'}
          </Button>
        </div>

        {quizStarted && !result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <Button
              icon={<MessageOutlined />}
              onClick={() => {
                void openWithPrompt('请结合我当前这道测试题，先帮我讲清思路，不要直接剧透答案。', {
                  context: quizChatContext,
                });
              }}
              style={{ borderRadius: '8px' }}
            >
              AI 讲题
            </Button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text style={{ fontSize: '14px', color: '#4b5563', fontWeight: 600 }}>自动跳转</Text>
              <Switch checked={isAutoAdvance} onChange={setIsAutoAdvance} />
            </div>
            <div style={{ minWidth: '160px' }}>
              <Text style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>
                题目: {currentQuestionIndex + 1} / {questions.length}
              </Text>
              <Progress percent={progressPercent} strokeColor="#8b5cf6" trailColor="#e8dccd" showInfo={false} />
            </div>
          </div>
        )}
      </div>

      <div className="page-content">
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {!quizStarted && !result ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card style={{
                borderRadius: '24px',
                background: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.8)'
              }} bodyStyle={{ padding: '40px' }}>
                <div className="quiz-home-shell">
                  <div className="quiz-home-intro">
                    <div>
                      <Title level={3} style={{ margin: 0, color: '#111827' }}>开始测试</Title>
                      <Text style={{ display: 'block', marginTop: 8, fontSize: '14px', color: '#6b7280', lineHeight: 1.7 }}>
                        左边先选题型，右边确认题目数量后直接开始。整个入口会更清楚一些。
                      </Text>
                    </div>
                  </div>

                  <div className="quiz-home-grid">
                    <div className="quiz-home-column">
                      <div className="quiz-home-section-head">
                        <Text className="quiz-home-section-label">测试类型</Text>
                        <Text className="quiz-home-section-note">先确定这一轮更想练理解还是拼写</Text>
                      </div>

                      <Radio.Group
                        value={quizType}
                        onChange={(e) => setQuizType(e.target.value)}
                        className="quiz-home-option-list"
                      >
                        {QUIZ_TYPE_OPTIONS.map((item) => {
                          const active = quizType === item.value;
                          return (
                            <label
                              key={item.value}
                              className={`quiz-home-option ${active ? 'quiz-home-option--active' : ''}`}
                            >
                              <Radio value={item.value} />
                              <div className="quiz-home-option__copy">
                                <div className="quiz-home-option__top">
                                  <Text className="quiz-home-option__title">{item.title}</Text>
                                  <span
                                    className="quiz-home-option__badge"
                                    style={{
                                      color: item.badgeColor,
                                      background: `${item.badgeColor}14`,
                                    }}
                                  >
                                    {item.badge}
                                  </span>
                                </div>
                                <Text className="quiz-home-option__desc">{item.description}</Text>
                              </div>
                            </label>
                          );
                        })}
                      </Radio.Group>
                    </div>

                    <div className="quiz-home-column">
                      <div className="quiz-home-side">
                        <div className="quiz-home-section-head">
                          <Text className="quiz-home-section-label">本次设置</Text>
                          <Text className="quiz-home-section-note">确认好后就可以直接开始</Text>
                        </div>

                        <div className="quiz-home-summary">
                          <div className="quiz-home-summary-item">
                            <Text className="quiz-home-summary-label">当前题型</Text>
                            <div className="quiz-home-summary-value-row">
                              <Text className="quiz-home-summary-value">{selectedQuizType.title}</Text>
                              <span
                                className="quiz-home-option__badge"
                                style={{
                                  color: selectedQuizType.badgeColor,
                                  background: `${selectedQuizType.badgeColor}14`,
                                }}
                              >
                                {selectedQuizType.badge}
                              </span>
                            </div>
                          </div>
                          <div className="quiz-home-summary-item">
                            <Text className="quiz-home-summary-label">题目数量</Text>
                            <Text className="quiz-home-summary-value">{questionCount} 题</Text>
                          </div>
                        </div>

                        <div>
                          <Text className="quiz-home-section-label" style={{ display: 'block', marginBottom: 12 }}>
                            题目数量
                          </Text>
                          <Radio.Group
                            value={questionCount}
                            onChange={(e) => setQuestionCount(e.target.value)}
                            size="large"
                            className="quiz-home-count-group"
                          >
                            {QUESTION_COUNT_OPTIONS.map((count) => (
                              <Radio.Button key={count} value={count}>
                                {count}题
                              </Radio.Button>
                            ))}
                          </Radio.Group>
                        </div>

                        <Button
                          type="primary"
                          size="large"
                          block
                          onClick={handleStartQuiz}
                          className="quiz-home-start-button"
                        >
                          开始测试
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ) : result ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Card style={{
                borderRadius: '24px',
                textAlign: 'center',
                padding: '60px 40px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.3)'
              }}>
                <TrophyOutlined style={{ fontSize: '64px', color: '#8b5cf6', marginBottom: '16px' }} />
                <Title level={2} style={{ color: '#8b5cf6', marginBottom: '16px' }}>测试完成！</Title>
                <div style={{ marginBottom: '32px' }}>
                  <Text style={{ fontSize: '48px', fontWeight: 700, color: '#8b5cf6' }}>
                    {result.score}分
                  </Text>
                  <br />
                  <Text style={{ fontSize: '18px', color: '#6b7280' }}>
                    正确 {result.correct_answers} / {result.total_questions} 题
                  </Text>
                </div>

                <div style={{ marginTop: 32, display: 'flex', gap: 16, justifyContent: 'center' }}>
                  <Button
                    size="large"
                    onClick={returnToQuizHome}
                    style={{ height: '48px', borderRadius: '12px', fontSize: '16px' }}
                  >
                    返回测试首页
                  </Button>
                  <Button
                    type="primary"
                    size="large"
                    onClick={returnToQuizHome}
                    style={{ height: '48px', borderRadius: '12px', fontSize: '16px' }}
                  >
                    再测一次
                  </Button>
                </div>
              </Card>
            </motion.div>
          ) : !currentQuestion ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card style={{
                borderRadius: '24px',
                textAlign: 'center',
                padding: '60px 40px',
                background: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.8)'
              }}>
                <Text style={{ fontSize: '16px', color: '#6b7280', display: 'block', marginBottom: 20 }}>
                  无法恢复上次测试题目，请重新开始
                </Text>
                <Button type="primary" size="large" onClick={returnToQuizHome}>
                  返回测试首页
                </Button>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key={currentQuestionIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <QuizQuestion
                question={currentQuestion}
                onSubmit={handleSubmitAnswer}
                feedback={historyLog[currentQuestionIndex]?.feedback}
                savedAnswer={historyLog[currentQuestionIndex]?.answer}
              />

              {historyLog[currentQuestionIndex] && (
                <div style={{ marginTop: '24px' }}>
                  {isAutoAdvance && isTimerRunning && (
                    <motion.div
                      key={`timer-${currentQuestionIndex}`}
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 2, ease: "linear" }}
                      onAnimationComplete={() => handleNextQuestion()}
                      style={{ 
                        height: '4px', 
                        background: 'linear-gradient(90deg, #8b5cf6 0%, #a855f7 100%)', 
                        borderRadius: '2px', 
                        marginBottom: '16px',
                        boxShadow: '0 0 8px rgba(139, 92, 246, 0.4)'
                      }}
                    />
                  )}
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <Button
                      size="large"
                      onClick={handlePrevQuestion}
                      disabled={currentQuestionIndex === 0}
                      style={{ flex: 1, height: '56px', borderRadius: '12px', fontSize: '18px', fontWeight: 600 }}
                    >
                      上一题
                    </Button>
                    <Button
                      type="primary"
                      size="large"
                      onClick={handleNextQuestion}
                      style={{ flex: 2, height: '56px', borderRadius: '12px', fontSize: '18px', fontWeight: 600 }}
                    >
                      {currentQuestionIndex < questions.length - 1 ? '下一题' : '查看结果'}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default Quiz;
