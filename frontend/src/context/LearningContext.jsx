/**
 * 核心学习状态管理Context (剥离后)
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import apiClient from '../api/client';

const LearningContext = createContext(null);

export const LearningProvider = ({ children }) => {
  const [mode, setMode] = useState(null); // 'sequential' | 'random-group' | 'random-word' | 'review' | 'mistake-book' | 'quiz' | 'check-in'
  const [currentChapter, setCurrentChapter] = useState(null);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [words, setWords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [images, setImages] = useState([]);

  // 统一的透镜大小与倍率配置 (持久化保存)
  const [lensRadius, setLensRadiusState] = useState(() => {
    return Number(localStorage.getItem('ieltswords_lens_radius')) || 110;
  });
  const [magnifierScale, setMagnifierScaleState] = useState(() => {
    return Number(localStorage.getItem('ieltswords_lens_scale')) || 2.0;
  });
  const [spotlightOpacity, setSpotlightOpacityState] = useState(() => {
    return Number(localStorage.getItem('ieltswords_spotlight_opacity')) || 40;
  });

  const setLensRadius = useCallback((val) => {
    setLensRadiusState(val);
    localStorage.setItem('ieltswords_lens_radius', val);
  }, []);

  const setMagnifierScale = useCallback((val) => {
    setMagnifierScaleState(val);
    localStorage.setItem('ieltswords_lens_scale', val);
  }, []);

  const setSpotlightOpacity = useCallback((val) => {
    setSpotlightOpacityState(val);
    localStorage.setItem('ieltswords_spotlight_opacity', val);
  }, []);

  // 获取所有章节
  const fetchChapters = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/chapters');
      return response.data;
    } catch (error) {
      console.error('获取章节列表失败:', error);
      return [];
    }
  }, []);

  // 获取章节的分组
  const fetchGroupsByChapter = useCallback(async (chapterNo) => {
    try {
      const response = await apiClient.get(`/api/chapters/${chapterNo}/groups`);
      return response.data;
    } catch (error) {
      console.error('获取分组列表失败:', error);
      return [];
    }
  }, []);

  // 获取分组的单词
  const fetchWordsByGroup = useCallback(async (chapterNo, groupId) => {
    try {
      const response = await apiClient.get(
        `/api/groups/${groupId}/words?detail=true&chapter_no=${chapterNo}`
      );
      setWords(response.data);
      setCurrentIndex(0);
      return response.data;
    } catch (error) {
      console.error('获取单词列表失败:', error);
      setWords([]);
      setCurrentIndex(0);
      return [];
    }
  }, []);

  // 获取随机分组
  const fetchRandomGroups = useCallback(async (count = 5) => {
    try {
      const response = await apiClient.get(`/api/groups/random?count=${count}`);
      return response.data;
    } catch (error) {
      console.error('获取随机分组失败:', error);
      return [];
    }
  }, []);

  // 获取随机单词
  const fetchRandomWord = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/words/random');
      return response.data;
    } catch (error) {
      console.error('获取随机单词失败:', error);
      return null;
    }
  }, []);

  // 获取分组的图片
  const fetchImagesByGroup = useCallback(async (chapterNo, groupId) => {
    try {
      const response = await apiClient.get(`/api/images/${groupId}?chapter_no=${chapterNo}`, {
        skipErrorHandler: true,
        validateStatus: (status) => status === 200 || status === 404,
      });

      if (response.status === 404) {
        setImages([]);
        return [];
      }

      setImages(response.data);
      return response.data;
    } catch (error) {
      console.error('获取图片列表失败:', error);
      setImages([]);
      return [];
    }
  }, []);

  // 导航：上一个
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  // 导航：下一个
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < words.length - 1 ? prev + 1 : prev));
  }, [words.length]);

  const selectWordAtIndex = useCallback((index) => {
    if (index >= 0 && index < words.length) {
      setCurrentIndex(index);
    }
  }, [words.length]);

  // 重置学习状态
  const resetLearning = useCallback(() => {
    setMode(null);
    setCurrentChapter(null);
    setCurrentGroup(null);
    setWords([]);
    setCurrentIndex(0);
    setImages([]);
  }, []);

  const value = useMemo(() => ({
    mode,
    setMode,
    currentChapter,
    setCurrentChapter,
    currentGroup,
    setCurrentGroup,
    words,
    setWords,
    currentIndex,
    setCurrentIndex,
    images,
    setImages,
    lensRadius,
    setLensRadius,
    magnifierScale,
    setMagnifierScale,
    spotlightOpacity,
    setSpotlightOpacity,
    fetchChapters,
    fetchGroupsByChapter,
    fetchWordsByGroup,
    fetchRandomGroups,
    fetchRandomWord,
    fetchImagesByGroup,
    goToPrevious,
    goToNext,
    selectWordAtIndex,
    resetLearning,
  }), [
    mode,
    currentChapter,
    currentGroup,
    words,
    currentIndex,
    images,
	    lensRadius,
	    setLensRadius,
	    magnifierScale,
	    setMagnifierScale,
	    spotlightOpacity,
	    setSpotlightOpacity,
	    fetchChapters,
    fetchGroupsByChapter,
    fetchWordsByGroup,
    fetchRandomGroups,
    fetchRandomWord,
    fetchImagesByGroup,
    goToPrevious,
    goToNext,
    selectWordAtIndex,
    resetLearning,
  ]);

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
};

// 自定义Hook
export const useLearning = () => {
  const context = useContext(LearningContext);
  if (!context) {
    throw new Error('useLearning必须在LearningProvider内部使用');
  }
  return context;
};

export default LearningContext;
