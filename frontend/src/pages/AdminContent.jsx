import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Form, Input, List, Space, Typography, message } from 'antd';
import { SearchOutlined, SaveOutlined } from '@ant-design/icons';
import apiClient from '../api/client';

const { Title, Text } = Typography;

const AdminContent = () => {
  const [keyword, setKeyword] = useState('');
  const [words, setWords] = useState([]);
  const [selectedWord, setSelectedWord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

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

  const handleSave = async (values) => {
    if (!selectedWord) return;
    setSaving(true);
    try {
      const response = await apiClient.patch(`/api/admin/words/${selectedWord.id}`, values);
      setSelectedWord(response.data);
      setWords((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      message.success('内容已保存');
    } catch (error) {
      console.error('保存单词失败:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-content-page">
      <style>{css}</style>
      <div>
        <Title level={2} style={{ margin: 0 }}>内容管理</Title>
        <Text type="secondary">搜索并维护单词释义、例句、音标和备注。</Text>
      </div>

      <div className="admin-content-grid">
        <Card className="admin-content-card">
          <Space.Compact style={{ width: '100%', marginBottom: 14 }}>
            <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索单词、释义、章节" />
            <Button icon={<SearchOutlined />} onClick={() => fetchWords(keyword)}>搜索</Button>
          </Space.Compact>
          <List
            loading={loading}
            dataSource={words}
            className="admin-word-list"
            renderItem={(word) => (
              <List.Item
                className={selectedWord?.id === word.id ? 'is-selected' : ''}
                onClick={() => handleSelect(word)}
              >
                <List.Item.Meta
                  title={`${word.word} · ${word.wordNo}`}
                  description={`${word.chapterName} / ${word.groupTheme}`}
                />
              </List.Item>
            )}
          />
        </Card>

        <Card className="admin-content-card">
          {selectedWord ? (
            <Form form={form} layout="vertical" onFinish={handleSave}>
              <div className="editor-title">
                <Title level={3}>{selectedWord.word}</Title>
                <Text type="secondary">{selectedWord.chapterName} · {selectedWord.groupTheme}</Text>
              </div>
              <Form.Item label="释义" name="explanation"><Input.TextArea rows={3} /></Form.Item>
              <Form.Item label="例句" name="exampleSentence"><Input.TextArea rows={3} /></Form.Item>
              <Form.Item label="例句中文" name="sentenceMeaning"><Input.TextArea rows={2} /></Form.Item>
              <Form.Item label="单词备注" name="word_note"><Input.TextArea rows={2} /></Form.Item>
              <div className="phonetic-grid">
                <Form.Item label="英音" name="phonetics_uk"><Input /></Form.Item>
                <Form.Item label="美音" name="phonetics_us"><Input /></Form.Item>
              </div>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存内容</Button>
            </Form>
          ) : (
            <Text type="secondary">请选择一个单词</Text>
          )}
        </Card>
      </div>
    </div>
  );
};

const css = `
.admin-content-page { display: flex; flex-direction: column; gap: 20px; max-width: 1280px; margin: 0 auto; }
.admin-content-grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 20px; min-height: 620px; }
.admin-content-card { border-radius: 8px; background: rgba(255,255,255,0.74); border: 1px solid rgba(226,232,240,0.82); }
.admin-word-list { max-height: 540px; overflow: auto; }
.admin-word-list .ant-list-item { cursor: pointer; padding: 12px; border-radius: 8px; }
.admin-word-list .ant-list-item:hover, .admin-word-list .ant-list-item.is-selected { background: rgba(99,102,241,0.08); }
.editor-title { margin-bottom: 18px; }
.editor-title h3 { margin: 0; }
.phonetic-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 900px) { .admin-content-grid { grid-template-columns: 1fr; } }
`;

export default AdminContent;
