'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import Toast from '@/components/Toast';

export default function SettingsPage() {
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');

        if (res.ok) {
          const data = await res.json();

          if (data.settings) {
            setSmtpHost(data.settings.smtpHost || '');

            const port = Number(data.settings.smtpPort);

            setSmtpPort(
              Number.isFinite(port) && port > 0
                ? String(port)
                : '587'
            );

            setSmtpUser(data.settings.smtpUser || '');

            /*
             * Don't display an old masked password
             * as the actual password value.
             */
            setSmtpPass('');

            setSmtpFromEmail(
              data.settings.smtpFromEmail || ''
            );

            setSmtpFrom(
              data.settings.smtpFrom || ''
            );
          }
        }
      } catch (err) {
        console.error(
          'Error loading settings:',
          err
        );

        setToast({
          message: 'Failed to load SMTP settings.',
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleSave = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    const portNumber = Number(smtpPort);

    if (
      !Number.isFinite(portNumber) ||
      portNumber <= 0 ||
      portNumber > 65535
    ) {
      setToast({
        message:
          'Please enter a valid SMTP port between 1 and 65535.',
        type: 'error',
      });

      return;
    }

    if (!smtpHost.trim()) {
      setToast({
        message: 'SMTP Host is required.',
        type: 'error',
      });

      return;
    }

    if (!smtpUser.trim()) {
      setToast({
        message: 'SMTP Username / Login is required.',
        type: 'error',
      });

      return;
    }

    if (!smtpPass.trim()) {
      setToast({
        message: 'SMTP Password / API key is required.',
        type: 'error',
      });

      return;
    }

    if (!smtpFromEmail.trim()) {
      setToast({
        message: 'Sender Email Address is required.',
        type: 'error',
      });

      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          smtpHost: smtpHost.trim(),

          smtpPort: portNumber,

          smtpUser: smtpUser.trim(),

          smtpPass: smtpPass,

          smtpFromEmail:
            smtpFromEmail.trim(),

          smtpFrom:
            smtpFrom.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setToast({
          message:
            data.message ||
            'Settings saved successfully!',
          type: 'success',
        });

        /*
         * Clear the password after saving.
         * This prevents the secret from remaining
         * in the browser form state.
         */
        setSmtpPass('');
      } else {
        setToast({
          message:
            data.error ||
            'Failed to save settings.',
          type: 'error',
        });
      }
    } catch (err) {
      console.error(
        'Error saving settings:',
        err
      );

      setToast({
        message:
          'Network error. Please try again.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="SMTP Settings"
      subtitle="Configure email server for transactional and bulk certificate delivery."
    >
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {loading ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '48px',
          }}
        >
          <div className="spinner" />
        </div>
      ) : (
        <div
          className="glass-panel"
          style={{
            maxWidth: '650px',
            padding: '32px',
            margin: '0 auto',
          }}
        >
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '24px',
              color: '#f3f4f6',
              borderBottom:
                '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: '12px',
            }}
          >
            Sender Configuration
          </h2>

          <form
            onSubmit={handleSave}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* SMTP HOST + PORT */}

            <div
              style={{
                display: 'flex',
                gap: '20px',
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <label
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#9ca3af',
                  }}
                >
                  SMTP Host
                </label>

                <input
                  type="text"
                  placeholder="smtp.resend.com"
                  value={smtpHost}
                  onChange={(e) =>
                    setSmtpHost(e.target.value)
                  }
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border:
                      '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor:
                      'rgba(15, 21, 36, 0.8)',
                    color: '#fff',
                    outline: 'none',
                  }}
                  required
                />
              </div>

              <div
                style={{
                  width: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <label
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#9ca3af',
                  }}
                >
                  Port
                </label>

                <input
                  type="number"
                  placeholder="465"
                  min="1"
                  max="65535"
                  value={smtpPort}
                  onChange={(e) =>
                    setSmtpPort(e.target.value)
                  }
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border:
                      '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor:
                      'rgba(15, 21, 36, 0.8)',
                    color: '#fff',
                    outline: 'none',
                  }}
                  required
                />
              </div>
            </div>

            {/* SMTP USERNAME */}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#9ca3af',
                }}
              >
                SMTP Username / Login
              </label>

              <input
                type="text"
                placeholder="For Resend: resend"
                value={smtpUser}
                onChange={(e) =>
                  setSmtpUser(e.target.value)
                }
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border:
                    '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor:
                    'rgba(15, 21, 36, 0.8)',
                  color: '#fff',
                  outline: 'none',
                }}
                required
              />
            </div>

            {/* SMTP PASSWORD */}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#9ca3af',
                }}
              >
                SMTP Password
              </label>

              <input
                type="password"
                placeholder="Enter SMTP password or Resend API key"
                value={smtpPass}
                onChange={(e) =>
                  setSmtpPass(e.target.value)
                }
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border:
                    '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor:
                    'rgba(15, 21, 36, 0.8)',
                  color: '#fff',
                  outline: 'none',
                }}
                required
              />
            </div>

            {/* FROM NAME */}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#9ca3af',
                }}
              >
                Sender Name (From name)
              </label>

              <input
                type="text"
                placeholder="Certificate Builder"
                value={smtpFrom}
                onChange={(e) =>
                  setSmtpFrom(e.target.value)
                }
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border:
                    '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor:
                    'rgba(15, 21, 36, 0.8)',
                  color: '#fff',
                  outline: 'none',
                }}
              />
            </div>

            {/* FROM EMAIL */}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <label
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#9ca3af',
                }}
              >
                Sender Email Address
              </label>

              <input
                type="email"
                placeholder="certificates@yourdomain.com"
                value={smtpFromEmail}
                onChange={(e) =>
                  setSmtpFromEmail(
                    e.target.value
                  )
                }
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border:
                    '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor:
                    'rgba(15, 21, 36, 0.8)',
                  color: '#fff',
                  outline: 'none',
                }}
                required
              />

              <span
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                }}
              >
                Must be a verified sender address
                in your email provider. This is the
                address recipients see in their inbox.
              </span>
            </div>

            {/* SAVE BUTTON */}

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
                  <div
                    className="spinner"
                    style={{
                      width: '16px',
                      height: '16px',
                      borderWidth: '2px',
                    }}
                  />

                  <span>
                    Saving Settings...
                  </span>
                </>
              ) : (
                <span>
                  Save SMTP Configuration
                </span>
              )}
            </button>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}