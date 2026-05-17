/**
 * 学习页面 - 单词学习主界面
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Card, Progress, Slider, Spin, Switch, Typography, message } from 'antd';
import { ArrowLeftOutlined, LeftOutlined, MessageOutlined, ReloadOutlined, RightOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { useProgress } from '../context/ProgressContext';
import { useMistake } from '../context/MistakeContext';
import { useAIChat } from '../context/AIChatContext';
import WordCard from '../components/WordCard';
import ImageGallery from '../components/ImageGallery';
import ExampleSentenceCard from '../components/ExampleSentenceCard';
import './Learning.css';
import { formatChapterTitle } from '../utils/learning';


const { Title, Text } = Typography;

const Learning = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    mode,
    setMode,
    currentGroup,
    setCurrentGroup,
    words,
    setWords,
    currentIndex,
    setCurrentIndex,
    images,
    setImages,
    fetchWordsByGroup,
    fetchImagesByGroup,
    fetchRandomGroups,
    fetchRandomWord,
    goToPrevious,
    goToNext,
    lensRadius,
    setLensRadius,
  } = useLearning();

  const { fetchWordProgress, updateWordProgress } = useProgress();
  const { toggleMistakeMark } = useMistake();
  const { setPageContext, clearPageContext, openWithPrompt } = useAIChat();

  const routeMode = location.pathname === '/random-group'
    ? 'random-group'
    : location.pathname === '/random-word'
      ? 'random-word'
      : null;
  const activeMode = routeMode || mode;
  const [loading, setLoading] = useState(activeMode !== 'mistake-book');
  const [randomWord, setRandomWord] = useState(null);
  const [currentStatus, setCurrentStatus] = useState('unlearned');
  const [isMistakeMarked, setIsMistakeMarked] = useState(false);
  const [autoAdvanceSequential, setAutoAdvanceSequential] = useState(true);
  const [isCompletingGroup, setIsCompletingGroup] = useState(false);
  const completionTimeoutRef = useRef(null);
  const isListMode =
    activeMode === 'sequential' ||
    activeMode === 'random-group' ||
    activeMode === 'mistake-book';
  const currentWord = isListMode ? words[currentIndex] || null : randomWord;
  const currentWordId = currentWord?.id || null;
  const currentChapterTitle = currentGroup
    ? formatChapterTitle(currentGroup.chapterNo, currentGroup.chapterName)
    : '';

  const loadSequentialContent = useCallback(async (group) => {
    const wordsAlreadyLoaded =
      words.length > 0 &&
      words[0].groupId === group.groupId &&
      words[0].chapterNo === group.chapterNo;
    const imagesAlreadyLoaded =
      images.length > 0 &&
      images[0].groupId === group.groupId &&
      images[0].chapterNo === group.chapterNo;

    if (!wordsAlreadyLoaded) {
      await fetchWordsByGroup(group.chapterNo, group.groupId);
    }

    if (!imagesAlreadyLoaded) {
      await fetchImagesByGroup(group.chapterNo, group.groupId);
    }

    setLoading(false);
  }, [fetchImagesByGroup, fetchWordsByGroup, images, words]);

  const loadRandomWordContent = useCallback(async () => {
    const word = await fetchRandomWord();
    setRandomWord(word);

    // 尝试加载该单词所属分组的配图
    if (word && word.chapterNo && word.groupId) {
      await fetchImagesByGroup(word.chapterNo, word.groupId);
    } else {
      setImages([]);
    }

    setLoading(false);
  }, [fetchImagesByGroup, fetchRandomWord, setImages]);

  const loadRandomGroupContent = useCallback(async () => {
    const groups = await fetchRandomGroups(1);
    const nextGroup = groups[0] || null;
    setCurrentGroup(nextGroup);

    if (!nextGroup) {
      setWords([]);
      setCurrentIndex(0);
      setImages([]);
      setLoading(false);
      return;
    }

    await fetchWordsByGroup(nextGroup.chapterNo, nextGroup.groupId);
    await fetchImagesByGroup(nextGroup.chapterNo, nextGroup.groupId);
    setLoading(false);
  }, [fetchImagesByGroup, fetchRandomGroups, fetchWordsByGroup, setCurrentGroup, setCurrentIndex, setImages, setWords]);

  useEffect(() => {
    if (routeMode && routeMode !== mode) {
      setMode(routeMode);
    }
  }, [routeMode, mode, setMode]);

  useEffect(() => {
    let active = true;

    const loadWordProgress = async () => {
      if (!currentWordId) {
        setCurrentStatus('unlearned');
        setIsMistakeMarked(false);
        return;
      }

      setCurrentStatus('unlearned');
      setIsMistakeMarked(false);
      const progress = await fetchWordProgress(currentWordId);
      if (active) {
        setCurrentStatus(progress?.status || 'unlearned');
        setIsMistakeMarked(progress?.is_mistake_marked || false);
      }
    };

    loadWordProgress();

    return () => {
      active = false;
    };
  }, [currentWordId, fetchWordProgress]);

  useEffect(() => {
    if (activeMode !== 'sequential') {
      return undefined;
    }

    let cancelled = false;

    queueMicrotask(async () => {
      if (cancelled) {
        return;
      }

      if (currentGroup) {
        await loadSequentialContent(currentGroup);
      } else {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeMode, currentGroup, loadSequentialContent]);

  // 错词本模式：根据当前单词加载对应分组的配图
  useEffect(() => {
    if (activeMode !== 'mistake-book' || !currentWord) return;

    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      await fetchImagesByGroup(currentWord.chapterNo, currentWord.groupId);
    });

    return () => { cancelled = true; };
  }, [activeMode, currentWord, fetchImagesByGroup]);

  useEffect(() => {
    if (activeMode !== 'random-word' && activeMode !== 'random-group') {
      return undefined;
    }

    let cancelled = false;

    queueMicrotask(async () => {
      if (cancelled) {
        return;
      }

      if (activeMode === 'random-word') {
        await loadRandomWordContent();
      } else {
        await loadRandomGroupContent();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeMode, loadRandomGroupContent, loadRandomWordContent]);

  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        window.clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

  const handleBackNavigation = () => {
    if (activeMode === 'sequential') {
      navigate('/chapter-select');
      return;
    }

    if (activeMode === 'mistake-book') {
      navigate('/mistake-book');
      return;
    }

    navigate('/home');
  };

  const handleProgressUpdate = async (status) => {
    if (!currentWord || isCompletingGroup) {
      return;
    }

    const updatedProgress = await updateWordProgress(currentWord.id, status);
    if (updatedProgress?.status) {
      setCurrentStatus(updatedProgress.status);

      // 顺序模式：最后一组单词完成时跳转章节选择
      if (activeMode === 'sequential' && words.length > 0 && currentIndex === words.length - 1) {
        setIsCompletingGroup(true);
        message.success('已经完成本组', 1);
        completionTimeoutRef.current = window.setTimeout(() => {
          navigate('/chapter-select');
        }, 1000);
        return;
      }

      // 列表模式（顺序/随机分组/错词本）：自动前进到下一个
      if (isListMode && currentIndex < words.length - 1) {
        if (activeMode !== 'sequential' || autoAdvanceSequential) {
          goToNext();
        }
      }

      // 随机单词模式：标记后自动换一个新单词
      if (activeMode === 'random-word') {
        message.success('太棒了！已掌握这个单词', 1);
        setTimeout(() => {
          setLoading(true);
          setRandomWord(null);
          setCurrentGroup(null);
          setWords([]);
          setCurrentIndex(0);
          setImages([]);
          void loadRandomWordContent();
        }, 1000);
      }
    }
  };

  const handleRefreshContent = async () => {
    if (activeMode === 'random-word') {
      setLoading(true);
      setRandomWord(null);
      setCurrentGroup(null);
      setWords([]);
      setCurrentIndex(0);
      setImages([]);
      await loadRandomWordContent();
    } else if (activeMode === 'random-group') {
      setLoading(true);
      setWords([]);
      setCurrentIndex(0);
      setImages([]);
      await loadRandomGroupContent();
    }
  };

  const handleToggleMistakeMark = async () => {
    if (!currentWord) return;

    const result = await toggleMistakeMark(currentWord.id);
    if (result) {
      setIsMistakeMarked(result.is_mistake_marked);
      message.success(result.message);

      if (activeMode === 'mistake-book' && !result.is_mistake_marked) {
        const newWords = words.filter(w => w.id !== currentWord.id);
        setWords(newWords);
        if (currentIndex >= newWords.length) {
          setCurrentIndex(Math.max(0, newWords.length - 1));
        }
      }
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      goToPrevious();
    }
  };

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      goToNext();
    }
  };

  const progressPercent = words.length > 0
    ? Math.round(((currentIndex + 1) / words.length) * 100)
    : 0;
  const titleText = activeMode === 'sequential'
    ? currentChapterTitle
    : activeMode === 'random-group'
      ? currentGroup?.groupTheme || '随机分组'
      : activeMode === 'mistake-book'
        ? '错词本复习'
      : '随机单词';
  const subtitleText = activeMode === 'sequential'
    ? `${currentGroup?.groupId || ''} · ${currentGroup?.groupTheme || ''} · ${currentIndex + 1}/${words.length}`
    : activeMode === 'random-group'
      ? `${currentChapterTitle} · ${currentGroup?.groupId || ''} · ${words.length} 个词`
      : activeMode === 'mistake-book'
        ? currentWord
          ? `${formatChapterTitle(currentWord.chapterNo, currentWord.chapterName)} · ${currentWord.groupId} · ${currentIndex + 1}/${words.length}`
          : `错词本 · ${words.length} 个词`
      : currentWord
        ? `${formatChapterTitle(currentWord.chapterNo, currentWord.chapterName)} · ${currentWord.groupId}`
        : '随机抽取一个单词';
  const emptyText = activeMode === 'random-group'
    ? '没有可用的随机分组'
    : activeMode === 'mistake-book'
      ? '错词本里还没有单词'
      : '没有可学习的单词';
  const learningChatContext = useMemo(() => {
    const modeLabel = activeMode === 'sequential'
      ? '顺序学习'
      : activeMode === 'random-group'
        ? '随机分组'
        : activeMode === 'mistake-book'
          ? '错词本复习'
          : '随机单词';
    const chapterTitle = currentChapterTitle || (
      currentWord
        ? formatChapterTitle(currentWord.chapterNo, currentWord.chapterName)
        : ''
    );
    const groupLabel = currentGroup
      ? `${currentGroup.groupId}${currentGroup.groupTheme ? ` · ${currentGroup.groupTheme}` : ''}`
      : currentWord?.groupId || '';

    return {
      page: 'learning',
      label: '单词学习助手',
      description: currentWord
        ? `当前聚焦 ${currentWord.word}，可以直接问词义、辨析或记忆方法。`
        : '可以结合当前学习内容直接提问。',
      shortcuts: [
        {
          key: 'learning-explain',
          label: '解释单词',
          prompt: '请结合我当前这个单词，用简洁中文讲清楚核心词义和常见使用场景。',
        },
        {
          key: 'learning-memory',
          label: '记忆技巧',
          prompt: '请结合我当前这个单词，给我一个简短、好记的记忆技巧。',
        },
        {
          key: 'learning-compare',
          label: '近义辨析',
          prompt: '请结合我当前这个单词，帮我做一个常见易混词辨析，重点说明差别。',
        },
      ],
      payload: {
        modeLabel,
        chapterTitle,
        groupLabel,
        word: currentWord?.word,
        explanation: currentWord?.explanation,
        exampleSentence: currentWord?.exampleSentence,
        sentenceMeaning: currentWord?.sentenceMeaning,
        wordNote: currentWord?.word_note,
        imageProgressText: images.length > 0 ? `当前分组共有 ${images.length} 张配图` : '当前没有配图',
      },
    };
  }, [activeMode, currentChapterTitle, currentGroup, currentWord, images.length]);

  useEffect(() => {
    if (!currentWord) {
      return;
    }

    setPageContext(learningChatContext);
  }, [currentWord, learningChatContext, setPageContext]);

  useEffect(() => () => {
    clearPageContext('learning');
  }, [clearPageContext]);

  if (loading) {
    return (
      <div className="learning-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!currentWord) {
    return (
      <div className="learning-empty">
        <Text>{emptyText}</Text>
        <Button type="primary" onClick={() => navigate('/home')} style={{ marginTop: 16 }}>
          返回首页
        </Button>
      </div>
    );
  }

  return (
    <motion.div className="page-wrapper" style={{ maxWidth: 1200, margin: '0 auto', height: "100%" }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
      <div className="page-subheader" style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="learning-header__main" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
          <div className="learning-header__copy" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {activeMode === 'sequential' && (
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}>
                {titleText}
              </div>
            )}
            <Text style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500 }}>{subtitleText}</Text>
          </div>
          
          <div 
            onClick={handleBackNavigation}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px', 
              color: '#9ca3af', cursor: 'pointer', fontSize: '13px', fontWeight: 600, 
              transition: 'color 0.2s' 
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#4f46e5'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          >
            <ArrowLeftOutlined />
            <span>
              {activeMode === 'sequential'
                ? '返回本组单词列表'
                : activeMode === 'mistake-book'
                  ? '返回错词本'
                  : '返回首页'}
            </span>
          </div>
        </div>

        <div className="learning-header__actions">
          <Button
            icon={<MessageOutlined />}
            onClick={() => {
              void openWithPrompt('请结合我当前正在看的这个单词，帮我快速讲透它，并顺手给一个记忆技巧。', {
                context: learningChatContext,
              });
            }}
            className="learning-secondary-action"
          >
            问 AI
          </Button>
          {activeMode === 'sequential' && (
            <div className="learning-auto-advance" style={{ display: 'none' }}>
              <span className="learning-auto-advance__label">自动跳词</span>
              <Switch
                checked={autoAdvanceSequential}
                onChange={setAutoAdvanceSequential}
              />
            </div>
          )}
          {activeMode === 'random-group' && (
            <Button icon={<ReloadOutlined />} onClick={handleRefreshContent} className="learning-secondary-action">
              换一组
            </Button>
          )}
          {activeMode === 'random-word' && (
            <Button icon={<ReloadOutlined />} onClick={handleRefreshContent} className="learning-secondary-action">
              换一个单词
            </Button>
          )}
          {isListMode && (
            <div className="learning-progress-wrap">
              <Progress percent={progressPercent} strokeColor="#c96d47" trailColor="#e8dccd" />
            </div>
          )}
        </div>
      </div>

      <div className="page-content" style={{ position: 'relative' }}>
        <div className="learning-grid">
          <div className="learning-primary">
            {/* Control bar for primary (Parallel to ImageGallery toolbar) */}
            <div style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {activeMode === 'sequential' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>自动跳词</span>
                    <Switch
                      size="small"
                      checked={autoAdvanceSequential}
                      onChange={setAutoAdvanceSequential}
                    />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>大小</span>
                  <Slider
                    min={30}
                    max={300}
                    step={10}
                    value={lensRadius}
                    onChange={setLensRadius}
                    style={{ width: 72, margin: 0 }}
                    tooltip={{ formatter: (val) => `${val}px` }}
                  />
                </div>
                {currentWord && (
                  <Button
                    size="small"
                    type="text"
                    icon={isMistakeMarked ? <StarFilled /> : <StarOutlined />}
                    onClick={handleToggleMistakeMark}
                    style={{
                      color: isMistakeMarked ? '#f59e0b' : '#6b7280',
                      fontWeight: 600,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px 8px'
                    }}
                  >
                    {isMistakeMarked ? '已在错词本' : '加入错词'}
                  </Button>
                )}
              </div>
            </div>

            <WordCard
              key={currentWord.id}
              word={currentWord}
              learningStatus={currentStatus}
              onSwipeLeft={currentIndex < words.length - 1 ? handleNext : null}
              onSwipeRight={currentIndex > 0 ? handlePrevious : null}
              onStatusChange={handleProgressUpdate}
            />
          </div>

          <aside className="learning-sidebar">
            <ImageGallery images={images} emptyMode={activeMode} />
          </aside>
        </div>
        
        <ExampleSentenceCard word={currentWord} />
      </div>
    </motion.div>
  );
};

export default Learning;
