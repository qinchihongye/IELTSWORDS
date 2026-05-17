/**
 * 测试题目组件
 */

import React, { useState, useRef } from 'react';
import { Card, Radio, Input, Button, Typography, Space } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const QuizQuestion = ({ question, onSubmit, feedback, savedAnswer }) => {
  const [answer, setAnswer] = useState(savedAnswer || '');
  const inputRef = useRef(null);

  // Keep answer in sync if navigating through history
  React.useEffect(() => {
    setAnswer(savedAnswer || '');
  }, [savedAnswer, question]);

  const handleSubmit = (val) => {
    const finalAnswer = typeof val === 'string' ? val : answer;
    if (finalAnswer && finalAnswer.trim()) {
      onSubmit(finalAnswer);
    }
  };

  const isMultipleChoice = question.question_type === 'multiple_choice';

  return (
    <Card
      style={{
        borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.4)',
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.04)'
      }}
      bodyStyle={{ padding: '40px' }}
    >
      <Title level={4} style={{ marginBottom: '24px', color: '#1f2937' }}>
        {question.question_text}
      </Title>

      {isMultipleChoice ? (
        <Radio.Group
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            // Auto submit on selection
            handleSubmit(e.target.value);
          }}
          style={{ width: '100%' }}
          disabled={!!feedback}
        >
          <Space direction="vertical" style={{ width: '100%', gap: '12px' }}>
            {question.options?.map((option, index) => (
              <Radio
                key={index}
                value={option}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '2px solid rgba(0,0,0,0.06)',
                  background: 'rgba(255,255,255,0.8)',
                  fontSize: '16px'
                }}
              >
                {option}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      ) : (
        <div 
          style={{ position: 'relative', marginBottom: '24px', cursor: 'text' }}
          onClick={() => {
            if (!feedback && inputRef.current) {
               inputRef.current.focus();
            }
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {(() => {
              let currentAlphaCount = 0;
              const typedChars = answer.replace(/\s+/g, '').split('');
              
              return (question.hint || '').split('').map((char, index) => {
                const isSpace = char === ' ' || char === '-';
                
                if (isSpace) {
                  return (
                    <div 
                      key={index} 
                      style={{ 
                        width: '20px', 
                        height: '52px', 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9ca3af',
                        fontSize: '28px',
                        fontFamily: 'monospace'
                      }}>
                      {char}
                    </div>
                  );
                }

                const alphaIndex = currentAlphaCount++;
                const isTyped = alphaIndex < typedChars.length;
                const isCurrentCursor = !feedback && alphaIndex === typedChars.length;
                
                let displayChar = '';
                let color = '#374151';
                
                if (isTyped) {
                   displayChar = typedChars[alphaIndex];
                   color = '#8b5cf6'; // Typed text styling
                } else if (char !== '_') {
                   displayChar = char;
                   color = '#9ca3af'; // Hint text styling
                }

                return (
                  <div 
                    key={index} 
                    style={{
                      width: '40px',
                      height: '52px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '28px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: color,
                      borderBottom: isCurrentCursor && !feedback ? '3px solid #8b5cf6' : (isTyped ? '3px solid #8b5cf6' : '3px solid #d1d5db'),
                      background: isCurrentCursor && !feedback ? 'rgba(139, 92, 246, 0.05)' : 'rgba(255,255,255,0.7)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'all 0.2s',
                      boxShadow: isCurrentCursor && !feedback ? '0 4px 12px rgba(139, 92, 246, 0.15)' : 'none'
                    }}
                  >
                    {displayChar.toUpperCase()}
                  </div>
                );
              });
            })()}
          </div>

          <Input
            ref={inputRef}
            size="large"
            value={answer}
            onChange={(e) => {
              const rawInput = e.target.value.replace(/\s+/g, '');
              const maxAlphas = (question.hint || '').replace(/[\s-]+/g, '').length;
              if (rawInput.length <= maxAlphas) {
                setAnswer(rawInput);
              }
            }}
            onPressEnter={handleSubmit}
            disabled={!!feedback}
            autoComplete="off"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'text',
              zIndex: 10
            }}
          />
        </div>
      )}

      {feedback && (
        <div
          style={{
            marginTop: '24px',
            padding: '20px',
            borderRadius: '12px',
            background: feedback.is_correct
              ? 'rgba(16, 185, 129, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
            border: `2px solid ${feedback.is_correct ? '#10b981' : '#ef4444'}`
          }}
        >
          <Space direction="vertical" size="small">
            <Text
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: feedback.is_correct ? '#10b981' : '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {feedback.is_correct ? (
                <>
                  <CheckCircleOutlined /> 回答正确！
                </>
              ) : (
                <>
                  <CloseCircleOutlined /> 回答错误
                </>
              )}
            </Text>
            {!feedback.is_correct && (
              <Text style={{ fontSize: '16px', color: '#6b7280' }}>
                正确答案：<strong>{feedback.correct_answer}</strong>
              </Text>
            )}
          </Space>
        </div>
      )}

      {!feedback && !isMultipleChoice && (
        <Button
          type="primary"
          size="large"
          block
          onClick={() => handleSubmit(answer)}
          disabled={!answer.trim()}
          style={{
            marginTop: '24px',
            height: '48px',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: 600
          }}
        >
          提交答案
        </Button>
      )}
    </Card>
  );
};

export default QuizQuestion;
