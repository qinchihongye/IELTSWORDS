import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
  message,
  Tooltip,
  Segmented,
  Drawer,
  Empty,
  Slider,
  Input,
  Pagination,
  Table
} from 'antd';
import {
  DeleteOutlined,
  ReloadOutlined,
  UploadOutlined,
  InboxOutlined,
  EyeOutlined,
  CrownOutlined,
  PictureOutlined,
  CloudUploadOutlined,
  SafetyOutlined,
  UserOutlined,
  TrophyOutlined,
  InfoCircleOutlined,
  AppstoreOutlined,
  FireOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ScissorOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  FilterOutlined
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import Cropper from 'react-easy-crop';
import apiClient from '../api/client';
import config from '../config/settings';
import { fetchDynamicBuiltinAvatars } from '../utils/avatars';

const { Title, Text } = Typography;

const builtinApiBase = config.api.baseURL.replace(/\/$/, '');

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24
    }
  }
};

// Utility to crop image inside a canvas and return a transparent PNG blob
const getCroppedImg = (imageSrc, croppedAreaPixels) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法获取 Canvas 2D 绘图上下文'));
        return;
      }

      // We draw the crop area at the exact original pixel dimension to PRESERVE 100% original quality
      const size = croppedAreaPixels.width;
      canvas.width = size;
      canvas.height = size;

      // Create circular clipping path
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
      ctx.clip();

      // Draw the cropped portion from original image onto the circular canvas area
      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        size,
        size
      );

      // Convert canvas to a transparent PNG Blob
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    };
    image.onerror = (error) => reject(error);
  });
};

