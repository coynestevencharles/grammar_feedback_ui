export interface FeedbackComment {
  index: number;
  source: string;
  corrected: string;
  highlight_start: number;
  highlight_end: number;
  highlight_text: string;
  error_tag: string;
  feedback_explanation: string;
  feedback_suggestion: string;
  global_highlight_start: number;
  global_highlight_end: number;
}

export interface FeedbackResponse {
  response_id: string;
  feedback_list: FeedbackComment[];
  metadata: Record<string, unknown>;
}

export interface PipelinesResponse {
  default_pipeline: string;
  pipelines: string[];
}

export interface UserRequest {
  user_id: string;
  assignment_id: string;
  system_choice?: string;
  draft_number: number;
  text: string;
}

export interface FeedbackDiscussion extends FeedbackComment {
  id: string;
}
