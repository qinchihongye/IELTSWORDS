import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import apiClient from '../api/client';
import { message } from 'antd';
import { useAuth } from './AuthContext';
import AvatarUnlockModal from '../components/AvatarUnlockModal';

const ProgressContext = createContext(null);
const DASHBOARD_STALE_MS = 15000;
const WORD_PROGRESS_UPDATED_EVENT = 'ieltswords:word-progress-updated';

export const ProgressProvider = ({ children }) => {
  const { user, getCurrentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [streakInfo, setStreakInfo] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [chapterProgress, setChapterProgress] = useState([]);
  const pendingRequestsRef = useRef(new Map());
  const lastDashboardFetchRef = useRef({ timestamp: 0, limit: null });
  const currentUserRole = user?.role ?? null;
  const [newlyUnlockedAvatars, setNewlyUnlockedAvatars] = useState([]);
  const [avatarUnlockModalOpen, setAvatarUnlockModalOpen] = useState(false);

  const runProgressRequest = useCallback((key, requestFn) => {
    const pendingRequest = pendingRequestsRef.current.get(key);
    if (pendingRequest) {
      return pendingRequest;
    }

    const request = Promise.resolve()
      .then(requestFn)
      .finally(() => {
        if (pendingRequestsRef.current.get(key) === request) {
          pendingRequestsRef.current.delete(key);
        }
      });

    pendingRequestsRef.current.set(key, request);
    return request;
  }, []);

  const invalidateDashboardSnapshot = useCallback(() => {
    lastDashboardFetchRef.current = { timestamp: 0, limit: null };
  }, []);

  // 获取数据看板聚合数据
  const fetchDashboard = useCallback(async (leaderboardLimit = 30, options = {}) => {
    const limit = Math.max(1, Math.min(Number(leaderboardLimit) || 30, 100));
    const now = Date.now();
    const lastFetch = lastDashboardFetchRef.current;
    const hasSnapshot = stats && streakInfo && Array.isArray(leaderboard) && Array.isArray(chapterProgress);

    if (
      !options.force &&
      hasSnapshot &&
      lastFetch.limit === limit &&
      now - lastFetch.timestamp < DASHBOARD_STALE_MS
    ) {
      return {
        stats,
        streakInfo,
        leaderboard,
        chapterProgress,
      };
    }

    return runProgressRequest(`dashboard:${limit}`, async () => {
      try {
        const response = await apiClient.get(`/api/progress/dashboard?leaderboard_limit=${limit}`);
        const dashboard = response.data;
        setStats(dashboard.stats);
        setStreakInfo(dashboard.streakInfo);
        setLeaderboard(dashboard.leaderboard || []);
        setChapterProgress(dashboard.chapterProgress || []);
        lastDashboardFetchRef.current = { timestamp: Date.now(), limit };
        return dashboard;
      } catch (error) {
        console.error('获取数据看板失败:', error);
        return null;
      }
    });
  }, [chapterProgress, leaderboard, runProgressRequest, stats, streakInfo]);

  // 获取学习统计
  const fetchStats = useCallback(async () => {
    return runProgressRequest('stats', async () => {
      try {
        const response = await apiClient.get('/api/progress/stats');
        setStats(response.data);
        return response.data;
      } catch (error) {
        console.error('获取学习统计失败:', error);
        return null;
      }
    });
  }, [runProgressRequest]);

  // 获取打卡连续记录
  const fetchStreakInfo = useCallback(async () => {
    return runProgressRequest('streak', async () => {
      try {
        const response = await apiClient.get('/api/checkin/streak');
        setStreakInfo(response.data);
        return response.data;
      } catch (error) {
        console.error('获取打卡信息失败:', error);
        return null;
      }
    });
  }, [runProgressRequest]);

  // 获取排行榜
  const fetchLeaderboard = useCallback(async (limit = 10) => {
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
    return runProgressRequest(`leaderboard:${normalizedLimit}`, async () => {
      try {
        const response = await apiClient.get(`/api/progress/leaderboard?limit=${normalizedLimit}`);
        setLeaderboard(response.data);
        return response.data;
      } catch (error) {
        console.error('获取排行榜失败:', error);
        return [];
      }
    });
  }, [runProgressRequest]);

  // 获取每章学习进度
  const fetchChapterProgress = useCallback(async () => {
    return runProgressRequest('chapters', async () => {
      try {
        const response = await apiClient.get('/api/progress/chapters');
        setChapterProgress(response.data);
        return response.data;
      } catch (error) {
        console.error('获取章节学习进度失败:', error);
        return [];
      }
    });
  }, [runProgressRequest]);

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
      const unlockedAvatars = Array.isArray(response.data?.newly_unlocked_avatars)
        ? response.data.newly_unlocked_avatars
        : [];
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(WORD_PROGRESS_UPDATED_EVENT, {
          detail: {
            wordId,
            status: response.data?.status || status,
          },
        }));
      }
      message.success('学习状态已更新');
      if (unlockedAvatars.length > 0) {
        setNewlyUnlockedAvatars(unlockedAvatars);
        setAvatarUnlockModalOpen(true);
      }
      const previousRole = currentUserRole;
      const refreshedUser = await getCurrentUser();
      if (previousRole === 'user' && refreshedUser?.role === 'premium_user') {
        message.success('已完成全部内置词汇学习，已自动升级为 VIP 用户');
      }
      invalidateDashboardSnapshot();
      // 刷新统计数据
      fetchStats();
      fetchChapterProgress();
      return response.data;
    } catch (error) {
      console.error('更新学习状态失败:', error);
      return null;
    }
  }, [currentUserRole, fetchChapterProgress, fetchStats, getCurrentUser, invalidateDashboardSnapshot]);

  // 更新今日打卡
  const updateTodayCheckIn = useCallback(async (wordsLearned, wordsReviewed) => {
    try {
      const response = await apiClient.post('/api/checkin/today', {
        words_learned: wordsLearned,
        words_reviewed: wordsReviewed
      });
      setStreakInfo(response.data);
      invalidateDashboardSnapshot();
      message.success('打卡成功！');
      return response.data;
    } catch (error) {
      console.error('打卡失败:', error);
      return null;
    }
  }, [invalidateDashboardSnapshot]);

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
    fetchDashboard,
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
    fetchDashboard,
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

  return (
    <ProgressContext.Provider value={value}>
      {children}
      <AvatarUnlockModal
        open={avatarUnlockModalOpen}
        avatars={newlyUnlockedAvatars}
        onClose={() => {
          setAvatarUnlockModalOpen(false);
          setNewlyUnlockedAvatars([]);
        }}
      />
    </ProgressContext.Provider>
  );
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress必须在ProgressProvider内部使用');
  }
  return context;
};

export default ProgressContext;
