import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import apiClient from '../api/client';
import { message } from 'antd';
import { useAuth } from './AuthContext';

const ReviewContext = createContext(null);

export const ReviewProvider = ({ children }) => {
  const { user, getCurrentUser } = useAuth();
  const [reviewWords, setReviewWords] = useState([]);
  const currentUserRole = user?.role ?? null;

  const fetchReviewDueWords = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/review/due');
      setReviewWords(response.data);
      return response.data;
    } catch (error) {
      console.error('获取复习单词失败:', error);
      return [];
    }
  }, []);

  const updateWordDifficulty = useCallback(async (wordId, difficulty) => {
    try {
      const response = await apiClient.post(`/api/review/word/${wordId}/difficulty`, {
        difficulty
      });
      message.success('已更新复习计划');
      const previousRole = currentUserRole;
      const refreshedUser = await getCurrentUser();
      if (previousRole === 'user' && refreshedUser?.role === 'premium_user') {
        message.success('已完成全部内置词汇学习，已自动升级为 VIP 用户');
      }
      return response.data;
    } catch (error) {
      console.error('更新难度失败:', error);
      return null;
    }
  }, [currentUserRole, getCurrentUser]);

  const fetchReviewStats = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/review/stats');
      return response.data;
    } catch (error) {
      console.error('获取复习统计失败:', error);
      return null;
    }
  }, []);

  const value = useMemo(() => ({
    reviewWords,
    setReviewWords,
    fetchReviewDueWords,
    updateWordDifficulty,
    fetchReviewStats,
  }), [
    reviewWords,
    fetchReviewDueWords,
    updateWordDifficulty,
    fetchReviewStats,
  ]);

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
};

export const useReview = () => {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error('useReview必须在ReviewProvider内部使用');
  }
  return context;
};

export default ReviewContext;
