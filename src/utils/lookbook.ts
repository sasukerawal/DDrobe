import type { createAuthenticatedClient } from './supabase';

type Client = ReturnType<typeof createAuthenticatedClient>;

export interface FeedPost {
  id: string;
  user_id: string;
  image_url: string;
  caption: string;
  created_at: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  author: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: string;
}

type CountRel = { count: number }[] | null;

async function namesFor(client: Client, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await client.rpc('display_names', { ids: unique });
  return new Map(((data ?? []) as { id: string; display_name: string }[]).map((r) => [r.id, r.display_name]));
}

function toPost(row: Record<string, unknown>, likedIds: Set<string>, names: Map<string, string>): FeedPost {
  const likes = row.post_likes as CountRel;
  const comments = row.post_comments as CountRel;
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    image_url: row.image_url as string,
    caption: (row.caption as string) ?? '',
    created_at: row.created_at as string,
    likeCount: likes?.[0]?.count ?? 0,
    commentCount: comments?.[0]?.count ?? 0,
    liked: likedIds.has(row.id as string),
    author: names.get(row.user_id as string) || 'DDrobe member',
  };
}

const POST_SELECT = 'id, user_id, image_url, caption, created_at, post_likes(count), post_comments(count)';

export async function fetchFeed(client: Client, userId: string): Promise<FeedPost[]> {
  const { data, error } = await client
    .from('feed_posts')
    .select(POST_SELECT)
    .eq('moderation_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  return enrich(client, userId, rows);
}

export async function fetchPost(client: Client, userId: string, postId: string): Promise<FeedPost> {
  const { data, error } = await client.from('feed_posts').select(POST_SELECT).eq('id', postId).single();
  if (error) throw error;
  const [post] = await enrich(client, userId, [data as Record<string, unknown>]);
  return post;
}

async function enrich(client: Client, userId: string, rows: Record<string, unknown>[]): Promise<FeedPost[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const [likesRes, names] = await Promise.all([
    client.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', ids),
    namesFor(client, rows.map((r) => r.user_id as string)),
  ]);
  const liked = new Set(((likesRes.data ?? []) as { post_id: string }[]).map((r) => r.post_id));
  return rows.map((r) => toPost(r, liked, names));
}

export async function setLiked(client: Client, userId: string, postId: string, like: boolean) {
  const { error } = like
    ? await client.from('post_likes').upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
    : await client.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}

export async function fetchComments(client: Client, postId: string): Promise<PostComment[]> {
  const { data, error } = await client
    .from('post_comments')
    .select('id, post_id, user_id, body, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as Omit<PostComment, 'author'>[];
  const names = await namesFor(client, rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, author: names.get(r.user_id) || 'DDrobe member' }));
}

export async function addComment(client: Client, userId: string, postId: string, body: string) {
  const { error } = await client.from('post_comments').insert({ post_id: postId, user_id: userId, body: body.trim().slice(0, 300) });
  if (error) throw error;
}

export async function deleteComment(client: Client, commentId: string) {
  const { error } = await client.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
