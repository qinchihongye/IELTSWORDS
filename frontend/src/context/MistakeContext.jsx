import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import apiClient from '../api/client';
import { message } from 'antd';
import { useAuth } from './AuthContext';

const MistakeContext = createContext(null);

export const MistakeProvider = ({ children }) => {
  const { user, getCurrentUser } = useAuth();
  const [mistakeWords, setMistakeWords] = useState([]);
  const currentUserRole = user?.role ?? null;

  const fetchMistakeWords = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/mistakes');
      setMistakeWords(response.data);
      return response.data;
    } catch (error) {
      console.error('获取错词本失败:', error);
      return [];
    }
  }, []);

  const toggleMistakeMark = useCallback(async (wordId) => {
    try {
      const response = await apiClient.post(`/api/mistakes/word/${wordId}/toggle`);
      message.success(response.data.message);
      const previousRole = currentUserRole;
      const refreshedUser = await getCurrentUser();
      if (previousRole === 'user' && refreshedUser?.role === 'premium_user') {
        message.success('已完成全部内置词汇学习，已自动升级为 VIP 用户');
      }
      return response.data;
    } catch (error) {
      console.error('切换错词标记失败:', error);
      return null;
    }
  }, [currentUserRole, getCurrentUser]);

  const fetchMistakeReviewPlan = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/mistakes/review-plan');
      return response.data;
    } catch (error) {
      console.error('获取错词复习计划失败:', error);
      return [];
    }
  }, []);

  const value = useMemo(() => ({
    mistakeWords,
    setMistakeWords,
    fetchMistakeWords,
    fetchMistakeReviewPlan,
    toggleMistakeMark,
  }), [
    mistakeWords,
    fetchMistakeWords,
    fetchMistakeReviewPlan,
    toggleMistakeMark,
  ]);

  return <MistakeContext.Provider value={value}>{children}</MistakeContext.Provider>;
};

export const useMistake = () => {
  const context = useContext(MistakeContext);
  if (!context) {
    throw new Error('useMistake必须在MistakeProvider内部使用');
  }
  return context;
};

export default MistakeContext;
