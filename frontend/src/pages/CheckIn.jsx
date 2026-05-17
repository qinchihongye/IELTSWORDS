/**
 * 打卡模式页面（紧凑单页布局）
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Typography, Spin, Statistic } from 'antd';
import { ArrowLeftOutlined, FireFilled, TrophyOutlined, CalendarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { useProgress } from '../context/ProgressContext';
import StreakCalendar from '../components/StreakCalendar';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

const CheckIn = () => {
  const navigate = useNavigate();
  const { setMode } = useLearning();
  const {
    fetchStreakInfo,
    updateTodayCheckIn,
    fetchCheckInHistory,
    fetchStats
  } = useProgress();

  const [loading, setLoading] = useState(true);
  const [streakInfo, setStreakInfo] = useState(null);
  const [checkInHistory, setCheckInHistory] = useState([]);
  const [todayStats, setTodayStats] = useState(null);
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);

  const formatLocalDate = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const loadData = useCallback(async () => {
    const [streak, history, stats] = await Promise.all([
      fetchStreakInfo(),
      fetchCheckInHistory(365),
      fetchStats()
    ]);

    setStreakInfo(streak);
    setCheckInHistory(history);
    setTodayStats(stats);

    const today = formatLocalDate(new Date());
    const todayRecord = history?.find(record => formatLocalDate(record.check_in_date) === today);
    setHasCheckedInToday(Boolean(todayRecord));
    setLoading(false);
  }, [fetchCheckInHistory, fetchStats, fetchStreakInfo]);

  useEffect(() => {
    let cancelled = false;
    setMode('check-in');

    queueMicrotask(async () => {
      await loadData();
      if (cancelled) return;
    });

    return () => { cancelled = true; };
  }, [fetchCheckInHistory, fetchStats, fetchStreakInfo, setMode, loadData]);

  const handleCheckIn = async () => {
    if (!todayStats) return;

    const wordsLearned = todayStats.learningCount + todayStats.masteredCount;
    const wordsReviewed = todayStats.masteredCount;

    const result = await updateTodayCheckIn(wordsLearned, wordsReviewed);
    if (result) {
      setStreakInfo(result);
      setHasCheckedInToday(true);
      setLoading(true);
      await loadData();
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <motion.div className="page-wrapper" style={{ maxWidth: 1200, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
      {/* 顶部栏 */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/home')} style={{ borderRadius: 8 }}>返回首页</Button>
      </div>

      {/* 两栏布局 */}
      <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>
        {/* 左栏：打卡信息 */}
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 连续打卡 */}
          <Card style={{
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(219, 39, 119, 0.1) 100%)',
            border: '1px solid rgba(236, 72, 153, 0.3)',
            textAlign: 'center',
          }} bodyStyle={{ padding: '24px 20px' }}>
            <FireFilled style={{ fontSize: 40, color: '#ec4899', marginBottom: 8 }} />
            <Title level={1} style={{ fontSize: 52, margin: 0, color: '#ec4899', fontWeight: 800, lineHeight: 1.1 }}>
              {streakInfo?.current_streak || 0}
            </Title>
            <Text style={{ fontSize: 16, color: '#6b7280', fontWeight: 600 }}>天连续打卡</Text>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 32 }}>
              <div>
                <TrophyOutlined style={{ fontSize: 20, color: '#f59e0b' }} />
                <br />
                <Text style={{ fontSize: 13, color: '#6b7280' }}>最长 <strong style={{ fontSize: 18, color: '#1f2937' }}>{streakInfo?.longest_streak || 0}</strong> 天</Text>
              </div>
              <div>
                <CalendarOutlined style={{ fontSize: 20, color: '#10b981' }} />
                <br />
                <Text style={{ fontSize: 13, color: '#6b7280' }}>累计 <strong style={{ fontSize: 18, color: '#1f2937' }}>{streakInfo?.total_check_ins || 0}</strong> 次</Text>
              </div>
            </div>
          </Card>

          {/* 今日统计 */}
          <Card style={{
            borderRadius: 20,
            background: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.8)',
            flex: 1,
          }} bodyStyle={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Text style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 16 }}>今日学习统计</Text>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: 12, background: 'rgba(99, 102, 241, 0.06)' }}>
                <Statistic title="已学习" value={todayStats?.learningCount || 0} suffix="词" valueStyle={{ color: '#6366f1', fontSize: 24, fontWeight: 700 }} />
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: 12, background: 'rgba(16, 185, 129, 0.06)' }}>
                <Statistic title="已掌握" value={todayStats?.masteredCount || 0} suffix="词" valueStyle={{ color: '#10b981', fontSize: 24, fontWeight: 700 }} />
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: 12, background: 'rgba(107, 114, 128, 0.06)' }}>
                <Statistic title="总单词" value={todayStats?.totalWords || 0} suffix="词" valueStyle={{ color: '#6b7280', fontSize: 24, fontWeight: 700 }} />
              </div>
            </div>

            <div style={{ marginTop: 'auto' }}>
              {!hasCheckedInToday ? (
                <Button
                  type="primary"
                  size="large"
                  block
                  onClick={handleCheckIn}
                  style={{
                    height: 48,
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                    border: 'none'
                  }}
                >
                  立即打卡
                </Button>
              ) : (
                <div style={{
                  padding: '14px',
                  borderRadius: 12,
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '2px solid #10b981',
                  textAlign: 'center'
                }}>
                  <Text style={{ fontSize: 15, fontWeight: 600, color: '#10b981' }}>
                    今日已打卡
                  </Text>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* 右栏：日历 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <StreakCalendar checkInHistory={checkInHistory} />
        </div>
      </div>
    </motion.div>
  );
};

export default CheckIn;
