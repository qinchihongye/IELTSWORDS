import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Empty, Progress, Slider, Spin, Tag, Typography, message } from 'antd';
import { ArrowLeftOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import apiClient from '../api/client';
import { useLearning } from '../context/LearningContext';
import { useAuth } from '../context/AuthContext';
import WordCard from '../components/WordCard';
import ExampleSentenceCard from '../components/ExampleSentenceCard';
import { hasMinRole } from '../utils/roles';
import './Learning.css';

const { Title, Text } = Typography;

const pageVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 24 },
  },
};

const statusMeta = {
  unlearned: { label: '未掌握', color: 'default' },
  learning: { label: '有印象', color: 'processing' },
  mastered: { label: '已掌握', color: 'success' },
};

const CustomBookLearning = () => {
  const navigate = useNavigate();
  const { bookId, groupId } = useParams();
  const { lensRadius, setLensRadius } = useLearning();
  const { user } = useAuth();

  const [bookDetail, setBookDetail] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('unlearned');
  const customBooksUnlocked = hasMinRole(user, 'premium_user');

  const activeBookId = useMemo(() => {
    const parsedValue = Number(bookId);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [bookId]);

  const activeGroupId = useMemo(() => {
    const parsedValue = Number(groupId);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [groupId]);

  const currentWord = words[currentIndex] || null;
  const currentWordId = currentWord?.id || null;
  const currentGroup = useMemo(
    () => bookDetail?.groups?.find((group) => group.id === activeGroupId) || null,
    [activeGroupId, bookDetail]
  );

  const fetchCurrentWordProgress = useCallback(async (wordId) => {
    if (!customBooksUnlocked) {
      setCurrentStatus('unlearned');
      return null;
    }

    if (!wordId) {
      setCurrentStatus('unlearned');
      return null;
    }

    try {
      const response = await apiClient.get(`/api/custom-books/words/${wordId}/progress`, {
        skipErrorHandler: true,
        validateStatus: (status) => status === 200 || status === 404,
      });
      if (response.status === 404) {
        setCurrentStatus('unlearned');
        return null;
      }
      setCurrentStatus(response.data?.status || 'unlearned');
      return response.data;
    } catch (error) {
      console.error('获取自定义词书进度失败:', error);
      setCurrentStatus('unlearned');
      return null;
    }
  }, [customBooksUnlocked]);

  const loadPageData = useCallback(async () => {
    if (!customBooksUnlocked) {
      setBookDetail(null);
      setWords([]);
      setCurrentIndex(0);
      setLoading(false);
      return;
    }

    if (!activeBookId || !activeGroupId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [bookResponse, wordsResponse] = await Promise.all([
        apiClient.get(`/api/custom-books/${activeBookId}`),
        apiClient.get(`/api/custom-books/groups/${activeGroupId}/words`),
      ]);

      setBookDetail(bookResponse.data);
      setWords(wordsResponse.data || []);
      setCurrentIndex(0);
    } catch (error) {
      console.error('加载自定义词书学习内容失败:', error);
      setBookDetail(null);
      setWords([]);
      setCurrentIndex(0);
    } finally {
      setLoading(false);
    }
  }, [activeBookId, activeGroupId, customBooksUnlocked, setWords]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    void fetchCurrentWordProgress(currentWordId);
  }, [currentWordId, fetchCurrentWordProgress]);

  const handleProgressUpdate = async (status) => {
    if (!customBooksUnlocked) {
      message.info('普通用户暂不可使用自定义词书功能');
      return null;
    }

    if (!currentWordId) {
      return null;
    }

    try {
      const response = await apiClient.post(`/api/custom-books/words/${currentWordId}/progress`, { status });
      setCurrentStatus(response.data?.status || status);
      message.success('学习状态已更新');
      if (activeBookId) {
        void apiClient.get(`/api/custom-books/${activeBookId}`).then((bookResponse) => {
          setBookDetail(bookResponse.data);
        }).catch((error) => {
          console.error('刷新自定义词书详情失败:', error);
        });
      }
      return response.data;
    } catch (error) {
      console.error('更新自定义词书进度失败:', error);
      return null;
    }
  };

  const goPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev < words.length - 1 ? prev + 1 : prev));
  };

  const currentProgressPercent = words.length
    ? Math.round(((currentIndex + 1) / words.length) * 100)
    : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!customBooksUnlocked) {
    return (
      <Card style={{ borderRadius: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Tag color="blue" style={{ width: 'fit-content' }}>VIP 专属功能</Tag>
          <Title level={3} style={{ margin: 0 }}>普通用户暂不可学习自定义词书</Title>
          <Text style={{ color: '#64748b', lineHeight: 1.8 }}>
            自定义词书与内置课程是隔离的独立体系。普通用户完成全部内置词汇学习后，会自动升级为 VIP 用户，到时这里会自动解锁。
          </Text>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button type="primary" onClick={() => navigate('/chapter-select')}>
              去继续学习内置词汇
            </Button>
            <Button onClick={() => navigate('/custom-books')}>
              返回自定义词书页
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (!currentWord || !currentGroup) {
    return (
      <Card style={{ borderRadius: 24 }}>
        <Empty
          description="这个分组暂时没有可学习的单词"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" onClick={() => navigate(activeBookId ? `/custom-books/${activeBookId}` : '/custom-books')}>
            返回词书
          </Button>
        </Empty>
      </Card>
    );
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      style={{ maxWidth: 1380, margin: '0 auto' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(activeBookId ? `/custom-books/${activeBookId}` : '/custom-books')}
            style={{ marginBottom: 14 }}
          >
            返回词书
          </Button>
          <Title level={2} style={{ marginBottom: 6, color: '#0f172a' }}>
            {bookDetail?.name}
          </Title>
          <Text style={{ color: '#64748b', fontSize: 15 }}>
            {currentGroup.group_name} · 第 {currentIndex + 1}/{words.length} 个单词
          </Text>
        </div>
        <div style={{ minWidth: 260 }}>
          <Text style={{ display: 'block', color: '#64748b', marginBottom: 8 }}>本组浏览进度</Text>
          <Progress
            percent={currentProgressPercent}
            strokeColor="#6366f1"
            trailColor="rgba(99, 102, 241, 0.12)"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <WordCard
            word={currentWord}
            learningStatus={currentStatus}
            onSwipeLeft={currentIndex < words.length - 1 ? goNext : null}
            onSwipeRight={currentIndex > 0 ? goPrevious : null}
            onStatusChange={handleProgressUpdate}
          />
          <ExampleSentenceCard word={currentWord} />
        </div>

        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', top: 0 }}>
          <Card
            style={{
              borderRadius: 20,
              background: 'rgba(255,255,255,0.78)',
              border: '1px solid rgba(255,255,255,0.82)',
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.05)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <Text style={{ display: 'block', color: '#64748b', marginBottom: 6 }}>当前状态</Text>
                <Tag color={statusMeta[currentStatus]?.color || 'default'} style={{ fontSize: 13, padding: '4px 10px' }}>
                  {statusMeta[currentStatus]?.label || '未掌握'}
                </Tag>
              </div>

              <div>
                <Text style={{ display: 'block', color: '#64748b', marginBottom: 12 }}>单词卡圆圈大小</Text>
                <Slider
                  min={70}
                  max={220}
                  value={lensRadius}
                  onChange={setLensRadius}
                />
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>{lensRadius}px</Text>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  icon={<LeftOutlined />}
                  onClick={goPrevious}
                  disabled={currentIndex === 0}
                  style={{ flex: 1 }}
                >
                  上一个
                </Button>
                <Button
                  type="primary"
                  icon={<RightOutlined />}
                  onClick={goNext}
                  disabled={currentIndex >= words.length - 1}
                  style={{ flex: 1 }}
                >
                  下一个
                </Button>
              </div>
            </div>
          </Card>

          <Card
            style={{
              borderRadius: 20,
              background: 'rgba(255,255,255,0.78)',
              border: '1px solid rgba(255,255,255,0.82)',
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.05)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <Text style={{ display: 'block', color: '#64748b', marginBottom: 6 }}>分组信息</Text>
                <Title level={4} style={{ margin: 0, color: '#111827' }}>
                  {currentGroup.group_name}
                </Title>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <div style={{ padding: 14, borderRadius: 14, background: 'rgba(248,250,252,0.92)' }}>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>总单词</Text>
                  <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: '#2563eb' }}>
                    {currentGroup.wordCount}
                  </div>
                </div>
                <div style={{ padding: 14, borderRadius: 14, background: 'rgba(248,250,252,0.92)' }}>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>已学习</Text>
                  <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>
                    {currentGroup.learnedCount}
                  </div>
                </div>
                <div style={{ padding: 14, borderRadius: 14, background: 'rgba(248,250,252,0.92)' }}>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>学习中</Text>
                  <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: '#d97706' }}>
                    {currentGroup.learningCount}
                  </div>
                </div>
                <div style={{ padding: 14, borderRadius: 14, background: 'rgba(248,250,252,0.92)' }}>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>已掌握</Text>
                  <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: '#059669' }}>
                    {currentGroup.masteredCount}
                  </div>
                </div>
              </div>

              <Progress
                percent={Number(currentGroup.progressPercent || 0)}
                strokeColor="#6366f1"
                trailColor="rgba(99, 102, 241, 0.12)"
              />

              <Text style={{ color: '#64748b' }}>
                这套进度只属于自定义词书，不会并入正式课程的数据统计。
              </Text>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};

export default CustomBookLearning;
