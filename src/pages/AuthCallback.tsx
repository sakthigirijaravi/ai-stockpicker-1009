import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { testConnection } from '../lib/supabase';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { user, isInitialized, connectionError } = useAuth();
  const [status, setStatus] = useState<'processing' | 'testing_connection' | 'redirecting' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        setStatus('processing');
        
        // Wait for auth context to initialize
        let attempts = 0;
        while (!isInitialized && attempts < 10) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }

        if (!isInitialized) {
          throw new Error('Authentication initialization timeout');
        }

        // Test database connection
        setStatus('testing_connection');
        const connectionTest = await testConnection();
        if (!connectionTest.connected) {
          throw new Error('Database connection failed');
        }

        // Check for connection errors
        if (connectionError) {
          throw new Error(connectionError);
        }
        
        setStatus('redirecting');
        
        // Get stored redirect location or default
        const storedLocation = sessionStorage.getItem('redirectAfterAuth');
        sessionStorage.removeItem('redirectAfterAuth');
        
        const redirectTo = storedLocation || (user ? '/momentum' : '/');
        navigate(redirectTo, { replace: true });
        
      } catch (error) {
        console.error('Error handling auth callback:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
        setStatus('error');
        
        // Fallback redirect after error
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 5000);
      }
    };

    handleAuthCallback();
  }, [navigate, user, isInitialized, connectionError]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        {status === 'processing' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Completing sign in...</p>
            <p className="text-sm text-gray-500 mt-2">Validating authentication...</p>
          </>
        )}
        
        {status === 'testing_connection' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Connecting to database...</p>
            <p className="text-sm text-gray-500 mt-2">Testing connection...</p>
          </>
        )}
        
        {status === 'redirecting' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Redirecting...</p>
            <p className="text-sm text-gray-500 mt-2">Taking you to your dashboard...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-red-600 text-xl">!</span>
            </div>
            <p className="text-red-600 mb-2">Authentication Error</p>
            <p className="text-sm text-gray-600 mb-4">{errorMessage}</p>
            <p className="text-xs text-gray-500 mt-2">Redirecting to home page in 5 seconds...</p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Home Page
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;