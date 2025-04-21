export const maxDrafts = 3;
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
export const validSystems = [
  "rule-based",
  "llm-based",
]
export const defaultSystem = "rule-based";