const AdminBuiltinAvatars = () => {
  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingKey, setDeletingKey] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [selectedFrame, setSelectedFrame] = useState('standard');

  // Filter, Layout & Pagination States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'default', 'custom', 'vip'
  const [viewMode, setViewMode] = useState('grid'); // 'grid', 'list'
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  // Cropper states
  const [cropImage, setCropImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [uploadFileName, setUploadFileName] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/admin/builtin-avatars');
      setAvatars(response.data || []);
    } catch (error) {
      console.error('获取内置头像列表失败:', error);
      message.error('获取内置头像列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Reset pagination on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType]);

  // Filtered List
  const filteredAvatars = avatars.filter((item) => {
    const matchesSearch =
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterType === 'default') {
      return matchesSearch && item.is_hardcoded;
    }
    if (filterType === 'custom') {
      return matchesSearch && !item.is_hardcoded;
    }
    if (filterType === 'vip') {
      return matchesSearch && item.vip_only;
    }
    return matchesSearch;
  });

  // Paginated List
  const paginatedAvatars = filteredAvatars.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Read file locally as Data URL and open the cropping modal
  const beforeUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setCropImage(reader.result);
      // Force change original suffix to .png since circular cropping outputs PNG transparency
      const baseName = file.name.replace(/\.[^.]+$/, '');
      setUploadFileName(`${baseName}.png`);
    });
    reader.readAsDataURL(file);
    return false; // Prevent automatic uploading
  }, []);

  // Submit the cropped circular PNG Blob to backend
  const handleCropSubmit = async () => {
    if (!cropImage || !croppedAreaPixels) return;
    setUploading(true);
    try {
      const croppedBlob = await getCroppedImg(cropImage, croppedAreaPixels);
      const croppedFile = new File([croppedBlob], uploadFileName, { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', croppedFile);
      
      await apiClient.post('/api/admin/builtin-avatars/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      message.success(`内置圆形头像 ${uploadFileName} 已成功生成并上传`);
      setCropImage(null); // Close Cropper Modal
      await fetchList();
      await fetchDynamicBuiltinAvatars();
    } catch (error) {
      console.error('上传裁剪圆形头像失败:', error);
      message.error('圆形裁剪或上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = useCallback((item) => {
    if (item.is_hardcoded) {
      message.warning('默认内置头像无法删除');
      return;
    }
    Modal.confirm({
      title: '确认删除内置头像',
      icon: <InfoCircleOutlined style={{ color: '#ef4444' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <Text>确定要永久删除内置头像「<Text strong>{item.label}</Text>」吗？</Text>
          <div style={{ marginTop: 6, padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
            <Text type="danger" style={{ fontSize: '13px' }}>
              ⚠️ 注意：已使用该头像的用户将自动回退为平台默认内置头像。
            </Text>
          </div>
        </div>
      ),
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true, size: 'large', style: { borderRadius: '8px' } },
      cancelButtonProps: { size: 'large', style: { borderRadius: '8px' } },
      onOk: async () => {
        setDeletingKey(item.key);
        try {
          await apiClient.delete(`/api/admin/builtin-avatars/${item.key}`);
          message.success(`内置头像 ${item.label} 已成功删除`);
          await fetchList();
          await fetchDynamicBuiltinAvatars();
          if (previewItem?.key === item.key) {
            setPreviewItem(null);
          }
        } catch (error) {
          console.error('删除内置头像失败:', error);
          message.error('删除内置头像失败');
        } finally {
          setDeletingKey(null);
        }
      },
    });
  }, [fetchList, previewItem]);

  // Table columns definition
  const columns = [
    {
      title: '头像预览',
      key: 'url',
      width: 110,
      align: 'center',
      render: (_, record) => (
        <div className="table-avatar-circle">
          <img
            src={`${builtinApiBase}${record.url}`}
            alt={record.label}
            className="table-avatar-img"
          />
        </div>
      ),
    },
    {
      title: '显示名称',
      dataIndex: 'label',
      key: 'label',
      render: (text) => <Text strong style={{ color: '#1e293b', fontSize: '14px' }}>{text}</Text>,
    },
    {
      title: '唯一文件名 / Key',
      dataIndex: 'key',
      key: 'key',
      render: (text) => <Text code style={{ fontSize: '12px', background: 'rgba(241, 245, 249, 0.7)' }}>{text}</Text>,
    },
    {
      title: '属性标识',
      key: 'badges',
      render: (_, record) => (
        <Space size="small">
          {record.is_hardcoded ? (
            <Tag color="purple" style={{ borderRadius: '6px', fontWeight: 600 }}>系统默认</Tag>
          ) : (
            <Tag color="emerald" style={{ borderRadius: '6px', fontWeight: 600 }}>动态内置</Tag>
          )}
          {record.vip_only && (
            <Tag color="gold" icon={<CrownOutlined />} style={{ borderRadius: '6px', fontWeight: 600 }}>VIP 专属</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '管理操作',
      key: 'actions',
      width: 140,
      align: 'center',
      render: (_, record) => (
        <Space size="middle">
          <Tooltip title="实机效果模拟">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => setPreviewItem(record)}
              style={{ color: '#6366f1', fontSize: '16px' }}
              className="table-action-btn"
            />
          </Tooltip>
          {!record.is_hardcoded && (
            <Tooltip title="永久删除">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                loading={deletingKey === record.key}
                onClick={() => handleDelete(record)}
                style={{ fontSize: '16px' }}
                className="table-action-btn danger"
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Statistics calculation
  const totalCount = avatars.length;
  const defaultCount = avatars.filter((a) => a.is_hardcoded).length;
  const customCount = avatars.filter((a) => !a.is_hardcoded).length;
  const vipCount = avatars.filter((a) => a.vip_only).length;

  return (
    <div className="admin-avatars-dashboard">
      <style>{css}</style>

      {/* Analytics Stats bar is now the new top container */}

      {/* Analytics Stats bar */}
      <div className="stats-dashboard-grid">
        <div className="stat-glass-card purple">
          <div className="stat-icon-wrap">
            <PictureOutlined />
          </div>
          <div className="stat-content">
            <Text className="stat-label">总头像数量</Text>
            <Title level={2} className="stat-value">{totalCount}</Title>
          </div>
        </div>

        <div className="stat-glass-card indigo">
          <div className="stat-icon-wrap">
            <SafetyOutlined />
          </div>
          <div className="stat-content">
            <Text className="stat-label">系统默认</Text>
            <Title level={2} className="stat-value">{defaultCount}</Title>
          </div>
        </div>

        <div className="stat-glass-card emerald">
          <div className="stat-icon-wrap">
            <CloudUploadOutlined />
          </div>
          <div className="stat-content">
            <Text className="stat-label">动态内置</Text>
            <Title level={2} className="stat-value">{customCount}</Title>
          </div>
        </div>

        <div className="stat-glass-card gold">
          <div className="stat-icon-wrap">
            <CrownOutlined />
          </div>
          <div className="stat-content">
            <Text className="stat-label">VIP 尊享</Text>
            <Title level={2} className="stat-value">{vipCount}</Title>
          </div>
        </div>
      </div>

      {/* Upload Drag Area & Grid Split */}
      <div className="admin-avatars-workspace">
        <div className="workspace-main">
          {/* Custom Styled Drag & Drop Zone */}
          <div className="premium-upload-container">
            <Upload.Dragger
              accept=".png,.jpg,.jpeg,.webp"
              showUploadList={false}
              beforeUpload={beforeUpload}
              disabled={uploading}
              className="premium-dragger"
            >
              <div className="dragger-interior">
                <p className="dragger-icon-pulse">
                  {uploading ? <Spin size="large" /> : <InboxOutlined />}
                </p>
                <h3 className="dragger-title">
                  {uploading ? '正在解析文件并打开裁剪沙盒...' : '拖拽新头像图片到此处，或点击浏览本地文件'}
                </h3>
                <p className="dragger-description">
                  支持 PNG、JPG、JPEG 或 WEBP • 物理无损圆形裁剪（原画画质）
                </p>
              </div>
            </Upload.Dragger>
          </div>

          {/* New Scalable Control Toolbar (Search, Filter, ViewMode Toggle) */}
          <div className="avatar-workspace-toolbar">
            <div className="toolbar-left">
              <Input
                placeholder="搜索内置头像名称或 Key..."
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                className="search-input-glass"
              />
            </div>
            
            <div className="toolbar-center">
              <Segmented
                value={filterType}
                onChange={setFilterType}
                options={[
                  { label: '全部头像', value: 'all' },
                  { label: '系统默认', value: 'default' },
                  { label: '动态内置', value: 'custom' },
                  { label: 'VIP专属', value: 'vip' }
                ]}
                className="filter-segmented-glass"
              />
            </div>

            <div className="toolbar-right">
              <Space size="middle">
                <Button
                  type="default"
                  icon={<ReloadOutlined spin={loading} />}
                  onClick={fetchList}
                  loading={loading}
                  className="toolbar-refresh-btn"
                >
                  刷新数据
                </Button>
                <Segmented
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { label: <Tooltip title="紧凑圆泡阵列"><AppstoreOutlined /></Tooltip>, value: 'grid' },
                    { label: <Tooltip title="详细数据清单"><UnorderedListOutlined /></Tooltip>, value: 'list' }
                  ]}
                  className="layout-segmented-glass"
                />
              </Space>
            </div>
          </div>

          {/* Main List Rendering Area */}
          {loading && avatars.length === 0 ? (
            <div className="grid-loading-shell">
              <Spin size="large" tip="正在构建高密管理面板..." />
            </div>
          ) : filteredAvatars.length === 0 ? (
            <div className="empty-shell">
              <Empty description="未找到匹配任何搜索或筛选条件的内置头像" />
            </div>
          ) : viewMode === 'grid' ? (
            // REDESIGNED Compact Circular Bubble Grid
            <div className="compact-grid-wrapper">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="compact-avatar-bubble-grid"
              >
                <AnimatePresence>
                  {paginatedAvatars.map((item) => (
                    <motion.div
                      key={item.key}
                      variants={itemVariants}
                      layoutId={item.key}
                      whileHover={{ y: -4, scale: 1.03 }}
                      className={`compact-avatar-bubble-card ${item.is_hardcoded ? 'is-hardcoded' : 'is-custom'}`}
                    >
                      {/* Top Overlay Badge Icons */}
                      <div className="bubble-badge-overlay">
                        {item.vip_only && (
                          <span className="bubble-badge gold-crown">
                            <CrownOutlined />
                          </span>
                        )}
                        {!item.is_hardcoded && (
                          <span className="bubble-badge emerald-user">
                            <UserOutlined />
                          </span>
                        )}
                      </div>

                      {/* Perfect Compact circular avatar preview */}
                      <div className="bubble-avatar-frame">
                        <img
                          src={`${builtinApiBase}${item.url}`}
                          alt={item.label}
                          className="bubble-img"
                        />
                        
                        {/* Compact Hover Backdrop Actions */}
                        <div className="bubble-action-backdrop">
                          <Space size={8}>
                            <Button
                              type="primary"
                              shape="circle"
                              icon={<EyeOutlined />}
                              size="small"
                              onClick={() => setPreviewItem(item)}
                              className="bubble-action-btn view"
                            />
                            {!item.is_hardcoded && (
                              <Button
                                danger
                                type="primary"
                                shape="circle"
                                icon={<DeleteOutlined />}
                                size="small"
                                loading={deletingKey === item.key}
                                onClick={() => handleDelete(item)}
                                className="bubble-action-btn del"
                              />
                            )}
                          </Space>
                        </div>
                      </div>

                      {/* Small compact title */}
                      <div className="bubble-label-wrap">
                        <Text className="bubble-label-text" ellipsis={{ tooltip: item.label }}>
                          {item.label}
                        </Text>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          ) : (
            // REDESIGNED Glassmorphic Table/List View
            <div className="scalable-table-wrapper">
              <Table
                dataSource={paginatedAvatars}
                columns={columns}
                rowKey="key"
                pagination={false}
                className="premium-glass-table"
                rowClassName={(record) => record.is_hardcoded ? 'table-row-default' : 'table-row-custom'}
              />
            </div>
          )}

          {/* Shared Pagination component */}
          {filteredAvatars.length > pageSize && (
            <div className="workspace-pagination-wrapper">
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={filteredAvatars.length}
                onChange={setCurrentPage}
                showSizeChanger={false}
                className="workspace-pagination-glass"
              />
            </div>
          )}
        </div>
      </div>

      {/* The Interactive Cropping Modal (Drag & Crop to perfect transparent circle) */}
      <Modal
        title={
          <div className="modal-custom-title">
            <ScissorOutlined style={{ color: '#8b5cf6', fontSize: '18px' }} />
            <span>圆形头像高保真裁剪器</span>
          </div>
        }
        open={!!cropImage}
        onCancel={() => setCropImage(null)}
        footer={
          <div className="cropper-modal-footer">
            <Button size="large" onClick={() => setCropImage(null)} style={{ borderRadius: '8px' }}>
              取消
            </Button>
            <Button
              type="primary"
              size="large"
              loading={uploading}
              icon={<CloudUploadOutlined />}
              onClick={handleCropSubmit}
              className="cropper-confirm-btn"
            >
              确认裁剪并上传
            </Button>
          </div>
        }
        width={550}
        destroyOnClose
        className="premium-cropper-modal"
      >
        {cropImage && (
          <div className="cropper-wrapper">
            <Text type="secondary" className="cropper-tip">
              💡 鼠标拖动图片可移动位置，使用滚轮或下方控制杆可缩放。圆圈内部区域将保留，圆圈外部将自动裁剪为透明。
            </Text>
            
            {/* The absolute Cropper container */}
            <div className="cropper-container-box">
              <Cropper
                image={cropImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
              />
            </div>

            {/* Slider zoom controller */}
            <div className="cropper-zoom-slider">
              <ZoomOutOutlined style={{ color: '#94a3b8', fontSize: '16px' }} />
              <Slider
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={setZoom}
                tooltip={{ open: false }}
                className="zoom-slider-glass"
              />
              <ZoomInOutlined style={{ color: '#6366f1', fontSize: '16px' }} />
            </div>
          </div>
        )}
      </Modal>

      {/* The WOW Factor: Live Simulator Sandbox Drawer */}
      <Drawer
        title={
          <div className="drawer-custom-title">
            <AppstoreOutlined style={{ color: '#8b5cf6', fontSize: '18px' }} />
            <span>头像高保真效果沙盒模拟器</span>
          </div>
        }
        placement="right"
        width={680}
        onClose={() => setPreviewItem(null)}
        open={!!previewItem}
        destroyOnClose
        className="premium-preview-drawer"
        bodyStyle={{
          background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
          padding: '24px 32px'
        }}
      >
        {previewItem && (
          <div className="sandbox-simulator-shell">
            <div className="sandbox-card shadow-glass">
              {/* Left Sandbox Control Section */}
              <div className="sandbox-control-center">
                <Title level={4} style={{ margin: 0, color: '#1e293b', fontWeight: 700 }}>
                  头像装饰挂件
                </Title>
                <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginBottom: '16px' }}>
                  为该头像搭配不同的平台尊享边框，测试渲染效果
                </Text>

                {/* Big simulator frame container */}
                <div className="sandbox-big-avatar-showcase">
                  <div className={`simulator-badge-wrapper ring-${selectedFrame}`}>
                    <img
                      src={`${builtinApiBase}${previewItem.url}`}
                      alt={previewItem.label}
                      className="simulator-avatar-actual"
                    />
                  </div>
                </div>

                <div className="frame-controller-segmented">
                  <Segmented
                    value={selectedFrame}
                    onChange={setSelectedFrame}
                    block
                    options={[
                      { label: '标准边框', value: 'standard' },
                      { label: 'VIP 金环', value: 'gold' },
                      { label: '霓虹极光', value: 'neon' },
                      { label: '钢制徽章', value: 'steel' }
                    ]}
                    className="segmented-glass"
                  />
                </div>
              </div>

              {/* Mockups section */}
              <div className="sandbox-mockups-list">
                <Title level={4} style={{ margin: 0, color: '#1e293b', fontWeight: 700, marginBottom: '16px' }}>
                  真实场景高保真预览 (Mockups)
                </Title>

                {/* Mockup 1: Bento Profile Card */}
                <div className="mockup-item">
                  <div className="mockup-badge">仪表盘 Bento 模块</div>
                  <div className="mockup-profile-card">
                    <div className="profile-card-left">
                      <div className={`mockup-avatar-ring ring-${selectedFrame} size-medium`}>
                        <img src={`${builtinApiBase}${previewItem.url}`} className="mockup-img" alt="" />
                      </div>
                      <div className="mockup-profile-names">
                        <Text className="mockup-username">雅思学霸</Text>
                        <Space size={4}>
                          <span className="mockup-vip-tag">Premium VIP</span>
                          <span className="mockup-level-tag">LV.7</span>
                        </Space>
                      </div>
                    </div>
                    <div className="profile-card-right">
                      <div className="mockup-streak-badge">
                        <FireOutlined style={{ color: '#f59e0b' }} />
                        <span>30天连签</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mockup 2: Header Navigation Bar */}
                <div className="mockup-item">
                  <div className="mockup-badge">顶部导航栏 (Navbar)</div>
                  <div className="mockup-navbar-card">
                    <div className="mockup-navbar-logo">IELTSWORDS</div>
                    <div className="mockup-navbar-nav">
                      <span className="navbar-nav-item">学习中心</span>
                      <span className="navbar-nav-item">测试模式</span>
                      <span className="navbar-nav-item active">个人空间</span>
                    </div>
                    <div className="mockup-navbar-right">
                      <div className="mockup-navbar-avatar-container">
                        <div className={`mockup-avatar-ring ring-${selectedFrame} size-small`}>
                          <img src={`${builtinApiBase}${previewItem.url}`} className="mockup-img" alt="" />
                        </div>
                        <span className="mockup-navbar-active-dot" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mockup 3: Leaderboard Position */}
                <div className="mockup-item">
                  <div className="mockup-badge">平台排行榜 (Leaderboard)</div>
                  <div className="mockup-leaderboard-row">
                    <div className="leaderboard-row-left">
                      <div className="leaderboard-rank gold">
                        <TrophyOutlined />
                        <span>1</span>
                      </div>
                      <div className={`mockup-avatar-ring ring-${selectedFrame} size-small`}>
                        <img src={`${builtinApiBase}${previewItem.url}`} className="mockup-img" alt="" />
                      </div>
                      <Text className="leaderboard-username">mengzhichao</Text>
                      <Tag color="purple" style={{ fontSize: '10px', height: '18px', display: 'flex', alignItems: 'center' }}>管理员</Tag>
                    </div>
                    <div className="leaderboard-row-right">
                      <Text className="leaderboard-score">980 分</Text>
                    </div>
                  </div>
                </div>
              </div>

              {/* Close panel action */}
              <div className="sandbox-footer-action">
                <Button
                  type="primary"
                  size="large"
                  block
                  onClick={() => setPreviewItem(null)}
                  className="preview-close-button"
                >
                  关闭模拟沙盒
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

const css = `
.admin-avatars-dashboard {
  display: flex;
  flex-direction: column;
  gap: 28px;
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 40px;
}

/* Toolbar Refresh Button */
.toolbar-refresh-btn.ant-btn {
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, 0.2);
  background: rgba(255, 255, 255, 0.6);
  font-weight: 600;
  transition: all 0.25s ease;
}

.toolbar-refresh-btn.ant-btn:hover {
  border-color: rgba(99, 102, 241, 0.45);
  background: rgba(255, 255, 255, 0.85);
  color: #6366f1;
}

/* Statistics Grid */
.stats-dashboard-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.stat-glass-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 20px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.02);
  backdrop-filter: blur(12px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-glass-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 35px rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.25);
}

.stat-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  font-size: 24px;
}

.stat-glass-card.purple .stat-icon-wrap {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
}
.stat-glass-card.indigo .stat-icon-wrap {
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
}
.stat-glass-card.emerald .stat-icon-wrap {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}
.stat-glass-card.gold .stat-icon-wrap {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.stat-content {
  flex: 1;
}

.stat-label.ant-typography {
  display: block;
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
}

.stat-value.ant-typography {
  margin: 4px 0 0 0 !important;
  font-size: 28px;
  font-weight: 800;
  color: #1e293b;
  line-height: 1;
}

/* Drag & Drop upload container */
.premium-upload-container {
  margin-bottom: 24px;
}

.premium-dragger.ant-upload-drag {
  background: rgba(255, 255, 255, 0.6);
  border: 2px dashed rgba(99, 102, 241, 0.22);
  border-radius: 20px;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.premium-dragger.ant-upload-drag:hover {
  border-color: rgba(99, 102, 241, 0.5) !important;
  background: rgba(255, 255, 255, 0.85);
}

.dragger-interior {
  padding: 24px 20px;
}

.dragger-icon-pulse {
  font-size: 36px;
  color: #6366f1;
  margin-bottom: 8px;
  animation: draggerPulse 2s infinite alternate;
}

@keyframes draggerPulse {
  0% { transform: scale(1); opacity: 0.85; }
  100% { transform: scale(1.06); opacity: 1; }
}

.dragger-title {
  font-size: 15px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 4px;
}

.dragger-description {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}

/* Highly Compact WorkSpace Toolbar (Search, Filter, ViewMode) */
.avatar-workspace-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  margin-bottom: 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.01);
}

.toolbar-left {
  flex: 1;
  max-width: 320px;
}

.search-input-glass.ant-input-affix-wrapper {
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  height: 38px;
  transition: all 0.25s ease;
}

.search-input-glass.ant-input-affix-wrapper-focused,
.search-input-glass.ant-input-affix-wrapper:hover {
  border-color: #6366f1 !important;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1) !important;
}

.filter-segmented-glass.ant-segmented,
.layout-segmented-glass.ant-segmented {
  background: rgba(241, 245, 249, 0.8);
  padding: 3px;
  border-radius: 10px;
}

.filter-segmented-glass .ant-segmented-item-selected,
.layout-segmented-glass .ant-segmented-item-selected {
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  border-radius: 7px;
  color: #6366f1;
  font-weight: 700;
}

/* REDESIGNED: Compact Avatar Bubble Grid View */
.compact-avatar-bubble-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(115px, 1fr));
  gap: 16px;
}

.compact-avatar-bubble-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(226, 232, 240, 0.7);
  border-radius: 16px;
  backdrop-filter: blur(6px);
  transition: all 0.3s ease;
  overflow: hidden;
}

.compact-avatar-bubble-card:hover {
  border-color: rgba(99, 102, 241, 0.3);
  background: #ffffff;
}

/* Compact Overlaid Badge Icons */
.bubble-badge-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 3px;
  z-index: 5;
}

.bubble-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.bubble-badge.gold-crown {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #ffffff;
}

.bubble-badge.emerald-user {
  background: linear-gradient(135deg, #34d399, #10b981);
  color: #ffffff;
}

/* Compact Bubble Avatar image frame */
.bubble-avatar-frame {
  position: relative;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  border: 2px solid rgba(226, 232, 240, 0.9);
  background: #f8fafc;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  transition: all 0.28s ease;
}

.bubble-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bubble-action-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.9);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10;
}

.compact-avatar-bubble-card:hover .bubble-action-backdrop {
  opacity: 1;
  transform: scale(1);
}

.compact-avatar-bubble-card:hover .bubble-avatar-frame {
  transform: scale(0.96);
  border-color: rgba(99, 102, 241, 0.4);
}

.bubble-action-btn.ant-btn {
  width: 24px;
  height: 24px;
  font-size: 11px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bubble-action-btn.view {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
}

.bubble-action-btn.del {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  border: none;
}

/* Compact Bubble metadata name */
.bubble-label-wrap {
  width: 100%;
  text-align: center;
  margin-top: 8px;
}

.bubble-label-text.ant-typography {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  display: block;
}

/* REDESIGNED: Premium Glass Table View */
.scalable-table-wrapper {
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.01);
  backdrop-filter: blur(8px);
}

.premium-glass-table .ant-table {
  background: transparent !important;
}

.premium-glass-table .ant-table-thead > tr > th {
  background: rgba(241, 245, 249, 0.7) !important;
  color: #475569 !important;
  font-weight: 700 !important;
  border-bottom: 1px solid #e2e8f0 !important;
}

.premium-glass-table .ant-table-tbody > tr > td {
  border-bottom: 1px solid rgba(226, 232, 240, 0.6) !important;
}

.premium-glass-table .ant-table-tbody > tr:hover > td {
  background: rgba(99, 102, 241, 0.04) !important;
}

.table-avatar-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2.5px solid rgba(226, 232, 240, 0.95);
  background: #f8fafc;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.table-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.table-key-code.ant-typography {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.table-action-btn.ant-btn {
  transition: all 0.2s ease;
}

.table-action-btn.ant-btn:hover {
  background: rgba(99, 102, 241, 0.08);
  border-radius: 6px;
  transform: scale(1.1);
}

.table-action-btn.danger.ant-btn:hover {
  background: rgba(239, 68, 68, 0.08);
}

/* Shared Pagination Style */
.workspace-pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 28px;
}

.workspace-pagination-glass.ant-pagination .ant-pagination-item {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(226, 232, 240, 0.8);
  border-radius: 8px;
}

.workspace-pagination-glass.ant-pagination .ant-pagination-item-active {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-color: transparent;
}

.workspace-pagination-glass.ant-pagination .ant-pagination-item-active a {
  color: #ffffff !important;
}

.workspace-pagination-glass.ant-pagination .ant-pagination-prev .ant-pagination-item-link,
.workspace-pagination-glass.ant-pagination .ant-pagination-next .ant-pagination-item-link {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(226, 232, 240, 0.8);
  border-radius: 8px;
}

.grid-loading-shell, .empty-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 20px;
  border: 1px solid rgba(226, 232, 240, 0.6);
}

/* Interactive Sandbox Simulator */
.drawer-custom-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
}

.sandbox-simulator-shell {
  height: 100%;
}

.sandbox-card.shadow-glass {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.sandbox-control-center {
  padding: 24px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
}

.sandbox-big-avatar-showcase {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 30px 0;
}

.simulator-badge-wrapper {
  position: relative;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.simulator-avatar-actual {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  background: #f8fafc;
}

/* Beautiful RINGS */
.ring-standard {
  border: 3px solid rgba(226, 232, 240, 0.95);
  box-shadow: 0 10px 24px rgba(0,0,0,0.06);
}

.ring-gold {
  border: 4px solid #f59e0b;
  background: linear-gradient(135deg, #fbbf24, #f59e0b, #d97706);
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.5), inset 0 0 10px rgba(255,255,255,0.4);
  padding: 4px;
}

.ring-neon {
  border: 4px solid #8b5cf6;
  box-shadow: 0 0 24px rgba(139, 92, 246, 0.7);
  animation: neonFramePulse 2s infinite alternate;
  padding: 4px;
}

@keyframes neonFramePulse {
  0% { box-shadow: 0 0 12px rgba(139, 92, 246, 0.4); border-color: #8b5cf6; }
  100% { box-shadow: 0 0 28px rgba(139, 92, 246, 0.9); border-color: #a78bfa; }
}

.ring-steel {
  border: 5px double #64748b;
  padding: 3px;
  background: #cbd5e1;
  box-shadow: 0 6px 18px rgba(100, 116, 139, 0.15);
}

.frame-controller-segmented {
  margin-top: 10px;
}

.segmented-glass.ant-segmented {
  background: rgba(241, 245, 249, 0.9);
  padding: 4px;
  border-radius: 12px;
}

.segmented-glass .ant-segmented-item-selected {
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  color: #4f46e5;
  font-weight: 700;
}

/* Mockups layout */
.sandbox-mockups-list {
  padding: 24px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
}

.mockup-item {
  position: relative;
  margin-bottom: 20px;
  border: 1px solid rgba(226, 232, 240, 0.7);
  background: #f8fafc;
  border-radius: 16px;
  padding: 20px;
  padding-top: 24px;
}

.mockup-badge {
  position: absolute;
  top: -9px;
  left: 14px;
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 6px;
  color: #475569;
}

/* Mockup 1: Profile card */
.mockup-profile-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.5);
  box-shadow: 0 4px 10px rgba(0,0,0,0.01);
}

.profile-card-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.mockup-profile-names {
  display: flex;
  flex-direction: column;
}

.mockup-username.ant-typography {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.mockup-vip-tag {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  color: #ffffff;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 4px;
}

.mockup-level-tag {
  background: #f1f5f9;
  color: #475569;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
}

.mockup-streak-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #fef3c7;
  color: #d97706;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid #fde68a;
}

/* Mockup 2: Navbar */
.mockup-navbar-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.5);
  box-shadow: 0 4px 10px rgba(0,0,0,0.01);
}

.mockup-navbar-logo {
  font-size: 14px;
  font-weight: 800;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.mockup-navbar-nav {
  display: flex;
  gap: 12px;
}

.navbar-nav-item {
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
}

.navbar-nav-item.active {
  color: #6366f1;
}

.mockup-navbar-avatar-container {
  position: relative;
  display: flex;
  align-items: center;
}

.mockup-navbar-active-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 9px;
  height: 9px;
  background: #10b981;
  border-radius: 50%;
  border: 1.5px solid #ffffff;
}

/* Mockup 3: Leaderboard */
.mockup-leaderboard-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.5);
}

.leaderboard-row-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.leaderboard-rank {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 14px;
  font-weight: 800;
}

.leaderboard-rank.gold {
  color: #d97706;
}

.leaderboard-username.ant-typography {
  font-size: 14px;
  font-weight: 700;
  color: #334155;
}

.leaderboard-score.ant-typography {
  font-size: 14px;
  font-weight: 700;
  color: #6366f1;
}

/* Rings on mockups */
.mockup-avatar-ring {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.mockup-avatar-ring.size-medium {
  width: 44px;
  height: 44px;
}
.mockup-avatar-ring.size-small {
  width: 32px;
  height: 32px;
}

.mockup-avatar-ring.size-medium .mockup-img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
}

.mockup-avatar-ring.size-small .mockup-img {
  width: 26px;
  height: 26px;
  border-radius: 50%;
}

.mockup-avatar-ring.ring-standard {
  border: 1px solid #cbd5e1;
}
.mockup-avatar-ring.ring-gold {
  border: 2px solid #fbbf24;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  box-shadow: 0 0 6px rgba(251,191,36,0.3);
  padding: 1px;
}
.mockup-avatar-ring.ring-neon {
  border: 2px solid #8b5cf6;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
  padding: 1px;
}
.mockup-avatar-ring.ring-steel {
  border: 2px double #64748b;
  padding: 1px;
  background: #cbd5e1;
}

/* Sandbox footer closing action */
.sandbox-footer-action {
  margin-top: 12px;
}

.preview-close-button.ant-btn {
  height: 48px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  box-shadow: 0 10px 24px rgba(99, 102, 241, 0.25);
  transition: all 0.25s ease;
}

.preview-close-button.ant-btn:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  transform: translateY(-1px);
}

/* Interactive Circular Cropper Modal Custom Styles */
.modal-custom-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
}

.cropper-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cropper-tip.ant-typography {
  font-size: 13px;
  color: #64748b;
  background: #f1f5f9;
  padding: 8px 12px;
  border-radius: 8px;
  line-height: 1.5;
  border-left: 3px solid #8b5cf6;
}

.cropper-container-box {
  position: relative;
  width: 100%;
  height: 320px;
  background: #0f172a;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}

.cropper-zoom-slider {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.zoom-slider-glass.ant-slider {
  flex: 1;
  margin: 0;
}

.cropper-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;
}

.cropper-confirm-btn.ant-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  border-radius: 8px;
  font-weight: 700;
}

.cropper-confirm-btn.ant-btn:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
}

@media (max-width: 960px) {
  .stats-dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .avatar-workspace-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-left {
    max-width: none;
  }
}

@media (max-width: 600px) {
  .stats-dashboard-grid {
    grid-template-columns: 1fr;
  }
}
`;

export default AdminBuiltinAvatars;
