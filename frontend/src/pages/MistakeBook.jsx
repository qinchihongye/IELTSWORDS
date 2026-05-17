/**
 * 错词本页面
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Typography, Spin, Empty, Tag } from 'antd';
import { ArrowLeftOutlined, MessageOutlined, RightOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { useMistake } from '../context/MistakeContext';
import { useAIChat } from '../context/AIChatContext';
import { motion } from 'framer-motion';


const { Title, Text } = Typography;

const MistakeBook = () => {
  const navigate = useNavigate();
  const {
    setMode,
    setWords,
    setCurrentIndex,
    setImages,
    setCurrentGroup,
  } = useLearning();

  const { fetchMistakeWords, fetchMistakeReviewPlan, toggleMistakeMark } = useMistake();
  const { setPageContext, clearPageContext, openWithPrompt } = useAIChat();

  const [loading, setLoading] = useState(true);
  const [mistakeWords, setMistakeWords] = useState([]);
  const [reviewPlan, setReviewPlan] = useState([]);
  const focusWord = mistakeWords[0] || null;

  const loadMistakeWords = useCallback(async () => {
    const [data, plan] = await Promise.all([
      fetchMistakeWords(),
      fetchMistakeReviewPlan(),
    ]);
    setMistakeWords(data);
    setReviewPlan(plan);
    setLoading(false);
  }, [fetchMistakeReviewPlan, fetchMistakeWords]);

  useEffect(() => {
    let cancelled = false;

    setMode('mistake-book');

    queueMicrotask(async () => {
      const [data, plan] = await Promise.all([
        fetchMistakeWords(),
        fetchMistakeReviewPlan(),
      ]);
      if (cancelled) {
        return;
      }

      setMistakeWords(data);
      setReviewPlan(plan);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchMistakeReviewPlan, fetchMistakeWords, setMode]);

  const mistakeChatContext = useMemo(() => ({
    page: 'mistake-book',
    label: '错词复盘助手',
    description: mistakeWords.length > 0
      ? `当前共有 ${mistakeWords.length} 个错词，可以让我帮你判断先复习哪几个。`
      : '错词本暂时是空的，也可以让我帮你规划下一轮学习重点。',
    shortcuts: [
      {
        key: 'mistake-analyze',
        label: '分析错因',
        prompt: '请结合我当前这批错词，帮我归纳一下我最容易错的类型，并说明原因。',
      },
      {
        key: 'mistake-plan',
        label: '安排复习',
        prompt: '请根据我当前错词本的情况，给我一个简短的三步复习计划。',
      },
      {
        key: 'mistake-focus',
        label: '优先级建议',
        prompt: '请告诉我这批错词里，哪些应该优先复习，并说一下排序理由。',
      },
    ],
    payload: {
      wordCountText: `当前错词本共有 ${mistakeWords.length} 个单词`,
      selectedWord: focusWord?.word,
      explanation: focusWord?.explanation,
      reviewPlanSummary: reviewPlan.slice(0, 3).map((item) => (
        `${item.word}（${item.reason}）`
      )).join('；'),
      relatedWords: mistakeWords.slice(0, 8).map((word) => word.word),
    },
  }), [focusWord, mistakeWords, reviewPlan]);

  useEffect(() => {
    setPageContext(mistakeChatContext);
  }, [mistakeChatContext, setPageContext]);

  useEffect(() => () => {
    clearPageContext('mistake-book');
  }, [clearPageContext]);

  const handleToggleMark = async (wordId, e) => {
    e.stopPropagation();
    // 乐观更新：立刻从本地列表中移除，实现“秒删”效果
    setMistakeWords(prev => prev.filter(w => w.id !== wordId));
    
    // 发起后端请求
    await toggleMistakeMark(wordId);
  };

  const handleWordClick = (word, index) => {
    // 保持错词本上下文，直接进入错词复习流
    setMode('mistake-book');
    setCurrentGroup(null);
    setImages([]);
    setWords(mistakeWords);
    setCurrentIndex(index);
    navigate('/learning');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <motion.div className="page-wrapper" style={{ maxWidth: 1200, margin: '0 auto', height: "100%" }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
      <div className="page-subheader" style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/home')}
            style={{ borderRadius: '8px' }}
          >
            返回首页
          </Button>
          <Text style={{ fontSize: '14px', color: '#6b7280' }}>
            共 {mistakeWords.length} 个需要重点复习的单词
          </Text>
        </div>
        <Button
          icon={<MessageOutlined />}
          onClick={() => {
            void openWithPrompt('请结合我当前这批错词，帮我判断最值得先复习的 3 个词，并告诉我为什么。', {
              context: mistakeChatContext,
            });
          }}
          style={{ borderRadius: '8px' }}
        >
          AI 分析
        </Button>
      </div>

      <div className="page-content">
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {reviewPlan.length > 0 && (
            <Card style={{ borderRadius: 20, marginBottom: 18, background: 'rgba(255,255,255,0.68)' }}>
              <Title level={4} style={{ marginTop: 0 }}>错词复习计划</Title>
              <div style={{ display: 'grid', gap: 10 }}>
                {reviewPlan.slice(0, 5).map((item) => (
                  <div key={item.word_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                    <div>
                      <Text strong>{item.word}</Text>
                      <Text type="secondary" style={{ marginLeft: 10 }}>{item.reason}</Text>
                    </div>
                    <Tag color={item.priority === 'high' ? 'red' : item.priority === 'medium' ? 'gold' : 'blue'}>
                      {item.priority === 'high' ? '优先' : item.priority === 'medium' ? '本轮' : '稍后'}
                    </Tag>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {mistakeWords.length === 0 ? (
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
                <Empty
                  description={
                    <div>
                      <Title level={3} style={{ marginTop: 16 }}>📚 错词本是空的</Title>
                      <Text style={{ fontSize: '16px', color: '#6b7280' }}>
                        开始学习单词，将难记的单词添加到错词本吧
                      </Text>
                    </div>
                  }
                />
                <Button
                  type="primary"
                  size="large"
                  onClick={() => navigate('/home')}
                  style={{ marginTop: 24, height: '48px', borderRadius: '12px', fontSize: '16px' }}
                >
                  开始学习
                </Button>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ display: 'grid', gap: '16px' }}
            >
              {mistakeWords.map((word, index) => (
                <motion.div
                  key={word.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    hoverable
                    onClick={() => handleWordClick(word, index)}
                    style={{
                      borderRadius: '20px',
                      background: 'rgba(255,255,255,0.6)',
                      border: '1px solid rgba(255,255,255,0.8)',
                      cursor: 'pointer'
                    }}
                    bodyStyle={{ padding: '24px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <Text style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600 }}>
                            {word.wordNo}
                          </Text>
                          <Text style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937' }}>
                            {word.word}
                          </Text>
                          <Tag color="orange">有印象</Tag>
                          <Button
                            type="text"
                            icon={<StarFilled />}
                            onClick={(e) => handleToggleMark(word.id, e)}
                            style={{ color: '#f59e0b' }}
                          />
                        </div>
                        <Text style={{ fontSize: '16px', color: '#6b7280' }}>
                          {word.explanation}
                        </Text>
                      </div>
                      <Button
                        type="text"
                        icon={<RightOutlined />}
                        style={{ fontSize: '20px', color: '#9ca3af' }}
                      />
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default MistakeBook;
