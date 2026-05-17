import React, { useCallback, useEffect, useState } from 'react';
import { Card, Spin, Statistic, Typography } from 'antd';
import { CalendarOutlined, FireFilled } from '@ant-design/icons';
import { useProgress } from '../context/ProgressContext';
import StreakCalendar from '../components/StreakCalendar';

const { Title, Text } = Typography;

const LearningCalendar = () => {
  const { fetchCheckInHistory, fetchStreakInfo } = useProgress();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [streak, setStreak] = useState(null);

  const loadData = useCallback(async () => {
    const [nextHistory, nextStreak] = await Promise.all([
      fetchCheckInHistory(365),
      fetchStreakInfo(),
    ]);
    setHistory(nextHistory);
    setStreak(nextStreak);
    setLoading(false);
  }, [fetchCheckInHistory, fetchStreakInfo]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      await loadData();
    });
    return () => { cancelled = true; };
  }, [loadData]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <div className="learning-calendar-page">
      <style>{css}</style>
      <div>
        <Title level={2} style={{ margin: 0 }}>学习日历</Title>
        <Text type="secondary">按日期查看打卡与学习节奏。</Text>
      </div>
      <div className="calendar-stats">
        <Card><Statistic prefix={<FireFilled />} title="当前连续" value={streak?.current_streak || 0} suffix="天" /></Card>
        <Card><Statistic prefix={<CalendarOutlined />} title="累计打卡" value={streak?.total_check_ins || 0} suffix="次" /></Card>
        <Card><Statistic title="最长连续" value={streak?.longest_streak || 0} suffix="天" /></Card>
      </div>
      <StreakCalendar checkInHistory={history} />
    </div>
  );
};

const css = `
.learning-calendar-page { max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
.calendar-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 760px) { .calendar-stats { grid-template-columns: 1fr; } }
`;

export default LearningCalendar;
