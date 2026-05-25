import React, { useCallback, useEffect, useState } from 'react';
import { Card, Typography, Button, Spin, Collapse, Badge, Tooltip } from 'antd';
import { BookOutlined, RightOutlined, ArrowRightOutlined, VerticalAlignTopOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { useProgress } from '../context/ProgressContext';
import { formatChapterTitle, getWordStatusMeta, sortGroupsByGroupId } from '../utils/learning';
import { motion } from 'framer-motion';
import './SelectionPages.css';

const { Text } = Typography;
const { Panel } = Collapse;

// Animation Variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

const isGroupCompleted = (group) => (
  Number(group?.wordCount || 0) > 0 && Number(group?.learnedCount || 0) >= Number(group?.wordCount || 0)
);

const isGroupUnlocked = (groups, index) => {
  if (typeof groups[index]?.isUnlocked === 'boolean') {
    return groups[index].isUnlocked;
  }

  if (index === 0) {
    return true;
  }

  return isGroupCompleted(groups[index - 1]);
};

const LAST_POSITION_KEY = 'ieltswords_last_learning_position';

const saveLastPosition = (chapterNo, groupId) => {
  try {
    localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({ chapterNo, groupId }));
  } catch {
    // localStorage can be unavailable in private browsing modes.
  }
};

