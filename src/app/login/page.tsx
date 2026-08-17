'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icons } from '@/components/Icons';
import Toast from '@/components/Toast';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    async function checkSession() {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        router.replace('/dashboard');
      }
    }
    checkSession();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setToast({ message: 'Please enter both email and password.', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        setToast({ message: data.error || 'Login failed.', type: 'error' });
        return;
      }

      setToast({ message: 'Login successful!', type: 'success' });
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      setToast({ message: 'Network error. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '20px',
      position: 'relative'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        backgroundColor: 'rgba(22, 30, 49, 0.75)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            padding: '12px',
            borderRadius: '12px',
            backgroundColor: 'rgba(99, 102, 241, 0.12)',
            marginBottom: '16px',
            color: '#6366f1'
          }}>
            <Icons.Templates size={32} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>Welcome Back</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Sign in to manage your certificate campaigns
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="name@organization.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? <Icons.Spinner size={16} /> : <span>Sign In</span>}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          fontSize: '14px',
          color: 'var(--text-muted)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '20px'
        }}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" style={{ color: '#6366f1', fontWeight: 600 }}>
            Sign Up
          </Link>
        </div>
      </div>

      {toast && (
        <div className="toast-container">
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
}
