import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, FloatButton, Input, Modal, Select, Space, Typography, message } from 'antd';
import { BulbOutlined, DeleteOutlined, DownOutlined, LinkOutlined, MessageOutlined, ReloadOutlined, RightOutlined, RobotOutlined, SendOutlined, SettingOutlined, ThunderboltFilled } from '@ant-design/icons';
import { useAIChat } from '../context/AIChatContext';
import AIMarkdownContent from './AIMarkdownContent';

const { Text } = Typography;

const MODEL_PROVIDER_ORDER = ['OpenAI', 'DeepSeek', 'Anthropic (Claude)', 'Kimi', 'Other models'];

const getModelProvider = (model) => {
  const value = String(model || '').toLowerCase();
  if (value.includes('deepseek')) return 'DeepSeek';
  if (value.includes('claude') || value.includes('anthropic')) return 'Anthropic (Claude)';
  if (value.includes('kimi') || value.includes('moonshot')) return 'Kimi';
  if (value.includes('gpt') || value.includes('openai')) return 'OpenAI';
  return 'Other models';
};

const buildModelLabel = (model) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <ThunderboltFilled style={{ color: '#4f46e5', fontSize: 13 }} />
    <span>{model}</span>
  </span>
);

const groupModels = (models) => {
  const groups = new Map();

  models.forEach((model) => {
    const provider = getModelProvider(model);
    if (!groups.has(provider)) {
      groups.set(provider, []);
    }
    groups.get(provider).push({
      label: buildModelLabel(model),
      value: model,
    });
  });

  return MODEL_PROVIDER_ORDER
    .filter((provider) => groups.has(provider))
    .map((provider) => ({
      label: provider,
      options: groups.get(provider),
    }));
};

const bubbleStyle = (role, isError) => {
  if (role === 'user') {
    return {
      marginLeft: 'auto',
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      color: '#ffffff',
      border: 'none',
    };
  }

  return {
    marginRight: 'auto',
    background: isError ? 'rgba(254, 242, 242, 0.96)' : 'rgba(255, 255, 255, 0.94)',
    color: isError ? '#b91c1c' : '#1f2937',
    border: isError ? '1px solid rgba(239, 68, 68, 0.22)' : '1px solid rgba(148, 163, 184, 0.16)',
  };
};

