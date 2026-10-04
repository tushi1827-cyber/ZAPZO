import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile, AdminPermission } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  permissions: AdminPermission[];
  hasPermission: (perm: AdminPermission) => boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error) return;
    setProfile(data as Profile | null);
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_permissions');
      if (!error && data) {
        setPermissions(data as AdminPermission[]);
      } else {
        setPermissions([]);
      }
    } catch {
      setPermissions([]);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
    await loadPermissions();
  }, [user, loadProfile, loadPermissions]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        Promise.all([
          loadProfile(data.session.user.id),
          loadPermissions(),
        ]).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await Promise.all([
            loadProfile(newSession.user.id),
            loadPermissions(),
          ]);
        } else {
          setProfile(null);
          setPermissions([]);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, loadPermissions]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPermissions([]);
  }, []);

  const isAdmin = Boolean(
    profile?.is_admin || user?.app_metadata?.is_admin === true,
  );

  const isSuperAdmin = isAdmin;

  const hasPermission = useCallback((perm: AdminPermission) => {
    if (isSuperAdmin) return true;
    return permissions.includes(perm);
  }, [isSuperAdmin, permissions]);

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, isAdmin, isSuperAdmin, permissions, hasPermission, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
