/**
 * 核心学习状态管理Context (剥离后)
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../api/client';

const LearningContext = createContext(null);

const getGroupCacheKey = (chapterNo, groupId) => `${chapterNo}:${groupId}`;
const SESSION_CACHE_VERSION = 'v2';
const SESSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const WORD_PROGRESS_UPDATED_EVENT = 'ieltswords:word-progress-updated';

const getCacheNamespace = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user?.id || user?.uid || user?.username) {
      return user.id || user.uid || user.username;
    }
  } catch {
    // Ignore malformed user storage.
  }
  return (localStorage.getItem('access_token') || 'anonymous').slice(-16);
};

const getSessionCacheKey = (key) => `ieltswords:${SESSION_CACHE_VERSION}:${getCacheNamespace()}:${key}`;

const readSessionCache = (key) => {
  try {
    const raw = sessionStorage.getItem(getSessionCacheKey(key));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - Number(parsed.savedAt || 0) > SESSION_CACHE_TTL_MS) {
      sessionStorage.removeItem(getSessionCacheKey(key));
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
};

const writeSessionCache = (key, value) => {
  try {
    sessionStorage.setItem(
      getSessionCacheKey(key),
      JSON.stringify({ savedAt: Date.now(), value })
    );
  } catch {
    // Browsers may reject sessionStorage in private mode or when quota is full.
  }
};

const removeSessionCacheByPrefix = (prefix) => {
  try {
    const namespacePrefix = `ieltswords:${getCacheNamespace()}:`;
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = sessionStorage.key(index);
      if (!storageKey?.startsWith(namespacePrefix)) {
        continue;
      }

      const cacheKey = storageKey.slice(namespacePrefix.length);
      if (cacheKey.startsWith(prefix)) {
        sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    // sessionStorage can be unavailable in private browsing modes.
  }
};

export const LearningProvider = ({ children }) => {
  const [mode, setMode] = useState(null); // 'sequential' | 'random-group' | 'random-word' | 'review' | 'mistake-book' | 'quiz' | 'check-in'
  const [currentChapter, setCurrentChapter] = useState(null);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [words, setWords] = useState([]);
  const [currentWordsKey, setCurrentWordsKey] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [images, setImages] = useState([]);
  const [currentImagesKey, setCurrentImagesKey] = useState(null);
  const chaptersCacheRef = useRef(null);
  const groupsCacheRef = useRef(new Map());
  const wordsCacheRef = useRef(new Map());
  const imagesCacheRef = useRef(new Map());

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
    if (chaptersCacheRef.current) {
      return chaptersCacheRef.current;
    }

    const cachedChapters = readSessionCache('chapters');
    if (cachedChapters) {
      chaptersCacheRef.current = cachedChapters;
      return cachedChapters;
    }

    try {
      const response = await apiClient.get('/api/chapters');
      chaptersCacheRef.current = response.data;
      writeSessionCache('chapters', response.data);
      return response.data;
    } catch (error) {
      console.error('获取章节列表失败:', error);
      return [];
    }
  }, []);

  // 获取章节的分组
  const fetchGroupsByChapter = useCallback(async (chapterNo, options = {}) => {
    const cacheKey = String(chapterNo);
    const cachedGroups = groupsCacheRef.current.get(cacheKey);
    if (cachedGroups) {
      if (!options.force) {
        return cachedGroups;
      }
    }

    const sessionGroups = readSessionCache(`groups:${cacheKey}`);
    if (sessionGroups) {
      if (!options.force) {
        groupsCacheRef.current.set(cacheKey, sessionGroups);
        return sessionGroups;
      }
    }

    try {
      const response = await apiClient.get(`/api/chapters/${chapterNo}/groups`);
      groupsCacheRef.current.set(cacheKey, response.data);
      writeSessionCache(`groups:${cacheKey}`, response.data);
      return response.data;
    } catch (error) {
      console.error('获取分组列表失败:', error);
      return [];
    }
  }, []);

  useEffect(() => {
    const handleProgressUpdated = () => {
      groupsCacheRef.current.clear();
      removeSessionCacheByPrefix('groups:');
    };

    window.addEventListener(WORD_PROGRESS_UPDATED_EVENT, handleProgressUpdated);
    return () => {
      window.removeEventListener(WORD_PROGRESS_UPDATED_EVENT, handleProgressUpdated);
    };
  }, []);

  // 获取分组的单词
  const fetchWordsByGroup = useCallback(async (chapterNo, groupId) => {
    const cacheKey = getGroupCacheKey(chapterNo, groupId);
    const cachedWords = wordsCacheRef.current.get(cacheKey);
    if (cachedWords) {
      setWords(cachedWords);
      setCurrentWordsKey(cacheKey);
      setCurrentIndex(0);
      return cachedWords;
    }

    const sessionWords = readSessionCache(`words:${cacheKey}`);
    if (sessionWords) {
      wordsCacheRef.current.set(cacheKey, sessionWords);
      setWords(sessionWords);
      setCurrentWordsKey(cacheKey);
      setCurrentIndex(0);
      return sessionWords;
    }

    try {
      const response = await apiClient.get(
        `/api/groups/${groupId}/words?detail=true&chapter_no=${chapterNo}`
      );
      wordsCacheRef.current.set(cacheKey, response.data);
      writeSessionCache(`words:${cacheKey}`, response.data);
      setWords(response.data);
      setCurrentWordsKey(cacheKey);
      setCurrentIndex(0);
      return response.data;
    } catch (error) {
      console.error('获取单词列表失败:', error);
      setWords([]);
      setCurrentWordsKey(null);
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
    const cacheKey = getGroupCacheKey(chapterNo, groupId);
    if (imagesCacheRef.current.has(cacheKey)) {
      const cachedImages = imagesCacheRef.current.get(cacheKey);
      setImages(cachedImages);
      setCurrentImagesKey(cacheKey);
      return cachedImages;
    }

    const sessionImages = readSessionCache(`images:${cacheKey}`);
    if (sessionImages) {
      imagesCacheRef.current.set(cacheKey, sessionImages);
      setImages(sessionImages);
      setCurrentImagesKey(cacheKey);
      return sessionImages;
    }

    try {
      const response = await apiClient.get(`/api/images/${groupId}?chapter_no=${chapterNo}`, {
        skipErrorHandler: true,
        validateStatus: (status) => status === 200 || status === 404,
      });

      if (response.status === 404) {
        imagesCacheRef.current.set(cacheKey, []);
        writeSessionCache(`images:${cacheKey}`, []);
        setImages([]);
        setCurrentImagesKey(cacheKey);
        return [];
      }

      imagesCacheRef.current.set(cacheKey, response.data);
      writeSessionCache(`images:${cacheKey}`, response.data);
      setImages(response.data);
      setCurrentImagesKey(cacheKey);
      return response.data;
    } catch (error) {
      console.error('获取图片列表失败:', error);
      setImages([]);
      setCurrentImagesKey(null);
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
    setCurrentWordsKey(null);
    setCurrentIndex(0);
    setImages([]);
    setCurrentImagesKey(null);
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
    currentWordsKey,
    currentIndex,
    setCurrentIndex,
    images,
    setImages,
    currentImagesKey,
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
    currentWordsKey,
    currentIndex,
    images,
    currentImagesKey,
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
