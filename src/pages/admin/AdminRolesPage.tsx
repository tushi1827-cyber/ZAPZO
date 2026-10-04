import { useState, useCallback, useEffect } from 'react';
import { Shield, Search, Plus, Trash2, UserCog, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { supabase } from '@/lib/supabase';
import { AdminRoleAssignment, AdminRole } from '@/types';

const roleLabels: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  moderator: 'Moderator',
  support: 'Support',
  finance: 'Finance',
};

const roleTones: Record<AdminRole, 'brand' | 'info' | 'success' | 'warning'> = {
  super_admin: 'brand',
  moderator: 'info',
  support: 'success',
  finance: 'warning',
};

const roleDescriptions: Record<AdminRole, string> = {
  super_admin: 'Full access to all admin features including role management',
  moderator: 'Manage users, tasks, submissions, feedback, and fraud',
  support: 'Handle support tickets and user feedback/reports',
  finance: 'Manage withdrawals and wallet transactions',
};

const allRoles: AdminRole[] = ['super_admin', 'moderator', 'support', 'finance'];

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

interface UserSearchResult {
  id: string;
  name: string;
  referral_code: string;
  is_admin: boolean;
}

export function AdminRolesPage() {
  const [assignments, setAssignments] = useState<AdminRoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [selectedRole, setSelectedRole] = useState<AdminRole>('moderator');
  const [assigning, setAssigning] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<AdminRoleAssignment | null>(null);
  const [removing, setRemoving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.rpc('get_admin_roles_list');
    if (err) {
      setError('Failed to load admin roles');
      setAssignments([]);
    } else {
      setAssignments((data as AdminRoleAssignment[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = useCallback(async () => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, name, referral_code, is_admin')
      .or(`name.ilike.%${searchQuery.trim()}%,referral_code.ilike.%${searchQuery.trim()}%`)
      .limit(10);
    if (!err) {
      setSearchResults((data as UserSearchResult[]) || []);
    }
    setSearching(false);
  }, [searchQuery]);

  useEffect(() => {
    const t = setTimeout(() => { if (searchQuery.trim().length >= 2) handleSearch(); }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, handleSearch]);

  const handleAssign = async () => {
    if (!selectedUser) return;
    setActionError('');
    setAssigning(true);
    const { error: rpcErr } = await supabase.rpc('assign_admin_role', {
      p_user_id: selectedUser.id,
      p_role: selectedRole,
    });
    setAssigning(false);
    if (rpcErr) {
      setActionError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }
    setSuccessMsg(`Assigned ${roleLabels[selectedRole]} to ${selectedUser.name}`);
    setShowAssign(false);
    setSelectedUser(null);
    setSearchQuery('');
    setSearchResults([]);
    await load();
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const handleRemove = async () => {
    if (!confirmRemove) return;
    setActionError('');
    setRemoving(true);
    const { error: rpcErr } = await supabase.rpc('remove_admin_role', {
      p_user_id: confirmRemove.user_id,
      p_role: confirmRemove.role,
    });
    setRemoving(false);
    if (rpcErr) {
      setActionError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }
    setSuccessMsg(`Removed ${roleLabels[confirmRemove.role]} from ${confirmRemove.user_name || 'user'}`);
    setConfirmRemove(null);
    await load();
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const groupedByUser = assignments.reduce<Record<string, AdminRoleAssignment[]>>((acc, a) => {
    if (!acc[a.user_id]) acc[a.user_id] = [];
    acc[a.user_id].push(a);
    return acc;
  }, {});

  const userGroups = Object.entries(groupedByUser).map(([uid, roles]) => ({
    userId: uid,
    name: roles[0]?.user_name || 'Unknown',
    referralCode: roles[0]?.user_referral_code || '',
    roles: roles.sort((a, b) => a.role.localeCompare(b.role)),
    assignedAt: roles[0]?.created_at || '',
  }));

  return (
    <AdminPageWrapper
      title="Admin Roles & Permissions"
      subtitle="Manage admin role assignments and access levels"
      actions={
        <Button onClick={() => setShowAssign(true)} size="sm">
          <Plus className="h-4 w-4" /> Assign Role
        </Button>
      }
    >
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>
      )}

      <Card className="p-5">
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <Shield className="h-5 w-5 text-brand-400" />
          Permission Matrix
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {allRoles.map(role => (
            <div key={role} className="rounded-xl border border-ink-200 bg-ink-800/30 p-4">
              <Badge tone={roleTones[role]}>{roleLabels[role]}</Badge>
              <p className="mt-2 text-xs text-ink-400">{roleDescriptions[role]}</p>
            </div>
          ))}
        </div>
      </Card>

      {loading ? (
        <Spinner size="lg" className="py-20" />
      ) : assignments.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<UserCog className="h-10 w-10" />}
            title="No admin roles assigned"
            description="Click 'Assign Role' to grant admin access to a user. The existing super admin via app_metadata is not listed here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {userGroups.map(group => (
            <Card key={group.userId} className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white">{group.name}</p>
                    <span className="text-xs text-ink-400">{group.referralCode}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {group.roles.map(r => (
                      <div key={r.id} className="flex items-center gap-1.5">
                        <Badge tone={roleTones[r.role]}>{roleLabels[r.role]}</Badge>
                        <span className="text-xs text-ink-400">
                          {r.assigner_name ? `by ${r.assigner_name}` : ''} · {timeAgo(r.created_at)}
                        </span>
                        <button
                          onClick={() => setConfirmRemove(r)}
                          className="ml-1 rounded p-1 text-ink-400 transition hover:bg-danger-500/10 hover:text-danger-400"
                          title="Remove role"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Assign Role Modal */}
      <Modal open={showAssign} onClose={() => { setShowAssign(false); setSelectedUser(null); setSearchQuery(''); setSearchResults([]); setActionError(''); }} title="Assign Admin Role" size="md">
        <div className="space-y-4">
          <div>
            <label className="label">Search User</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                placeholder="Search by name or referral code..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedUser(null); }}
                className="input pl-10"
              />
            </div>
            {searching && <p className="mt-1 text-xs text-ink-400">Searching...</p>}
            {!searching && searchResults.length > 0 && !selectedUser && (
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-ink-200 bg-ink-800/50 p-2">
                {searchResults.map(user => (
                  <button
                    key={user.id}
                    onClick={() => { setSelectedUser(user); setSearchQuery(user.name); setSearchResults([]); }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-ink-800"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{user.name}</p>
                      <p className="text-xs text-ink-400">{user.referral_code}</p>
                    </div>
                    {user.is_admin && <Badge tone="brand">Super Admin</Badge>}
                  </button>
                ))}
              </div>
            )}
            {selectedUser && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-brand-600/10 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-white">{selectedUser.name}</p>
                  <p className="text-xs text-ink-400">{selectedUser.referral_code}</p>
                </div>
                <button onClick={() => { setSelectedUser(null); setSearchQuery(''); }} className="text-xs text-ink-400 hover:text-white">
                  Change
                </button>
              </div>
            )}
          </div>

          <Select
            label="Role"
            name="role"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as AdminRole)}
          >
            {allRoles.map(r => (
              <option key={r} value={r}>{roleLabels[r]}</option>
            ))}
          </Select>
          <p className="text-xs text-ink-400">{roleDescriptions[selectedRole]}</p>

          {actionError && (
            <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{actionError}</div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setShowAssign(false); setSelectedUser(null); setSearchQuery(''); setSearchResults([]); setActionError(''); }}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedUser || assigning}>
              {assigning ? <Spinner size="sm" /> : <><Plus className="h-4 w-4" /> Assign Role</>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Remove Role Confirmation */}
      <Modal open={!!confirmRemove} onClose={() => { setConfirmRemove(null); setActionError(''); }} title="Remove Role" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-danger-500/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-danger-400" />
            <div>
              <p className="text-sm font-medium text-white">
                Remove {confirmRemove && roleLabels[confirmRemove.role]} from {confirmRemove?.user_name}?
              </p>
              <p className="mt-1 text-xs text-ink-400">
                This will revoke access to all features associated with this role. The user will lose access immediately.
              </p>
            </div>
          </div>
          {actionError && (
            <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{actionError}</div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setConfirmRemove(null); setActionError(''); }}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRemove} disabled={removing}>
              {removing ? <Spinner size="sm" /> : <><Trash2 className="h-4 w-4" /> Remove Role</>}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminPageWrapper>
  );
}
