import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import apiClient from '../api/client';
import { message } from 'antd';
import { useAuth } from './AuthContext';

const ProgressContext = createContext(null);

export const ProgressProvider = ({ children }) => {
  const { user, getCurrentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [streakInfo, setStreakInfo] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [chapterProgress, setChapterProgress] = useState([]);
  const currentUserRole = user?.role ?? null;

  // 获取学习统计
  const fetchStats = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/progress/stats');
      setStats(response.data);
      return response.data;
    } catch (error) {
      console.error('获取学习统计失败:', error);
      return null;
    }
  }, []);

  // 获取打卡连续记录
  const fetchStreakInfo = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/checkin/streak');
      setStreakInfo(response.data);
      return response.data;
    } catch (error) {
      console.error('获取打卡信息失败:', error);
      return null;
    }
  }, []);

  // 获取排行榜
  const fetchLeaderboard = useCallback(async (limit = 10) => {
    try {
      const response = await apiClient.get(`/api/progress/leaderboard?limit=${limit}`);
      setLeaderboard(response.data);
      return response.data;
    } catch (error) {
      console.error('获取排行榜失败:', error);
      return [];
    }
  }, []);

  // 获取每章学习进度
  const fetchChapterProgress = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/progress/chapters');
      setChapterProgress(response.data);
      return response.data;
    } catch (error) {
      console.error('获取章节学习进度失败:', error);
      return [];
    }
  }, []);

  // 获取单一单词进度
  const fetchWordProgress = useCallback(async (wordId) => {
    try {
      const response = await apiClient.get(`/api/progress/word/${wordId}`, {
        skipErrorHandler: true,
        validateStatus: (status) => status === 200 || status === 404,
      });

      if (response.status === 404) {
        return null;
      }

      return response.data;
    } catch (error) {
      console.error('获取单词进度失败:', error);
      return null;
    }
  }, []);

  // 获取单词组合进度映射表
  const fetchProgressMapForWords = useCallback(async (wordIds = []) => {
    if (!wordIds.length) {
      return {};
    }

    try {
      const response = await apiClient.get('/api/progress/words', {
        skipErrorHandler: true,
      });
      const wordIdSet = new Set(wordIds.map((wordId) => Number(wordId)));

      return response.data.reduce((progressMap, item) => {
        if (wordIdSet.has(Number(item.word_id))) {
          progressMap[item.word_id] = item.status;
        }

        return progressMap;
      }, {});
    } catch (error) {
      console.error('批量获取单词进度失败:', error);
      return {};
    }
  }, []);

  // 更新单词学习状态
  const updateWordProgress = useCallback(async (wordId, status) => {
    try {
      const response = await apiClient.post(`/api/progress/word/${wordId}`, { status });
      message.success('学习状态已更新');
      const previousRole = currentUserRole;
      const refreshedUser = await getCurrentUser();
      if (previousRole === 'user' && refreshedUser?.role === 'premium_user') {
        message.success('已完成全部内置词汇学习，已自动升级为 VIP 用户');
      }
      // 刷新统计数据
      fetchStats();
      fetchChapterProgress();
      return response.data;
    } catch (error) {
      console.error('更新学习状态失败:', error);
      return null;
    }
  }, [currentUserRole, fetchChapterProgress, fetchStats, getCurrentUser]);

  // 更新今日打卡
  const updateTodayCheckIn = useCallback(async (wordsLearned, wordsReviewed) => {
    try {
      const response = await apiClient.post('/api/checkin/today', {
        words_learned: wordsLearned,
        words_reviewed: wordsReviewed
      });
      setStreakInfo(response.data);
      message.success('打卡成功！');
      return response.data;
    } catch (error) {
      console.error('打卡失败:', error);
      return null;
    }
  }, []);

  // 获取打卡历史
  const fetchCheckInHistory = useCallback(async (days = 30) => {
    try {
      const response = await apiClient.get(`/api/checkin/history?days=${days}`);
      return response.data;
    } catch (error) {
      console.error('获取打卡历史失败:', error);
      return [];
    }
  }, []);

  const value = useMemo(() => ({
    stats,
    setStats,
    fetchStats,
    streakInfo,
    setStreakInfo,
    fetchStreakInfo,
    leaderboard,
    fetchLeaderboard,
    chapterProgress,
    fetchChapterProgress,
    fetchWordProgress,
    fetchProgressMapForWords,
    updateWordProgress,
    updateTodayCheckIn,
    fetchCheckInHistory,
  }), [
    stats,
    fetchStats,
    streakInfo,
    fetchStreakInfo,
    leaderboard,
    fetchLeaderboard,
    chapterProgress,
    fetchChapterProgress,
    fetchWordProgress,
    fetchProgressMapForWords,
    updateWordProgress,
    updateTodayCheckIn,
    fetchCheckInHistory,
  ]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress必须在ProgressProvider内部使用');
  }
  return context;
};

export default ProgressContext;
