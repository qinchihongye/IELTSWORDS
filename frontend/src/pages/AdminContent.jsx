import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Button, Card, Form, Input, List, Space, Typography, message, Modal, Tabs, Collapse, Badge, Spin } from 'antd';
import {
  SearchOutlined,
  SaveOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  BookOutlined,
  EditOutlined,
  ArrowLeftOutlined,
  RightOutlined,
  VerticalAlignTopOutlined,
  BulbOutlined,
  SoundOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  HighlightOutlined,
  BranchesOutlined,
  MinusCircleOutlined,
  PlusOutlined
} from '@ant-design/icons';
import apiClient from '../api/client';
import { formatChapterTitle, sortGroupsByGroupId } from '../utils/learning';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

// JSON parsing helpers for list fields
const parseRootsAffixes = (str) => {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    const lines = str.split('\n').filter(Boolean);
    return lines.map(line => {
      const match = line.trim().match(/^(.+?)[（(](.+?)[）)]$|^(.*?)\s*[:|-]\s*(.*)$/);
      if (match) {
        if (match[1]) {
          return { key: match[1].trim(), value: match[2].trim() };
        } else {
          return { key: match[3].trim(), value: match[4].trim() };
        }
      }
      return { key: '', value: line.trim() };
    });
  }
};

const parseDerivatives = (str) => {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    const lines = (str.includes('\n') 
      ? str.split('\n') 
      : str.split(/[,;]\s*(?=[a-zA-Z-]+\s*\|)/)
    ).filter(Boolean);
    
    return lines.map(line => {
      const parts = line.split('|');
      if (parts.length < 2) {
        const match = line.trim().match(/^(.+?)[（(](.+?)[）)]$|^(.*?)\s*[:|-]\s*(.*)$/);
        if (match) {
          if (match[1]) return { key: match[1].trim(), value: match[2].trim() };
          return { key: match[3].trim(), value: match[4].trim() };
        }
        return { key: '', value: line.trim() };
      }
      return { key: parts[0].trim(), value: parts.slice(1).join('|').trim() };
    });
  }
};

const stringifyJsonField = (arr) => {
  if (!arr || !arr.length) return '';
  return JSON.stringify(arr);
};

