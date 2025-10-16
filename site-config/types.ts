// site-config/types.ts
export interface SiteConfig {
  applyCouponUrl: string;
  payload: { data: any } | string;
  // Опціональні поля для додаткової конфігурації
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  cookies?: string;
  timestamp?: string;
}
