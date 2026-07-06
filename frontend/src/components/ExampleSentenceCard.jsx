import React, { useCallback } from 'react';
import { Card, Button, Typography, message } from 'antd';
import { SoundOutlined, ReadOutlined, LinkOutlined } from '@ant-design/icons';

const { Text } = Typography;

const ExampleSentenceCard = ({ word }) => {
  const exampleSentence = word?.exampleSentence;
  const candidateWords = word?.candidateWords;

  // 朗读例句
  const playSentenceAudio = useCallback((e) => {
    if (e) e.stopPropagation();
    if (!exampleSentence) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(exampleSentence);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        let targetVoice = voices.find(v => v.lang === 'en-US' || v.lang === 'en_US');
        if (!targetVoice) targetVoice = voices.find(v => v.lang.startsWith('en'));
        if (targetVoice) utterance.voice = targetVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch {
      message.warning('语音播报不可用');
    }
  }, [exampleSentence]);

  if (!word || (!exampleSentence && !candidateWords)) return null;

  return (
    <Card
      className="study-card"
      style={{
        width: '100%',
        marginTop: 24,
      }}
      bodyStyle={{ padding: 'clamp(16px, 4vw, 32px) clamp(16px, 5vw, 40px)' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 4vw, 32px)' }}>
        {/* === Example Sentence Section === */}
        {exampleSentence && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
               <Text style={{ color: '#6366f1', fontWeight: 700, fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>
                 <ReadOutlined style={{ marginRight: 6 }} /> Example Sentence
               </Text>

               <Button
                 shape="circle"
                 icon={<SoundOutlined style={{ fontSize: '13px' }} />}
                 onClick={playSentenceAudio}
                 style={{ 
                   color: '#6366f1', 
                   borderColor: 'rgba(99, 102, 241, 0.3)', 
                   background: 'rgba(99, 102, 241, 0.05)',
                   boxShadow: 'none',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   width: '28px',
                   height: '28px',
                   flexShrink: 0
                 }}
               />
            </div>
            
            <div style={{ borderLeft: '3px solid #e5e7eb', paddingLeft: 'clamp(12px, 3vw, 24px)', margin: '16px 0 0 0' }}>
              <p style={{ 
                fontSize: 'clamp(16px, 3.5vw + 4px, 24px)', color: '#111827', fontStyle: 'italic', 
                fontFamily: 'serif', margin: '0 0 12px 0', lineHeight: 1.5 
              }}>
                "{exampleSentence}"
              </p>
              {word.sentenceMeaning && (
                <p style={{ margin: 0, fontSize: 'clamp(13px, 2vw + 6px, 15px)', color: '#6b7280', fontWeight: 500 }}>
                  {word.sentenceMeaning}
                </p>
              )}
            </div>
          </div>
        )}

        {/* === Candidate Words Section === */}
        {candidateWords && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
               <Text style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                 <LinkOutlined style={{ marginRight: 6 }} /> Synonyms & Candidates
               </Text>
            </div>
            
            <div style={{ borderLeft: '3px solid #ede9fe', paddingLeft: 'clamp(12px, 3vw, 24px)', margin: '16px 0 0 0' }}>
              <p style={{ 
                fontSize: 'clamp(13px, 2vw + 6px, 16px)', color: '#4c1d95', fontWeight: 500, margin: 0, lineHeight: 1.6 
              }}>
                {candidateWords}
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default ExampleSentenceCard;
