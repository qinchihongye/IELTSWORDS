/**
 * 难度按钮组件 - 用于复习模式
 */

import React from 'react';
import { Button } from 'antd';
import { CheckOutlined } from '@ant-design/icons';

const DifficultyButtons = ({ currentDifficulty, onDifficultyChange }) => {
  const difficulties = [
    { value: 1, label: '简单', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.1)' },
    { value: 3, label: '一般', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
    { value: 5, label: '困难', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' }
  ];

  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      justifyContent: 'center',
      marginTop: '32px'
    }}>
      {difficulties.map(diff => {
        const isActive = currentDifficulty === diff.value;

        return (
          <Button
            key={diff.value}
            size="large"
            onClick={() => onDifficultyChange(diff.value)}
            style={{
              flex: 1,
              height: '64px',
              borderRadius: '16px',
              border: isActive ? `2px solid ${diff.color}` : '2px solid rgba(0,0,0,0.06)',
              background: isActive ? diff.bgColor : 'rgba(255,255,255,0.6)',
              color: isActive ? diff.color : '#6b7280',
              fontWeight: 600,
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s ease',
              boxShadow: isActive ? `0 4px 12px ${diff.color}40` : 'none'
            }}
          >
            {isActive && <CheckOutlined />}
            {diff.label}
          </Button>
        );
      })}
    </div>
  );
};

export default DifficultyButtons;
