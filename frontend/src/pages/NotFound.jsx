import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography } from 'antd';
import { HomeOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <style>{css}</style>
      <div className="not-found-card">
        <Title level={2} style={{ margin: 0 }}>404</Title>
        <Text type="secondary">页面未找到</Text>
        <Button
          type="primary"
          icon={<HomeOutlined />}
          onClick={() => navigate('/home')}
        >
          返回首页
        </Button>
      </div>
    </div>
  );
};

const css = `
.not-found-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.not-found-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
}
`;

export default NotFound;
