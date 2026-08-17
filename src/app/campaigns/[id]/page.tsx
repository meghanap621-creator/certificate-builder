'use client';

import React, { useState, useEffect, use } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import Toast from '@/components/Toast';
import { Icons } from '@/components/Icons';
import * as XLSX from 'xlsx';
import Link from 'next/link';

interface Student {
  id: string;
  name: string;
  email: string;
  collegeName?: string;
  course?: string;
  department?: string;
  role?: string;
  organizationName?: string;
  startDate?: string;
  endDate?: string;
  certDate?: string;
  certId: string;
  customFields?: Record<string, string>;
}

interface DeliveryLog {
  id: string;
  studentId: string;
  recipientEmail: string;
  certStatus: 'Pending' | 'Generating' | 'Generated' | 'Failed';
  emailStatus: 'Pending' | 'Sending' | 'Sent' | 'Failed';
  sentAt?: string;
  error?: string;
  attempts: number;
}

interface Template {
  id: string;
  name: string;
  type: 'upload' | 'editor';
  backgroundImage?: string;
  width: number;
  height: number;
  elements: any[];
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  templateId: string;
  emailSubject: string;
  emailBody: string;
  status: 'Draft' | 'Processing' | 'Completed' | 'Failed';
}

const DEFAULT_FIELDS = [
  { key: 'student_name', label: 'Student Name' },
  { key: 'email', label: 'Email' },
  { key: 'college_name', label: 'College / Institution' },
  { key: 'course', label: 'Course' },
  { key: 'department', label: 'Department' },
  { key: 'internship_role', label: 'Internship / Role' },
  { key: 'organization_name', label: 'Organization Name' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'end_date', label: 'End Date' },
  { key: 'certificate_date', label: 'Certificate Date' },
];

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params);

  // Core Data
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  
  // App states
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  // File parsing states
  const [rawFileHeaders, setRawFileHeaders] = useState<string[]>([]);
  const [rawFileData, setRawFileData] = useState<any[]>([]);

  // Preview Student Selection
  const [previewStudentIndex, setPreviewStudentIndex] = useState(0);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Job background processing state
  const [jobProgress, setJobProgress] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load details
  const loadCampaignData = async () => {
    try {
      const campRes = await fetch(`/api/campaigns/${campaignId}`);
      if (!campRes.ok) throw new Error('Campaign details failed to load');
      const campData = await campRes.json();
      setCampaign(campData.campaign);

      // Fetch templates
      const tempRes = await fetch('/api/templates');
      if (tempRes.ok) {
        const tempData = await tempRes.json();
        setTemplates(tempData.templates || []);
      }

      // Fetch students and mappings and logs
      const stuRes = await fetch(`/api/campaigns/${campaignId}/students`);
      if (stuRes.ok) {
        const stuData = await stuRes.json();
        setStudents(stuData.students || []);
        setLogs(stuData.logs || []);
        setMappings(stuData.mappings || {});
      }

      // Check SMTP config status
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        const settings = settingsData.settings;
        if (settings && settings.smtpHost && settings.smtpUser) {
          setSmtpConfigured(true);
        }
      }
    } catch (err: any) {
      console.error(err);
      setToast({ message: err.message || 'Error loading campaign details.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaignData();
  }, [campaignId]);

  // Background Job poller
  useEffect(() => {
    let interval: any;
    if (isProcessing || (campaign && campaign.status === 'Processing')) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/campaigns/${campaignId}/process`);
          if (res.ok) {
            const data = await res.json();
            if (data.job) {
              setJobProgress(data.job);
              if (data.job.status === 'Completed' || data.job.status === 'Failed') {
                setIsProcessing(false);
                // Reload delivery logs
                loadCampaignData();
                setToast({ message: `Campaign completed processing! Status: ${data.job.status}`, type: data.job.status === 'Completed' ? 'success' : 'error' });
              } else {
                setIsProcessing(true);
              }
            }
          }
        } catch (err) {
          console.error(err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isProcessing, campaign]);

  // Excel / CSV File upload parser
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        if (data.length === 0) {
          setToast({ message: 'The uploaded file contains no data.', type: 'error' });
          return;
        }
        const headers = Object.keys(data[0] as any);
        setRawFileHeaders(headers);
        setRawFileData(data);

        // Pre-attempt smart mapping
        const initialMap: Record<string, string> = {};
        DEFAULT_FIELDS.forEach((f) => {
          // Look for direct match
          const match = headers.find(
            (h) =>
              h.toLowerCase().replace(/[^a-z]/g, '') ===
              f.label.toLowerCase().replace(/[^a-z]/g, '')
          );
          if (match) {
            initialMap[f.key] = match;
          }
        });
        setMappings(initialMap);
        setToast({ message: `Successfully loaded ${data.length} student rows!`, type: 'success' });
      } catch (err) {
        console.error(err);
        setToast({ message: 'Error parsing spreadsheet file.', type: 'error' });
      }
    };
    reader.readAsBinaryString(file);
  };

  // Submit spreadsheet data and mappings to database
  const saveImportedData = async () => {
    if (rawFileData.length === 0) {
      setToast({ message: 'No student data uploaded.', type: 'error' });
      return;
    }
    // Must map Student Name and Email as minimum
    if (!mappings.student_name || !mappings.email) {
      setToast({ message: 'Mapping for Student Name and Email is required.', type: 'error' });
      return;
    }

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: rawFileData,
          mappings: mappings,
        }),
      });

      if (res.ok) {
        setToast({ message: 'Students and column mappings saved successfully!', type: 'success' });
        loadCampaignData();
        setCurrentStep(5); // Go to Customize Design
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Failed to save mappings.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error saving student mappings.', type: 'error' });
    }
  };

  // Update campaign text/templates
  const updateCampaignDetails = async (updates: Partial<Campaign>) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setCampaign(data.campaign);
        setToast({ message: 'Campaign settings updated!', type: 'success' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to update campaign details.', type: 'error' });
    }
  };

  // Send Test Email Action
  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailAddress.trim()) {
      setToast({ message: 'Test email address is required.', type: 'error' });
      return;
    }
    if (students.length === 0) {
      setToast({ message: 'No students imported to pull test data from.', type: 'error' });
      return;
    }

    const testStudent = students[previewStudentIndex] || students[0];

    setSendingTest(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: testStudent.id,
          testEmail: testEmailAddress.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setToast({ message: '✓ Test email sent successfully', type: 'success' });
      } else {
        setToast({ message: `✕ Email failed: ${data.error || 'SMTP delivery rejected'}`, type: 'error' });
      }
    } catch (err: any) {
      console.error(err);
      setToast({ message: `✕ Email failed: ${err.message || 'Network exception'}`, type: 'error' });
    } finally {
      setSendingTest(false);
    }
  };

  // Trigger Bulk Generation
  const handleBulkStart = async (onlyPendingFailed = false) => {
    if (!smtpConfigured) {
      setToast({ message: 'SMTP credentials are not configured.', type: 'error' });
      return;
    }

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyPendingFailed }),
      });

      if (res.ok) {
        setToast({ message: 'Bulk distribution launched successfully!', type: 'success' });
        setIsProcessing(true);
        // Refresh detail state
        if (campaign) {
          setCampaign({ ...campaign, status: 'Processing' });
        }
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Failed to start processing.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error starting bulk run.', type: 'error' });
    }
  };

  // Trigger individual resend
  const handleIndividualResend = async (studentId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });

      const data = await res.json();
      if (res.ok) {
        setToast({ message: data.message || 'Resend triggered!', type: 'success' });
        loadCampaignData();
      } else {
        setToast({ message: data.error || 'Individual delivery failed.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Network error resending certificate.', type: 'error' });
    }
  };

  // Replace tags client-side for dynamic rendering preview
  const renderClientPlaceholders = (text: string, student: Student) => {
    if (!text) return '';
    const data: Record<string, string> = {
      student_name: student.name,
      email: student.email,
      college_name: student.collegeName || '',
      course: student.course || '',
      department: student.department || '',
      internship_role: student.role || '',
      organization_name: student.organizationName || '',
      start_date: student.startDate || '',
      end_date: student.endDate || '',
      certificate_date: student.certDate || '',
      certificate_id: student.certId,
      ...(student.customFields || {}),
    };

    let replaced = text;
    Object.entries(data).forEach(([key, val]) => {
      const mappedHeader = mappings[key];
      const value = val || '';
      replaced = replaced.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), value);
      if (mappedHeader) {
        replaced = replaced.replace(new RegExp(`{{\\s*${mappedHeader}\\s*}}`, 'gi'), value);
      }
    });
    return replaced;
  };

  if (loading || !campaign) {
    return (
      <DashboardLayout title="Loading Wizard..." subtitle="Decrypting workspaces">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <div className="spinner" />
        </div>
      </DashboardLayout>
    );
  }

  // Pre-flight checks
  const boundTemplate = templates.find((t) => t.id === campaign.templateId);
  const checklist = {
    template: !!campaign.templateId,
    excel: students.length > 0,
    mapped: !!(mappings.student_name && mappings.email),
    smtp: smtpConfigured,
  };

  const isPreflightOk = checklist.template && checklist.excel && checklist.mapped && checklist.smtp;

  return (
    <DashboardLayout title={campaign.name} subtitle={campaign.description || 'Campaign run dashboard'}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Steps Breadcrumb */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', marginBottom: '32px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        {[
          'Details', 'Template', 'Spreadsheet', 'Mapping',
          'Customize', 'Email Configuration', 'Preview Data', 'Send Test',
          'Generate & Send', 'Delivery Logs'
        ].map((stepLabel, idx) => {
          const stepNum = idx + 1;
          const isActive = currentStep === stepNum;
          return (
            <button
              key={stepLabel}
              onClick={() => setCurrentStep(stepNum)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isActive ? '#6366f1' : 'rgba(255, 255, 255, 0.05)',
                backgroundColor: isActive ? 'rgba(99, 102, 241, 0.15)' : 'rgba(22, 30, 49, 0.4)',
                color: isActive ? '#fff' : '#9ca3af',
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              Step {stepNum}: {stepLabel}
            </button>
          );
        })}
      </div>

      {/* ----------------- STEP 1: Details ----------------- */}
      {currentStep === 1 && (
        <div className="glass-panel" style={{ padding: '32px', maxWidth: '650px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px' }}>Step 1: Campaign Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: '#9ca3af' }}>Campaign Name</label>
              <input
                type="text"
                value={campaign.name}
                onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(15, 21, 36, 0.8)', color: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: '#9ca3af' }}>Description</label>
              <textarea
                value={campaign.description || ''}
                onChange={(e) => setCampaign({ ...campaign, description: e.target.value })}
                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(15, 21, 36, 0.8)', color: '#fff', minHeight: '100px' }}
              />
            </div>
            <button className="btn btn-primary" onClick={() => updateCampaignDetails({ name: campaign.name, description: campaign.description })} style={{ padding: '12px' }}>
              Save Details
            </button>
          </div>
        </div>
      )}

      {/* ----------------- STEP 2: Template Bind ----------------- */}
      {currentStep === 2 && (
        <div className="glass-panel" style={{ padding: '32px', maxWidth: '650px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Step 2: Bind Layout Design Template</h3>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '24px' }}>
            Choose an existing certificate layout design from your library or go to Templates to create a new layout.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: '#9ca3af' }}>Select Template</label>
              <select
                value={campaign.templateId}
                onChange={(e) => {
                  const val = e.target.value;
                  setCampaign({ ...campaign, templateId: val });
                  updateCampaignDetails({ templateId: val });
                }}
                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(15, 21, 36, 0.8)', color: '#fff' }}
              >
                <option value="">-- Click to choose template --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.type === 'upload' ? 'Upload' : 'Canvas'})
                  </option>
                ))}
              </select>
            </div>

            {boundTemplate && (
              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af', display: 'block' }}>BOUND TEMPLATE DESIGN</span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#f3f4f6' }}>{boundTemplate.name}</span>
              </div>
            )}

            <Link href="/templates" className="btn btn-secondary" style={{ textAlign: 'center', padding: '12px' }}>
              Go to Template Creator Library
            </Link>
          </div>
        </div>
      )}

      {/* ----------------- STEP 3: Upload Spreadsheet ----------------- */}
      {currentStep === 3 && (
        <div className="glass-panel" style={{ padding: '32px', maxWidth: '650px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Step 3: Upload Student Spreadsheet</h3>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '24px' }}>
            Upload an Excel (.xlsx, .xls) or CSV file containing student delivery records.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ border: '2px dashed rgba(255, 255, 255, 0.15)', padding: '40px 20px', borderRadius: '12px', textAlign: 'center', backgroundColor: 'rgba(15, 21, 36, 0.3)' }}>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} style={{ display: 'none' }} id="xlsx-upload" />
              <label htmlFor="xlsx-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <Icons.Campaigns size={40} style={{ color: '#6366f1', opacity: 0.8 }} />
                <span style={{ color: '#fff', fontSize: '15px', fontWeight: 600 }}>Click to Choose File</span>
                <span style={{ color: '#9ca3af', fontSize: '12px' }}>Excel or CSV (Max 8MB)</span>
              </label>
            </div>

            {rawFileData.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#f3f4f6', marginBottom: '12px' }}>
                  Parsed Spreadsheet Contents (Total: {rawFileData.length} rows)
                </h4>
                <div style={{ overflowX: 'auto', maxHeight: '200px', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {rawFileHeaders.map((h) => (
                          <th key={h} style={{ padding: '8px 12px', color: '#9ca3af' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawFileData.slice(0, 5).map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          {rawFileHeaders.map((h) => (
                            <td key={h} style={{ padding: '8px 12px', color: '#d1d5db' }}>{String(row[h] || '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {students.length > 0 && rawFileData.length === 0 && (
              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#10b981' }}>
                  ✓ {students.length} students currently mapped in active database workspace.
                </span>
              </div>
            )}

            {rawFileData.length > 0 && (
              <button className="btn btn-primary" onClick={() => setCurrentStep(4)} style={{ padding: '12px' }}>
                Proceed to Column Mapping
              </button>
            )}
          </div>
        </div>
      )}

      {/* ----------------- STEP 4: Mappings ----------------- */}
      {currentStep === 4 && (
        <div className="glass-panel" style={{ padding: '32px', maxWidth: '650px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Step 4: Map Excel Columns to Dynamic Variables</h3>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '24px' }}>
            Map variables (like Student Name, Email) to columns found in the uploaded file header list.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {DEFAULT_FIELDS.map((field) => (
              <div key={field.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#f3f4f6' }}>{field.label} <code style={{ fontSize: '12px', color: '#6366f1' }}>{`{{${field.key}}}`}</code></span>
                <select
                  value={mappings[field.key] || ''}
                  onChange={(e) => setMappings({ ...mappings, [field.key]: e.target.value })}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(15, 21, 36, 0.8)', color: '#fff', width: '200px' }}
                >
                  <option value="">-- Ignore / Unmapped --</option>
                  {(rawFileHeaders.length > 0 ? rawFileHeaders : Object.values(mappings)).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <button className="btn btn-primary" onClick={saveImportedData} style={{ padding: '14px', marginTop: '16px' }}>
              Import Students & Save Mapping Configuration
            </button>
          </div>
        </div>
      )}

      {/* ----------------- STEP 5: Customize Certificate ----------------- */}
      {currentStep === 5 && (
        <div className="glass-panel" style={{ padding: '32px', maxWidth: '650px', margin: '0 auto', textAlign: 'center' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Step 5: Position Variables on Certificate Canvas</h3>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '24px' }}>
            Click edit template below to open the drag-and-drop Visual Editor where you can position variables and logos.
          </p>

          {boundTemplate ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <div style={{ padding: '24px', borderRadius: '12px', backgroundColor: 'rgba(99, 102, 241, 0.05)', border: '1px dashed #6366f1', width: '100%' }}>
                <Icons.Templates size={32} style={{ color: '#6366f1', marginBottom: '8px' }} />
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#f3f4f6' }}>{boundTemplate.name}</h4>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  {boundTemplate.elements.length} elements placed on the canvas layout.
                </p>
              </div>

              <Link href="/templates" className="btn btn-primary" style={{ padding: '12px 24px' }}>
                Open Template Designer Visual Editor
              </Link>
            </div>
          ) : (
            <div style={{ padding: '24px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px dashed #ef4444' }}>
              <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '16px' }}>
                No template layout has been bound to this campaign run.
              </p>
              <button className="btn btn-secondary" onClick={() => setCurrentStep(2)}>
                Bind Template First
              </button>
            </div>
          )}
        </div>
      )}

      {/* ----------------- STEP 6: Email Customization ----------------- */}
      {currentStep === 6 && (
        <div className="glass-panel" style={{ padding: '32px', maxWidth: '680px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px' }}>Step 6: Customize Personalized Email Body</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: '#9ca3af' }}>Email Subject Line</label>
              <input
                type="text"
                placeholder="Congratulations {{student_name}}!"
                value={campaign.emailSubject}
                onChange={(e) => setCampaign({ ...campaign, emailSubject: e.target.value })}
                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(15, 21, 36, 0.8)', color: '#fff' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: '#9ca3af' }}>Email Body Message (Plain Text)</label>
              <textarea
                placeholder="Dear {{student_name}}, congratulations..."
                value={campaign.emailBody}
                onChange={(e) => setCampaign({ ...campaign, emailBody: e.target.value })}
                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(15, 21, 36, 0.8)', color: '#fff', minHeight: '220px', resize: 'vertical' }}
              />
            </div>

            <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '8px', fontWeight: 600 }}>AVAILABLE PLACEHOLDER TAGS:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {DEFAULT_FIELDS.map((f) => (
                  <span key={f.key} style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', fontFamily: 'monospace' }}>
                    {`{{${f.key}}}`}
                  </span>
                ))}
              </div>
            </div>

            <button className="btn btn-primary" onClick={() => updateCampaignDetails({ emailSubject: campaign.emailSubject, emailBody: campaign.emailBody })} style={{ padding: '12px' }}>
              Save Email Template
            </button>
          </div>
        </div>
      )}

      {/* ----------------- STEP 7: Preview Personalization ----------------- */}
      {currentStep === 7 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'start' }}>
          {/* Controls & Email preview */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f4f6', marginBottom: '4px' }}>Step 7: Personalization Preview</h3>
              <p style={{ color: '#9ca3af', fontSize: '13px' }}>Toggle through the student list to preview the dynamic output.</p>
            </div>

            {students.length === 0 ? (
              <p style={{ color: '#ef4444', fontSize: '13px' }}>Please import student spreadsheet files first to view previews.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setPreviewStudentIndex(prev => Math.max(0, prev - 1))}
                    disabled={previewStudentIndex === 0}
                    style={{ padding: '8px 12px' }}
                  >
                    Previous
                  </button>
                  <select
                    value={previewStudentIndex}
                    onChange={(e) => setPreviewStudentIndex(parseInt(e.target.value, 10))}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(15, 21, 36, 0.8)', color: '#fff' }}
                  >
                    {students.map((s, idx) => (
                      <option key={s.id} value={idx}>
                        {s.name} ({s.email})
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setPreviewStudentIndex(prev => Math.min(students.length - 1, prev + 1))}
                    disabled={previewStudentIndex === students.length - 1}
                    style={{ padding: '8px 12px' }}
                  >
                    Next
                  </button>
                </div>

                {/* Email Preview */}
                <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', backgroundColor: 'rgba(15, 21, 36, 0.4)' }}>
                  <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ color: '#9ca3af' }}><strong style={{ color: '#d1d5db' }}>TO: </strong> {students[previewStudentIndex]?.email}</span>
                    <span style={{ color: '#9ca3af' }}><strong style={{ color: '#d1d5db' }}>SUBJECT: </strong> {renderClientPlaceholders(campaign.emailSubject, students[previewStudentIndex])}</span>
                  </div>
                  <div style={{ padding: '16px', fontSize: '13px', whiteSpace: 'pre-wrap', color: '#d1d5db', minHeight: '150px' }}>
                    {renderClientPlaceholders(campaign.emailBody, students[previewStudentIndex])}
                  </div>
                  <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.04)', backgroundColor: 'rgba(255,255,255,0.02)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
                    📎 {`${String(students[previewStudentIndex]?.name).replace(/[^a-zA-Z0-9]/g, '_')}_${students[previewStudentIndex]?.certId}.pdf`}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Certificate Design Preview */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#f3f4f6' }}>Certificate Attachment Visual Layout</h4>
            {boundTemplate ? (
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1.414',
                  backgroundColor: '#0f1524',
                  backgroundImage: boundTemplate.backgroundImage && !boundTemplate.backgroundImage.startsWith('data:application/pdf;') ? `url(${boundTemplate.backgroundImage})` : 'none',
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Dynamically Overlay Elements Client-Side */}
                {boundTemplate.elements.map((el) => {
                  const targetStudent = students[previewStudentIndex] || students[0];
                  const previewText = el.type === 'text' && targetStudent ? renderClientPlaceholders(el.text || '', targetStudent) : el.text || '';
                  
                  // Translate positioning from design points to absolute percents
                  const xPct = `${(el.x / boundTemplate.width) * 100}%`;
                  const yPct = `${(el.y / boundTemplate.height) * 100}%`;
                  const wPct = `${(el.width / boundTemplate.width) * 100}%`;
                  const hPct = `${(el.height / boundTemplate.height) * 100}%`;

                  if (el.type === 'text') {
                    return (
                      <div
                        key={el.id}
                        style={{
                          position: 'absolute',
                          left: xPct,
                          top: yPct,
                          width: wPct,
                          height: hPct,
                          color: el.color || '#fff',
                          fontSize: `${(el.fontSize || 14) * 0.55}px`, // scale down size for preview box
                          fontFamily: el.fontFamily || 'Helvetica',
                          fontWeight: el.fontWeight || 'normal',
                          fontStyle: el.fontStyle || 'normal',
                          textAlign: el.align || 'left',
                          lineHeight: el.lineHeight || 1.2,
                          pointerEvents: 'none',
                          userSelect: 'none',
                          overflow: 'hidden',
                        }}
                      >
                        {previewText}
                      </div>
                    );
                  } else if (el.type === 'image') {
                    return (
                      <img
                        key={el.id}
                        src={el.src}
                        style={{
                          position: 'absolute',
                          left: xPct,
                          top: yPct,
                          width: wPct,
                          height: hPct,
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  } else if (el.type === 'shape' && el.shapeType === 'line') {
                    return (
                      <div
                        key={el.id}
                        style={{
                          position: 'absolute',
                          left: xPct,
                          top: yPct,
                          width: wPct,
                          borderTop: `${el.thickness || 2}px solid ${el.strokeColor || '#6366f1'}`,
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  } else if (el.type === 'shape') {
                    return (
                      <div
                        key={el.id}
                        style={{
                          position: 'absolute',
                          left: xPct,
                          top: yPct,
                          width: wPct,
                          height: hPct,
                          backgroundColor: el.fillColor || '#000',
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '13px' }}>Unattached design template layout.</p>
            )}
          </div>
        </div>
      )}

      {/* ----------------- STEP 8: Send Test Email ----------------- */}
      {currentStep === 8 && (
        <div className="glass-panel" style={{ padding: '32px', maxWidth: '650px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Step 8: Deliver Sandbox Verification Test</h3>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '24px' }}>
            Before launching distribution to your entire student list, dispatch a test copy of the certificate to confirm configuration.
          </p>

          <form onSubmit={handleSendTest} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: '#9ca3af' }}>Select Student to Simulate</label>
              <select
                value={previewStudentIndex}
                onChange={(e) => setPreviewStudentIndex(parseInt(e.target.value, 10))}
                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(15, 21, 36, 0.8)', color: '#fff' }}
              >
                {students.map((s, idx) => (
                  <option key={s.id} value={idx}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: '#9ca3af' }}>Recipient Test Email Address</label>
              <input
                type="email"
                placeholder="developer@yourdomain.com"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(15, 21, 36, 0.8)', color: '#fff' }}
                required
              />
            </div>

            <button type="submit" disabled={sendingTest || students.length === 0} className="btn btn-primary" style={{ padding: '14px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
              {sendingTest ? (
                <>
                  <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                  <span>Sending Sandbox Test...</span>
                </>
              ) : (
                <span>Dispatch Sandbox Test</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ----------------- STEP 9: Pre-flight & Run ----------------- */}
      {currentStep === 9 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Pre-flight Checks Card */}
          <div className="glass-panel" style={{ padding: '32px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#f3f4f6', marginBottom: '24px' }}>Step 9: Launch Pre-Flight Verification</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {checklist.template ? (
                  <Icons.Check size={20} style={{ color: '#10b981' }} />
                ) : (
                  <Icons.X size={20} style={{ color: '#ef4444' }} />
                )}
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>Layout Attached</span>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>{checklist.template ? 'Template bound successfully' : 'No template design bound'}</span>
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {checklist.excel ? (
                  <Icons.Check size={20} style={{ color: '#10b981' }} />
                ) : (
                  <Icons.X size={20} style={{ color: '#ef4444' }} />
                )}
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>Spreadsheet Data</span>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>{checklist.excel ? `${students.length} students loaded` : 'No spreadsheet uploaded'}</span>
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {checklist.mapped ? (
                  <Icons.Check size={20} style={{ color: '#10b981' }} />
                ) : (
                  <Icons.X size={20} style={{ color: '#ef4444' }} />
                )}
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>Mapped Headers</span>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>{checklist.mapped ? 'Name and Email bounds verified' : 'Required headers unmapped'}</span>
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {checklist.smtp ? (
                  <Icons.Check size={20} style={{ color: '#10b981' }} />
                ) : (
                  <Icons.X size={20} style={{ color: '#ef4444' }} />
                )}
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>SMTP Mail Server</span>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>{checklist.smtp ? 'Server credentials found' : 'SMTP settings unconfigured'}</span>
                </div>
              </div>
            </div>

            {/* Campaign Summary & Execution Trigger */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>PRE-SEND CAMPAIGN SUMMARY</span>
                  <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#f3f4f6', marginTop: '4px' }}>Ready for delivery to {students.length} recipients</h4>
                </div>
                {isPreflightOk && !isProcessing && campaign.status !== 'Processing' && (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary" onClick={() => handleBulkStart(true)}>
                      Send Only Pending/Failed
                    </button>
                    <button className="btn btn-primary" onClick={() => handleBulkStart(false)} style={{ padding: '12px 24px' }}>
                      Generate & Send Certificates
                    </button>
                  </div>
                )}
              </div>

              {!isPreflightOk && (
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: '13px' }}>
                  Please resolve all failing checks above before triggering bulk generator runs.
                </div>
              )}
            </div>
          </div>

          {/* Active Job Progress View */}
          {(isProcessing || jobProgress) && (
            <div className="glass-panel" style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f4f6', marginBottom: '16px' }}>Delivery Progress</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: '#9ca3af' }}>
                  {jobProgress?.status === 'Processing' ? 'Generating and delivering...' : `Run completed (${jobProgress?.status})`}
                </span>
                <span style={{ color: '#fff', fontWeight: 600 }}>
                  {jobProgress?.completed || 0} / {jobProgress?.total || 0} ({Math.round(((jobProgress?.completed || 0) / (jobProgress?.total || 1)) * 100)}%)
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden', marginBottom: '24px' }}>
                <div
                  style={{
                    width: `${((jobProgress?.completed || 0) / (jobProgress?.total || 1)) * 100}%`,
                    height: '100%',
                    backgroundColor: '#6366f1',
                    borderRadius: '4px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', textAlign: 'center' }}>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                  <span style={{ fontSize: '12px', color: '#9ca3af', display: 'block' }}>Pending</span>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{jobProgress?.pending ?? 0}</span>
                </div>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                  <span style={{ fontSize: '12px', color: '#9ca3af', display: 'block' }}>Generated / Sent</span>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>{jobProgress?.sent ?? 0}</span>
                </div>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                  <span style={{ fontSize: '12px', color: '#9ca3af', display: 'block' }}>Failed</span>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>{jobProgress?.failed ?? 0}</span>
                </div>
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                  <span style={{ fontSize: '12px', color: '#9ca3af', display: 'block' }}>Success Rate</span>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#06b6d4' }}>
                    {jobProgress?.total > 0 ? Math.round(((jobProgress?.sent ?? 0) / (jobProgress?.total ?? 1)) * 100) : 100}%
                  </span>
                </div>
              </div>

              {jobProgress?.status === 'Completed' && (
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={() => setCurrentStep(10)}>
                    View Delivery Logs
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ----------------- STEP 10: Logs & Download ----------------- */}
      {currentStep === 10 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Step 10: Campaign Delivery Records</h3>
            <div style={{ display: 'flex', gap: '12px' }}>
              <a href={`/api/campaigns/${campaignId}/report`} download className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icons.Dashboard size={14} />
                <span>Export delivery logs (CSV)</span>
              </a>
              <a href={`/api/campaigns/${campaignId}/download-all`} download className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icons.Templates size={14} />
                <span>Download All Certificates (ZIP)</span>
              </a>
            </div>
          </div>

          {/* Student delivery Table */}
          <div className="glass-panel" style={{ overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '14px 16px', color: '#9ca3af' }}>Student</th>
                  <th style={{ padding: '14px 16px', color: '#9ca3af' }}>Email Address</th>
                  <th style={{ padding: '14px 16px', color: '#9ca3af' }}>Certificate ID</th>
                  <th style={{ padding: '14px 16px', color: '#9ca3af' }}>Email Status</th>
                  <th style={{ padding: '14px 16px', color: '#9ca3af' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const log = logs.find((l) => l.studentId === student.id) || {
                    certStatus: 'Pending',
                    emailStatus: 'Pending',
                    error: '',
                  };

                  let badgeClass = 'badge-secondary';
                  if (log.emailStatus === 'Sent') badgeClass = 'badge-success';
                  if (log.emailStatus === 'Sending') badgeClass = 'badge-primary';
                  if (log.emailStatus === 'Failed') badgeClass = 'badge-danger';

                  return (
                    <tr key={student.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '14px 16px', color: '#f3f4f6', fontWeight: 500 }}>{student.name}</td>
                      <td style={{ padding: '14px 16px', color: '#9ca3af' }}>{student.email}</td>
                      <td style={{ padding: '14px 16px', color: '#6366f1', fontFamily: 'monospace' }}>{student.certId}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className={`badge ${badgeClass}`}>{log.emailStatus}</span>
                          {log.error && (
                            <span style={{ fontSize: '10px', color: '#ef4444', maxWidth: '200px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.error}>
                              Err: {log.error}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <a
                            href={`/api/campaigns/${campaignId}/students/${student.id}/download`}
                            download
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                          >
                            Download PDF
                          </a>
                          <button
                            className="btn btn-primary"
                            onClick={() => handleIndividualResend(student.id)}
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                          >
                            {log.emailStatus === 'Failed' ? 'Retry' : 'Resend'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
