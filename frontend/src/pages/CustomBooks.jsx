import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Progress,
  Spin,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  ArrowRightOutlined,
  BookOutlined,
  DeleteOutlined,
  InboxOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { hasMinRole } from '../utils/roles';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const pageVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 24 },
  },
};

const statusColorMap = {
  completed: 'success',
  progress: 'processing',
  idle: 'default',
};

const CustomBooks = () => {
  const navigate = useNavigate();
  const { bookId } = useParams();
  const { user } = useAuth();
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bookName, setBookName] = useState('');
  const [bookDescription, setBookDescription] = useState('');
  const [fileList, setFileList] = useState([]);
  const customBooksUnlocked = hasMinRole(user, 'premium_user');

  const activeBookId = useMemo(() => {
    const parsedValue = Number(bookId);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [bookId]);

  const fetchBooks = useCallback(async () => {
    if (!customBooksUnlocked) {
      setBooks([]);
      setLoadingBooks(false);
      return [];
    }

    setLoadingBooks(true);
    try {
      const response = await apiClient.get('/api/custom-books');
      setBooks(response.data);
      return response.data;
    } catch (error) {
      console.error('获取自定义词书列表失败:', error);
      setBooks([]);
      return [];
    } finally {
      setLoadingBooks(false);
    }
  }, [customBooksUnlocked]);

  const fetchBookDetail = useCallback(async (targetBookId) => {
    if (!customBooksUnlocked) {
      setSelectedBook(null);
      return null;
    }

    if (!targetBookId) {
      setSelectedBook(null);
      return null;
    }

    setLoadingDetail(true);
    try {
      const response = await apiClient.get(`/api/custom-books/${targetBookId}`);
      setSelectedBook(response.data);
      return response.data;
    } catch (error) {
      console.error('获取自定义词书详情失败:', error);
      setSelectedBook(null);
      return null;
    } finally {
      setLoadingDetail(false);
    }
  }, [customBooksUnlocked]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  useEffect(() => {
    if (!books.length || activeBookId) {
      return;
    }

    navigate(`/custom-books/${books[0].id}`, { replace: true });
  }, [activeBookId, books, navigate]);

  useEffect(() => {
    if (!customBooksUnlocked) {
      setSelectedBook(null);
      return;
    }

    if (!activeBookId) {
      setSelectedBook(null);
      return;
    }

    void fetchBookDetail(activeBookId);
  }, [activeBookId, customBooksUnlocked, fetchBookDetail]);

  const handleImport = async () => {
    if (!customBooksUnlocked) {
      message.info('普通用户暂不可使用自定义词书功能');
      return;
    }

    const currentFile = fileList[0]?.originFileObj;
    if (!currentFile) {
      message.warning('请先选择 CSV 或 XLSX 文件');
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', currentFile);
      if (bookName.trim()) {
        formData.append('name', bookName.trim());
      }
      if (bookDescription.trim()) {
        formData.append('description', bookDescription.trim());
      }

      const response = await apiClient.post('/api/custom-books/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const importedBook = response.data?.book;
      message.success(`导入完成，共写入 ${response.data?.importedWords || 0} 个单词`);
      setBookName('');
      setBookDescription('');
      setFileList([]);
      await fetchBooks();
      if (importedBook?.id) {
        navigate(`/custom-books/${importedBook.id}`);
      }
    } catch (error) {
      console.error('导入自定义词书失败:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteBook = async (targetBookId) => {
    if (!customBooksUnlocked) {
      message.info('普通用户暂不可使用自定义词书功能');
      return;
    }

    try {
      await apiClient.delete(`/api/custom-books/${targetBookId}`);
      message.success('自定义词书已删除');
      const nextBooks = await fetchBooks();

      if (activeBookId === targetBookId) {
        const fallbackBook = nextBooks[0];
        navigate(fallbackBook ? `/custom-books/${fallbackBook.id}` : '/custom-books', {
          replace: true,
        });
      }
    } catch (error) {
      console.error('删除自定义词书失败:', error);
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      style={{ maxWidth: 1400, margin: '0 auto', height: '100%' }}
    >
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ marginBottom: 8, color: '#0f172a' }}>
          自定义词书
        </Title>
        <Text style={{ color: '#64748b', fontSize: 15 }}>
          导入你自己的词库，独立学习、独立进度，不会影响正式章节、排行榜和错词体系。普通用户完成全部内置词汇学习后，会自动升级为 VIP 用户并解锁这里。
        </Text>
      </div>

      {!customBooksUnlocked ? (
        <Card
          style={{
            borderRadius: 24,
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid rgba(255,255,255,0.86)',
            boxShadow: '0 12px 36px rgba(15, 23, 42, 0.06)',
            maxWidth: 920,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Tag color="blue" style={{ width: 'fit-content', padding: '4px 12px', fontSize: 13 }}>
              VIP 专属功能
            </Tag>
            <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
              普通用户暂不可使用自定义词书
            </Title>
            <Paragraph style={{ margin: 0, color: '#475569', fontSize: 15, lineHeight: 1.8 }}>
              这里支持导入、管理和学习你自己的词库。为了和内置课程体系隔离，自定义词书当前仅对 VIP 用户及以上开放。
            </Paragraph>
            <Paragraph style={{ margin: 0, color: '#475569', fontSize: 15, lineHeight: 1.8 }}>
              当你完成全部内置词汇学习后，系统会自动把你的账户升级为 VIP 用户，到时这里会自动解锁。
            </Paragraph>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button type="primary" onClick={() => navigate('/chapter-select')}>
                去继续学习内置词汇
              </Button>
              <Button onClick={() => navigate('/home')}>
                返回数据看板
              </Button>
            </div>
          </div>
        </Card>
      ) : (

      <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', minHeight: 'calc(100% - 72px)' }}>
        <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card
            title="导入词库"
            style={{
              borderRadius: 20,
              background: 'rgba(255,255,255,0.72)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: '0 10px 32px rgba(15, 23, 42, 0.05)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input
                value={bookName}
                onChange={(event) => setBookName(event.target.value)}
                placeholder="词书名称（可选，默认取文件名）"
              />
              <TextArea
                value={bookDescription}
                onChange={(event) => setBookDescription(event.target.value)}
                placeholder="词书说明（可选）"
                autoSize={{ minRows: 3, maxRows: 5 }}
              />
              <Upload.Dragger
                accept=".csv,.xlsx"
                multiple={false}
                beforeUpload={() => false}
                fileList={fileList}
                onChange={({ fileList: nextFileList }) => setFileList(nextFileList.slice(-1))}
                style={{ background: 'rgba(248, 250, 252, 0.88)', borderRadius: 16 }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ color: '#6366f1' }} />
                </p>
                <p className="ant-upload-text">拖入或点击选择词库文件</p>
                <p className="ant-upload-hint">支持 CSV / XLSX，至少包含 `word` 和 `explanation` 两列。</p>
              </Upload.Dragger>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={importing}
                onClick={handleImport}
                style={{ height: 44, fontWeight: 600 }}
              >
                开始导入
              </Button>
            </div>
          </Card>

          <Card
            title={`我的词书 ${books.length ? `(${books.length})` : ''}`}
            style={{
              flex: 1,
              borderRadius: 20,
              background: 'rgba(255,255,255,0.72)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: '0 10px 32px rgba(15, 23, 42, 0.05)',
            }}
            bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 360 }}
          >
            {loadingBooks ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 220 }}>
                <Spin size="large" />
              </div>
            ) : books.length === 0 ? (
              <Empty
                description="还没有导入任何词书"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ margin: '48px 0' }}
              />
            ) : (
              books.map((book) => {
                const isActive = activeBookId === book.id;
                const completionPercent = book.wordCount
                  ? Math.round((book.learnedCount / book.wordCount) * 100)
                  : 0;

                return (
                  <div
                    key={book.id}
                    onClick={() => navigate(`/custom-books/${book.id}`)}
                    style={{
                      padding: 16,
                      borderRadius: 16,
                      cursor: 'pointer',
                      background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'rgba(248, 250, 252, 0.94)',
                      border: isActive ? '1px solid rgba(99, 102, 241, 0.28)' : '1px solid rgba(226, 232, 240, 0.9)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <BookOutlined style={{ color: '#6366f1' }} />
                          <Text strong style={{ fontSize: 15, color: '#1f2937' }}>
                            {book.name}
                          </Text>
                        </div>
                        <Paragraph
                          ellipsis={{ rows: 2, tooltip: book.description }}
                          style={{ marginBottom: 12, color: '#64748b', fontSize: 13 }}
                        >
                          {book.description || '未填写词书说明'}
                        </Paragraph>
                      </div>
                      <Popconfirm
                        title="删除这本词书？"
                        description="删除后该词书及其独立进度会一并移除。"
                        okText="删除"
                        cancelText="取消"
                        onConfirm={(event) => {
                          event?.stopPropagation?.();
                          void handleDeleteBook(book.id);
                        }}
                      >
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Popconfirm>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <Tag color="blue">{book.groupCount} 个分组</Tag>
                      <Tag color="purple">{book.wordCount} 个单词</Tag>
                      <Tag color="green">{book.masteredCount} 已掌握</Tag>
                    </div>

                    <Progress
                      percent={completionPercent}
                      showInfo={false}
                      strokeColor="#6366f1"
                      trailColor="rgba(99, 102, 241, 0.12)"
                      strokeWidth={8}
                    />
                  </div>
                );
              })
            )}
          </Card>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Card
            style={{
              height: '100%',
              borderRadius: 24,
              background: 'rgba(255,255,255,0.72)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.05)',
            }}
            bodyStyle={{ height: '100%', padding: 24 }}
          >
            {loadingDetail ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
                <Spin size="large" />
              </div>
            ) : !selectedBook ? (
              <Empty
                description={books.length ? '请选择一本自定义词书' : '导入后，这里会展示分组与学习进度'}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ marginTop: 120 }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
                <div
                  style={{
                    padding: 24,
                    borderRadius: 20,
                    background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.92), rgba(59, 130, 246, 0.82))',
                    color: '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <Title level={3} style={{ marginBottom: 8, color: '#fff' }}>
                        {selectedBook.name}
                      </Title>
                      <Paragraph style={{ color: 'rgba(255,255,255,0.82)', marginBottom: 12 }}>
                        {selectedBook.description || '这本词书还没有额外说明。'}
                      </Paragraph>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Tag color="cyan">{selectedBook.source_format?.toUpperCase() || 'FILE'}</Tag>
                        <Tag color="gold">{selectedBook.groupCount} 个分组</Tag>
                        <Tag color="lime">{selectedBook.wordCount} 个单词</Tag>
                      </div>
                    </div>
                    <div style={{ minWidth: 220 }}>
                      <Text style={{ display: 'block', color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>
                        当前整体进度
                      </Text>
                      <Progress
                        percent={selectedBook.wordCount ? Math.round((selectedBook.learnedCount / selectedBook.wordCount) * 100) : 0}
                        strokeColor="#ffffff"
                        trailColor="rgba(255,255,255,0.18)"
                        format={(percent) => `${percent}%`}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                  {[
                    { label: '已学习', value: selectedBook.learnedCount, color: '#2563eb' },
                    { label: '学习中', value: selectedBook.learningCount, color: '#d97706' },
                    { label: '已掌握', value: selectedBook.masteredCount, color: '#059669' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        padding: '18px 20px',
                        borderRadius: 18,
                        background: 'rgba(248,250,252,0.9)',
                        border: '1px solid rgba(226,232,240,0.9)',
                      }}
                    >
                      <Text style={{ display: 'block', color: '#64748b', marginBottom: 8 }}>{item.label}</Text>
                      <div style={{ fontSize: 28, fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <div>
                    <Title level={4} style={{ marginBottom: 4, color: '#0f172a' }}>
                      分组目录
                    </Title>
                    <Text style={{ color: '#64748b' }}>
                      每个分组独立学习，自定义词书进度不会并入正式课程。
                    </Text>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4 }}>
                  {selectedBook.groups?.length ? (
                    selectedBook.groups.map((group) => {
                      const groupStatus = group.isCompleted
                        ? 'completed'
                        : group.learnedCount > 0
                          ? 'progress'
                          : 'idle';

                      return (
                        <div
                          key={group.id}
                          style={{
                            padding: 18,
                            borderRadius: 18,
                            border: '1px solid rgba(226, 232, 240, 0.9)',
                            background: 'rgba(255,255,255,0.94)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 14 }}>
                            <div>
                              <Text strong style={{ fontSize: 16, color: '#1f2937' }}>
                                {group.group_name}
                              </Text>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                <Tag color={statusColorMap[groupStatus]}>{group.isCompleted ? '已完成' : group.learnedCount > 0 ? '进行中' : '未开始'}</Tag>
                                <Tag color="blue">{group.wordCount} 词</Tag>
                                <Tag color="green">{group.masteredCount} 已掌握</Tag>
                              </div>
                            </div>
                            <Button
                              type="primary"
                              icon={<ArrowRightOutlined />}
                              onClick={() => navigate(`/custom-books/${selectedBook.id}/groups/${group.id}/learn`)}
                            >
                              进入学习
                            </Button>
                          </div>

                          <Progress
                            percent={Number(group.progressPercent || 0)}
                            strokeColor="#6366f1"
                            trailColor="rgba(99, 102, 241, 0.12)"
                          />

                          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10, color: '#64748b', fontSize: 13 }}>
                            <span>已学习 {group.learnedCount}/{group.wordCount}</span>
                            <span>学习中 {group.learningCount}</span>
                            <span>已掌握 {group.masteredCount}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <Empty description="这本词书还没有可用分组" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
      )}
    </motion.div>
  );
};

export default CustomBooks;
