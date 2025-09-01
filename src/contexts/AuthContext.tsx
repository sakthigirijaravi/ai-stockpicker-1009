import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, testConnection } from '../lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  subscription_status: 'free' | 'premium';
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConnected: boolean;
  connectionError: string | null;
  isInitialized: boolean;
  userProfile: UserProfile | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<{ error: any }>;
  updateProfile: (updates: { full_name?: string; avatar_url?: string }) => Promise<{ error: any }>;
  restoreSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Enhanced user profile creation with error handling
  const createUserProfile = async (user: User): Promise<UserProfile | null> => {
    try {
      // Check if profile already exists
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (existingProfile) {
        return existingProfile;
      }

      // Create new profile
      const profileData = {
        id: user.id,
        email: user.email!,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        subscription_status: 'free' as const
      };

      const { data: newProfile, error } = await supabase
        .from('user_profiles')
        .insert(profileData)
        .select()
        .single();

      if (error) {
        console.error('Error creating user profile:', error);
        return null;
      }

      return newProfile;
    } catch (error) {
      console.error('Error in createUserProfile:', error);
      return null;
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      // Test connection first
      const connectionTest = await testConnection();
      if (!connectionTest.connected) {
        setConnectionError('Database connection failed');
        setIsConnected(false);
        return null;
      }

      setIsConnected(true);
      setConnectionError(null);

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        // If profile doesn't exist, try to create it
        if (error.code === 'PGRST116') {
          console.log('User profile not found, creating new profile...');
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const newProfile = await createUserProfile(user);
            setUserProfile(newProfile);
            return newProfile;
          }
        }
        console.error('Error fetching user profile:', error);
        setConnectionError('Failed to load user profile');
        return null;
      }
      
      setUserProfile(data);
      return data;
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      setConnectionError('Network error while loading profile');
      setIsConnected(false);
      return null;
    }
  };

  const restoreSession = async () => {
    try {
      setLoading(true);
      
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Error restoring session:', error);
        setConnectionError('Failed to restore session');
        return;
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session) {
        await fetchUserProfile(session.user.id);
      }
    } catch (error) {
      console.error('Error in restoreSession:', error);
      setConnectionError('Session restoration failed');
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      setConnectionError(null);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      
      if (error) {
        setConnectionError('Google sign-in failed');
      }
      
      return { error };
    } catch (error) {
      setConnectionError('Authentication error');
      return { error };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        setLoading(true);
        
        // Test database connection first
        const connectionTest = await testConnection();
        if (!connectionTest.connected) {
          setConnectionError('Database connection failed');
          setIsConnected(false);
          setLoading(false);
          setIsInitialized(true);
          return;
        }

        setIsConnected(true);
        setConnectionError(null);
        
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error getting session:', error);
          setConnectionError('Session validation failed');
        } else {
          setSession(session);
          setUser(session?.user ?? null);
          
          if (session) {
            await fetchUserProfile(session.user.id);
          }
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error);
        setConnectionError('Initialization failed');
        setIsConnected(false);
      } finally {
        setLoading(false);
        setIsInitialized(true);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.id);
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (event === 'SIGNED_IN' && session) {
          setLoading(true);
          await fetchUserProfile(session.user.id);
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          setUserProfile(null);
          setConnectionError(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        return { error };
      }

      // Create user profile if sign up was successful
      if (data.user && !error) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: data.user.id,
            email: data.user.email!,
            full_name: fullName,
          });

        if (profileError) {
          console.error('Error creating user profile:', profileError);
        }
      }

      return { error };
    } catch (error) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error signing out:', error);
      }
    } catch (error) {
      console.error('Error in signOut:', error);
    }
  };

  const updateProfile = async (updates: { full_name?: string; avatar_url?: string }) => {
    try {
      if (!user) {
        return { error: new Error('No user logged in') };
      }

      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id);

      return { error };
    } catch (error) {
      return { error };
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    isConnected,
    connectionError,
    isInitialized,
    userProfile,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    updateProfile,
    restoreSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}