const AIChatWidget = () => {
  const {
    isOpen,
    openDrawer,
    closeDrawer,
    chatContext,
    messages,
    aiSettings,
    isSettingsSaving,
    isSending,
    sendMessage,
    selectModel,
    saveAISettings,
    resetAISettings,
    testAISettings,
    resetConversation,
  } = useAIChat();
  const [draft, setDraft] = useState('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState(() => new Set());
  const scrollRef = useRef(null);
  const reasoningCompletionRef = useRef(new Set());
  const canUseAI = aiSettings.canUseAI;

  const contextShortcuts = useMemo(
    () => chatContext?.shortcuts || [],
    [chatContext]
  );
  const modelCount = (aiSettings.availableModels || []).length;
  const modelOptions = useMemo(
    () => groupModels(aiSettings.availableModels || []),
    [aiSettings.availableModels]
  );
  const selectedModel = aiSettings.selectedModel || aiSettings.activeModel || '';
  const shouldShowModelBox = Boolean(selectedModel) || modelOptions.length > 0;

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [isOpen, messages, isSending]);

  useEffect(() => {
    setExpandedReasoningIds((prev) => {
      let changed = false;
      const next = new Set(prev);

      messages.forEach((message) => {
        if (message.reasoningComplete && message.reasoning) {
          if (!reasoningCompletionRef.current.has(message.id)) {
            reasoningCompletionRef.current.add(message.id);
            next.delete(message.id);
            changed = true;
          }
        } else {
          reasoningCompletionRef.current.delete(message.id);
        }
      });

      return changed ? next : prev;
    });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    setDraft('');
    await sendMessage(trimmed);
  };

  const toggleReasoning = (messageId) => {
    setExpandedReasoningIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const openSettingsModal = () => {
    setBaseUrlDraft(aiSettings.customBaseUrl || '');
    setModelDraft(aiSettings.customModel || '');
    setApiKeyDraft('');
    setTestResult(null);
    setIsSettingsModalOpen(true);
  };

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false);
    setTestResult(null);
    setApiKeyDraft('');
  };

  const handleSaveSettings = async () => {
    const nextSettings = await saveAISettings({
      baseUrl: baseUrlDraft,
      model: modelDraft,
      apiKey: apiKeyDraft,
    });

    if (nextSettings) {
      message.success('AI 配置已保存');
      closeSettingsModal();
    }
  };

  const handleResetSettings = async () => {
    const nextSettings = await resetAISettings();
    if (nextSettings) {
      message.success('已恢复系统默认 AI 配置');
      setBaseUrlDraft('');
      setModelDraft('');
      setApiKeyDraft('');
      setTestResult(null);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setTestResult(null);

    try {
      const result = await testAISettings({
        baseUrl: baseUrlDraft,
        model: modelDraft,
        apiKey: apiKeyDraft,
      });

      if (result?.success) {
        setTestResult({
          success: true,
          message: result.message,
          activeModel: result.active_model,
          activeSource: result.active_source || 'system',
        });
        message.success('连接测试成功');
      } else {
        setTestResult({
          success: false,
          message: result?.message || '连接测试失败，请检查配置后重试',
          activeSource: result?.active_source || aiSettings.activeSource || 'system',
        });
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const placeholder = chatContext?.page === 'quiz'
    ? '比如：先别直接告诉我答案，给我一点提示'
    : chatContext?.page === 'learning'
      ? '比如：这个词怎么记最牢？'
      : chatContext?.page === 'mistake-book'
        ? '比如：帮我看看我这批词该怎么复习'
        : '直接输入你想问的问题';
  const finalPlaceholder = canUseAI ? placeholder : '请先配置系统默认 AI，或在右上角填写自定义配置';

  return (
    <>
      <FloatButton
        icon={<MessageOutlined />}
        type="primary"
        tooltip="AI 助手"
        onClick={openDrawer}
        style={{ insetInlineEnd: 28, bottom: 28 }}
      />

      <Drawer
        title={(
          <Space size={10}>
            <RobotOutlined style={{ color: '#6366f1' }} />
            <span>AI 学习助手</span>
          </Space>
        )}
        placement="right"
        open={isOpen}
        onClose={closeDrawer}
        width="min(420px, 100vw)"
        extra={(
          <Space size={8}>
            <Button
              icon={<SettingOutlined />}
              size="small"
              onClick={openSettingsModal}
            >
              配置
            </Button>
            <Button
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => resetConversation()}
            >
              清空
            </Button>
          </Space>
        )}
        styles={{
          body: {
            padding: 0,
            background: 'linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(241, 245, 249, 0.98) 100%)',
          },
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {contextShortcuts.length > 0 && (
            <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {contextShortcuts.map((shortcut) => (
                  <Button
                    key={shortcut.key}
                    size="small"
                    onClick={() => sendMessage(shortcut.prompt)}
                    disabled={isSending || isSettingsSaving || !canUseAI}
                    style={{
                      borderRadius: 999,
                      background: 'rgba(99, 102, 241, 0.06)',
                      borderColor: 'rgba(99, 102, 241, 0.16)',
                      color: '#4f46e5',
                    }}
                  >
                    {shortcut.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {messages.map((message) => (
              (() => {
                const hasReasoning = Boolean(message.reasoning);
                const isReasoningExpanded = hasReasoning && (!message.reasoningComplete || expandedReasoningIds.has(message.id));

                return (
                  <div
                    key={message.id}
                    style={{
                      maxWidth: '88%',
                      width: 'fit-content',
                      borderRadius: 18,
                      padding: '12px 14px',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.7,
                      boxShadow: message.role === 'user'
                        ? '0 12px 28px rgba(99, 102, 241, 0.22)'
                        : '0 10px 24px rgba(15, 23, 42, 0.05)',
                      ...bubbleStyle(message.role, message.error),
                    }}
                  >
                    {message.role === 'user' ? (
                      <Text style={{ color: '#ffffff' }}>
                        {message.content}
                      </Text>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {hasReasoning && (
                          <div
                            style={{
                              borderRadius: 14,
                              overflow: 'hidden',
                              border: '1px solid rgba(148, 163, 184, 0.16)',
                              background: 'rgba(248, 250, 252, 0.92)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => toggleReasoning(message.id)}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                border: 'none',
                                background: 'transparent',
                                padding: '10px 12px',
                                cursor: 'pointer',
                                color: '#475569',
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                                <BulbOutlined />
                                {message.reasoningComplete ? '思考过程' : '正在思考'}
                              </span>
                              {isReasoningExpanded ? <DownOutlined /> : <RightOutlined />}
                            </button>
                            {isReasoningExpanded && (
                              <div
                                style={{
                                  padding: '0 12px 12px',
                                  borderTop: '1px solid rgba(148, 163, 184, 0.12)',
                                }}
                              >
                                <AIMarkdownContent content={message.reasoning} tone="subtle" />
                              </div>
                            )}
                          </div>
                        )}

                        {message.content && (
                          <AIMarkdownContent content={message.content} tone="default" />
                        )}

                        {!message.content && message.streaming && (
                          <Text style={{ color: '#64748b' }}>AI 正在组织回答...</Text>
                        )}

                        {message.streamError && (
                          <div
                            style={{
                              borderRadius: 12,
                              padding: '10px 12px',
                              background: 'rgba(254, 242, 242, 0.92)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: '#b91c1c',
                              fontSize: 12,
                              lineHeight: 1.65,
                            }}
                          >
                            {message.streamError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            ))}
          </div>

          <div style={{ padding: 16, borderTop: '1px solid rgba(148, 163, 184, 0.12)', background: 'rgba(255, 255, 255, 0.62)' }}>
            {shouldShowModelBox && (
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Select
                  value={selectedModel}
                  options={modelOptions}
                  onChange={selectModel}
                  disabled={isSending || !canUseAI || modelCount <= 1}
                  popupMatchSelectWidth={false}
                  suffixIcon={<DownOutlined style={{ color: '#64748b', fontSize: 12 }} />}
                  style={{ minWidth: 220, maxWidth: '100%' }}
                  placeholder="选择模型"
                  styles={{
                    popup: {
                      root: {
                        borderRadius: 16,
                      },
                    },
                  }}
                  className="ai-chat-model-select"
                  popupClassName="ai-chat-model-popup"
                  variant="borderless"
                />
              </div>
            )}
            {shouldShowModelBox && (
              <style>{`
                .ai-chat-model-select .ant-select-selector {
                  min-height: 40px !important;
                  padding: 0 14px !important;
                  border-radius: 999px !important;
                  background: rgba(99, 102, 241, 0.08) !important;
                  border: 1px solid rgba(99, 102, 241, 0.14) !important;
                  box-shadow: none !important;
                }
                .ai-chat-model-select .ant-select-selection-item {
                  display: flex !important;
                  align-items: center !important;
                  gap: 8px !important;
                  font-size: 14px !important;
                  font-weight: 600 !important;
                  color: #3730a3 !important;
                }
                .ai-chat-model-select.ant-select-disabled .ant-select-selector {
                  opacity: 0.86;
                  cursor: default !important;
                }
                .ai-chat-model-popup {
                  padding: 10px !important;
                  background: rgba(20, 23, 35, 0.96) !important;
                  border: 1px solid rgba(255, 255, 255, 0.08) !important;
                  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.28) !important;
                  backdrop-filter: blur(18px);
                }
                .ai-chat-model-popup .ant-select-item-group {
                  color: rgba(255, 255, 255, 0.5) !important;
                  font-size: 12px !important;
                  font-weight: 600 !important;
                  padding: 10px 12px 6px !important;
                }
                .ai-chat-model-popup .ant-select-item-option {
                  border-radius: 12px !important;
                  margin: 4px 0 !important;
                  padding: 11px 12px !important;
                  color: rgba(255, 255, 255, 0.94) !important;
                }
                .ai-chat-model-popup .ant-select-item-option-content {
                  display: flex !important;
                  align-items: center !important;
                  gap: 8px !important;
                }
                .ai-chat-model-popup .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {
                  background: rgba(115, 92, 255, 0.42) !important;
                }
                .ai-chat-model-popup .ant-select-item-option-active:not(.ant-select-item-option-disabled) {
                  background: rgba(255, 255, 255, 0.08) !important;
                }
              `}</style>
            )}
            <Input.TextArea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={finalPlaceholder}
              autoSize={{ minRows: 3, maxRows: 6 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              style={{
                borderRadius: 14,
                padding: 12,
                resize: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>
                Enter 发送，Shift + Enter 换行
              </Text>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => void handleSend()}
                disabled={!draft.trim() || isSending || isSettingsSaving || !canUseAI}
                style={{ borderRadius: 999 }}
              >
                发送
              </Button>
            </div>
          </div>
        </div>
      </Drawer>

      <Modal
        title="AI 配置"
        open={isSettingsModalOpen}
        onCancel={closeSettingsModal}
        onOk={() => void handleSaveSettings()}
        okText="保存配置"
        cancelText="取消"
        confirmLoading={isSettingsSaving}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text style={{ color: '#64748b', lineHeight: 1.7 }}>
            {aiSettings.systemConfigured
              ? '系统默认 AI 已经可以直接使用。这里也可以额外填写你自己的 OpenAI-compatible 配置；保存后，聊天会优先走你自己的 Base URL、API Key 和模型。'
              : '当前系统默认 AI 还没有配置完成。你可以先在项目根目录 .env 里配置 OPENAI_API_KEY，也可以在这里填写你自己的 OpenAI-compatible 配置。'}
          </Text>

          <div>
            <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
              Base URL
            </Text>
            <Input
              prefix={<LinkOutlined style={{ color: '#94a3b8' }} />}
              value={baseUrlDraft}
              onChange={(event) => setBaseUrlDraft(event.target.value)}
              placeholder="例如 https://api.openai.com/v1"
              maxLength={300}
            />
          </div>

          <div>
            <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
              模型名称
            </Text>
            <Input
              value={modelDraft}
              onChange={(event) => setModelDraft(event.target.value)}
              placeholder="例如 gpt-4o-mini"
              maxLength={120}
            />
          </div>

          <div>
            <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
              API Key
            </Text>
            <Input.Password
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder={aiSettings.hasApiKey ? '已保存，如需修改请重新输入' : '请输入你的 API Key'}
              maxLength={300}
            />
            {aiSettings.maskedApiKey && (
              <Text style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                当前已保存：{aiSettings.maskedApiKey}
              </Text>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              icon={<LinkOutlined />}
              onClick={() => void handleTestConnection()}
              loading={isTestingConnection}
              disabled={isSettingsSaving}
            >
              测试当前生效配置
            </Button>
            <Button
              icon={<ReloadOutlined />}
              danger
              onClick={() => void handleResetSettings()}
              loading={isSettingsSaving}
            >
              恢复默认
            </Button>
          </div>

          {testResult && (
            <div
              style={{
                borderRadius: 12,
                padding: '12px 14px',
                background: testResult.success ? 'rgba(240, 253, 244, 0.95)' : 'rgba(254, 242, 242, 0.95)',
                border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.22)'}`,
              }}
            >
              <Text style={{ display: 'block', color: testResult.success ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                {testResult.message}
              </Text>
              {testResult.success && (
                <>
                  <Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#166534' }}>
                    连接来源：{testResult.activeSource === 'custom' ? '用户自定义配置' : '系统默认配置'}
                  </Text>
                  <Text style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#166534' }}>
                    生效模型：{testResult.activeModel}
                  </Text>
                </>
              )}
            </div>
          )}
        </Space>
      </Modal>
    </>
  );
};

export default AIChatWidget;
