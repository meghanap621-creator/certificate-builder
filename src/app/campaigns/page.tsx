'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import Toast from '@/components/Toast';
import Link from 'next/link';
import { Icons } from '@/components/Icons';
import { useRouter } from 'next/navigation';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  templateId: string;
  status: 'Draft' | 'Processing' | 'Completed' | 'Failed';
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: string;
  name: string;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // New Campaign Form State
  const [isCreating, setIsCreating] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDesc, setNewCampaignDesc] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, tRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/templates'),
      ]);

      if (cRes.ok && tRes.ok) {
        const cData = await cRes.json();
        const tData = await tRes.json();
        setCampaigns(cData.campaigns || []);
        setTemplates(tData.templates || []);
      } else {
        setToast({ message: 'Failed to load campaigns or templates.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Network error loading page data.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) {
      setToast({ message: 'Campaign name is required.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampaignName.trim(),
          description: newCampaignDesc.trim(),
          templateId: selectedTemplateId,
          // Set standard default templates for email body/subject
          emailSubject: 'Congratulations {{student_name}}! Your Completion Certificate',
          emailBody: 'Dear {{student_name}},\n\nCongratulations on completing your internship/course.\nPlease find your certificate attached.\n\nBest regards,\nOrganization',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setToast({ message: 'Campaign created successfully!', type: 'success' });
        setIsCreating(false);
        setNewCampaignName('');
        setNewCampaignDesc('');
        setSelectedTemplateId('');
        // Direct redirection to the Campaign Wizard
        router.push(`/campaigns/${data.campaign.id}`);
      } else {
        setToast({ message: data.error || 'Failed to create campaign.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error establishing campaign run.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? All uploaded students, certificates, and delivery logs will be permanently deleted.')) return;

    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setToast({ message: 'Campaign deleted successfully.', type: 'success' });
        loadData();
      } else {
        setToast({ message: 'Failed to delete campaign.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error deleting campaign.', type: 'error' });
    }
  };

  return (
    <DashboardLayout title="Campaigns" subtitle="Configure and execute email delivery certificate campaigns.">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <button className="btn btn-primary" onClick={() => setIsCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icons.Campaigns size={16} />
          <span>New Certificate Campaign</span>
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <div className="spinner" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="glass-panel" style={{ padding: '64px', textAlign: 'center', maxWidth: '600px', margin: '40px auto' }}>
          <Icons.Campaigns size={48} style={{ color: '#6366f1', marginBottom: '16px', opacity: 0.8 }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f4f6', marginBottom: '8px' }}>No Campaigns Found</h3>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '24px' }}>
            You haven't configured any campaigns yet. Setup a wizard run to deliver custom PDF certificates to spreadsheets of emails.
          </p>
          <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
            Create First Campaign
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {campaigns.map((camp) => {
            const tpl = templates.find((t) => t.id === camp.templateId);
            let statusClass = 'badge-secondary';
            if (camp.status === 'Completed') statusClass = 'badge-success';
            if (camp.status === 'Processing') statusClass = 'badge-primary';
            if (camp.status === 'Failed') statusClass = 'badge-danger';

            return (
              <div key={camp.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '200px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f4f6' }}>{camp.name}</h4>
                    <span className={`badge ${statusClass}`}>{camp.status}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {camp.description || 'No description provided.'}
                  </p>
                  <div style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
                    <span>
                      <strong style={{ color: '#d1d5db' }}>Layout Design: </strong>
                      {tpl?.name || <em style={{ color: '#ef4444' }}>None (Needs mapping)</em>}
                    </span>
                    <span>
                      <strong style={{ color: '#d1d5db' }}>Created: </strong>
                      {new Date(camp.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <Link href={`/campaigns/${camp.id}`} style={{ flex: 1 }}>
                    <button className="btn btn-primary" style={{ width: '100%', padding: '10px 0', fontSize: '13px' }}>
                      Configure & Run
                    </button>
                  </Link>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleDelete(camp.id)}
                    style={{ padding: '10px 14px', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                  >
                    <Icons.X size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Creation Modal */}
      {isCreating && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(5, 7, 13, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '32px', animation: 'scaleIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#f3f4f6' }}>Create Campaign</h3>
              <button
                onClick={() => setIsCreating(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
              >
                <Icons.X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g. JAIVA Internship April-July 2026"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
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
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>Description</label>
                <textarea
                  placeholder="Summarize the intent of this certificate campaign run"
                  value={newCampaignDesc}
                  onChange={(e) => setNewCampaignDesc(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(15, 21, 36, 0.8)',
                    color: '#fff',
                    outline: 'none',
                    resize: 'vertical',
                    minHeight: '80px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>Bind Layout Design (Optional)</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(15, 21, 36, 0.8)',
                    color: '#fff',
                    outline: 'none',
                  }}
                >
                  <option value="">-- Do not bind template yet --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                  You can bind a design now or configure/upload one during the campaign wizard later.
                </span>
              </div>

              <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '14px', marginTop: '10px' }}>
                {saving ? 'Creating...' : 'Create Campaign & Open Wizard'}
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
