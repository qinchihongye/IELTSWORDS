import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  BranchesOutlined,
  DeleteOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import apiClient from '../api/client';
import config from '../config/settings';
import { ROLE_COLORS, ROLE_LABELS } from '../utils/roles';

const { Title, Text } = Typography;

const apiBase = config.api.baseURL.replace(/\/$/, '');

const ROLE_LIMIT_OPTIONS = [
  { value: 'premium_user', label: 'VIP专属' },
  { value: 'admin', label: '管理专属' },
  { value: 'super_admin', label: '超管专属' },
];

const ROLE_LIMIT_TAG_LABELS = {
  premium_user: 'VIP专属',
  admin: '管理专属',
  super_admin: '超管专属',
};

const AdminAvatarUnlockRules = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableAvatars, setAvailableAvatars] = useState([]);
  const [availableChapters, setAvailableChapters] = useState([]);
  const [availableVarietyFilter, setAvailableVarietyFilter] = useState();

  const watchedRulesRaw = Form.useWatch('rules', form);
  const watchedRules = useMemo(() => watchedRulesRaw || [], [watchedRulesRaw]);

  const avatarByKey = useMemo(
    () => new Map(availableAvatars.map((item) => [item.key, item])),
    [availableAvatars],
  );

  const varietyOptions = useMemo(() => {
    const uniqueVarieties = Array.from(
      new Set(
        availableAvatars
          .map((item) => String(item.variety || '').trim() || '未分类'),
      ),
    ).sort((a, b) => a.localeCompare(b, 'zh-CN'));

    return uniqueVarieties.map((item) => ({
      value: item,
      label: item,
    }));
  }, [availableAvatars]);

  const chapterByNo = useMemo(
    () => new Map(availableChapters.map((item) => [String(item.chapterNo), item])),
    [availableChapters],
  );

  const assignedAvatarKeys = useMemo(
    () => new Set((watchedRules || []).map((item) => item?.avatar_key).filter(Boolean)),
    [watchedRules],
  );

  const metrics = useMemo(() => {
    const configuredCount = watchedRules.length;
    const configuredVipCount = watchedRules.filter((item) => avatarByKey.get(item?.avatar_key)?.vip_only).length;
    return {
      configuredCount,
      chapterCoverage: `${configuredCount}/${availableChapters.length}`,
      unconfiguredCount: Math.max(availableAvatars.length - configuredCount, 0),
      configuredVipCount,
    };
  }, [availableAvatars.length, availableChapters.length, avatarByKey, watchedRules]);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/admin/avatar-unlock-rules');
      const payload = response.data || {};
      const nextAvailableAvatars = payload.available_avatars || [];
      const avatarVarietyMap = new Map(
        nextAvailableAvatars.map((item) => [item.key, String(item.variety || '').trim() || '未分类']),
      );
      const nextRules = (payload.rules || []).map((item) => ({
        avatar_key: item.avatar_key,
        chapter_no: item.chapter_no,
        min_role: item.min_role || undefined,
        variety_filter: avatarVarietyMap.get(item.avatar_key) || undefined,
      }));
      setAvailableAvatars(nextAvailableAvatars);
      setAvailableChapters(payload.available_chapters || []);
      form.setFieldsValue({ rules: nextRules });
    } catch (error) {
      console.error('获取头像解锁规则失败:', error);
      message.error('获取头像解锁规则失败');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  const avatarSelectOptions = useMemo(
    () => availableAvatars.map((item) => ({
      value: item.key,
      label: `${item.label} · ${item.variety}`,
      variety: item.variety || '未分类',
      searchText: `${item.label} ${item.variety} ${item.key}`.toLowerCase(),
    })),
    [availableAvatars],
  );

  const chapterSelectOptions = useMemo(
    () => availableChapters.map((item) => ({
      value: String(item.chapterNo),
      label: `第 ${item.chapterNo} 章 · ${item.chapterName}`,
    })),
    [availableChapters],
  );

  const handleAddRule = useCallback(() => {
    const nextAvatar = availableAvatars.find((item) => !assignedAvatarKeys.has(item.key));
    const currentRules = form.getFieldValue('rules') || [];
    form.setFieldsValue({
      rules: [
        ...currentRules,
        {
          avatar_key: nextAvatar?.key,
          chapter_no: undefined,
          min_role: undefined,
          variety_filter: nextAvatar?.variety || undefined,
        },
      ],
    });
  }, [assignedAvatarKeys, availableAvatars, form]);

  const getAvatarOptionsForRule = useCallback((currentRule) => {
    const selectedVariety = String(currentRule?.variety_filter || '').trim();

    return avatarSelectOptions
      .filter((option) => !selectedVariety || option.variety === selectedVariety)
      .map((option) => ({
        ...option,
        disabled: option.value !== currentRule?.avatar_key && assignedAvatarKeys.has(option.value),
      }));
  }, [assignedAvatarKeys, avatarSelectOptions]);

  const unconfiguredAvatars = useMemo(
    () => availableAvatars.filter((item) => {
      if (assignedAvatarKeys.has(item.key)) {
        return false;
      }
      if (!availableVarietyFilter) {
        return true;
      }
      return (item.variety || '未分类') === availableVarietyFilter;
    }),
    [assignedAvatarKeys, availableAvatars, availableVarietyFilter],
  );

  const handleSave = useCallback(async () => {
    const rawRules = form.getFieldValue('rules') || [];
    const normalizedRules = rawRules.map((item) => ({
      avatar_key: String(item?.avatar_key || '').trim(),
      chapter_no: String(item?.chapter_no || '').trim(),
      min_role: item?.min_role || undefined,
      unlock_type: 'chapter_completion',
    }));

    if (normalizedRules.some((item) => !item.avatar_key || !item.chapter_no)) {
      message.warning('请先补全所有头像和章节配置');
      return;
    }

    const keySet = new Set();
    for (const item of normalizedRules) {
      if (keySet.has(item.avatar_key)) {
        message.warning(`头像 ${avatarByKey.get(item.avatar_key)?.label || item.avatar_key} 重复配置了`);
        return;
      }
      keySet.add(item.avatar_key);
    }

    setSaving(true);
    try {
      await apiClient.put('/api/admin/avatar-unlock-rules', {
        rules: normalizedRules,
      });
      message.success('头像解锁规则已保存');
      await fetchRules();
    } catch (error) {
      console.error('保存头像解锁规则失败:', error);
      message.error(error?.response?.data?.detail || '保存头像解锁规则失败');
    } finally {
      setSaving(false);
    }
  }, [avatarByKey, fetchRules, form]);

  return (
    <div className="avatar-unlock-rules-page">
      <style>{css}</style>

      <div className="avatar-unlock-rules-header">
        <div>
          <Title level={2} style={{ margin: 0 }}>头像解锁规则</Title>
          <Text type="secondary">预览并编辑章节头像的解锁规则。当前这一期仅支持“完成章节后解锁”。</Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchRules} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            保存规则
          </Button>
        </Space>
      </div>

      <div className="avatar-unlock-rules-metrics">
        <Card className="metric-card">
          <BranchesOutlined />
          <div>
            <Text type="secondary">已配置规则</Text>
            <Title level={3}>{metrics.configuredCount}</Title>
          </div>
        </Card>
        <Card className="metric-card">
          <PictureOutlined />
          <div>
            <Text type="secondary">章节覆盖</Text>
            <Title level={3}>{metrics.chapterCoverage}</Title>
          </div>
        </Card>
        <Card className="metric-card">
          <PictureOutlined />
          <div>
            <Text type="secondary">未纳入规则头像</Text>
            <Title level={3}>{metrics.unconfiguredCount}</Title>
          </div>
        </Card>
        <Card className="metric-card">
          <PictureOutlined />
          <div>
            <Text type="secondary">当前规则中的 VIP 头像</Text>
            <Title level={3}>{metrics.configuredVipCount}</Title>
          </div>
        </Card>
      </div>

      <div className="avatar-unlock-rules-grid">
        <Card className="rule-editor-card" loading={loading}>
          <div className="panel-head">
            <div>
              <Title level={4}>规则编辑</Title>
              <Text type="secondary">每条规则指定头像、章节和开放范围。</Text>
            </div>
            <Button icon={<PlusOutlined />} onClick={handleAddRule}>
              添加规则
            </Button>
          </div>

          <Form form={form} layout="vertical">
            <Form.List name="rules">
              {(fields, { remove }) => (
                <div className="rule-list">
                  {fields.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前还没有配置章节头像规则" />
                  ) : fields.map((field) => {
                    const currentRule = watchedRules[field.name] || {};
                    return (
                      <div className="rule-row" key={field.key}>
                        <div className="rule-row-grid">
                          <Form.Item
                            {...field}
                            label="品种"
                            name={[field.name, 'variety_filter']}
                          >
                            <Select
                              allowClear
                              showSearch
                              placeholder="按品种筛选"
                              optionFilterProp="label"
                              options={varietyOptions}
                              onChange={(nextVariety) => {
                                const currentAvatarKey = form.getFieldValue(['rules', field.name, 'avatar_key']);
                                const currentAvatar = avatarByKey.get(currentAvatarKey);
                                if (nextVariety && currentAvatar && currentAvatar.variety !== nextVariety) {
                                  form.setFieldValue(['rules', field.name, 'avatar_key'], undefined);
                                }
                              }}
                            />
                          </Form.Item>

                          <Form.Item
                            {...field}
                            label="头像"
                            name={[field.name, 'avatar_key']}
                            rules={[{ required: true, message: '请选择头像' }]}
                          >
                            <Select
                              showSearch
                              placeholder="选择头像"
                              optionFilterProp="label"
                              filterOption={(input, option) => (
                                String(option?.searchText || '').includes(String(input || '').toLowerCase())
                              )}
                              options={getAvatarOptionsForRule(currentRule)}
                              onChange={(nextAvatarKey) => {
                                const nextAvatar = avatarByKey.get(nextAvatarKey);
                                if (nextAvatar?.variety) {
                                  form.setFieldValue(['rules', field.name, 'variety_filter'], nextAvatar.variety);
                                }
                              }}
                            />
                          </Form.Item>

                          <Form.Item
                            {...field}
                            label="解锁章节"
                            name={[field.name, 'chapter_no']}
                            rules={[{ required: true, message: '请选择章节' }]}
                          >
                            <Select
                              showSearch
                              placeholder="选择章节"
                              optionFilterProp="label"
                              options={chapterSelectOptions}
                            />
                          </Form.Item>

                          <Form.Item
                            {...field}
                            label="开放范围"
                            name={[field.name, 'min_role']}
                          >
                            <Select
                              allowClear
                              placeholder="全体用户"
                              options={ROLE_LIMIT_OPTIONS}
                            />
                          </Form.Item>

                          <div className="rule-row-action">
                            <Button danger icon={<DeleteOutlined />} onClick={() => remove(field.name)}>
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Form.List>
          </Form>
        </Card>

        <div className="side-panels">
          <Card className="side-card" loading={loading}>
            <div className="panel-head">
              <div>
                <Title level={4}>当前规则预览</Title>
                <Text type="secondary">方便快速核对头像和章节的对应关系。</Text>
              </div>
            </div>
            <div className="compact-rule-list">
              {watchedRules.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无规则" />
              ) : watchedRules.map((item, index) => {
                const avatarItem = avatarByKey.get(item?.avatar_key);
                const chapterItem = chapterByNo.get(String(item?.chapter_no || ''));
                return (
                  <div className="compact-rule-item" key={`${item?.avatar_key || 'rule'}-${index}`}>
                    <div className="compact-rule-avatar">
                      {avatarItem?.url ? (
                        <img src={`${apiBase}${avatarItem.url}`} alt={avatarItem.label} className="rule-avatar-img" />
                      ) : (
                        <div className="rule-avatar-fallback">{avatarItem?.label?.slice(0, 1) || '?'}</div>
                      )}
                    </div>
                    <div className="compact-rule-body">
                      <div className="compact-rule-title">
                        <Text strong ellipsis>{avatarItem?.label || '未选择头像'}</Text>
                        {avatarItem?.vip_only ? <Tag color="gold">VIP</Tag> : null}
                        {item?.min_role ? (
                          <Tag color={ROLE_COLORS[item.min_role] || 'default'}>
                            {ROLE_LIMIT_TAG_LABELS[item.min_role] || ROLE_LABELS[item.min_role] || item.min_role}
                          </Tag>
                        ) : null}
                      </div>
                      <Space wrap size={[6, 6]} className="compact-rule-meta">
                        {avatarItem?.variety ? <Tag>{avatarItem.variety}</Tag> : null}
                        {chapterItem ? <Tag color="blue">第 {chapterItem.chapterNo} 章</Tag> : <Tag>未选章节</Tag>}
                      </Space>
                      <Text type="secondary" className="compact-rule-chapter" ellipsis>
                        {chapterItem?.chapterName || '请先选择章节'}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="side-card" loading={loading}>
            <div className="panel-head">
              <div>
                <Title level={4}>未纳入规则的头像</Title>
                <Text type="secondary">这里只做预览，后续可以继续把它们加入章节解锁或其他阶段。</Text>
              </div>
              <Select
                allowClear
                className="variety-filter-select"
                placeholder="按品种查看"
                optionFilterProp="label"
                options={varietyOptions}
                value={availableVarietyFilter}
                onChange={setAvailableVarietyFilter}
              />
            </div>
            <div className="available-avatar-list">
              {unconfiguredAvatars.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={availableVarietyFilter ? '当前品种下没有未配置头像' : '当前所有头像都已纳入规则'} />
              ) : unconfiguredAvatars
                .map((item) => (
                  <div className="available-avatar-item" key={item.key}>
                    <div className="available-avatar-thumb">
                      <img src={`${apiBase}${item.url}`} alt={item.label} className="rule-avatar-img" />
                    </div>
                    <div className="available-avatar-copy">
                      <Text strong>{item.label}</Text>
                      <Space wrap size={[6, 6]}>
                        <Tag>{item.variety || '未分类'}</Tag>
                        {item.vip_only ? <Tag color="gold">VIP 头像</Tag> : null}
                      </Space>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const css = `
.avatar-unlock-rules-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.avatar-unlock-rules-header,
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.avatar-unlock-rules-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.metric-card,
.rule-editor-card,
.side-card {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(226, 232, 240, 0.82);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
}

.metric-card .ant-card-body {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
}

.metric-card .anticon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
  font-size: 20px;
}

.metric-card h3 {
  margin: 2px 0 0;
}

.avatar-unlock-rules-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
  gap: 20px;
  align-items: start;
}

.rule-editor-card .ant-card-body,
.side-card .ant-card-body {
  padding: 18px;
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 760px;
  overflow-y: auto;
  padding-right: 4px;
}

.rule-row {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  background: rgba(255, 255, 255, 0.92);
}

.rule-row-grid {
  display: grid;
  grid-template-columns: minmax(160px, 0.8fr) minmax(0, 1.3fr) minmax(0, 1fr) minmax(180px, 0.8fr) auto;
  gap: 12px;
  align-items: end;
}

.rule-row-grid .ant-form-item {
  margin-bottom: 0;
}

.rule-row-action {
  display: flex;
  align-items: end;
  min-height: 32px;
}

.rule-preview-avatar,
.available-avatar-thumb {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.92);
  background: rgba(248, 250, 252, 0.9);
  flex-shrink: 0;
}

.rule-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rule-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #475569;
}

.side-panels {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.compact-rule-list,
.available-avatar-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 520px;
  overflow-y: auto;
  padding-right: 4px;
}

.compact-rule-item,
.available-avatar-item {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  background: rgba(255, 255, 255, 0.9);
}

.compact-rule-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.compact-rule-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.92);
  background: rgba(248, 250, 252, 0.9);
  flex-shrink: 0;
}

.compact-rule-body {
  display: grid;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.compact-rule-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.compact-rule-title .ant-typography {
  min-width: 0;
  flex: 1;
}

.compact-rule-meta {
  min-width: 0;
}

.compact-rule-chapter {
  display: block;
  min-width: 0;
}

.available-avatar-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.available-avatar-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.variety-filter-select {
  min-width: 168px;
}

@media (max-width: 1180px) {
  .avatar-unlock-rules-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .avatar-unlock-rules-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .avatar-unlock-rules-header,
  .panel-head {
    flex-direction: column;
    align-items: stretch;
  }

  .avatar-unlock-rules-metrics {
    grid-template-columns: 1fr;
  }

  .rule-row-grid {
    grid-template-columns: 1fr;
  }

  .rule-row-action {
    padding-bottom: 0;
  }
}
`;

export default AdminAvatarUnlockRules;
