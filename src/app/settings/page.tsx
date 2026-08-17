'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import Toast from '@/components/Toast';

export default function SettingsPage() {
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState('');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings) {
            setSmtpHost(data.settings.smtpHost || '');
            setSmtpPort(data.settings.smtpPort || 587);
            setSmtpUser(data.settings.smtpUser || '');
            setSmtpPass(data.settings.smtpPass || '');
            setSmtpSecure(!!data.settings.smtpSecure);
            setSmtpFrom(data.settings.smtpFrom || '');
          }
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPass,
          smtpSecure,
          smtpFrom,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ message: data.message || 'Settings saved successfully!', type: 'success' });
        // Refill password field as placeholder
        if (smtpPass) {
          setSmtpPass('********');
        }
      } else {
        setToast({ message: data.error || 'Failed to save settings.', type: 'error' });
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setToast({ message: 'Network error. Please try again.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="SMTP Settings" subtitle="Configure email server for transactional and bulk certificate delivery.">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="glass-panel" style={{ maxWidth: '650px', padding: '32px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', color: '#f3f4f6', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
            Sender Configuration
          </h2>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>SMTP Host</label>
                <input
                  type="text"
                  placeholder="smtp.mailgun.org or smtp.gmail.com"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(15, 21, 36, 0.8)',
                    color: '#fff',
                    outline: 'none',
                  }}
                  required
                />
              </div>

              <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>Port</label>
                <input
                  type="number"
                  placeholder="587"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(parseInt(e.target.value, 10))}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(15, 21, 36, 0.8)',
                    color: '#fff',
                    outline: 'none',
                  }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>SMTP Username / Login</label>
              <input
                type="text"
                placeholder="postmaster@yourdomain.com or email address"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'rgba(15, 21, 36, 0.8)',
                  color: '#fff',
                  outline: 'none',
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>SMTP Password</label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'rgba(15, 21, 36, 0.8)',
                  color: '#fff',
                  outline: 'none',
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>Sender Name (From name)</label>
              <input
                type="text"
                placeholder="e.g. JAIVA Creative Labs"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'rgba(15, 21, 36, 0.8)',
                  color: '#fff',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <input
                type="checkbox"
                id="smtpSecure"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  accentColor: '#6366f1',
                }}
              />
              <label htmlFor="smtpSecure" style={{ fontSize: '14px', color: '#d1d5db', cursor: 'pointer', userSelect: 'none' }}>
                Use SSL Connection (Check if using port 465, uncheck for port 587 or 25)
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{
                marginTop: '16px',
                padding: '14px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {saving ? (
                <>
                  <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                  <span>Saving Settings...</span>
                </>
              ) : (
                <span>Save SMTP Configuration</span>
              )}
            </button>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
