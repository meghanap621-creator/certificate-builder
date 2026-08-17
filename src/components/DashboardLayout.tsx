'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Icons } from './Icons';
import Link from 'next/link';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Authenticate user on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (!res.ok) throw new Error('Auth fetch failed');
        const data = await res.json();
        setUser(data.user);
      } catch (err) {
        console.error('Session validation error:', err);
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: '16px',
        backgroundColor: '#0b0f19'
      }}>
        <div className="spinner" style={{ width: '40px', height: '40px' }} />
        <span style={{ color: '#9ca3af', fontWeight: 500, fontSize: '14px' }}>Loading workspace...</span>
      </div>
    );
  }

  // Sidebar link items
  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <Icons.Dashboard size={20} /> },
    { name: 'Campaigns', path: '/campaigns', icon: <Icons.Campaigns size={20} /> },
    { name: 'Templates', path: '/templates', icon: <Icons.Templates size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Icons.Settings size={20} /> },
  ];

  return (
    <div className="layout-wrapper">
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <Icons.Templates size={26} style={{ color: '#6366f1' }} />
          <span className="logo-text">CertBuilder</span>
        </div>

        <nav className="nav-links" style={{ flex: 1 }}>
          {menuItems.map((item) => {
            const isActive = pathname.startsWith(item.path);
            return (
              <Link href={item.path} key={item.path}>
                <div className={`nav-item ${isActive ? 'active' : ''}`}>
                  {item.icon}
                  <span>{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User profile and logout */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px', paddingLeft: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#f3f4f6' }}>{user?.name}</span>
            <span style={{ fontSize: '12px', color: '#9ca3af', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user?.email}</span>
          </div>
          <button className="btn btn-secondary" onClick={handleLogout} style={{ width: '100%', padding: '10px' }}>
            <Icons.Logout size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content grid */}
      <main className="main-content">
        <header className="top-header">
          <div className="header-title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="user-profile-menu">
            <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: '13px' }}>
              ✓ Live Workspace
            </span>
          </div>
        </header>
        
        {/* Children Render Area */}
        <div className="page-body-container" style={{ animation: 'slideIn 0.4s ease-out' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
