import React from 'react';
import { motion } from 'framer-motion';

const DonutChart = ({ data, total, centerText, size = 200, strokeWidth = 24 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const chartSegments = data.reduce((segments, item) => {
    if (item.value === 0 || total === 0) {
      return segments;
    }

    const valueBefore = segments.reduce((sum, segment) => sum + segment.value, 0);
    segments.push({
      ...item,
      rotateAngle: (valueBefore / total) * 360,
      dash: (item.value / total) * circumference,
      gap: circumference - ((item.value / total) * circumference),
    });
    return segments;
  }, []);
  
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {chartSegments.map((item) => {
          return (
            <motion.circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${item.dash} ${item.gap}`}
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray: `${item.dash} ${item.gap}` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              style={{
                transformOrigin: '50% 50%',
                transform: `rotate(${item.rotateAngle}deg)`,
              }}
            />
          );
        })}
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontSize: Math.round(size * 0.16), fontWeight: 800, color: '#111827', lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: Math.max(10, Math.round(size * 0.065)), color: '#6b7280', marginTop: 4, fontWeight: 500 }}>{centerText}</div>
      </div>
    </div>
  );
};

export default DonutChart;
