import React from 'react';
import { AuthProvider } from './AuthContext';
import { ProgressProvider } from './ProgressContext';
import { LearningProvider } from './LearningContext';
import { QuizProvider } from './QuizContext';
import { MistakeProvider } from './MistakeContext';
import { ReviewProvider } from './ReviewContext';
import { AIChatProvider } from './AIChatContext';

export const AppProviders = ({ children }) => {
  return (
    <AuthProvider>
      <ProgressProvider>
        <LearningProvider>
          <QuizProvider>
            <MistakeProvider>
              <ReviewProvider>
                <AIChatProvider>
                  {children}
                </AIChatProvider>
              </ReviewProvider>
            </MistakeProvider>
          </QuizProvider>
        </LearningProvider>
      </ProgressProvider>
    </AuthProvider>
  );
};

export default AppProviders;
