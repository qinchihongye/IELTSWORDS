import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Form, Input, List, Space, Typography, message, Modal } from 'antd';
import {
  SearchOutlined,
  SaveOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  BookOutlined,
  EditOutlined
} from '@ant-design/icons';
import apiClient from '../api/client';

const { Title, Text } = Typography;

const AdminContent = () => {
  const [keyword, setKeyword] = useState('');
  const [words, setWords] = useState([]);
  const [selectedWord, setSelectedWord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

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
      if (!selectedWord && response.data.length > 0) {
        setSelectedWord(response.data[0]);
        form.setFieldsValue(response.data[0]);
      }
    } catch (error) {
      console.error('搜索单词失败:', error);
    } finally {
      setLoading(false);
    }
  }, [form, keyword, selectedWord]);

  useEffect(() => {
    void fetchWords('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (word) => {
    setSelectedWord(word);
    form.setFieldsValue(word);
  };

  // Triggers when form validation passes
  const handleSubmitAttempt = (values) => {
    setPendingValues(values);
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
        <Card className="admin-content-card list-card shadow-glass">
          <div className="search-bar-wrap">
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
        </Card>

        {/* Right Editor Form Card */}
        <Card className="admin-content-card editor-card shadow-glass">
          {selectedWord ? (
            <Form form={form} layout="vertical" onFinish={handleSubmitAttempt}>
              <div className="editor-title-wrap">
                <div className="editor-title-badge">
                  <EditOutlined /> 实时内容编辑器
                </div>
                <Title level={3} style={{ margin: '8px 0 2px 0', fontWeight: 800, color: '#1e293b' }}>
                  {selectedWord.word}
                </Title>
                <Text type="secondary" style={{ fontSize: '13px' }}>
                  隶属章节：<Text strong>{selectedWord.chapterName}</Text> • 主题：<Text strong>{selectedWord.groupTheme}</Text>
                </Text>
              </div>

              <div className="editor-form-scrollbox">
                <Form.Item
                  label={<span className="field-label-bold">词义解释 (Explanation)</span>}
                  name="explanation"
                  rules={[{ required: true, message: '请输入词义释义' }]}
                >
                  <Input.TextArea rows={3} placeholder="例: n. 万华镜，万花筒" className="input-field-glass" />
                </Form.Item>

                <Form.Item
                  label={<span className="field-label-bold">英文例句 (English Sentence)</span>}
                  name="exampleSentence"
                >
                  <Input.TextArea rows={3} placeholder="例: The kaleidoscope reveals beautiful patterns." className="input-field-glass" />
                </Form.Item>

                <Form.Item
                  label={<span className="field-label-bold">例句中文对照 (Sentence Meaning)</span>}
                  name="sentenceMeaning"
                >
                  <Input.TextArea rows={2} placeholder="例: 万花筒呈现出美丽的图案。" className="input-field-glass" />
                </Form.Item>

                <Form.Item
                  label={<span className="field-label-bold">记忆卡片备注 / 考点拓展 (Word Note)</span>}
                  name="word_note"
                >
                  <Input.TextArea rows={2} placeholder="例: 雅思核心高频考词，常与 optics / physics 搭配" className="input-field-glass" />
                </Form.Item>

                <div className="phonetic-grid">
                  <Form.Item
                    label={<span className="field-label-bold">英式音标 [UK]</span>}
                    name="phonetics_uk"
                  >
                    <Input placeholder="例: /kəˈlaɪdəsɡəʊp/" className="input-field-glass" />
                  </Form.Item>

                  <Form.Item
                    label={<span className="field-label-bold">美式音标 [US]</span>}
                    name="phonetics_us"
                  >
                    <Input placeholder="例: /kəˈlaɪdəˌskoʊp/" className="input-field-glass" />
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
              <BookOutlined className="placeholder-icon-spin" />
              <Title level={4} style={{ margin: '16px 0 8px 0', color: '#64748b' }}>
                暂未选择词条
              </Title>
              <Text type="secondary">
                请在左侧词库列表中选择一个单词，以载入其完整的释义、例句与音标数据进行维护。
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
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.admin-content-card {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(226, 232, 240, 0.8);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.02);
  overflow: hidden;
}

.admin-content-card .ant-card-body {
  padding: 24px;
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
  max-height: 600px;
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

.input-field-glass.ant-input {
  background: rgba(248, 250, 252, 0.7);
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  transition: all 0.2s ease;
}

.input-field-glass.ant-input:focus {
  background: #fff;
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
}

.editor-form-scrollbox {
  max-height: 520px;
  overflow-y: auto;
  padding-right: 6px;
  margin-bottom: 20px;
}

.editor-form-scrollbox::-webkit-scrollbar {
  width: 5px;
}
.editor-form-scrollbox::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.25);
  border-radius: 99px;
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
}

.placeholder-icon-spin {
  font-size: 48px;
  color: #94a3b8;
  animation: placeHolderPulse 3s infinite alternate;
}

@keyframes placeHolderPulse {
  0% { transform: scale(1) rotate(0deg); opacity: 0.7; }
  100% { transform: scale(1.08) rotate(5deg); opacity: 1; }
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
