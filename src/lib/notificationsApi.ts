import { supabase } from '@/lib/supabase';
import { Notification } from '@/types';

interface RpcResult {
  data?: Notification[];
  count?: number;
  success?: boolean;
  error?: string;
}

async function callRpc(action: string, extra?: { p_notif_id?: string; p_limit?: number }): Promise<RpcResult> {
  const params: Record<string, unknown> = { p_action: action };
  if (extra?.p_notif_id) params.p_notif_id = extra.p_notif_id;
  if (extra?.p_limit !== undefined) params.p_limit = extra.p_limit;

  const { data, error } = await supabase.rpc('get_notifications', params);

  if (error) throw new Error(error.message || 'Failed to load notifications');
  if (!data) throw new Error('Failed to load notifications');

  const result = data as RpcResult;
  if (result.error) throw new Error(result.error);

  return result;
}

export async function fetchNotifications(limit = 50): Promise<Notification[]> {
  const result = await callRpc('list', { p_limit: limit });
  return result.data || [];
}

export async function fetchUnreadCount(): Promise<number> {
  const result = await callRpc('unread_count');
  return result.count || 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await callRpc('mark_read', { p_notif_id: id });
}

export async function markAllNotificationsRead(): Promise<void> {
  await callRpc('mark_all_read');
}

export async function deleteNotification(id: string): Promise<void> {
  await callRpc('delete', { p_notif_id: id });
}
