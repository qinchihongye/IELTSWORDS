import React, { useEffect, useRef, useState } from 'react';
import { Typography, Spin } from 'antd';
import {
  RiseOutlined,
  FireFilled,
  TrophyFilled,
  PlayCircleFilled,
  CalendarFilled,
  AppstoreFilled,
  CrownFilled,
  BookFilled,
  ClockCircleFilled,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProgress } from '../context/ProgressContext';
import { motion } from 'framer-motion';
import DonutChart from '../components/DonutChart';
import UserAvatar from '../components/UserAvatar';
import { formatChapterTitle } from '../utils/learning';
import { ROLE_LABELS } from '../utils/roles';

const { Title, Text } = Typography;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

const ROLE_STYLE_MAP = {
  user: {
    color: '#475569',
    background: 'rgba(226, 232, 240, 0.8)',
  },
  premium_user: {
    color: '#1d4ed8',
    background: 'rgba(219, 234, 254, 0.9)',
  },
  admin: {
    color: '#b45309',
    background: 'rgba(254, 243, 199, 0.95)',
  },
  super_admin: {
    color: '#b91c1c',
    background: 'rgba(254, 226, 226, 0.95)',
  },
};

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const leaderboardListRef = useRef(null);
  const [chapterExpanded, setChapterExpanded] = useState(false);

  const {
    stats,
    fetchStats,
    leaderboard,
    fetchLeaderboard,
    streakInfo,
    fetchStreakInfo,
    chapterProgress,
    fetchChapterProgress,
  } = useProgress();

  useEffect(() => {
    void fetchStats();
    void fetchLeaderboard(30);
    void fetchStreakInfo();
    void fetchChapterProgress();
  }, [fetchStats, fetchLeaderboard, fetchStreakInfo, fetchChapterProgress]);

  if (!stats) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  const chartData = [
    { label: '未掌握', value: stats.unlearnedCount || 0, color: '#e5e7eb' },
    { label: '有印象', value: stats.learningCount || 0, color: '#60a5fa' },
    { label: '已掌握', value: stats.masteredCount || 0, color: '#34d399' },
  ];

  const masteryPercent = stats.totalWords > 0
    ? ((stats.masteredCount / stats.totalWords) * 100).toFixed(1)
    : 0;

  const currentStreak = streakInfo?.current_streak ?? 0;
  const longestStreak = streakInfo?.longest_streak ?? 0;
  const totalCheckIns = streakInfo?.total_check_ins ?? 0;
  const displayChapterProgress = chapterProgress || [];

  const displayLeaderboard = (leaderboard || []).map((entry, index) => {
    let color = '#64748b';
    let bg = 'transparent';
    if (index === 0) { color = '#f59e0b'; bg = '#fef3c7'; }
    else if (index === 1) { color = '#94a3b8'; bg = '#f1f5f9'; }
    else if (index === 2) { color = '#b45309'; bg = '#ffedd5'; }
    return {
      rank: entry.rank,
      username: entry.username,
      avatar_type: entry.avatar_type,
      avatar_value: entry.avatar_value,
      role: entry.role || 'user',
      roleLabel: ROLE_LABELS[entry.role] || ROLE_LABELS.user,
      score: entry.score,
      color,
      bg,
      isUser: entry.is_user,
    };
  });

  const overviewMetrics = [
    {
      label: '总词汇',
      value: stats.totalWords,
      icon: <AppstoreFilled />,
      accent: 'indigo',
      support: '正式词库',
    },
    {
      label: '已掌握',
      value: stats.masteredCount,
      icon: <BookFilled />,
      accent: 'emerald',
      support: `${masteryPercent}% 掌握率`,
    },
    {
      label: '学习中',
      value: stats.learningCount,
      icon: <ClockCircleFilled />,
      accent: 'blue',
      support: `${stats.unlearnedCount || 0} 未开始`,
    },
    {
      label: '连续打卡',
      value: currentStreak,
      suffix: '天',
      icon: <FireFilled />,
      accent: 'orange',
      support: `最长 ${longestStreak} 天`,
    },
  ];

  return (
    <motion.div
      className="bento-container"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <style>{bentoCss}</style>

      <motion.div variants={itemVariants} className="bento-header">
        <div>
          <Title level={2} style={{ margin: 0, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.5px' }}>
            智能数据看板
          </Title>
          <Text style={{ color: '#64748b', fontSize: '15px' }}>
            欢迎回来, {user?.username}。一览你的学习进度与全球排名。
          </Text>
        </div>
      </motion.div>

      <div className="dashboard-top-grid">
        <div className="dashboard-summary-col">
          <motion.div variants={itemVariants} className="dashboard-card dashboard-hero">
            <div className="glass-card hero-action-card">
              <div>
                <div className="db-badge-white">
                  <CalendarFilled /> 今日任务
                </div>
                <Title level={2} style={{ color: '#fff', margin: '16px 0 8px', fontWeight: 700 }}>
                  继续顺序学习
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 15 }}>
                  根据艾宾浩斯记忆曲线，建议每天学习 50 个新词。
                </Text>
              </div>
              <div className="hero-buttons">
                <button className="btn-hero-primary" onClick={() => navigate('/chapter-select')}>
                  <PlayCircleFilled /> 开始学习
                </button>
                <button className="btn-hero-secondary" onClick={() => navigate('/review')}>
                  智能复习
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="dashboard-card dashboard-overview-card">
            <div className="glass-card db-card-inner overview-card">
              <div className="db-card-head overview-head">
                <div>
                  <Text className="db-card-title">学习概览</Text>
                  <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
                    合并展示核心指标与掌握分布
                  </div>
                </div>
                <div className="db-icon-circle bg-emerald-50 text-emerald-500">
                  <TrophyFilled />
                </div>
              </div>

              <div className="overview-layout">
                <div className="overview-donut-panel">
                  <div className="donut-area">
                    <DonutChart data={chartData} total={stats.totalWords} centerText="总词汇" />
                  </div>
                  <div className="mastery-pct">
                    <Text style={{ color: '#10b981', fontWeight: 700, fontSize: 22 }}>{masteryPercent}%</Text>
                    <Text style={{ color: '#64748b', fontSize: 13 }}>掌握率</Text>
                  </div>
                </div>

                <div className="overview-metrics-grid">
                  {overviewMetrics.map((metric) => (
                    <div key={metric.label} className="overview-metric-tile">
                      <div className="overview-metric-top">
                        <div className={`db-icon-circle bg-${metric.accent}-50 text-${metric.accent}-500 overview-metric-icon`}>
                          {metric.icon}
                        </div>
                        <Text className="overview-metric-label">{metric.label}</Text>
                      </div>
                      <div className="overview-metric-value">
                        {metric.value}
                        {metric.suffix ? <span className="overview-metric-suffix">{metric.suffix}</span> : null}
                      </div>
                      <div className="overview-metric-support">{metric.support}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overview-foot">
                <span className="db-badge-success"><RiseOutlined /> 学习稳步推进</span>
                <span className="overview-foot-text">总打卡 {totalCheckIns} 次</span>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div variants={itemVariants} className="dashboard-side-card">
          <div className="glass-card db-card-inner leaderboard-card">
            <div className="db-card-head leaderboard-head">
              <div>
                <Text style={{ color: '#1e293b', fontWeight: 600, fontSize: 18 }}>
                  全球积分榜
                </Text>
                <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
                  查看全站学习积分排名
                </div>
              </div>
              <CrownFilled style={{ color: '#f59e0b', fontSize: 20 }} />
            </div>

            {displayLeaderboard.length === 0 ? (
              <Text type="secondary" style={{ textAlign: 'center', padding: '20px 0', display: 'block' }}>暂无排行数据</Text>
            ) : (
              <div className="leaderboard-shell">
                <div ref={leaderboardListRef} className="leaderboard-scroll custom-scroll">
                  {displayLeaderboard.map((u) => (
                    <div key={u.rank} className={`leaderboard-row ${u.isUser ? 'is-user' : ''}`}>
                      <div className="rank-badge" style={{ background: u.bg, color: u.color }}>
                        {u.rank}
                      </div>
                      <div className="user-info">
                        <UserAvatar user={u} size={30} previewable previewTitle={`${u.username} 的头像`} />
                        <div className="leaderboard-user-copy">
                          <Text style={{ fontWeight: u.isUser ? 600 : 500, color: u.isUser ? '#4f46e5' : '#334155' }}>
                            {u.username}
                          </Text>
                          <span
                            className="leaderboard-role-badge"
                            style={ROLE_STYLE_MAP[u.role] || ROLE_STYLE_MAP.user}
                          >
                            {u.roleLabel}
                          </span>
                        </div>
                      </div>
                      <div className="user-score">
                        <Text style={{ fontWeight: 600, color: '#0f172a' }}>{u.score}</Text>
                        <span className="score-label">分</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <motion.div variants={itemVariants} className="dashboard-section">
        <div className="glass-card chapter-section-card">
          <button
            type="button"
            className={`chapter-section-toggle ${chapterExpanded ? 'is-open' : ''}`}
            onClick={() => setChapterExpanded((value) => !value)}
          >
            <div>
              <Text style={{ color: '#1e293b', fontWeight: 600, fontSize: 18 }}>
                章节学习目录
              </Text>
              <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
                每一章已学习词数与掌握情况
              </div>
            </div>
            <div className="chapter-section-toggle-right">
              <span className="chapter-section-toggle-label">
                {chapterExpanded ? '收起' : '展开'}
              </span>
              <RightOutlined className="chapter-section-toggle-arrow" />
            </div>
          </button>

          {chapterExpanded && (
            <div className="chapter-section-content">
              <div className="chapter-progress-list">
                {displayChapterProgress.length === 0 ? (
                  <Text type="secondary" style={{ textAlign: 'center', padding: '20px 0', display: 'block' }}>暂无章节进度</Text>
                ) : (
                  displayChapterProgress.map((chapter) => (
                    <button
                      key={chapter.chapterNo}
                      type="button"
                      className="chapter-progress-row"
                      onClick={() => navigate('/chapter-select')}
                    >
                      <div className="chapter-progress-main">
                        <div className="chapter-progress-title">
                          {formatChapterTitle(chapter.chapterNo, chapter.chapterName)}
                        </div>
                        <div className="chapter-progress-meta">
                          已学 {chapter.learnedCount}/{chapter.totalWords} · 掌握 {chapter.masteredCount}
                        </div>
                      </div>
                      <div className="chapter-progress-side">
                        <div className="chapter-progress-percent">{chapter.learnedPercent}%</div>
                        <div className="chapter-progress-bar">
                          <div
                            className="chapter-progress-bar-fill"
                            style={{ width: `${chapter.learnedPercent}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const bentoCss = `
.bento-container {
  max-width: 1240px;
  margin: 0 auto;
  padding-bottom: 40px;
}
.bento-header {
  margin-bottom: 28px;
}
.dashboard-top-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(340px, 1fr);
  gap: 20px;
  align-items: stretch;
}
.dashboard-summary-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 620px;
}
.dashboard-card,
.dashboard-side-card,
.dashboard-section {
  min-width: 0;
}
.dashboard-hero {
  flex: 0 0 auto;
}
.dashboard-overview-card {
  flex: 1;
  min-height: 0;
}
.db-card-inner {
  padding: 22px;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  border-radius: 18px;
}
.db-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.db-card-title {
  color: #64748b;
  font-weight: 500;
}
.db-card-label {
  color: #64748b;
  font-weight: 500;
}
.db-card-foot {
  margin-top: auto;
  padding-top: 12px;
}
.db-icon-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.bg-indigo-50 { background-color: #eef2ff; }
.text-indigo-500 { color: #6366f1; }
.bg-orange-50 { background-color: #fff7ed; }
.text-orange-500 { color: #f97316; }
.bg-emerald-50 { background-color: #ecfdf5; }
.text-emerald-500 { color: #10b981; }
.bg-blue-50 { background-color: #eff6ff; }
.text-blue-500 { color: #3b82f6; }
.db-badge-success {
  background: #dcfce7;
  color: #16a34a;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.db-badge-white {
  background: rgba(255,255,255,0.2);
  backdrop-filter: blur(4px);
  color: #fff;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.bg-wave {
  position: absolute;
  bottom: 0;
  right: 0;
  opacity: 0.1;
}
.hero-action-card {
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%) !important;
  border: none !important;
  box-shadow: 0 24px 48px rgba(99, 102, 241, 0.25) !important;
  padding: 28px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 18px;
  min-height: 188px;
}
.hero-buttons {
  margin-top: 18px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.btn-hero-primary,
.btn-hero-secondary {
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}
.btn-hero-primary {
  background: #fff;
  color: #4f46e5;
  box-shadow: 0 10px 20px rgba(0,0,0,0.1);
}
.btn-hero-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.15);
}
.btn-hero-secondary {
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.3);
  color: #fff;
}
.btn-hero-secondary:hover {
  background: rgba(255,255,255,0.25);
}
.overview-card {
  gap: 16px;
}
.overview-layout {
  display: grid;
  grid-template-columns: minmax(240px, 290px) minmax(0, 1fr);
  gap: 20px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}
.overview-donut-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 260px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.78);
  border: 1px solid rgba(226, 232, 240, 0.9);
}
.donut-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}
.mastery-pct {
  display: flex;
  align-items: baseline;
  gap: 6px;
  justify-content: center;
  margin-top: 8px;
}
.overview-metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.overview-metric-tile {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 16px;
  padding: 18px;
  background: rgba(248, 250, 252, 0.84);
  border: 1px solid rgba(226, 232, 240, 0.9);
  min-height: 128px;
}
.overview-metric-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.overview-metric-icon {
  width: 30px;
  height: 30px;
  font-size: 14px;
}
.overview-metric-label {
  color: #64748b;
  font-weight: 600;
}
.overview-metric-value {
  color: #0f172a;
  font-weight: 800;
  font-size: 30px;
  line-height: 1.1;
  margin-top: 8px;
}
.overview-metric-suffix {
  font-size: 14px;
  font-weight: 700;
  color: #64748b;
  margin-left: 4px;
}
.overview-metric-support {
  color: #94a3b8;
  font-size: 12px;
  margin-top: 8px;
}
.overview-foot {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.overview-foot-text {
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
}
.leaderboard-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.leaderboard-head {
  margin-bottom: 16px;
}
.leaderboard-shell {
  border: 2px dashed rgba(156, 163, 175, 0.28);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.42);
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.leaderboard-scroll {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}
.leaderboard-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.leaderboard-row:hover {
  background: rgba(255, 255, 255, 0.74);
  border-color: rgba(209, 213, 219, 0.6);
}
.leaderboard-row.is-user {
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
}
.rank-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  margin-right: 12px;
  flex-shrink: 0;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.leaderboard-user-copy {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.leaderboard-user-copy .ant-typography {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.leaderboard-role-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}
.user-score {
  text-align: right;
  flex-shrink: 0;
}
.score-label {
  font-size: 11px;
  color: #94a3b8;
  margin-left: 4px;
}
.dashboard-section {
  margin-top: 20px;
}
.chapter-section-card {
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 10px 32px rgba(15, 23, 42, 0.05);
  overflow: hidden;
}
.chapter-section-toggle {
  width: 100%;
  background: transparent;
  border: none;
  padding: 22px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-align: left;
  cursor: pointer;
}
.chapter-section-toggle-right {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}
.chapter-section-toggle-arrow {
  transition: transform 0.2s ease;
}
.chapter-section-toggle.is-open .chapter-section-toggle-arrow {
  transform: rotate(90deg);
}
.chapter-section-content {
  padding: 0 24px 24px;
}
.chapter-progress-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.chapter-progress-row {
  appearance: none;
  width: 100%;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(248, 250, 252, 0.66);
  border-radius: 12px;
  padding: 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px;
  gap: 18px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}
.chapter-progress-row:hover {
  background: rgba(255, 255, 255, 0.82);
  border-color: rgba(99, 102, 241, 0.26);
  transform: translateY(-1px);
}
.chapter-progress-main {
  min-width: 0;
}
.chapter-progress-title {
  color: #1e293b;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chapter-progress-meta {
  color: #64748b;
  font-size: 12px;
  margin-top: 4px;
}
.chapter-progress-side {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}
.chapter-progress-percent {
  color: #4f46e5;
  font-size: 14px;
  font-weight: 800;
  text-align: right;
}
.chapter-progress-bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  overflow: hidden;
}
.chapter-progress-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%);
}
@media (max-width: 1120px) {
  .dashboard-top-grid {
    grid-template-columns: 1fr;
  }
  .dashboard-summary-col {
    min-height: auto;
  }
  .leaderboard-card {
    min-height: 560px;
  }
  .leaderboard-scroll {
    min-height: 320px;
  }
  .overview-layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 820px) {
  .overview-metrics-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 640px) {
  .bento-container {
    padding-bottom: 24px;
  }
  .overview-metrics-grid {
    grid-template-columns: 1fr;
  }
  .hero-buttons {
    flex-direction: column;
  }
  .hero-buttons button {
    width: 100%;
    justify-content: center;
  }
  .chapter-progress-list {
    grid-template-columns: 1fr;
  }
  .chapter-progress-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .chapter-progress-side {
    grid-template-columns: 48px 1fr;
  }
}
`;

export default Home;
