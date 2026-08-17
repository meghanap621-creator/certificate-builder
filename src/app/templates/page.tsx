'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import Toast from '@/components/Toast';
import CanvasEditor, { CanvasElement } from '@/components/CanvasEditor';
import { Icons } from '@/components/Icons';

interface Template {
  id: string;
  name: string;
  type: 'upload' | 'editor';
  backgroundImage?: string;
  width: number;
  height: number;
  elements: CanvasElement[];
  createdAt: string;
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Editor modes
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateType, setNewTemplateType] = useState<'upload' | 'editor'>('upload');
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string>('');
  const [fileMimeType, setFileMimeType] = useState<string>('');

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      } else {
        setToast({ message: 'Failed to fetch templates.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Network error loading templates.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setToast({ message: 'File size must not exceed 8MB.', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setUploadedFileBase64(base64);
      setFileMimeType(file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) {
      setToast({ message: 'Template name is required.', type: 'error' });
      return;
    }

    if (newTemplateType === 'upload' && !uploadedFileBase64) {
      setToast({ message: 'Please upload a PDF or Image file first.', type: 'error' });
      return;
    }

    // Default elements for editor
    let initialElements: CanvasElement[] = [];

    // For blank canvas:
    let bg = '';
    if (newTemplateType === 'upload') {
      bg = uploadedFileBase64;
    } else {
      // blank light certificate background
      bg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="842" height="595" viewBox="0 0 842 595"><rect width="842" height="595" fill="%231a243d" stroke="%236366f1" stroke-width="8"/><rect x="20" y="20" width="802" height="555" fill="none" stroke="%234f46e5" stroke-width="2"/><text x="421" y="100" font-family="Helvetica" font-size="28" font-weight="bold" fill="%23f3f4f6" text-anchor="middle">CERTIFICATE OF COMPLETION</text></svg>';
      initialElements = [
        {
          id: 'title_placeholder',
          type: 'text',
          x: 221,
          y: 150,
          width: 400,
          height: 60,
          text: 'This is to certify that',
          fontSize: 16,
          fontFamily: 'Helvetica',
          color: '#9ca3af',
          align: 'center',
          zIndex: 1,
        },
        {
          id: 'student_placeholder',
          type: 'text',
          x: 171,
          y: 220,
          width: 500,
          height: 70,
          text: '{{student_name}}',
          fontSize: 28,
          fontFamily: 'Helvetica',
          fontWeight: 'bold',
          color: '#6366f1',
          align: 'center',
          zIndex: 2,
        },
        {
          id: 'desc_placeholder',
          type: 'text',
          x: 121,
          y: 300,
          width: 600,
          height: 90,
          text: 'has successfully completed their course at our organization.',
          fontSize: 14,
          fontFamily: 'Helvetica',
          color: '#d1d5db',
          align: 'center',
          zIndex: 3,
        }
      ];
    }

    // Save template
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          type: newTemplateType,
          backgroundImage: bg,
          width: 842,
          height: 595,
          elements: initialElements,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setToast({ message: 'Template created successfully!', type: 'success' });
        setIsCreating(false);
        setNewTemplateName('');
        setUploadedFileBase64('');
        // Immediately edit the newly created template
        setEditingTemplate(data.template);
        loadTemplates();
      } else {
        setToast({ message: data.error || 'Failed to create template.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error creating template.', type: 'error' });
    }
  };

  const handleSaveCanvas = async (elements: CanvasElement[], width: number, height: number) => {
    if (!editingTemplate) return;

    try {
      const res = await fetch(`/api/templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elements,
          width,
          height,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setToast({ message: 'Canvas elements saved successfully!', type: 'success' });
        setEditingTemplate(null);
        loadTemplates();
      } else {
        setToast({ message: data.error || 'Failed to save elements.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Network error saving template elements.', type: 'error' });
    }
  };

  const handleDuplicate = async (tpl: Template) => {
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${tpl.name} (Copy)`,
          type: tpl.type,
          backgroundImage: tpl.backgroundImage,
          width: tpl.width,
          height: tpl.height,
          elements: tpl.elements,
        }),
      });

      if (res.ok) {
        setToast({ message: 'Template duplicated!', type: 'success' });
        loadTemplates();
      } else {
        setToast({ message: 'Failed to duplicate template.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Network error duplicating template.', type: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template design? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setToast({ message: 'Template design deleted.', type: 'success' });
        loadTemplates();
      } else {
        setToast({ message: 'Failed to delete template.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error deleting template.', type: 'error' });
    }
  };

  // Canvas View Mode
  if (editingTemplate) {
    return (
      <div style={{ backgroundColor: '#0b0f19', minHeight: '100vh', padding: '24px' }}>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f3f4f6' }}>{editingTemplate.name}</h1>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Drag, drop, and configure dynamic fields on the layout.</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setEditingTemplate(null)}>
            Back to Library
          </button>
        </div>
        <CanvasEditor
          backgroundImage={editingTemplate.backgroundImage || ''}
          initialElements={editingTemplate.elements}
          width={editingTemplate.width}
          height={editingTemplate.height}
          onSave={handleSaveCanvas}
          onCancel={() => setEditingTemplate(null)}
        />
      </div>
    );
  }

  return (
    <DashboardLayout title="Template Library" subtitle="Create or upload reusable certificate layout designs.">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        <button className="btn btn-primary" onClick={() => setIsCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icons.Templates size={16} />
          <span>New Certificate Design</span>
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <div className="spinner" />
        </div>
      ) : templates.length === 0 ? (
        <div className="glass-panel" style={{ padding: '64px', textAlign: 'center', maxWidth: '600px', margin: '40px auto' }}>
          <Icons.Templates size={48} style={{ color: '#6366f1', marginBottom: '16px', opacity: 0.8 }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f3f4f6', marginBottom: '8px' }}>No Designs Found</h3>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '24px' }}>
            You haven't uploaded or built any templates yet. Let's create your first certificate layout!
          </p>
          <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
            Create First Template
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
          {templates.map((tpl) => (
            <div key={tpl.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Thumbnail Preview container */}
              <div
                style={{
                  height: '160px',
                  backgroundColor: '#0f1524',
                  backgroundImage: tpl.backgroundImage && !tpl.backgroundImage.startsWith('data:application/pdf;') ? `url(${tpl.backgroundImage})` : 'none',
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  position: 'relative',
                }}
              >
                {(!tpl.backgroundImage || tpl.backgroundImage.startsWith('data:application/pdf;')) && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <Icons.Templates size={32} style={{ color: '#6366f1', opacity: 0.6 }} />
                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>{tpl.type === 'upload' ? 'PDF Template' : 'Visual Design'}</span>
                  </div>
                )}
                <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                  <span className={`badge ${tpl.type === 'upload' ? 'badge-success' : 'badge-primary'}`}>
                    {tpl.type === 'upload' ? 'Uploaded' : 'Editor'}
                  </span>
                </div>
              </div>

              {/* Detail section */}
              <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#f3f4f6', marginBottom: '4px' }}>{tpl.name}</h4>
                  <p style={{ fontSize: '12px', color: '#9ca3af' }}>
                    Created: {new Date(tpl.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={() => setEditingTemplate(tpl)} style={{ fontSize: '13px', padding: '8px' }}>
                    Edit Design
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleDuplicate(tpl)} style={{ fontSize: '13px', padding: '8px' }}>
                    Duplicate
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleDelete(tpl.id)}
                    style={{ gridColumn: 'span 2', fontSize: '13px', padding: '8px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
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
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#f3f4f6' }}>Create Certificate Design</h3>
              <button
                onClick={() => setIsCreating(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
              >
                <Icons.X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>Template Name</label>
                <input
                  type="text"
                  placeholder="e.g. JAIVA Internship Certificate"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
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
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>Creation Method</label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      backgroundColor: newTemplateType === 'upload' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      borderColor: newTemplateType === 'upload' ? '#6366f1' : 'rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="templateType"
                      checked={newTemplateType === 'upload'}
                      onChange={() => setNewTemplateType('upload')}
                      style={{ cursor: 'pointer' }}
                    />
                    <div>
                      <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#f3f4f6' }}>Upload Design</span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#9ca3af' }}>PDF or Image template</span>
                    </div>
                  </label>

                  <label
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      backgroundColor: newTemplateType === 'editor' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      borderColor: newTemplateType === 'editor' ? '#6366f1' : 'rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="templateType"
                      checked={newTemplateType === 'editor'}
                      onChange={() => setNewTemplateType('editor')}
                      style={{ cursor: 'pointer' }}
                    />
                    <div>
                      <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#f3f4f6' }}>From Scratch</span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#9ca3af' }}>Blank canvas editor</span>
                    </div>
                  </label>
                </div>
              </div>

              {newTemplateType === 'upload' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>Select File (PDF, PNG, JPG/JPEG)</label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px dashed rgba(255, 255, 255, 0.2)',
                      backgroundColor: 'rgba(15, 21, 36, 0.5)',
                      color: '#9ca3af',
                    }}
                    required={newTemplateType === 'upload'}
                  />
                  {uploadedFileBase64 && (
                    <span style={{ fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ✓ File loaded successfully
                    </span>
                  )}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ padding: '14px', marginTop: '10px' }}>
                Initialize & Open Editor
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
