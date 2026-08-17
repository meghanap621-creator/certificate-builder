'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';
import { Icons } from '@/components/Icons';

interface Campaign {
  id: string;
  name: string;
  templateId: string;
  status: 'Draft' | 'Processing' | 'Completed' | 'Failed';
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats calculation
  const totalCampaigns = campaigns.length;
  const totalTemplates = templates.length;

  // Calculate sent/completed certificates across all campaigns
  const totalSent = logs.filter(l => l.emailStatus === 'Sent').length;
  const totalFailed = logs.filter(l => l.emailStatus === 'Failed').length;
  const totalProcessed = totalSent + totalFailed;
  const successRate = totalProcessed > 0 ? Math.round((totalSent / totalProcessed) * 100) : 100;

  useEffect(() => {
    async function fetchData() {
      try {
        const [campRes, tempRes] = await Promise.all([
          fetch('/api/campaigns'),
          fetch('/api/templates'),
        ]);

        if (campRes.ok && tempRes.ok) {
          const campData = await campRes.json();
          const tempData = await tempRes.json();
          setCampaigns(campData.campaigns || []);
          setTemplates(tempData.templates || []);

          // Try to aggregate logs from all campaigns to show global stats
          const allLogs: any[] = [];
          for (const camp of (campData.campaigns || [])) {
            const stuRes = await fetch(`/api/campaigns/${camp.id}/students`);
            if (stuRes.ok) {
              const stuData = await stuRes.ok ? await stuRes.json() : { logs: [] };
              allLogs.push(...(stuData.logs || []));
            }
          }
          setLogs(allLogs);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <DashboardLayout title="Dashboard" subtitle="Welcome to your workspace. Monitor and launch bulk personalization certificate runs.">
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Quick Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px' }}>
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(99, 102, 241, 0.15)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#6366f1' }}>
                <Icons.Campaigns size={24} />
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500, display: 'block', textTransform: 'uppercase' }}>Campaigns</span>
                <span style={{ fontSize: '28px', fontWeight: 700, color: '#f3f4f6' }}>{totalCampaigns}</span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(236, 72, 153, 0.15)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#ec4899' }}>
                <Icons.Templates size={24} />
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500, display: 'block', textTransform: 'uppercase' }}>Templates</span>
                <span style={{ fontSize: '28px', fontWeight: 700, color: '#f3f4f6' }}>{totalTemplates}</span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(6, 182, 212, 0.15)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#06b6d4' }}>
                <Icons.Check size={24} />
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500, display: 'block', textTransform: 'uppercase' }}>Emails Sent</span>
                <span style={{ fontSize: '28px', fontWeight: 700, color: '#f3f4f6' }}>{totalSent}</span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#10b981' }}>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>%</span>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500, display: 'block', textTransform: 'uppercase' }}>Success Rate</span>
                <span style={{ fontSize: '28px', fontWeight: 700, color: '#f3f4f6' }}>{successRate}%</span>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="glass-panel" style={{ padding: '32px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#f3f4f6', marginBottom: '24px' }}>Quick Starts</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
              <Link href="/campaigns">
                <div className="nav-item" style={{
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, border 0.2s',
                }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.transform = 'none'; }}
                >
                  <Icons.Campaigns size={24} style={{ color: '#6366f1' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f3f4f6' }}>New Certificate Campaign</h3>
                  <p style={{ fontSize: '13px', color: '#9ca3af' }}>Create a step-by-step wizard to import students, personalize templates, and deliver bulk PDF certifications.</p>
                </div>
              </Link>

              <Link href="/templates">
                <div className="nav-item" style={{
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, border 0.2s',
                }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.transform = 'none'; }}
                >
                  <Icons.Templates size={24} style={{ color: '#ec4899' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f3f4f6' }}>Template Designer</h3>
                  <p style={{ fontSize: '13px', color: '#9ca3af' }}>Upload an existing PDF design or construct layout templates from scratch with custom fonts and alignment variables.</p>
                </div>
              </Link>

              <Link href="/settings">
                <div className="nav-item" style={{
                  padding: '24px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, border 0.2s',
                }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.transform = 'none'; }}
                >
                  <Icons.Settings size={24} style={{ color: '#06b6d4' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f3f4f6' }}>Configure Mail Deliveries</h3>
                  <p style={{ fontSize: '13px', color: '#9ca3af' }}>Configure your SMTP server settings so bulk messages arrive correctly in student inboxes with valid attachments.</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Recent Campaigns Table */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f4f6', marginBottom: '16px' }}>Recent Campaigns</h2>
            {campaigns.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '24px' }}>No campaigns initialized yet.</p>
            ) : (
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: 600 }}>Campaign Name</th>
                    <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: 600 }}>Template Bind</th>
                    <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: 600 }}>Created Date</th>
                    <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 5).map((camp) => {
                    const tpl = templates.find((t) => t.id === camp.templateId);
                    let statusClass = 'badge-secondary';
                    if (camp.status === 'Completed') statusClass = 'badge-success';
                    if (camp.status === 'Processing') statusClass = 'badge-primary';
                    if (camp.status === 'Failed') statusClass = 'badge-danger';

                    return (
                      <tr key={camp.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 500, color: '#f3f4f6' }}>{camp.name}</td>
                        <td style={{ padding: '12px 16px', color: '#9ca3af' }}>{tpl?.name || 'Unbound'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={`badge ${statusClass}`}>{camp.status}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#9ca3af' }}>
                          {new Intl.DateTimeFormat('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          }).format(new Date(camp.createdAt))}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Link href={`/campaigns/${camp.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                            Manage Campaign
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
