interface Fetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  range?: R2Range;
  httpMetadata?: { contentType?: string };
  writeHttpMetadata(headers: Headers): void;
}

interface R2Bucket {
  get(key: string, options?: { range?: R2Range | Headers }): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    MEDIA: R2Bucket;
    AUTH_SECRET?: string;
    ADMIN_SETUP_KEY?: string;
    ADMIN_ALLOW_DEV_CODE?: string;
    ADMIN_LOGIN_CODE_DISABLED?: string;
    RESEND_API_KEY?: string;
    ADMIN_FROM_EMAIL?: string;
    ORDER_FROM_EMAIL?: string;
    PUBLIC_SITE_URL?: string;
    LAUNCH_AT?: string;
    VIP_LAUNCH_AT?: string;
    VIP_ACCESS_TOKEN?: string;
    VIP_PASSWORD?: string;
    META_PIXEL_ID?: string;
    META_CAPI_ACCESS_TOKEN?: string;
    META_GRAPH_API_VERSION?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET?: string;
    TURNSTILE_HOSTNAMES?: string;
    ASAAS_API_KEY?: string;
    ASAAS_WEBHOOK_TOKEN?: string;
    ASAAS_ENVIRONMENT?: "sandbox" | "production";
    SUPERFRETE_API_TOKEN?: string;
  };
}
