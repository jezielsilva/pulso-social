export type Network = 'instagram' | 'x';
export type PostType = 'feed' | 'carousel' | 'reel' | 'story' | 'x';
export type PostStatus = 'draft' | 'scheduled' | 'processing' | 'published' | 'error';

export interface MediaRef { key: string; mime: string; name?: string }
export interface Post {
  id: string; account_id: string | null; network: Network; type: PostType; caption: string;
  media: MediaRef[]; thread: string[]; scheduled_at: number | null; status: PostStatus;
  external_id: string | null; permalink: string | null; error: string | null; published_at: number | null;
  created_at: number; updated_at: number;
}
export interface Account { id: string; network: Network; username: string; name: string; avatar: string | null }
export interface Snippet { id: string; title: string; body: string }
export interface Totals {
  reach: number; views: number; interactions: number; likes: number; comments: number;
  shares: number; saves: number; follows: number; unfollows: number; profile_views: number;
}
export interface Overview {
  connected: boolean; account?: { username: string; avatar: string }; days?: number; followers?: number;
  followersDelta?: number; engagementRate?: number; posts?: number; current?: Totals; previous?: Totals;
}
export interface DailyRow { date: string; followers: number | null; follows: number | null; unfollows: number | null; reach: number | null; views: number | null; interactions: number | null }
export interface PostMetric {
  external_id: string; media_type: string; product_type: string | null; caption: string; permalink: string; thumb: string | null;
  posted_at: number; views: number; reach: number; likes: number; comments: number; shares: number; saved: number; interactions: number;
}
export interface FormatRow { fmt: string; n: number; interactions: number; avg_interactions: number; avg_reach: number }
export interface BestTimes { grid: number[][]; counts: number[][]; samples: number; best: { wd: number; hour: number; score: number }; lift: number }
export interface Comment {
  id: string; text: string; username: string; timestamp: string; likes: number; answered: boolean;
  replies: { id: string; text: string; username: string; timestamp: string }[];
  post: { id: string; caption: string; permalink: string; thumb: string | null };
}

export class ApiError extends Error { constructor(msg: string, public status: number) { super(msg); } }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('pulso:logout'));
    throw new ApiError((json as any).error || `Erro ${res.status}`, res.status);
  }
  return json as T;
}
const body = (b: unknown) => JSON.stringify(b);

export const api = {
  me: () => req<{ authed: boolean }>('/me'),
  login: (password: string) => req('/login', { method: 'POST', body: body({ password }) }),
  logout: () => req('/logout', { method: 'POST' }),

  accounts: () => req<Account[]>('/accounts'),
  removeAccount: (id: string) => req(`/accounts/${id}`, { method: 'DELETE' }),

  posts: (from: number, to: number) => req<Post[]>(`/posts?from=${from}&to=${to}`),
  createPost: (p: Partial<Post>) => req<Post>('/posts', { method: 'POST', body: body(p) }),
  updatePost: (id: string, p: Partial<Post>) => req<Post>(`/posts/${id}`, { method: 'PATCH', body: body(p) }),
  deletePost: (id: string) => req(`/posts/${id}`, { method: 'DELETE' }),
  publishNow: (id: string) => req<Post>(`/posts/${id}/publish`, { method: 'POST' }),

  /** Upload com progresso (XHR), devolve a referência salva no R2. */
  upload(file: File, onProgress?: (p: number) => void): Promise<MediaRef> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        const j = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(j); else reject(new ApiError(j.error || 'Falha no upload', xhr.status));
      };
      xhr.onerror = () => reject(new ApiError('Sem conexão', 0));
      const fd = new FormData();
      fd.append('file', file);
      xhr.send(fd);
    });
  },

  snippets: () => req<Snippet[]>('/snippets'),
  addSnippet: (title: string, b: string) => req<Snippet>('/snippets', { method: 'POST', body: body({ title, body: b }) }),
  removeSnippet: (id: string) => req(`/snippets/${id}`, { method: 'DELETE' }),

  overview: (days: number) => req<Overview>(`/stats/overview?days=${days}`),
  timeline: (days: number) => req<DailyRow[]>(`/stats/timeline?days=${days}`),
  topPosts: (days: number, sort: string) => req<PostMetric[]>(`/stats/posts?days=${days}&sort=${sort}`),
  formats: (days: number) => req<FormatRow[]>(`/stats/formats?days=${days}`),
  bestTimes: () => req<BestTimes>('/stats/best-times?days=90'),
  refresh: () => req('/stats/refresh', { method: 'POST' }),

  inbox: () => req<{ connected: boolean; comments: Comment[] }>('/inbox'),
  reply: (id: string, message: string) => req(`/inbox/${id}/reply`, { method: 'POST', body: body({ message }) }),
};

export const mediaSrc = (key: string) => `/m/${key}`;
