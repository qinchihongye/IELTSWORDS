/**
 * 路由守卫组件
 * 保护需要登录才能访问的路由
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spin } from 'antd';
import { hasMinRole } from '../utils/roles';

const ProtectedRoute = ({ children, minRole = 'user' }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasMinRole(user, minRole)) {
    return <Navigate to="/home" replace />;
  }

  return children;
};

export default ProtectedRoute;
