/**
 * 复习模式页面 - 基于遗忘曲线的智能复习
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Typography, Spin, Progress, Empty } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { useReview } from '../context/ReviewContext';
import WordCard from '../components/WordCard';
import DifficultyButtons from '../components/DifficultyButtons';
import { motion } from 'framer-motion';


const { Title, Text } = Typography;

const Review = () => {
  const navigate = useNavigate();
  const { setMode } = useLearning();
  const {
    fetchReviewDueWords,
    updateWordDifficulty,
    fetchReviewStats
  } = useReview();

  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [stats, setStats] = useState(null);

  const loadReviewWords = useCallback(async () => {
    const data = await fetchReviewDueWords();
    setWords(data);
    setCurrentIndex(0);
    setLoading(false);
  }, [fetchReviewDueWords]);

  const loadStats = useCallback(async () => {
    const data = await fetchReviewStats();
    setStats(data);
  }, [fetchReviewStats]);

  useEffect(() => {
    let cancelled = false;

    setMode('review');

    queueMicrotask(async () => {
      const [wordsData, statsData] = await Promise.all([
        fetchReviewDueWords(),
        fetchReviewStats(),
      ]);

      if (cancelled) {
        return;
      }

      setWords(wordsData);
      setCurrentIndex(0);
      setStats(statsData);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchReviewDueWords, fetchReviewStats, setMode]);

  const handleDifficultySelect = async (difficulty) => {
    const currentWord = words[currentIndex];
    if (!currentWord) return;

    const updated = await updateWordDifficulty(currentWord.word_id, difficulty);
    if (!updated) {
      return;
    }

    setReviewedCount((prev) => prev + 1);

    // 移动到下一个单词
    if (currentIndex < words.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // 全部复习完成
      setCurrentIndex(words.length);
      loadStats();
    }
  };

  const currentWord = words[currentIndex];
  const progressPercent = words.length > 0 ? Math.round(((currentIndex + 1) / words.length) * 100) : 0;
  const isCompleted = currentIndex >= words.length && words.length > 0;

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
        </div>

        {!isCompleted && words.length > 0 && (
          <div style={{ minWidth: '200px' }}>
            <Text style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>
              进度: {currentIndex + 1} / {words.length}
            </Text>
            <Progress percent={progressPercent} strokeColor="#10b981" trailColor="#e8dccd" showInfo={false} />
          </div>
        )}
      </div>

      <div className="page-content">
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {words.length === 0 ? (
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
                      <Title level={3} style={{ marginTop: 16 }}>🎉 太棒了！</Title>
                      <Text style={{ fontSize: '16px', color: '#6b7280' }}>
                        今天没有需要复习的单词
                      </Text>
                    </div>
                  }
                />
                {stats && (
                  <div style={{ marginTop: 32, padding: '24px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '16px' }}>
                    <Text style={{ fontSize: '14px', color: '#6b7280' }}>
                      本周待复习: <strong style={{ color: '#10b981', fontSize: '18px' }}>{stats.due_this_week}</strong> 个单词
                    </Text>
                  </div>
                )}
                <Button
                  type="primary"
                  size="large"
                  onClick={() => navigate('/home')}
                  style={{ marginTop: 24, height: '48px', borderRadius: '12px', fontSize: '16px' }}
                >
                  返回首页
                </Button>
              </Card>
            </motion.div>
          ) : isCompleted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Card style={{
                borderRadius: '24px',
                textAlign: 'center',
                padding: '60px 40px',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
                <Title level={2} style={{ color: '#10b981', marginBottom: '16px' }}>复习完成！</Title>
                <Text style={{ fontSize: '18px', color: '#6b7280' }}>
                  今天已复习 <strong style={{ color: '#10b981', fontSize: '24px' }}>{reviewedCount}</strong> 个单词
                </Text>
                <div style={{ marginTop: 32, display: 'flex', gap: 16, justifyContent: 'center' }}>
                  <Button
                    size="large"
                    onClick={() => navigate('/home')}
                    style={{ height: '48px', borderRadius: '12px', fontSize: '16px' }}
                  >
                    返回首页
                  </Button>
                  <Button
                    type="primary"
                    size="large"
                    onClick={async () => {
                      setLoading(true);
                      setCurrentIndex(0);
                      setReviewedCount(0);
                      await loadReviewWords();
                      await loadStats();
                    }}
                    style={{ height: '48px', borderRadius: '12px', fontSize: '16px' }}
                  >
                    再复习一遍
                  </Button>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key={currentWord?.word_id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <WordCard word={currentWord} />

              <Card style={{
                marginTop: '24px',
                borderRadius: '20px',
                background: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.8)'
              }}>
                <Text style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937', display: 'block', marginBottom: '16px' }}>
                  这个单词对你来说有多难？
                </Text>
                <Text style={{ fontSize: '14px', color: '#6b7280', display: 'block', marginBottom: '8px' }}>
                  根据你的选择，我们会智能安排下次复习时间
                </Text>

                <DifficultyButtons
                  currentDifficulty={null}
                  onDifficultyChange={handleDifficultySelect}
                />
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default Review;
