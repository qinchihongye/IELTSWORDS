/**
 * 打卡日历组件（按月浏览）
 */

import React, { useMemo, useState } from 'react';
import { Card, Typography } from 'antd';
import { LeftOutlined, RightOutlined, CheckCircleFilled } from '@ant-design/icons';

const { Text } = Typography;

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

const formatKey = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const StreakCalendar = ({ checkInHistory }) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const checkInMap = useMemo(() => {
    const map = new Map();
    if (checkInHistory) {
      checkInHistory.forEach(record => {
        const d = new Date(record.check_in_date);
        map.set(formatKey(d), record);
      });
    }
    return map;
  }, [checkInHistory]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startPad = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days = [];
    for (let i = startPad - 1; i >= 0; i--) {
      days.push({ date: new Date(viewYear, viewMonth, -i), isCurrentMonth: false });
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push({ date: new Date(viewYear, viewMonth, i), isCurrentMonth: true });
    }
    while (days.length % 7 !== 0) {
      days.push({ date: new Date(viewYear, viewMonth + 1, days.length - startPad - totalDays + 1), isCurrentMonth: false });
    }
    return days;
  }, [viewYear, viewMonth]);

  const todayStr = formatKey(today);

  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };

  const goNext = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const buildTooltip = (item, checkIn) => {
    const m = item.date.getMonth() + 1;
    const d = item.date.getDate();
    if (checkIn) return `${m}月${d}日 · 学习${checkIn.words_learned}词 · 复习${checkIn.words_reviewed}词`;
    return `${m}月${d}日 · 未打卡`;
  };

  return (
    <Card
      style={{ borderRadius: 20, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)' }}
      bodyStyle={{ padding: 24 }}
    >
      {/* 月份导航 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span onClick={goPrev} style={{ cursor: 'pointer', padding: '6px 10px', borderRadius: 8, color: '#6b7280' }}>
          <LeftOutlined />
        </span>
        <Text style={{ fontSize: 17, fontWeight: 700, color: '#1f2937' }}>
          {viewYear} 年 {viewMonth + 1} 月
        </Text>
        <span onClick={isCurrentMonth ? undefined : goNext} style={{ cursor: isCurrentMonth ? 'default' : 'pointer', padding: '6px 10px', borderRadius: 8, color: isCurrentMonth ? '#d1d5db' : '#6b7280' }}>
          <RightOutlined />
        </span>
      </div>

      {/* 星期标题 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {WEEK_DAYS.map(day => (
          <div key={day} style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', fontWeight: 600, padding: '4px 0' }}>
            {day}
          </div>
        ))}
      </div>

      {/* 日期格子 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {calendarDays.map((item, index) => {
          const key = formatKey(item.date);
          const checkIn = checkInMap.get(key);
          const isToday = key === todayStr;
          const isFuture = item.date > today;

          return (
            <div
              key={index}
              title={buildTooltip(item, checkIn)}
              style={{
                aspectRatio: '1',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: isToday ? 700 : item.isCurrentMonth ? 500 : 400,
                background: isFuture
                  ? 'transparent'
                  : checkIn
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : isToday
                  ? 'rgba(99, 102, 241, 0.1)'
                  : 'transparent',
                color: isFuture
                  ? '#d1d5db'
                  : !item.isCurrentMonth
                  ? '#d1d5db'
                  : checkIn
                  ? '#fff'
                  : isToday
                  ? '#6366f1'
                  : '#6b7280',
                border: isToday ? '2px solid #6366f1' : '1px solid transparent',
                cursor: isFuture || !item.isCurrentMonth ? 'default' : 'pointer',
                transition: 'all 0.15s',
                position: 'relative'
              }}
            >
              {item.date.getDate()}
              {checkIn && (
                <CheckCircleFilled style={{ position: 'absolute', top: 2, right: 2, fontSize: 10, color: '#fff' }} />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default StreakCalendar;
