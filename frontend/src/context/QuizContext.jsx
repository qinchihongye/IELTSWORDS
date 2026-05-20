import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import apiClient from '../api/client';

const QuizContext = createContext(null);

export const QuizProvider = ({ children }) => {
  const [quizSession, setQuizSession] = useState(null);

  const startQuiz = useCallback(async (quizType, count = 10) => {
    try {
      const response = await apiClient.post('/api/quiz/start', {
        quiz_type: quizType,
        count: count
      });
      setQuizSession(response.data);
      return response.data;
    } catch (error) {
      console.error('开始测试失败:', error);
      return null;
    }
  }, []);

  const fetchQuizQuestions = useCallback(async (sessionId) => {
    try {
      const response = await apiClient.get(`/api/quiz/session/${sessionId}/questions`);
      return response.data;
    } catch (error) {
      console.error('获取测试题目失败:', error);
      return [];
    }
  }, []);

  const submitQuizAnswer = useCallback(async (sessionId, wordId, answer) => {
    try {
      const response = await apiClient.post(`/api/quiz/session/${sessionId}/answer`, {
        word_id: wordId,
        user_answer: answer
      });
      return response.data;
    } catch (error) {
      console.error('提交答案失败:', error);
      return null;
    }
  }, []);

  const completeQuiz = useCallback(async (sessionId) => {
    try {
      const response = await apiClient.post(`/api/quiz/session/${sessionId}/complete`);
      setQuizSession(response.data);
      return response.data;
    } catch (error) {
      console.error('完成测试失败:', error);
      return null;
    }
  }, []);

  const fetchQuizHistory = useCallback(async (limit = 10) => {
    try {
      const response = await apiClient.get(`/api/quiz/history?limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('获取测试历史失败:', error);
      return [];
    }
  }, []);

  const fetchActiveQuizSession = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/quiz/active', {
        skipErrorHandler: true,
        validateStatus: (status) => status === 200 || status === 404,
      });

      if (response.status === 404) {
        return null;
      }

      return response.data;
    } catch (error) {
      console.error('获取当前测试快照失败:', error);
      return null;
    }
  }, []);

  const deleteQuizSession = useCallback(async (sessionId) => {
    try {
      const response = await apiClient.delete(`/api/quiz/session/${sessionId}`);
      setQuizSession(null);
      return response.data;
    } catch (error) {
      console.error('删除测试会话失败:', error);
      return null;
    }
  }, []);

  const value = useMemo(() => ({
    quizSession,
    setQuizSession,
    startQuiz,
    fetchQuizQuestions,
    submitQuizAnswer,
    completeQuiz,
    fetchQuizHistory,
    fetchActiveQuizSession,
    deleteQuizSession,
  }), [
    quizSession,
    startQuiz,
    fetchQuizQuestions,
    submitQuizAnswer,
    completeQuiz,
    fetchQuizHistory,
    fetchActiveQuizSession,
    deleteQuizSession,
  ]);

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
};

export const useQuiz = () => {
  const context = useContext(QuizContext);
  if (!context) {
    throw new Error('useQuiz必须在QuizProvider内部使用');
  }
  return context;
};

export default QuizContext;
