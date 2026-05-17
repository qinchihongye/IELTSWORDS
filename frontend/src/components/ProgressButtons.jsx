/**
 * 学习进度按钮组件
 */

import React, { useState, useEffect } from 'react';
import { Card, Button, Typography } from 'antd';
import { CloseCircleOutlined, ClockCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';

const OPTIONS = [
  {
    status: 'unlearned',
    label: '没想起',
    icon: <CloseCircleOutlined />,
    color: '#f43f5e',
    gradient: 'linear-gradient(135deg, #fecdd3 0%, #fda4af 100%)',
    activeGradient: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)'
  },
  {
    status: 'learning',
    label: '有印象',
    icon: <ClockCircleOutlined />,
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    activeGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
  },
  {
    status: 'mastered',
    label: '记住了',
    icon: <CheckCircleOutlined />,
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
    activeGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
  },
];

const STATUS_LABELS = {
  unlearned: '未学习',
  learning: '学习中',
  mastered: '已掌握',
};

const ProgressButtons = ({ currentStatus = 'unlearned', onStatusChange }) => {
  const [loading, setLoading] = useState(false);

  const handleStatusChange = async (status) => {
    if (loading) return;
    setLoading(true);
    await onStatusChange(status);
    setLoading(false);
  };

  // 快捷键: 1(没想起) 2(有印象) 3(记住了)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        return;
      }
      
      if (e.key === '1') {
        e.preventDefault();
        handleStatusChange('unlearned');
      } else if (e.key === '2') {
        e.preventDefault();
        handleStatusChange('learning');
      } else if (e.key === '3') {
        e.preventDefault();
        handleStatusChange('mastered');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, onStatusChange]);

  return (
    <Card
      className="glass-card mt-6"
      style={{ borderRadius: '24px', overflow: 'hidden', marginTop: '24px' }}
      bodyStyle={{ padding: '24px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, color: '#374151' }}>学习反馈</div>
        <div style={{ 
          fontSize: '14px', 
          fontWeight: 600, 
          padding: '6px 12px', 
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.6)',
          color: '#6b7280'
        }}>
          当前记录: <span style={{ color: OPTIONS.find(o => o.status === currentStatus)?.color }}>{STATUS_LABELS[currentStatus]}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {OPTIONS.map((option, index) => {
          const isActive = currentStatus === option.status;
          return (
            <motion.div
              key={option.status}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                size="large"
                icon={option.icon}
                onClick={() => handleStatusChange(option.status)}
                loading={loading}
                style={{
                  width: '100%',
                  height: '64px',
                  borderRadius: '16px',
                  border: 'none',
                  background: isActive ? option.activeGradient : option.gradient,
                  color: isActive ? '#fff' : option.color,
                  fontWeight: 600,
                  fontSize: '16px',
                  boxShadow: isActive ? `0 8px 20px ${option.color}40` : 'none',
                  transition: 'all 0.3s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span>{option.label}</span>
                  <Typography.Text style={{ color: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.2)', fontSize: '12px', background: isActive ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: '4px', marginLeft: 4 }}>
                    {index + 1}
                  </Typography.Text>
                </div>
              </Button>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
};

export default ProgressButtons;
