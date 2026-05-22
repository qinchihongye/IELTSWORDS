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
      <div className="calendar-layout">
        <div className="calendar-sidebar">
          <div style={{ marginBottom: 16 }}>
            <Title level={2} style={{ margin: 0 }}>学习日历</Title>
            <Text type="secondary">按日期查看打卡与学习节奏。</Text>
          </div>
          <div className="calendar-stats">
            <Card><Statistic prefix={<FireFilled style={{ color: '#ef4444' }} />} title="当前连续" value={streak?.current_streak || 0} suffix="天" /></Card>
            <Card><Statistic prefix={<CalendarOutlined style={{ color: '#10b981' }} />} title="累计打卡" value={streak?.total_check_ins || 0} suffix="次" /></Card>
            <Card><Statistic title="最长连续" value={streak?.longest_streak || 0} suffix="天" /></Card>
          </div>
        </div>
        
        <div className="calendar-main">
          <StreakCalendar checkInHistory={history} />
        </div>
      </div>
    </div>
  );
};

const css = `
.learning-calendar-page { max-width: 960px; margin: 0 auto; padding: 24px; }
.calendar-layout { display: flex; gap: 40px; align-items: flex-start; }
.calendar-sidebar { flex: 0 0 280px; display: flex; flex-direction: column; }
.calendar-main { flex: 1; min-width: 0; }
.calendar-stats { display: flex; flex-direction: column; gap: 16px; }
@media (max-width: 800px) {
  .calendar-layout { flex-direction: column; gap: 24px; }
  .calendar-sidebar { flex: none; width: 100%; }
  .calendar-stats { flex-direction: row; flex-wrap: wrap; }
  .calendar-stats > * { flex: 1; min-width: 120px; }
}
`;

export default LearningCalendar;
