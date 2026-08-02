export const maxDrafts = 3;
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
import { FeedbackSystem } from '../types/api';

export const validSystems = [
  'rule-based',
  'llm-based',
] as const satisfies readonly FeedbackSystem[];
export const defaultSystem: FeedbackSystem = 'rule-based';