const loadLastPosition = () => {
  try {
    const raw = localStorage.getItem(LAST_POSITION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore invalid stored navigation state.
  }
  return null;
};

const SequentialSelect = () => {
  const navigate = useNavigate();
  const {
    fetchChapters,
    fetchGroupsByChapter,
    fetchWordsByGroup,
    setCurrentChapter,
    setCurrentGroup,
    selectWordAtIndex,
    setMode,
    currentChapter,
    currentGroup,
    words
  } = useLearning();

  const { fetchProgressMapForWords } = useProgress();

  const [chapters, setChapters] = useState([]);
  const [loadingChapters, setLoadingChapters] = useState(true);

  // Cache for groups by chapterNo
  const [chapterGroups, setChapterGroups] = useState({});
  const [loadingPanel, setLoadingPanel] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [lastPositionRestored, setLastPositionRestored] = useState(false);
  // Refs for each chapter's group list scroll container
  const groupListRefs = React.useRef({});

  // Right pane state
  const [loadingWords, setLoadingWords] = useState(false);
  const [progressMap, setProgressMap] = useState({});
  const [activeWordId, setActiveWordId] = useState(null);

  // 2. Handle Chapter Expansion (Fetch Groups)
  const handleGroupSelect = useCallback(async (chapter, group) => {
    if (!chapter || !group) {
      return;
    }

    setCurrentChapter(chapter);
    setCurrentGroup(group);
    saveLastPosition(chapter.chapterNo, group.groupId);
    setLoadingWords(true);

    try {
      const wordsData = await fetchWordsByGroup(chapter.chapterNo, group.groupId);
      const nextProgressMap = await fetchProgressMapForWords(wordsData.map(w => w.id));
      setProgressMap(nextProgressMap);
      setActiveWordId(wordsData[0]?.id || null);
    } catch(e) {
       console.error(e);
    } finally {
      setLoadingWords(false);
    }
  }, [
    fetchProgressMapForWords,
    fetchWordsByGroup,
    setCurrentChapter,
    setCurrentGroup,
  ]);

  const handleExpand = useCallback(async (rawKey, chapterList = chapters, targetGroupId = null) => {
    const keyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    const keys = keyStr ? [String(keyStr)] : [];
    setExpandedKeys(keys);
    const newKeys = keys.filter(k => !chapterGroups[k]);

    if (newKeys.length > 0) {
      const chapterNo = Number(newKeys[0]);
      setLoadingPanel(chapterNo);
      try {
        const groups = await fetchGroupsByChapter(chapterNo);
        const sortedGroups = sortGroupsByGroupId(groups);
        setChapterGroups(prev => ({ ...prev, [chapterNo]: sortedGroups }));

        // Restore last position, or auto-select first group
        if (!currentGroup && sortedGroups.length > 0) {
           const matchedChapter = chapterList.find(c => String(c.chapterNo) === String(chapterNo));
           if (matchedChapter) {
             const targetGroup = targetGroupId
               ? sortedGroups.find(g => String(g.groupId) === String(targetGroupId))
               : null;
             void handleGroupSelect(matchedChapter, targetGroup || sortedGroups[0]);
           }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingPanel(null);
      }
    }
  }, [chapterGroups, chapters, currentGroup, fetchGroupsByChapter, handleGroupSelect]);

  const handleExpandRef = React.useRef(handleExpand);
  handleExpandRef.current = handleExpand;

  // 1. Initial Load: Fetch Chapters
  useEffect(() => {
    let cancelled = false;
    setMode('sequential');

    const loadInit = async () => {
      const data = await fetchChapters();
      if (cancelled) {
        return;
      }

      setChapters(data);
      setLoadingChapters(false);

      if (data.length > 0) {
        const lastPos = lastPositionRestored ? null : loadLastPosition();
        const autoOpenKey = lastPos?.chapterNo
          || (currentChapter ? currentChapter.chapterNo : data[0].chapterNo);
        await handleExpandRef.current([String(autoOpenKey)], data, lastPos?.groupId);
        if (lastPos) setLastPositionRestored(true);
      }
    };

    void loadInit();

    return () => { cancelled = true; };
	  }, [currentChapter, fetchChapters, setMode, lastPositionRestored]);

  // 3. Restore Progress Map if returning to a previously selected group
  useEffect(() => {
    let cancelled = false;
    const restoreProgress = async () => {
      // If we have words from context, but progressMap is empty, fetch it
      if (currentGroup && words.length > 0 && Object.keys(progressMap).length === 0) {
        try {
          const nextProgressMap = await fetchProgressMapForWords(words.map(w => w.id));
          if (!cancelled) setProgressMap(nextProgressMap);
        } catch(e) {
          console.error(e);
        }
      }
    };
    void restoreProgress();
    return () => { cancelled = true; };
  }, [currentGroup, words, progressMap, fetchProgressMapForWords]);

  useEffect(() => {
    const handleProgressUpdated = async (event) => {
      const wordId = Number(event.detail?.wordId);
      const status = event.detail?.status || 'unlearned';
      if (wordId) {
        setProgressMap(prev => (
          prev[wordId] === status ? prev : { ...prev, [wordId]: status }
        ));
      }

      const chapterNo = currentChapter?.chapterNo || currentGroup?.chapterNo;
      if (!chapterNo) {
        return;
      }

      try {
        const groups = await fetchGroupsByChapter(chapterNo, { force: true });
        setChapterGroups(prev => ({
          ...prev,
          [chapterNo]: sortGroupsByGroupId(groups),
        }));
      } catch (error) {
        console.error('刷新分组进度失败:', error);
      }
    };

    window.addEventListener('ieltswords:word-progress-updated', handleProgressUpdated);
    return () => {
      window.removeEventListener('ieltswords:word-progress-updated', handleProgressUpdated);
    };
  }, [currentChapter?.chapterNo, currentGroup?.chapterNo, fetchGroupsByChapter]);

  // 4. Start Learning
  const handleStartLearning = (index = 0) => {
    if (words.length > 0) {
      setActiveWordId(words[index]?.id || null);
      selectWordAtIndex(index);
      navigate('/learning');
    }
  };

  return (
    <motion.div 
      className="page-wrapper" 
      style={{ 
        maxWidth: 1400, 
        margin: '0 auto', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column' 
      }} 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0, paddingBottom: 24 }}>
        {/* Left Pane: Explorer Tree (Original Glassy Box-in-Box layout) */}
        <div style={{ 
          width: 340, 
          display: 'flex', 
          flexDirection: 'column',
          background: 'rgba(255, 255, 255, 0.5)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: 24,
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.4)' }}>
            <Text strong style={{ color: '#4b5563', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>课程目录 Curriculum</Text>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }} className="custom-scroll">
            {loadingChapters ? (
              <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
            ) : (
              <Collapse 
                accordion
                ghost 
                activeKey={expandedKeys} 
                onChange={handleExpand}
                expandIcon={({ isActive }) => <RightOutlined rotate={isActive ? 90 : 0} style={{ color: '#9ca3af' }}/>}
              >
                {chapters.map(chapter => (
                  <Panel 
                    key={String(chapter.chapterNo)} 
                    header={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <Text strong style={{ color: '#1f2937', fontSize: 15 }}>{formatChapterTitle(chapter.chapterNo, chapter.chapterName)}</Text>
                        <Badge count={chapter.groupCount} style={{ backgroundColor: 'rgba(17, 24, 39, 0.05)', color: '#4b5563', boxShadow: 'none' }} />
                      </div>
                    }
                  >
                    {loadingPanel === chapter.chapterNo ? (
                      <div style={{ padding: 16, textAlign: 'center' }}><Spin size="small" /></div>
                    ) : (
                      <div style={{ 
                        border: '2px dashed rgba(156, 163, 175, 0.3)',
                        borderRadius: '16px',
                        background: 'rgba(255, 255, 255, 0.4)',
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        {/* Scrollable group list — fixed height shows ~3 items */}
                        <div
                          ref={el => { groupListRefs.current[chapter.chapterNo] = el; }}
                          style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: 6,
                            height: '174px',
                            overflowY: 'auto', 
                            padding: '8px',
                          }}
                          className="custom-scroll"
                        >
                          {(chapterGroups[chapter.chapterNo] || []).map((group, groupIndex, groups) => {
                            const isActive = currentGroup?.groupId === group.groupId;
                            const isCompleted = isGroupCompleted(group);
                            const isUnlocked = isGroupUnlocked(groups, groupIndex);
                            const progressPercent = Math.min(100, Math.round(((group.learnedCount || 0) / Math.max(1, group.wordCount)) * 100));
                            const groupNode = (
                              <div 
                                key={group.groupId}
                                ref={isActive ? (el => {
                                  if (el && !el.dataset.scrolled) {
                                    setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 100);
                                    el.dataset.scrolled = "true";
                                  }
                                }) : null}
                                onClick={() => {
                                  if (isUnlocked) {
                                    handleGroupSelect(chapter, group);
                                  }
                                }}
                                style={{
                                  padding: '10px 16px',
                                  borderRadius: 12,
                                  background: isActive ? 'rgba(243, 244, 246, 0.8)' : 'transparent',
                                  border: isActive ? '1px solid rgba(209, 213, 219, 0.6)' : '1px solid transparent',
                                  cursor: isUnlocked ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.2s',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  flexShrink: 0,
                                  opacity: isUnlocked ? 1 : 0.5
                                }}
                                onMouseEnter={(e) => {
                                  if (!isActive && isUnlocked) e.currentTarget.style.background = 'rgba(255,255,255,0.7)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isActive) e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? '#111827' : '#4b5563' }}>
                                    {group.groupId}
                                  </div>
                                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{group.groupTheme}</div>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                  <Text type="secondary" style={{ fontSize: 12, color: isActive ? '#6b7280' : '#9ca3af', fontWeight: 500, lineHeight: 1 }}>
                                    {isUnlocked ? `${group.wordCount} 词` : <><LockOutlined /> 待解锁</>}
                                  </Text>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: isActive ? 1 : 0.8 }}>
                                    <div style={{ width: 36, height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                      <div style={{ 
                                        width: `${progressPercent}%`, 
                                        height: '100%', 
                                        background: isCompleted ? '#10b981' : '#6366f1', 
                                        borderRadius: 2 
                                      }} />
                                    </div>
                                    <span style={{ 
                                      fontSize: 10, 
                                      color: isCompleted ? '#10b981' : '#6366f1', 
                                      fontWeight: 700, 
                                      minWidth: '24px', 
                                      textAlign: 'right',
                                      lineHeight: 1
                                    }}>
                                      {progressPercent}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );

                            return isUnlocked ? groupNode : (
                              <Tooltip key={group.groupId} title="完成上一组后解锁；VIP 用户及以上可解锁全部 group。">
                                {groupNode}
                              </Tooltip>
                            );
                          })}
                        </div>
                        {/* Back-to-top arrow */}
                        {(chapterGroups[chapter.chapterNo] || []).length > 3 && (
                          <div
                            style={{
                              position: 'sticky',
                              bottom: 0,
                              display: 'flex',
                              justifyContent: 'center',
                              paddingTop: 4,
                              paddingBottom: 6,
                              background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.85) 60%)',
                              pointerEvents: 'none'
                            }}
                          >
                            <button
                              title="回到第一个 Group"
                              onClick={(e) => {
                                e.stopPropagation();
                                const el = groupListRefs.current[chapter.chapterNo];
                                if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              style={{
                                pointerEvents: 'auto',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '3px 12px',
                                borderRadius: 20,
                                border: '1px solid rgba(209, 213, 219, 0.6)',
                                background: 'rgba(255,255,255,0.9)',
                                color: '#4b5563',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(243,244,246,1)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; }}
                            >
                              <VerticalAlignTopOutlined style={{ fontSize: 13 }} />
                              <span>回顶</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </Panel>
                ))}
              </Collapse>
            )}
          </div>
        </div>

        {/* Right Pane: Word Content Canvas (Glassy Container with Sleek New Content) */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          background: 'rgba(255, 255, 255, 0.5)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: 24,
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          overflow: 'hidden'
        }}>
          {loadingWords ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="large" tip="载入词汇中..." />
            </div>
          ) : !currentGroup ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
              <BookOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
              <Text style={{ fontSize: 16, color: '#6b7280' }}>请在左侧选择一个分组来查看单词</Text>
            </div>
          ) : (
            <>
              {/* New Sleek Header inside the glassy pane */}
              <div className="sleek-main-header" style={{ padding: '24px 32px' }}>
                <div>
                  <h1 className="sleek-main-title">{currentGroup.groupId}</h1>
                  <div className="sleek-main-subtitle">{currentGroup.groupTheme} · {words.length} words</div>
                </div>
                <Button
                  type="primary"
                  size="large"
                  onClick={() => handleStartLearning(0)}
                  style={{
                    background: '#111827',
                    border: 'none',
                    fontWeight: 600,
                    borderRadius: 8,
                    padding: '0 24px'
                  }}
                >
                  开始学习
                </Button>
              </div>
              
              {/* New Sleek List inside the glassy pane */}
              <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scroll">
                <motion.div 
                  className="sleek-word-list"
                  variants={containerVariants}
                  initial="hidden"
                  animate="show"
                >
                  {words.map((word, index) => {
                    const rawStatus = progressMap[word.id] || 'unlearned';
                    const statusMeta = getWordStatusMeta(rawStatus);
                    const statusClass = rawStatus === 'mastered' ? 'sleek-badge--mastered' : 
                                        rawStatus === 'learning' ? 'sleek-badge--learning' : 
                                        'sleek-badge--unlearned';
                    const isActiveWord = activeWordId === word.id;

                    return (
                      <motion.div key={word.id} variants={itemVariants}>
                        <div 
                          className="sleek-word-row" 
                          onClick={() => handleStartLearning(index)}
                          style={{
                            background: isActiveWord ? 'rgba(255,255,255,0.6)' : 'transparent',
                            borderRadius: isActiveWord ? '12px' : '0'
                          }}
                        >
                          <div className="sleek-word-index">{word.wordNo || (index + 1)}</div>
                          <div className="sleek-word-info">
                            <div className="sleek-word-text">{word.word}</div>
                            <div className="sleek-word-def">{word.explanation}</div>
                          </div>
                          <div>
                            <span className={`sleek-badge ${statusClass}`}>{statusMeta.label}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            </>
          )}
        </div>

      </div>
    </motion.div>
  );
};

export default SequentialSelect;
