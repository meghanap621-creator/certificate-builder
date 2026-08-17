'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icons } from '@/components/Icons';
import Toast from '@/components/Toast';
import Link from 'next/link';

export default function SignupPage() {
    const router = useRouter();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const [toast, setToast] = useState<{
        message: string;
        type: 'success' | 'error';
    } | null>(null);

    // Redirect already logged-in users
    useEffect(() => {
        async function checkSession() {
            try {
                const res = await fetch('/api/auth/me');

                if (res.ok) {
                    router.replace('/dashboard');
                }
            } catch {
                // No active session
            }
        }

        checkSession();
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim() || !email.trim() || !password) {
            setToast({
                message: 'Please fill in all fields.',
                type: 'error',
            });
            return;
        }

        if (password.length < 6) {
            setToast({
                message: 'Password must be at least 6 characters.',
                type: 'error',
            });
            return;
        }

        if (password !== confirmPassword) {
            setToast({
                message: 'Passwords do not match.',
                type: 'error',
            });
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name,
                    email,
                    password,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setToast({
                    message: data.error || 'Signup failed.',
                    type: 'error',
                });
                return;
            }

            setToast({
                message: 'Account created successfully!',
                type: 'success',
            });

            router.replace('/dashboard');
        } catch (error) {
            console.error('Signup error:', error);

            setToast({
                message: 'Network error. Please try again.',
                type: 'error',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                padding: '20px',
            }}
        >
            <div
                className="glass-panel"
                style={{
                    width: '100%',
                    maxWidth: '440px',
                    padding: '40px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                    backgroundColor: 'rgba(22, 30, 49, 0.75)',
                }}
            >
                {/* Header */}
                <div style={{ textAlign: 'center' }}>
                    <div
                        style={{
                            display: 'inline-flex',
                            padding: '12px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(99, 102, 241, 0.12)',
                            marginBottom: '16px',
                            color: '#6366f1',
                        }}
                    >
                        <Icons.Templates size={32} />
                    </div>

                    <h2
                        style={{
                            fontSize: '24px',
                            fontWeight: 700,
                            letterSpacing: '-0.5px',
                        }}
                    >
                        Create Account
                    </h2>

                    <p
                        style={{
                            color: 'var(--text-muted)',
                            fontSize: '14px',
                            marginTop: '4px',
                        }}
                    >
                        Create your Certificate Builder workspace
                    </p>
                </div>

                {/* Signup Form */}
                <form
                    onSubmit={handleSubmit}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                    }}
                >
                    {/* Name */}
                    <div className="form-group">
                        <label className="form-label">Full Name</label>

                        <input
                            type="text"
                            className="form-control"
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>

                    {/* Email */}
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

                    {/* Password */}
                    <div className="form-group">
                        <label className="form-label">Password</label>

                        <input
                            type="password"
                            className="form-control"
                            placeholder="At least 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    {/* Confirm Password */}
                    <div className="form-group">
                        <label className="form-label">Confirm Password</label>

                        <input
                            type="password"
                            className="form-control"
                            placeholder="Re-enter your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{
                            width: '100%',
                            padding: '12px',
                            marginTop: '8px',
                        }}
                        disabled={loading}
                    >
                        {loading ? (
                            <Icons.Spinner size={16} />
                        ) : (
                            <span>Create Account</span>
                        )}
                    </button>
                </form>

                {/* Login Link */}
                <div
                    style={{
                        textAlign: 'center',
                        fontSize: '14px',
                        color: 'var(--text-muted)',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                        paddingTop: '20px',
                    }}
                >
                    Already have an account?{' '}
                    <Link
                        href="/login"
                        style={{
                            color: '#6366f1',
                            fontWeight: 600,
                        }}
                    >
                        Sign In
                    </Link>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className="toast-container">
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                </div>
            )}
        </div>
    );
}