const AdminContent = () => {
  const [keyword, setKeyword] = useState('');
  const [words, setWords] = useState([]);
  const [selectedWord, setSelectedWord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Directory Search states
  const [searchMode, setSearchMode] = useState('directory'); // 'keyword' | 'directory'
  const [chapters, setChapters] = useState([]);
  const [chapterGroups, setChapterGroups] = useState({});
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupWords, setGroupWords] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [loadingPanel, setLoadingPanel] = useState(null);
  const groupListRefs = useRef({});

  // Password verification states
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [verifying, setVerifying] = useState(false);

  const fetchWords = useCallback(async (nextKeyword = keyword) => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/admin/words', {
        params: { keyword: nextKeyword || undefined, limit: 60 },
      });
      setWords(response.data);
    } catch (error) {
      console.error('搜索单词失败:', error);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    void fetchWords('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchMode === 'directory' && chapters.length === 0) {
      const loadChapters = async () => {
        setLoadingDirectory(true);
        try {
          const res = await apiClient.get('/api/chapters');
          setChapters(res.data);
        } catch (error) {
          message.error('加载章节目录失败');
        } finally {
          setLoadingDirectory(false);
        }
      };
      void loadChapters();
    }
  }, [searchMode, chapters.length]);

  const handleExpandChapter = async (keys) => {
    setExpandedKeys(keys);
    const activeKey = keys.length > 0 ? keys[0] : null;

    const scrollToPanel = () => {
      if (activeKey) {
        setTimeout(() => {
          const panelElement = document.getElementById(`chapter-panel-${activeKey}`);
          const container = panelElement?.closest('.admin-word-list');
          if (panelElement && container) {
            const containerRect = container.getBoundingClientRect();
            const panelRect = panelElement.getBoundingClientRect();
            const relativeTop = Math.max(0, panelRect.top - containerRect.top + container.scrollTop - 12);
            container.scrollTo({
              top: relativeTop,
              behavior: 'smooth'
            });
          }
        }, 300);
      }
    };

    const newKey = keys.find(k => !chapterGroups[k]);
    if (newKey) {
      setLoadingPanel(newKey);
      try {
        const res = await apiClient.get(`/api/chapters/${newKey}/groups`);
        const sorted = sortGroupsByGroupId(res.data);
        setChapterGroups(prev => ({ ...prev, [newKey]: sorted }));
        scrollToPanel();
      } catch (error) {
        message.error('加载分组失败');
      } finally {
        setLoadingPanel(null);
      }
    } else {
      scrollToPanel();
    }
  };

  const handleGroupSelect = async (chapterNo, group) => {
    setActiveGroup({ chapterNo, ...group });
    setLoadingDirectory(true);
    try {
      const res = await apiClient.get(`/api/groups/${group.groupId}/words?detail=true&chapter_no=${chapterNo}`);
      setGroupWords(res.data);
    } catch (error) {
      message.error('加载分组单词失败');
    } finally {
      setLoadingDirectory(false);
    }
  };

  const handleSelect = (word) => {
    setSelectedWord(word);
    form.setFieldsValue({
      ...word,
      roots_affixes: parseRootsAffixes(word.roots_affixes),
      derivatives: parseDerivatives(word.derivatives)
    });
  };

  // Triggers when form validation passes
  const handleSubmitAttempt = (values) => {
    const processedValues = {
      ...values,
      roots_affixes: stringifyJsonField(values.roots_affixes),
      derivatives: stringifyJsonField(values.derivatives)
    };
    setPendingValues(processedValues);
    setAdminPassword('');
    setPasswordModalOpen(true);
  };

  // Executes the secure save after password verification
  const handleVerifyAndSave = async () => {
    if (!adminPassword.trim()) {
      message.warning('请输入超级管理员密码以继续');
      return;
    }
    setVerifying(true);
    setSaving(true);
    try {
      const payload = {
        ...pendingValues,
        password: adminPassword
      };
      const response = await apiClient.patch(`/api/admin/words/${selectedWord.id}`, payload);
      setSelectedWord(response.data);
      setWords((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      message.success('超级管理员密码验证成功，内容已保存');
      setPasswordModalOpen(false);
      setPendingValues(null);
      setAdminPassword('');
    } catch (error) {
      console.error('保存单词失败:', error);
      const errorMsg = error.response?.data?.detail || '超级管理员密码验证失败，请重试';
      message.error(errorMsg);
    } finally {
      setVerifying(false);
      setSaving(false);
    }
  };

  return (
    <div className="admin-content-page">
      <style>{css}</style>
      <div className="admin-content-grid">
        {/* Left Search List Card */}
        <Card className="admin-content-card list-card shadow-glass" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', height: '100%' } }}>
          <Tabs
            activeKey={searchMode}
            onChange={(key) => setSearchMode(key)}
            items={[
              { key: 'directory', label: '目录检索' },
              { key: 'keyword', label: '关键词搜索' }
            ]}
            style={{ flexShrink: 0, marginBottom: 8 }}
          />

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} className="custom-scroll">
            {searchMode === 'keyword' && (
              <>
                <div className="search-bar-wrap" style={{ marginBottom: 16 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      onPressEnter={() => fetchWords(keyword)}
                      placeholder="搜索单词、释义、章节..."
                      className="search-input-glass"
                    />
                    <Button
                      type="primary"
                      icon={<SearchOutlined />}
                      onClick={() => fetchWords(keyword)}
                      className="search-btn-glass"
                    >
                      搜索
                    </Button>
                  </Space.Compact>
                </div>
                
                <List
                  loading={loading}
                  dataSource={words}
                  className="admin-word-list"
                  renderItem={(word) => {
                    const active = selectedWord?.id === word.id;
                    return (
                      <List.Item
                        className={`word-list-item-glass ${active ? 'is-selected' : ''}`}
                        onClick={() => handleSelect(word)}
                      >
                        <div className="item-left-decorator" />
                        <List.Item.Meta
                          title={
                            <div className="word-meta-title">
                              <span className="word-text-bold">{word.word}</span>
                              <span className="word-no-badge">#{word.wordNo}</span>
                            </div>
                          }
                          description={
                            <span className="word-chapter-desc">
                              {word.chapterName} · {word.groupTheme}
                            </span>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              </>
            )}

            {searchMode === 'directory' && (
              <div className="admin-directory-pane">
                {activeGroup ? (
                  <div className="admin-directory-group-view">
                    <div className="admin-directory-header-glass">
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                        <Button 
                          type="text" 
                          icon={<ArrowLeftOutlined />} 
                          onClick={() => setActiveGroup(null)}
                          className="admin-back-btn"
                        >
                          返回章节目录
                        </Button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <Text style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', lineHeight: 1.2 }}>
                          {activeGroup.groupId}
                        </Text>
                      </div>
                      <Text type="secondary" style={{ display: 'block', fontSize: 13, marginTop: 4, color: '#64748b' }}>
                        {activeGroup.groupTheme}
                      </Text>
                    </div>
                    
                    <List
                      loading={loadingDirectory}
                      dataSource={groupWords}
                      className="admin-word-list"
                      renderItem={(word) => {
                        const active = selectedWord?.id === word.id;
                        return (
                          <List.Item
                            className={`word-list-item-glass ${active ? 'is-selected' : ''}`}
                            onClick={() => handleSelect(word)}
                          >
                            <div className="item-left-decorator" />
                            <List.Item.Meta
                              title={
                                <div className="word-meta-title">
                                  <span className="word-text-bold">{word.word}</span>
                                  <span className="word-no-badge">#{word.wordNo}</span>
                                </div>
                              }
                              description={
                                <span className="word-chapter-desc">
                                  {word.explanation}
                                </span>
                              }
                            />
                          </List.Item>
                        );
                      }}
                    />
                  </div>
                ) : (
                  loadingDirectory ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
                  ) : (
                    <div className="admin-word-list" style={{ height: '570px', overflowY: 'auto' }}>
                      <Collapse 
                        accordion
                        ghost 
                        activeKey={expandedKeys} 
                        onChange={handleExpandChapter}
                        expandIcon={({ isActive }) => <RightOutlined rotate={isActive ? 90 : 0} style={{ color: '#9ca3af' }}/>}
                      >
                        {chapters.map(chapter => (
                          <Collapse.Panel 
                            key={String(chapter.chapterNo)} 
                            header={
                            <div id={`chapter-panel-${chapter.chapterNo}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                              <Text strong style={{ color: '#1f2937', fontSize: 14 }}>{formatChapterTitle(chapter.chapterNo, chapter.chapterName)}</Text>
                                <Badge count={chapter.groupCount} style={{ backgroundColor: 'rgba(17, 24, 39, 0.05)', color: '#4b5563', boxShadow: 'none' }} />
                              </div>
                            }
                          >
                            {loadingPanel === String(chapter.chapterNo) ? (
                              <div style={{ textAlign: 'center', padding: 12 }}><Spin size="small" /></div>
                            ) : (
                              <div style={{ 
                                border: '2px dashed rgba(156, 163, 175, 0.3)',
                                borderRadius: '16px',
                                background: 'rgba(255, 255, 255, 0.4)',
                                overflow: 'hidden',
                                position: 'relative'
                              }}>
                                <div 
                                  ref={el => { groupListRefs.current[chapter.chapterNo] = el; }}
                                  style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '174px', overflowY: 'auto', padding: '8px' }}
                                  className="custom-scroll"
                                >
                                  {(chapterGroups[chapter.chapterNo] || []).map(group => (
                                    <div 
                                      key={group.groupId}
                                      className="admin-directory-group-item"
                                      onClick={() => handleGroupSelect(chapter.chapterNo, group)}
                                    >
                                      <div>
                                        <div className="admin-group-id">{group.groupId}</div>
                                        <div className="admin-group-theme">{group.groupTheme}</div>
                                      </div>
                                      <Text type="secondary" style={{ fontSize: 12 }}>{group.wordCount} 词</Text>
                                    </div>
                                  ))}
                                </div>
                                {/* Back-to-top arrow */}
                                {(chapterGroups[chapter.chapterNo] || []).length > 3 && (
                                  <div
                                    style={{
                                      position: 'sticky',
                                      bottom: 0,
                                      display: 'flex',
                                      justifyContent: 'center',
                                      paddingTop: 4,
                                      paddingBottom: 6,
                                      background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.85) 60%)',
                                      pointerEvents: 'none'
                                    }}
                                  >
                                    <button
                                      title="回到第一个 Group"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const el = groupListRefs.current[chapter.chapterNo];
                                        if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
                                      }}
                                      style={{
                                        pointerEvents: 'auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '3px 12px',
                                        borderRadius: 20,
                                        border: '1px solid rgba(209, 213, 219, 0.6)',
                                        background: 'rgba(255,255,255,0.9)',
                                        color: '#4b5563',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(243,244,246,1)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; }}
                                    >
                                      <VerticalAlignTopOutlined style={{ fontSize: 13 }} />
                                      <span>回顶</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </Collapse.Panel>
                        ))}
                      </Collapse>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Right Editor Form Card */}
        <Card className="admin-content-card editor-card shadow-glass">
          {selectedWord ? (
            <Form form={form} layout="vertical" onFinish={handleSubmitAttempt}>
              {searchMode !== 'directory' && (
                <div className="editor-title-wrap">
                  <div className="editor-header-flashcard">
                    <div className="editor-header-top">
                      <div className="editor-title-badge">
                        <EditOutlined /> 修改内容
                      </div>
                    </div>
                    <div className="editor-word-display-row">
                      <div className="editor-word-display">
                        {selectedWord.word}
                      </div>
                      <div className="editor-tags-row">
                        <span className="editor-glass-tag">🔖 {selectedWord.chapterName}</span>
                        <span className="editor-glass-tag">🎯 {selectedWord.groupTheme}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="editor-form-scrollbox">
                {/* Bento Module A1: Core Explanation */}
                <div className="bento-module-title" style={{ top: '0px' }}>
                  <BookOutlined style={{ color: '#6366f1' }} /> 核心释义
                </div>
                <div className="bento-module-content-card">
                  <Form.Item
                    name="explanation"
                    rules={[{ required: true, message: '请输入词义释义' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input.TextArea rows={3} placeholder="词义解释 (例: n. 万华镜，万花筒)" className="input-field-glass" />
                  </Form.Item>
                </div>

                {/* Bento Module A2: Roots & Affixes */}
                <div className="bento-module-title" style={{ top: '46px', background: 'rgba(239, 246, 255, 0.95)', borderColor: 'rgba(191, 219, 254, 0.8)', color: '#2563eb' }}>
                  <NodeIndexOutlined /> 词根词缀
                </div>
                <div className="bento-module-content-card" style={{ background: 'rgba(239, 246, 255, 0.4)', borderColor: 'rgba(191, 219, 254, 0.8)', borderTop: 'none' }}>
                  <Form.List name="roots_affixes">
                    {(fields, { add, remove }) => (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {fields.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, paddingRight: 24, paddingLeft: 4, fontSize: '12px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: 2 }}>
                            <div style={{ flex: 1 }}>词根</div>
                            <div style={{ flex: 2 }}>释义</div>
                          </div>
                        )}
                        {fields.map(({ key, name, ...restField }) => (
                          <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Form.Item
                              {...restField}
                              name={[name, 'key']}
                              style={{ marginBottom: 0, flex: 1 }}
                            >
                              <Input placeholder="词根" className="input-field-glass table-input-blue" />
                            </Form.Item>
                            <Form.Item
                              {...restField}
                              name={[name, 'value']}
                              style={{ marginBottom: 0, flex: 2 }}
                            >
                              <Input placeholder="含义 (例: 空气)" className="input-field-glass table-input-blue" />
                            </Form.Item>
                            <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#94a3b8', fontSize: 16, cursor: 'pointer' }} />
                          </div>
                        ))}
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ borderColor: 'rgba(59, 130, 246, 0.4)', color: '#3b82f6', borderRadius: 10, background: 'transparent' }}>
                          添加词根
                        </Button>
                      </div>
                    )}
                  </Form.List>
                </div>

                {/* Bento Module A3: Derivatives */}
                <div className="bento-module-title" style={{ top: '92px', background: 'rgba(240, 253, 244, 0.95)', borderColor: 'rgba(187, 247, 208, 0.8)', color: '#16a34a' }}>
                  <BranchesOutlined /> 派生词汇
                </div>
                <div className="bento-module-content-card" style={{ background: 'rgba(240, 253, 244, 0.4)', borderColor: 'rgba(187, 247, 208, 0.8)', borderTop: 'none' }}>
                  <Form.List name="derivatives">
                    {(fields, { add, remove }) => (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {fields.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, paddingRight: 24, paddingLeft: 4, fontSize: '12px', fontWeight: 'bold', color: '#14532d', marginBottom: 2 }}>
                            <div style={{ flex: 1 }}>派生词</div>
                            <div style={{ flex: 2 }}>释义</div>
                          </div>
                        )}
                        {fields.map(({ key, name, ...restField }) => (
                          <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Form.Item
                              {...restField}
                              name={[name, 'key']}
                              style={{ marginBottom: 0, flex: 1 }}
                            >
                              <Input placeholder="派生词" className="input-field-glass table-input-green" />
                            </Form.Item>
                            <Form.Item
                              {...restField}
                              name={[name, 'value']}
                              style={{ marginBottom: 0, flex: 2 }}
                            >
                              <Input placeholder="含义 (例: 大气的)" className="input-field-glass table-input-green" />
                            </Form.Item>
                            <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#94a3b8', fontSize: 16, cursor: 'pointer' }} />
                          </div>
                        ))}
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ borderColor: 'rgba(34, 197, 94, 0.4)', color: '#22c55e', borderRadius: 10, background: 'transparent' }}>
                          添加派生词
                        </Button>
                      </div>
                    )}
                  </Form.List>
                </div>

                {/* Bento Module A4: Word Note */}
                <div className="bento-module-title" style={{ top: '138px' }}>
                  <HighlightOutlined style={{ color: '#f59e0b' }} /> 单词备注
                </div>
                <div className="bento-module-content-card">
                  <Form.Item
                    name="word_note"
                    style={{ marginBottom: 0 }}
                  >
                    <Input.TextArea rows={3} placeholder="记忆卡片备注 / 考点拓展 (例: 雅思核心高频考词)" className="input-field-glass" />
                  </Form.Item>
                </div>

                {/* Bento Module B: Phonetics */}
                <div className="bento-module-title" style={{ top: '184px' }}>
                  <SoundOutlined style={{ color: '#8b5cf6' }} /> 发音区块
                </div>
                <div className="bento-module-content-card">
                  <div className="phonetic-grid">
                    <Form.Item
                      name="phonetics_uk"
                      style={{ marginBottom: 0 }}
                    >
                      <Input prefix={<span style={{ marginRight: 6 }}>🇬🇧</span>} placeholder="英式音标 [UK]" className="input-field-glass" />
                    </Form.Item>
                    <Form.Item
                      name="phonetics_us"
                      style={{ marginBottom: 0 }}
                    >
                      <Input prefix={<span style={{ marginRight: 6 }}>🇺🇸</span>} placeholder="美式音标 [US]" className="input-field-glass" />
                    </Form.Item>
                  </div>
                </div>

                {/* Bento Module C: Context & Example */}
                <div className="bento-module-title" style={{ top: '230px', background: 'rgba(240, 249, 255, 0.95)', borderColor: 'rgba(191, 219, 254, 0.8)' }}>
                  <MessageOutlined style={{ color: '#3b82f6' }} /> 语境与例句
                </div>
                <div className="bento-module-content-card module-context" style={{ background: 'rgba(240, 249, 255, 0.4)', borderColor: 'rgba(191, 219, 254, 0.8)', borderTop: 'none' }}>
                  <Form.Item
                    name="exampleSentence"
                    style={{ marginBottom: 12 }}
                  >
                    <Input.TextArea rows={3} placeholder="英文例句 (例: The kaleidoscope reveals beautiful patterns.)" className="input-field-glass" />
                  </Form.Item>
                  <Form.Item
                    name="sentenceMeaning"
                    style={{ marginBottom: 0 }}
                  >
                    <Input.TextArea rows={2} placeholder="例句中文对照 (例: 万花筒呈现出美丽的图案。)" className="input-field-glass" />
                  </Form.Item>
                </div>
              </div>

              <div className="editor-footer-actions">
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  size="large"
                  className="save-action-btn-glass"
                  loading={saving}
                >
                  保存修改内容
                </Button>
              </div>
            </Form>
          ) : (
            <div className="editor-placeholder-shell">
              <motion.div 
                animate={{ y: [0, -15, 0] }} 
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="placeholder-illustration"
              >
                <div className="placeholder-glow-orb"></div>
                <BulbOutlined className="placeholder-icon-premium" />
              </motion.div>
              <Title level={3} style={{ margin: '24px 0 12px 0', color: '#334155', fontWeight: 800 }}>
                修改内容
              </Title>
              <Text style={{ color: '#64748b', fontSize: 15, maxWidth: 300, display: 'inline-block' }}>
                在左侧词库中选择任意词汇，即刻在此工作台为您展现完整的语义世界。
              </Text>
            </div>
          )}
        </Card>
      </div>

      {/* Super Admin Security Password Verification Modal */}
      <Modal
        title={
          <div className="security-modal-title">
            <SafetyCertificateOutlined className="shield-icon-pulse" />
            <span>超级管理员安全身份验证</span>
          </div>
        }
        open={passwordModalOpen}
        onOk={handleVerifyAndSave}
        onCancel={() => {
          setPasswordModalOpen(false);
          setPendingValues(null);
          setAdminPassword('');
        }}
        confirmLoading={verifying}
        okText="验证密码并保存"
        cancelText="取消"
        className="premium-security-modal"
        okButtonProps={{
          size: 'large',
          style: {
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            border: 'none',
            fontWeight: '600'
          }
        }}
        cancelButtonProps={{
          size: 'large',
          style: { borderRadius: '10px' }
        }}
        width={400}
        destroyOnClose
      >
        <div className="security-modal-body">
          <div className="password-input-wrap" style={{ paddingTop: '8px' }}>
            <Text style={{ display: 'block', marginBottom: 12, fontWeight: 600, color: '#334155', fontSize: '14px' }}>
              请输入超级管理员安全密码以确认保存修改：
            </Text>
            <Input.Password
              prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="输入你的超级管理员账户密码..."
              onPressEnter={handleVerifyAndSave}
              className="security-password-field"
              size="large"
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

const css = `
.admin-content-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1280px;
  margin: 0 auto;
  padding-bottom: 40px;
}

.content-manager-header {
  padding: 8px 0;
}

.admin-content-grid {
  display: grid;
  grid-template-columns: 380px minmax(0, 720px);
  justify-content: center;
  gap: 32px;
  align-items: start;
}

.admin-content-card {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(226, 232, 240, 0.8);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.02);
  overflow: hidden;
  height: 720px;
}

.admin-content-card .ant-card-body {
  padding: 24px;
}

.editor-card .ant-card-body {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-card form {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* Left List layout */
.search-bar-wrap {
  margin-bottom: 18px;
}

.search-input-glass.ant-input {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid #cbd5e1;
  border-radius: 12px 0 0 12px !important;
  height: 40px;
}

.search-btn-glass.ant-btn {
  height: 40px;
  border-radius: 0 12px 12px 0 !important;
  font-weight: 600;
  background: #6366f1;
}

.admin-word-list {
  height: 570px;
  overflow-y: auto;
  padding-right: 4px;
}

/* Custom Webkit scrollbar for word list */
.admin-word-list::-webkit-scrollbar {
  width: 6px;
}
.admin-word-list::-webkit-scrollbar-track {
  background: transparent;
}
.admin-word-list::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 99px;
}

.word-list-item-glass.ant-list-item {
  position: relative;
  cursor: pointer;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.4);
  margin-bottom: 8px;
  transition: all 0.25s ease;
}

.item-left-decorator {
  position: absolute;
  left: 0;
  top: 15%;
  height: 70%;
  width: 4px;
  background: transparent;
  border-radius: 0 4px 4px 0;
  transition: all 0.25s ease;
}

.word-list-item-glass:hover {
  background: rgba(255, 255, 255, 0.85);
  border-color: rgba(99, 102, 241, 0.15);
  transform: translateX(2px);
}

.word-list-item-glass.is-selected {
  background: rgba(238, 242, 255, 0.9);
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.05);
}

.word-list-item-glass.is-selected .item-left-decorator {
  background: #6366f1;
}

.word-meta-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.word-text-bold {
  font-weight: 700;
  color: #1e293b;
  font-size: 15px;
}

.word-no-badge {
  font-size: 11px;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.08);
  padding: 1px 6px;
  border-radius: 99px;
  font-weight: 600;
  font-family: monospace;
}

.word-chapter-desc {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

/* Right Editor Layout */
.editor-title-wrap {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.editor-title-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #059669;
  background: rgba(16, 185, 129, 0.08);
  padding: 3px 10px;
  border-radius: 99px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.field-label-bold {
  font-weight: 700;
  color: #334155;
  font-size: 13.5px;
}

.input-field-glass {
  border-radius: 8px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(4px);
  transition: all 0.2s ease;
}

.input-field-glass:focus,
.input-field-glass:hover {
  background: #fff;
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.admin-directory-group-item {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  background: rgba(248, 250, 252, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.admin-directory-group-item:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(99, 102, 241, 0.3);
  transform: translateY(-1px);
}
.admin-group-id {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}
.admin-group-theme {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.admin-directory-header-glass {
  background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.85) 100%);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 16px;
  padding: 16px 20px;
  margin-bottom: 16px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  backdrop-filter: blur(8px);
}

.admin-back-btn.ant-btn {
  padding: 4px 12px;
  height: 32px;
  font-weight: 600;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.08);
  border-radius: 10px;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  border: none;
}
.admin-back-btn.ant-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  color: #4f46e5;
  transform: translateY(-1px);
}

/* Bento Module Styles */
.editor-header-flashcard {
  background: linear-gradient(135deg, rgba(238,242,255,0.7) 0%, rgba(248,250,252,0.5) 100%);
  border: 1px solid rgba(199, 210, 254, 0.6);
  border-radius: 20px;
  padding: 24px;
  margin-bottom: 24px;
  position: relative;
  overflow: hidden;
}
.editor-header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.editor-word-display-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.editor-word-display {
  font-size: 32px;
  font-weight: 900;
  color: #1e293b;
  letter-spacing: -0.5px;
  line-height: 1.2;
}
.editor-tags-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.editor-glass-tag {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(226, 232, 240, 0.8);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.bento-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
@media (max-width: 900px) {
  .bento-grid-2 {
    grid-template-columns: 1fr;
  }
}

.table-input-blue.ant-input {
  background: rgba(239, 246, 255, 0.8) !important;
  color: #1e3a8a !important;
  font-weight: 600;
  border-color: rgba(191, 219, 254, 0.6) !important;
}
.table-input-green.ant-input {
  background: rgba(240, 253, 244, 0.8) !important;
  color: #14532d !important;
  font-weight: 600;
  border-color: rgba(187, 247, 208, 0.6) !important;
}

.editor-form-scrollbox {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 12px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
}
.editor-form-scrollbox::-webkit-scrollbar { width: 5px; }
.editor-form-scrollbox::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 99px;
}

.bento-module-card {
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.02);
  transition: all 0.3s ease;
}
.bento-module-card:focus-within {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.06);
}

.bento-module-title {
  position: sticky;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: #334155;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  padding: 12px 20px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
}

.bento-module-content-card {
  padding: 20px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-top: none;
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;
  margin-bottom: 20px;
  transition: all 0.3s ease;
}
.bento-module-content-card:focus-within {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.06);
}

.module-context {
  background: rgba(240, 249, 255, 0.4);
}
.module-context:focus-within {
  background: rgba(240, 249, 255, 0.8);
  border-color: rgba(59, 130, 246, 0.3);
}

.phonetic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.editor-footer-actions {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #e2e8f0;
  padding-top: 20px;
}

.save-action-btn-glass.ant-btn {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  border: none;
  border-radius: 12px;
  font-weight: 700;
  padding: 0 32px;
  height: 48px;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
  transition: all 0.25s ease;
}

.save-action-btn-glass.ant-btn:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.3);
}

/* Editor Placeholder empty state */
.editor-placeholder-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 40px;
  text-align: center;
  background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(248,250,252,0.5) 100%);
  border-radius: 20px;
  height: 100%;
}

.placeholder-illustration {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100px;
  height: 100px;
}
.placeholder-glow-orb {
  position: absolute;
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%);
  filter: blur(20px);
  border-radius: 50%;
  opacity: 0.4;
}
.placeholder-icon-premium {
  font-size: 54px;
  color: #6366f1;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 8px 16px rgba(99,102,241,0.2));
}

/* Super Admin Security Password Verification Modal */
.security-modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 800;
  color: #1e293b;
}

.shield-icon-pulse {
  color: #6366f1;
  font-size: 20px;
  animation: shieldPulse 1.5s infinite alternate;
}

@keyframes shieldPulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  100% { transform: scale(1.1); opacity: 1; }
}

.security-modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0;
}

.security-password-field.ant-input-affix-wrapper {
  border-radius: 10px;
  border-color: #cbd5e1;
}

.security-password-field.ant-input-affix-wrapper:focus-within {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
}

@media (max-width: 900px) {
  .admin-content-grid {
    grid-template-columns: 1fr;
  }
}
`;

export default AdminContent;
