export const CLASSIFICATION_RETRY_THRESHOLD = 3;

export interface ReportFlow {
  photoAttempts: number;
  canChooseClassification: boolean;
  step: 'capture' | 'review' | 'classification-help' | 'comment-choice' | 'comment';
}

type Action = { type: 'photo' | 'reject' | 'retake' | 'choose-classification' | 'accept' | 'add-comment' | 'back' | 'reset' };

export const initialReportFlow = (): ReportFlow => ({ photoAttempts: 0, canChooseClassification: false, step: 'capture' });

export function reportFlowReducer(state: ReportFlow, action: Action): ReportFlow {
  switch (action.type) {
    case 'photo': return { ...state, photoAttempts: state.photoAttempts + 1, step: 'review' };
    case 'reject': {
      if (state.step !== 'review') return state;
      const canChooseClassification = state.photoAttempts >= CLASSIFICATION_RETRY_THRESHOLD;
      return { ...state, canChooseClassification, step: canChooseClassification ? 'classification-help' : 'capture' };
    }
    case 'retake': return { ...state, step: 'capture' };
    case 'choose-classification': return state.step === 'classification-help' && state.canChooseClassification ? { ...state, step: 'review' } : state;
    case 'accept': return state.step === 'review' ? { ...state, step: 'comment-choice' } : state;
    case 'add-comment': return state.step === 'comment-choice' ? { ...state, step: 'comment' } : state;
    case 'back': return state.step === 'comment' || state.step === 'comment-choice' ? { ...state, step: 'review' } : state;
    case 'reset': return initialReportFlow();
  }
}

// Only an explicit answer to the comment question can proceed to submission.
export function submissionComment(flow: ReportFlow, description: string, includeComment: boolean): string | null {
  if (includeComment) return flow.step === 'comment' ? description.trim() : null;
  return flow.step === 'comment-choice' || flow.step === 'comment' ? '' : null;
}
