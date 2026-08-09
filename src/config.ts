export interface AppConfig {
  apiBaseUrl: string;
  /** Shows a selector containing every pipeline reported by the backend. */
  demoMode: boolean;
  /** Limits successful submissions, or allows unlimited submissions when null. */
  maxDrafts: number | null;
}

export const appConfig: AppConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  demoMode: false,
  maxDrafts: 3,
};
