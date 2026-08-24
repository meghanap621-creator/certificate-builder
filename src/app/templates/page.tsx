'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  certificateBody?: string;
  createdAt: string;
  updatedAt: string;
}

type EditorTab =
  | 'design'
  | 'body'
  | 'fields'
  | 'role'
  | 'email';

const FIELD_LIST = [
  {
    key: 'student_name',
    label: 'Student Name',
    description: 'Full name from Excel',
  },
  {
    key: 'internship_role',
    label: 'Internship Role',
    description: 'Role from Excel',
  },
  {
    key: 'college_name',
    label: 'College Name',
    description: 'College / institution',
  },
  {
    key: 'course',
    label: 'Course',
    description: 'Course name',
  },
  {
    key: 'department',
    label: 'Department',
    description: 'Department / branch',
  },
  {
    key: 'organization_name',
    label: 'Organization',
    description: 'Company / organization',
  },
  {
    key: 'start_date',
    label: 'Start Date',
    description: 'Internship start date',
  },
  {
    key: 'end_date',
    label: 'End Date',
    description: 'Internship end date',
  },
  {
    key: 'certificate_date',
    label: 'Certificate Date',
    description: 'Certificate issue date',
  },
  {
    key: 'certificate_id',
    label: 'Certificate ID',
    description: 'Generated certificate ID',
  },
];

const DEFAULT_BODY =
  'This is to certify that {{student_name}} has successfully completed the role of {{internship_role}} at {{organization_name}}.';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const [editingTemplate, setEditingTemplate] =
    useState<Template | null>(null);

  const [activeTab, setActiveTab] =
    useState<EditorTab>('design');

  const [bodyText, setBodyText] =
    useState('');

  const [roleText, setRoleText] =
    useState('{{internship_role}}');

  const [emailSubject, setEmailSubject] =
    useState('');

  const [emailBody, setEmailBody] =
    useState('');

  const [savingContent, setSavingContent] =
    useState(false);

  const [isCreating, setIsCreating] =
    useState(false);

  const [newTemplateName, setNewTemplateName] =
    useState('');

  const [newTemplateType, setNewTemplateType] =
    useState<'upload' | 'editor'>('upload');

  const [uploadedFileBase64, setUploadedFileBase64] =
    useState('');

  const [fileMimeType, setFileMimeType] =
    useState('');

  /* =====================================================
     LOAD TEMPLATES
  ===================================================== */

  const loadTemplates = async () => {
    setLoading(true);

    try {
      const res = await fetch('/api/templates');

      if (!res.ok) {
        setToast({
          message: 'Failed to fetch templates.',
          type: 'error',
        });
        return;
      }

      const data = await res.json();

      setTemplates(data.templates || []);
    } catch (err) {
      console.error(err);

      setToast({
        message: 'Network error loading templates.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  /* =====================================================
     OPEN EDITOR
  ===================================================== */

  const openEditor = (template: Template) => {
    setEditingTemplate(template);

    setBodyText(
      template.certificateBody?.trim() ||
        DEFAULT_BODY
    );

    const roleElement =
      template.elements?.find(
        (element: any) =>
          element.type === 'text' &&
          (element.text || '').includes(
            '{{internship_role}}'
          )
      );

    setRoleText(
      roleElement?.text ||
        '{{internship_role}}'
    );

    setEmailSubject(
      (template as any).emailSubject || ''
    );

    setEmailBody(
      (template as any).emailBody || ''
    );

    setActiveTab('design');
  };

  /* =====================================================
     FILE UPLOAD
  ===================================================== */

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setToast({
        message: 'File size must not exceed 8MB.',
        type: 'error',
      });

      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setUploadedFileBase64(
        reader.result as string
      );

      setFileMimeType(file.type);
    };

    reader.readAsDataURL(file);
  };

  /* =====================================================
     DEFAULT CANVAS ELEMENTS
  ===================================================== */

  const createDefaultElements =
    (): CanvasElement[] => [
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
        x: 121,
        y: 220,
        width: 600,
        height: 70,
        text: '{{student_name}}',
        fontSize: 28,
        fontFamily: 'Helvetica',
        fontWeight: 'bold',
        color: '#6366f1',
        align: 'center',
        zIndex: 2,
        autoFit: true,
        minFontSize: 18,
      } as any,

      {
        id: 'role_placeholder',
        type: 'text',
        x: 121,
        y: 300,
        width: 600,
        height: 60,
        text: '{{internship_role}}',
        fontSize: 22,
        fontFamily: 'Helvetica',
        fontWeight: 'bold',
        color: '#f3f4f6',
        align: 'center',
        zIndex: 3,
        autoFit: true,
        minFontSize: 14,
      } as any,

      /* ================================================
         CERTIFICATE BODY
         This element is required by pdf.ts
      ================================================= */

      {
        id: 'certificate_body',
        type: 'text',
        x: 121,
        y: 370,
        width: 600,
        height: 140,
        text: '{{certificate_body}}',
        fontSize: 16,
        fontFamily: 'Helvetica',
        fontWeight: 'normal',
        color: '#000000',
        align: 'center',
        lineHeight: 1.35,
        zIndex: 5,
        autoFit: true,
        minFontSize: 10,
      } as any,
    ];

  /* =====================================================
     CREATE TEMPLATE
  ===================================================== */

  const handleCreateSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!newTemplateName.trim()) {
      setToast({
        message: 'Template name is required.',
        type: 'error',
      });

      return;
    }

    if (
      newTemplateType === 'upload' &&
      !uploadedFileBase64
    ) {
      setToast({
        message:
          'Please upload a PDF or Image file first.',
        type: 'error',
      });

      return;
    }

    let initialElements: CanvasElement[] = [];

    let bg = '';

    if (newTemplateType === 'upload') {
      bg = uploadedFileBase64;

      /*
       * Even uploaded templates need the body element.
       */
      initialElements =
        createDefaultElements();
    } else {
      bg =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="842" height="595"><rect width="842" height="595" fill="%231a243d"/><rect x="20" y="20" width="802" height="555" fill="none" stroke="%236366f1" stroke-width="4"/></svg>';

      initialElements =
        createDefaultElements();
    }

    try {
      const res = await fetch(
        '/api/templates',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            name:
              newTemplateName.trim(),

            type:
              newTemplateType,

            backgroundImage:
              bg,

            width: 842,

            height: 595,

            elements:
              initialElements,

            certificateBody:
              DEFAULT_BODY,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setToast({
          message:
            data.error ||
            'Failed to create template.',
          type: 'error',
        });

        return;
      }

      setToast({
        message:
          'Template created successfully!',
        type: 'success',
      });

      setIsCreating(false);
      setNewTemplateName('');
      setUploadedFileBase64('');
      setFileMimeType('');

      openEditor(data.template);

      loadTemplates();
    } catch (err) {
      console.error(err);

      setToast({
        message:
          'Error creating template.',
        type: 'error',
      });
    }
  };

  /* =====================================================
     GENERIC TEMPLATE UPDATE
  ===================================================== */

  const updateTemplateContent =
    async (
      updates: Record<string, any>
    ) => {
      if (!editingTemplate) return;

      setSavingContent(true);

      try {
        const res = await fetch(
          `/api/templates/${editingTemplate.id}`,
          {
            method: 'PUT',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(
              updates
            ),
          }
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.error ||
              'Failed to save template.'
          );
        }

        setEditingTemplate(
          data.template
        );

        setToast({
          message:
            'Template saved successfully.',
          type: 'success',
        });

        await loadTemplates();
      } catch (err: any) {
        console.error(err);

        setToast({
          message:
            err.message ||
            'Failed to save template.',
          type: 'error',
        });
      } finally {
        setSavingContent(false);
      }
    };

  /* =====================================================
     CERTIFICATE BODY ELEMENT
  ===================================================== */

  const createCertificateBodyElement = (
    existing?: any
  ): any => {
    return {
      id: 'certificate_body',
      type: 'text',

      /*
       * Preserve user's existing position/
       * formatting when available.
       */
      x:
        typeof existing?.x === 'number'
          ? existing.x
          : 121,

      y:
        typeof existing?.y === 'number'
          ? existing.y
          : 370,

      width:
        typeof existing?.width === 'number'
          ? existing.width
          : 600,

      height:
        typeof existing?.height === 'number'
          ? existing.height
          : 140,

      text: '{{certificate_body}}',

      fontSize:
        typeof existing?.fontSize === 'number'
          ? existing.fontSize
          : 16,

      fontFamily:
        existing?.fontFamily ||
        'Helvetica',

      fontWeight:
        existing?.fontWeight ||
        'normal',

      fontStyle:
        existing?.fontStyle ||
        'normal',

      color:
        existing?.color ||
        '#000000',

      align:
        existing?.align ||
        'center',

      lineHeight:
        typeof existing?.lineHeight === 'number'
          ? existing.lineHeight
          : 1.35,

      zIndex:
        typeof existing?.zIndex === 'number'
          ? existing.zIndex
          : 5,

      autoFit: true,

      minFontSize:
        typeof existing?.minFontSize === 'number'
          ? existing.minFontSize
          : 10,
    };
  };

  /* =====================================================
     SAVE CERTIFICATE BODY
  ===================================================== */

  const handleSaveBody = async () => {
    if (!editingTemplate) return;

    const elements = [
      ...(editingTemplate.elements || []),
    ];

    const bodyIndex =
      elements.findIndex(
        (element: any) =>
          element.id ===
          'certificate_body'
      );

    const existingBody =
      bodyIndex >= 0
        ? elements[bodyIndex]
        : undefined;

    const bodyElement =
      createCertificateBodyElement(
        existingBody
      );

    if (bodyIndex >= 0) {
      elements[bodyIndex] =
        bodyElement;
    } else {
      elements.push(
        bodyElement
      );
    }

    await updateTemplateContent({
      certificateBody:
        bodyText.trim(),

      elements,
    });
  };

  /* =====================================================
     SAVE ROLE
  ===================================================== */

  const handleSaveRole = async () => {
    if (!editingTemplate) return;

    const elements =
      [...editingTemplate.elements];

    const roleIndex =
      elements.findIndex(
        (element: any) =>
          element.type === 'text' &&
          (element.text || '').includes(
            '{{internship_role}}'
          )
      );

    if (roleIndex === -1) {
      elements.push({
        id:
          `role_${Date.now()}`,

        type: 'text',

        x: 121,
        y: 300,

        width: 600,
        height: 60,

        text:
          roleText ||
          '{{internship_role}}',

        fontSize: 22,

        fontFamily:
          'Helvetica',

        fontWeight:
          'bold',

        color:
          '#f3f4f6',

        align:
          'center',

        zIndex:
          4,

        autoFit:
          true,

        minFontSize:
          14,
      } as any);
    } else {
      elements[roleIndex] = {
        ...elements[roleIndex],

        text:
          roleText ||
          '{{internship_role}}',

        autoFit:
          true,

        minFontSize:
          (elements[
            roleIndex
          ] as any).minFontSize ||
          14,
      } as any;
    }

    await updateTemplateContent({
      elements,
    });
  };

  /* =====================================================
     SAVE EMAIL
  ===================================================== */

  const handleSaveEmail = async () => {
    await updateTemplateContent({
      emailSubject:
        emailSubject.trim(),

      emailBody:
        emailBody.trim(),
    });
  };

  /* =====================================================
     SAVE CANVAS
  ===================================================== */

  const handleSaveCanvas = async (
    elements: CanvasElement[],
    width: number,
    height: number
  ) => {
    if (!editingTemplate) return;

    /*
     * Make sure the certificate body element
     * can never accidentally disappear when
     * Design tab saves the canvas.
     */
    const currentBodyElement =
      editingTemplate.elements?.find(
        (element: any) =>
          element.id ===
          'certificate_body'
      ) as any;

    const incomingBodyElement =
      elements.find(
        (element: any) =>
          element.id ===
          'certificate_body'
      ) as any;

    let finalElements = [
      ...elements,
    ];

    /*
     * If CanvasEditor did not return the
     * certificate body element, preserve it.
     */
    if (
      !incomingBodyElement &&
      currentBodyElement
    ) {
      finalElements.push(
        createCertificateBodyElement(
          currentBodyElement
        )
      );
    }

    /*
     * If there is no body element at all,
     * create one.
     */
    if (
      !finalElements.some(
        (element: any) =>
          element.id ===
          'certificate_body'
      )
    ) {
      finalElements.push(
        createCertificateBodyElement()
      );
    }

    try {
      const res = await fetch(
        `/api/templates/${editingTemplate.id}`,
        {
          method: 'PUT',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            elements:
              finalElements,

            width,

            height,

            /*
             * IMPORTANT:
             * Preserve certificate body
             * during Design saves.
             */
            certificateBody:
              editingTemplate.certificateBody ||
              bodyText ||
              DEFAULT_BODY,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
            'Failed to save elements.'
        );
      }

      setEditingTemplate(
        data.template
      );

      setToast({
        message:
          'Design saved successfully!',
        type: 'success',
      });

      await loadTemplates();
    } catch (err: any) {
      console.error(err);

      setToast({
        message:
          err.message ||
          'Network error saving template.',
        type: 'error',
      });
    }
  };

  /* =====================================================
     INSERT FIELD INTO BODY
  ===================================================== */

  const insertField = (
    field: string
  ) => {
    setBodyText(
      (current) => {
        const separator =
          current &&
          !current.endsWith(' ')
            ? ' '
            : '';

        return `${current}${separator}{{${field}}}`;
      }
    );

    setActiveTab('body');
  };

  /* =====================================================
     DUPLICATE TEMPLATE
  ===================================================== */

  const handleDuplicate = async (
    tpl: Template
  ) => {
    try {
      /*
       * Make sure duplicate also has
       * certificate body element.
       */
      const elements = [
        ...(tpl.elements || []),
      ];

      if (
        !elements.some(
          (element: any) =>
            element.id ===
            'certificate_body'
        )
      ) {
        elements.push(
          createCertificateBodyElement()
        );
      }

      const res = await fetch(
        '/api/templates',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            name:
              `${tpl.name} (Copy)`,

            type:
              tpl.type,

            backgroundImage:
              tpl.backgroundImage,

            width:
              tpl.width,

            height:
              tpl.height,

            elements,

            certificateBody:
              tpl.certificateBody ||
              DEFAULT_BODY,
          }),
        }
      );

      if (res.ok) {
        setToast({
          message:
            'Template duplicated!',
          type: 'success',
        });

        loadTemplates();
      } else {
        setToast({
          message:
            'Failed to duplicate template.',
          type: 'error',
        });
      }
    } catch (err) {
      console.error(err);

      setToast({
        message:
          'Network error duplicating template.',
        type: 'error',
      });
    }
  };

  /* =====================================================
     DELETE TEMPLATE
  ===================================================== */

  const handleDelete = async (
    id: string
  ) => {
    if (
      !confirm(
        'Are you sure you want to delete this template? This cannot be undone.'
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/templates/${id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        setToast({
          message:
            'Template deleted.',
          type: 'success',
        });

        loadTemplates();
      } else {
        setToast({
          message:
            'Failed to delete template.',
          type: 'error',
        });
      }
    } catch (err) {
      console.error(err);

      setToast({
        message:
          'Error deleting template.',
        type: 'error',
      });
    }
  };

  /* =====================================================
     CURRENT ROLE ELEMENT
  ===================================================== */

  const currentRoleElement =
    useMemo(() => {
      return editingTemplate?.elements?.find(
        (element: any) =>
          element.type === 'text' &&
          (element.text || '').includes(
            '{{internship_role}}'
          )
      ) as any;
    }, [editingTemplate]);

  /* =====================================================
     CURRENT BODY ELEMENT
  ===================================================== */

  const currentBodyElement =
    useMemo(() => {
      return editingTemplate?.elements?.find(
        (element: any) =>
          element.id ===
          'certificate_body'
      ) as any;
    }, [editingTemplate]);

  /* =====================================================
     EDITOR
  ===================================================== */

  if (editingTemplate) {
    return (
      <div
        style={{
          minHeight:
            '100vh',

          background:
            'radial-gradient(circle at top right, rgba(99,102,241,.10), transparent 35%), #080b12',

          color:
            '#f3f4f6',

          padding:
            '24px',
        }}
      >
        {toast && (
          <Toast
            message={
              toast.message
            }
            type={
              toast.type
            }
            onClose={() =>
              setToast(null)
            }
          />
        )}

        {/* HEADER */}

        <div
          style={{
            maxWidth:
              '1500px',

            margin:
              '0 auto',

            display:
              'flex',

            justifyContent:
              'space-between',

            alignItems:
              'center',

            marginBottom:
              '20px',
          }}
        >
          <div>
            <div
              style={{
                display:
                  'flex',

                alignItems:
                  'center',

                gap:
                  '10px',

                marginBottom:
                  '5px',
              }}
            >
              <h1
                style={{
                  fontSize:
                    '24px',

                  fontWeight:
                    700,

                  margin:
                    0,
                }}
              >
                {editingTemplate.name}
              </h1>

              <span
                style={{
                  padding:
                    '4px 9px',

                  borderRadius:
                    '999px',

                  fontSize:
                    '11px',

                  background:
                    'rgba(99,102,241,.15)',

                  color:
                    '#a5b4fc',
                }}
              >
                Certificate Template
              </span>
            </div>

            <p
              style={{
                margin:
                  0,

                color:
                  '#8b93a7',

                fontSize:
                  '13px',
              }}
            >
              Build once. Personalize automatically for every student.
            </p>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() =>
              setEditingTemplate(
                null
              )
            }
          >
            ← Template Library
          </button>
        </div>

        {/* TABS */}

        <div
          style={{
            maxWidth:
              '1500px',

            margin:
              '0 auto 18px',

            display:
              'flex',

            gap:
              '5px',

            padding:
              '5px',

            borderRadius:
              '12px',

            background:
              'rgba(255,255,255,.035)',

            border:
              '1px solid rgba(255,255,255,.07)',
          }}
        >
          {[
            [
              'design',
              'Design',
            ],
            [
              'body',
              'Certificate Body',
            ],
            [
              'fields',
              'Student Fields',
            ],
            [
              'role',
              'Role',
            ],
            [
              'email',
              'Email',
            ],
          ].map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() =>
                  setActiveTab(
                    key as EditorTab
                  )
                }
                style={{
                  flex:
                    1,

                  padding:
                    '12px 16px',

                  border:
                    'none',

                  borderRadius:
                    '8px',

                  cursor:
                    'pointer',

                  background:
                    activeTab ===
                    key
                      ? 'rgba(99,102,241,.18)'
                      : 'transparent',

                  color:
                    activeTab ===
                    key
                      ? '#c7d2fe'
                      : '#8b93a7',

                  fontWeight:
                    activeTab ===
                    key
                      ? 600
                      : 500,
                }}
              >
                {label}
              </button>
            )
          )}
        </div>

        {/* DESIGN TAB */}

        {activeTab ===
          'design' && (
          <CanvasEditor
            backgroundImage={
              editingTemplate.backgroundImage ||
              ''
            }

            initialElements={
              editingTemplate.elements
            }

            width={
              editingTemplate.width
            }

            height={
              editingTemplate.height
            }

            onSave={
              handleSaveCanvas
            }

            onCancel={() =>
              setEditingTemplate(
                null
              )
            }
          />
        )}

        {/* BODY TAB */}

        {activeTab ===
          'body' && (
          <div
            style={{
              maxWidth:
                '1100px',

              margin:
                '0 auto',

              display:
                'grid',

              gridTemplateColumns:
                '1fr 300px',

              gap:
                '20px',
            }}
          >
            <div
              className="glass-panel"
              style={{
                padding:
                  '26px',
              }}
            >
              <div
                style={{
                  marginBottom:
                    '18px',
                }}
              >
                <h2
                  style={{
                    fontSize:
                      '19px',

                    margin:
                      '0 0 6px',
                  }}
                >
                  Certificate Body
                </h2>

                <p
                  style={{
                    color:
                      '#8b93a7',

                    fontSize:
                      '13px',

                    margin:
                      0,
                  }}
                >
                  Write the certificate message once. JAIVA will replace the fields for every student.
                </p>
              </div>

              <textarea
                value={
                  bodyText
                }
                onChange={(e) =>
                  setBodyText(
                    e.target.value
                  )
                }
                placeholder="This is to certify that {{student_name}}..."
                style={{
                  width:
                    '100%',

                  minHeight:
                    '360px',

                  resize:
                    'vertical',

                  boxSizing:
                    'border-box',

                  padding:
                    '18px',

                  borderRadius:
                    '12px',

                  border:
                    '1px solid rgba(255,255,255,.09)',

                  background:
                    '#0c111d',

                  color:
                    '#f3f4f6',

                  outline:
                    'none',

                  fontSize:
                    '15px',

                  lineHeight:
                    1.8,

                  fontFamily:
                    'inherit',
                }}
              />

              {/* BODY STATUS */}

              <div
                style={{
                  marginTop:
                    '12px',

                  padding:
                    '11px 14px',

                  borderRadius:
                    '9px',

                  background:
                    currentBodyElement
                      ? 'rgba(34,197,94,.07)'
                      : 'rgba(245,158,11,.08)',

                  border:
                    currentBodyElement
                      ? '1px solid rgba(34,197,94,.15)'
                      : '1px solid rgba(245,158,11,.16)',

                  color:
                    currentBodyElement
                      ? '#86efac'
                      : '#fbbf24',

                  fontSize:
                    '12px',
                }}
              >
                {currentBodyElement
                  ? '✓ Certificate body area is connected to the certificate design.'
                  : '⚠ The certificate body area will be created when you save.'}
              </div>

              <div
                style={{
                  display:
                    'flex',

                  justifyContent:
                    'space-between',

                  alignItems:
                    'center',

                  marginTop:
                    '16px',
                }}
              >
                <span
                  style={{
                    color:
                      '#687184',

                    fontSize:
                      '12px',
                  }}
                >
                  {bodyText.length} characters
                </span>

                <button
                  className="btn btn-primary"
                  disabled={
                    savingContent
                  }
                  onClick={
                    handleSaveBody
                  }
                >
                  {savingContent
                    ? 'Saving...'
                    : 'Save Certificate Body'}
                </button>
              </div>
            </div>

            <FieldPanel
              onInsert={
                insertField
              }
            />
          </div>
        )}

        {/* STUDENT FIELDS */}

        {activeTab ===
          'fields' && (
          <div
            style={{
              maxWidth:
                '1100px',

              margin:
                '0 auto',
            }}
          >
            <div
              className="glass-panel"
              style={{
                padding:
                  '28px',
              }}
            >
              <h2
                style={{
                  margin:
                    '0 0 7px',

                  fontSize:
                    '20px',
                }}
              >
                Personalization Fields
              </h2>

              <p
                style={{
                  color:
                    '#8b93a7',

                  fontSize:
                    '13px',

                  margin:
                    '0 0 24px',
                }}
              >
                These values come from your Excel/CSV upload. Insert them into your certificate body or design.
              </p>

              <div
                style={{
                  display:
                    'grid',

                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(280px, 1fr))',

                  gap:
                    '12px',
                }}
              >
                {FIELD_LIST.map(
                  (field) => (
                    <button
                      key={
                        field.key
                      }
                      onClick={() =>
                        insertField(
                          field.key
                        )
                      }
                      style={{
                        textAlign:
                          'left',

                        padding:
                          '16px',

                        borderRadius:
                          '11px',

                        border:
                          '1px solid rgba(255,255,255,.08)',

                        background:
                          '#0c111d',

                        color:
                          '#f3f4f6',

                        cursor:
                          'pointer',
                      }}
                    >
                      <div
                        style={{
                          display:
                            'flex',

                          justifyContent:
                            'space-between',

                          alignItems:
                            'center',
                        }}
                      >
                        <strong>
                          {
                            field.label
                          }
                        </strong>

                        <span
                          style={{
                            fontSize:
                              '12px',

                            color:
                              '#a5b4fc',
                          }}
                        >
                          Insert
                        </span>
                      </div>

                      <div
                        style={{
                          color:
                            '#6f788b',

                          fontSize:
                            '12px',

                          marginTop:
                            '5px',
                        }}
                      >
                        {
                          field.description
                        }
                      </div>

                      <code
                        style={{
                          display:
                            'inline-block',

                          marginTop:
                            '10px',

                          padding:
                            '4px 7px',

                          borderRadius:
                            '5px',

                          background:
                            'rgba(99,102,241,.09)',

                          color:
                            '#a5b4fc',

                          fontSize:
                            '11px',
                        }}
                      >
                        {'{{'}
                        {
                          field.key
                        }
                        {'}}'}
                      </code>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* ROLE TAB */}

        {activeTab ===
          'role' && (
          <div
            style={{
              maxWidth:
                '900px',

              margin:
                '0 auto',
            }}
          >
            <div
              className="glass-panel"
              style={{
                padding:
                  '28px',
              }}
            >
              <div
                style={{
                  display:
                    'flex',

                  alignItems:
                    'center',

                  gap:
                    '12px',

                  marginBottom:
                    '22px',
                }}
              >
                <div
                  style={{
                    width:
                      '42px',

                    height:
                      '42px',

                    borderRadius:
                      '10px',

                    display:
                      'grid',

                    placeItems:
                      'center',

                    background:
                      'rgba(99,102,241,.14)',

                    color:
                      '#a5b4fc',

                    fontWeight:
                      700,
                  }}
                >
                  R
                </div>

                <div>
                  <h2
                    style={{
                      margin:
                        0,

                      fontSize:
                        '19px',
                    }}
                  >
                    Internship Role
                  </h2>

                  <p
                    style={{
                      margin:
                        '4px 0 0',

                      color:
                        '#8b93a7',

                      fontSize:
                        '13px',
                    }}
                  >
                    The role is automatically taken from your Excel sheet.
                  </p>
                </div>
              </div>

              <label
                style={{
                  display:
                    'block',

                  color:
                    '#9ca3af',

                  fontSize:
                    '13px',

                  marginBottom:
                    '8px',
                }}
              >
                Role field
              </label>

              <input
                value={
                  roleText
                }
                onChange={(e) =>
                  setRoleText(
                    e.target.value
                  )
                }
                placeholder="{{internship_role}}"
                style={{
                  width:
                    '100%',

                  boxSizing:
                    'border-box',

                  padding:
                    '14px 16px',

                  borderRadius:
                    '10px',

                  border:
                    '1px solid rgba(255,255,255,.09)',

                  background:
                    '#0c111d',

                  color:
                    '#fff',

                  outline:
                    'none',

                  fontSize:
                    '15px',
                }}
              />

              <div
                style={{
                  marginTop:
                    '18px',

                  padding:
                    '16px',

                  borderRadius:
                    '10px',

                  background:
                    'rgba(99,102,241,.06)',

                  border:
                    '1px solid rgba(99,102,241,.12)',
                }}
              >
                <strong
                  style={{
                    display:
                      'block',

                    fontSize:
                      '13px',

                    marginBottom:
                      '6px',
                  }}
                >
                  Automatic fitting enabled
                </strong>

                <p
                  style={{
                    margin:
                      0,

                    color:
                      '#8b93a7',

                    fontSize:
                      '12px',

                    lineHeight:
                      1.6,
                  }}
                >
                  Long roles such as “Artificial Intelligence and Machine Learning Intern” will automatically reduce in size to remain inside the role area.
                </p>
              </div>

              {currentRoleElement && (
                <div
                  style={{
                    marginTop:
                      '20px',

                    display:
                      'grid',

                    gridTemplateColumns:
                      '1fr 1fr',

                    gap:
                      '12px',
                  }}
                >
                  <InfoBox
                    label="Current font size"
                    value={`${currentRoleElement.fontSize || 22}px`}
                  />

                  <InfoBox
                    label="Minimum size"
                    value={`${currentRoleElement.minFontSize || 14}px`}
                  />
                </div>
              )}

              <button
                className="btn btn-primary"
                disabled={
                  savingContent
                }
                onClick={
                  handleSaveRole
                }
                style={{
                  marginTop:
                    '24px',
                }}
              >
                {savingContent
                  ? 'Saving...'
                  : 'Save Role Field'}
              </button>
            </div>
          </div>
        )}

        {/* EMAIL TAB */}

        {activeTab ===
          'email' && (
          <div
            style={{
              maxWidth:
                '900px',

              margin:
                '0 auto',
            }}
          >
            <div
              className="glass-panel"
              style={{
                padding:
                  '28px',
              }}
            >
              <h2
                style={{
                  margin:
                    '0 0 6px',

                  fontSize:
                    '19px',
                }}
              >
                Bulk Email Content
              </h2>

              <p
                style={{
                  color:
                    '#8b93a7',

                  fontSize:
                    '13px',

                  marginBottom:
                    '22px',
                }}
              >
                Personalize the email sent with each student's certificate.
              </p>

              <label
                style={{
                  display:
                    'block',

                  color:
                    '#9ca3af',

                  fontSize:
                    '13px',

                  marginBottom:
                    '7px',
                }}
              >
                Subject
              </label>

              <input
                value={
                  emailSubject
                }
                onChange={(e) =>
                  setEmailSubject(
                    e.target.value
                  )
                }
                placeholder="Your Certificate – {{student_name}}"
                style={inputStyle}
              />

              <label
                style={{
                  display:
                    'block',

                  color:
                    '#9ca3af',

                  fontSize:
                    '13px',

                  margin:
                    '18px 0 7px',
                }}
              >
                Email Body
              </label>

              <textarea
                value={
                  emailBody
                }
                onChange={(e) =>
                  setEmailBody(
                    e.target.value
                  )
                }
                placeholder={`Dear {{student_name}},\n\nPlease find attached your certificate for {{internship_role}}.`}
                style={{
                  ...inputStyle,

                  minHeight:
                    '260px',

                  resize:
                    'vertical',

                  lineHeight:
                    1.7,
                }}
              />

              <button
                className="btn btn-primary"
                disabled={
                  savingContent
                }
                onClick={
                  handleSaveEmail
                }
                style={{
                  marginTop:
                    '18px',
                }}
              >
                {savingContent
                  ? 'Saving...'
                  : 'Save Email Content'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* =====================================================
     TEMPLATE LIBRARY
  ===================================================== */

  return (
    <DashboardLayout
      title="Template Library"
      subtitle="Create reusable certificate designs and personalize them automatically."
    >
      {toast && (
        <Toast
          message={
            toast.message
          }
          type={
            toast.type
          }
          onClose={() =>
            setToast(null)
          }
        />
      )}

      <div
        style={{
          display:
            'flex',

          justifyContent:
            'flex-end',

          marginBottom:
            '24px',
        }}
      >
        <button
          className="btn btn-primary"
          onClick={() =>
            setIsCreating(
              true
            )
          }
          style={{
            display:
              'flex',

            alignItems:
              'center',

            gap:
              '8px',
          }}
        >
          <Icons.Templates
            size={16}
          />

          <span>
            New Certificate Design
          </span>
        </button>
      </div>

      {loading ? (
        <div
          style={{
            display:
              'flex',

            justifyContent:
              'center',

            padding:
              '64px',
          }}
        >
          <div className="spinner" />
        </div>
      ) : templates.length ===
        0 ? (
        <div
          className="glass-panel"
          style={{
            padding:
              '64px',

            textAlign:
              'center',

            maxWidth:
              '600px',

            margin:
              '40px auto',
          }}
        >
          <Icons.Templates
            size={48}
            style={{
              color:
                '#6366f1',

              marginBottom:
                '16px',

              opacity:
                0.8,
            }}
          />

          <h3
            style={{
              fontSize:
                '18px',

              fontWeight:
                600,

              color:
                '#f3f4f6',

              marginBottom:
                '8px',
            }}
          >
            No Designs Found
          </h3>

          <p
            style={{
              color:
                '#9ca3af',

              fontSize:
                '14px',

              marginBottom:
                '24px',
            }}
          >
            Create your first reusable certificate template.
          </p>

          <button
            className="btn btn-primary"
            onClick={() =>
              setIsCreating(
                true
              )
            }
          >
            Create First Template
          </button>
        </div>
      ) : (
        <div
          style={{
            display:
              'grid',

            gridTemplateColumns:
              'repeat(auto-fill, minmax(280px, 1fr))',

            gap:
              '24px',
          }}
        >
          {templates.map(
            (tpl) => (
              <div
                key={
                  tpl.id
                }
                className="glass-panel"
                style={{
                  display:
                    'flex',

                  flexDirection:
                    'column',

                  overflow:
                    'hidden',
                }}
              >
                <div
                  style={{
                    height:
                      '160px',

                    backgroundColor:
                      '#0f1524',

                    backgroundImage:
                      tpl.backgroundImage &&
                      !tpl.backgroundImage.startsWith(
                        'data:application/pdf;'
                      )
                        ? `url(${tpl.backgroundImage})`
                        : 'none',

                    backgroundSize:
                      'contain',

                    backgroundPosition:
                      'center',

                    backgroundRepeat:
                      'no-repeat',

                    display:
                      'flex',

                    justifyContent:
                      'center',

                    alignItems:
                      'center',

                    borderBottom:
                      '1px solid rgba(255,255,255,.08)',

                    position:
                      'relative',
                  }}
                >
                  {!tpl.backgroundImage && (
                    <span
                      style={{
                        color:
                          '#727b8f',

                        fontSize:
                          '12px',
                      }}
                    >
                      Certificate Preview
                    </span>
                  )}

                  <div
                    style={{
                      position:
                        'absolute',

                      top:
                        '10px',

                      right:
                        '10px',
                    }}
                  >
                    <span
                      className={`badge ${
                        tpl.type ===
                        'upload'
                          ? 'badge-success'
                          : 'badge-primary'
                      }`}
                    >
                      {tpl.type ===
                      'upload'
                        ? 'Uploaded'
                        : 'Editor'}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    padding:
                      '16px',

                    flex:
                      1,

                    display:
                      'flex',

                    flexDirection:
                      'column',

                    gap:
                      '16px',
                  }}
                >
                  <div>
                    <h4
                      style={{
                        fontSize:
                          '16px',

                        fontWeight:
                          600,

                        color:
                          '#f3f4f6',

                        margin:
                          '0 0 4px',
                      }}
                    >
                      {tpl.name}
                    </h4>

                    <p
                      style={{
                        fontSize:
                          '12px',

                        color:
                          '#9ca3af',

                        margin:
                          0,
                      }}
                    >
                      Created:{' '}
                      {new Date(
                        tpl.createdAt
                      ).toLocaleDateString()}
                    </p>
                  </div>

                  <div
                    style={{
                      display:
                        'grid',

                      gridTemplateColumns:
                        '1fr 1fr',

                      gap:
                        '8px',

                      marginTop:
                        'auto',
                    }}
                  >
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        openEditor(
                          tpl
                        )
                      }
                      style={{
                        fontSize:
                          '13px',

                        padding:
                          '9px',
                      }}
                    >
                      Edit
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        handleDuplicate(
                          tpl
                        )
                      }
                      style={{
                        fontSize:
                          '13px',

                        padding:
                          '9px',
                      }}
                    >
                      Duplicate
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        handleDelete(
                          tpl.id
                        )
                      }
                      style={{
                        gridColumn:
                          'span 2',

                        fontSize:
                          '13px',

                        padding:
                          '9px',

                        color:
                          '#ef4444',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* =================================================
          CREATE MODAL
      ================================================= */}

      {isCreating && (
        <div
          style={{
            position:
              'fixed',

            inset:
              0,

            background:
              'rgba(5,7,13,.82)',

            display:
              'flex',

            justifyContent:
              'center',

            alignItems:
              'center',

            zIndex:
              1000,

            backdropFilter:
              'blur(8px)',

            padding:
              '20px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width:
                '100%',

              maxWidth:
                '520px',

              padding:
                '30px',
            }}
          >
            <div
              style={{
                display:
                  'flex',

                justifyContent:
                  'space-between',

                alignItems:
                  'center',

                marginBottom:
                  '24px',
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize:
                      '20px',

                    fontWeight:
                      600,

                    margin:
                      0,
                  }}
                >
                  Create Certificate
                </h3>

                <p
                  style={{
                    color:
                      '#7f889b',

                    fontSize:
                      '12px',

                    margin:
                      '5px 0 0',
                  }}
                >
                  Start with a design or blank canvas.
                </p>
              </div>

              <button
                onClick={() =>
                  setIsCreating(
                    false
                  )
                }
                style={{
                  background:
                    'none',

                  border:
                    'none',

                  color:
                    '#9ca3af',

                  cursor:
                    'pointer',
                }}
              >
                <Icons.X
                  size={20}
                />
              </button>
            </div>

            <form
              onSubmit={
                handleCreateSubmit
              }
              style={{
                display:
                  'flex',

                flexDirection:
                  'column',

                gap:
                  '20px',
              }}
            >
              <input
                type="text"
                placeholder="Template name"
                value={
                  newTemplateName
                }
                onChange={(e) =>
                  setNewTemplateName(
                    e.target.value
                  )
                }
                style={
                  inputStyle
                }
                required
              />

              <div
                style={{
                  display:
                    'grid',

                  gridTemplateColumns:
                    '1fr 1fr',

                  gap:
                    '12px',
                }}
              >
                <label
                  style={{
                    padding:
                      '16px',

                    borderRadius:
                      '10px',

                    border:
                      `1px solid ${
                        newTemplateType ===
                        'upload'
                          ? '#6366f1'
                          : 'rgba(255,255,255,.08)'
                      }`,

                    background:
                      newTemplateType ===
                      'upload'
                        ? 'rgba(99,102,241,.1)'
                        : '#0c111d',

                    cursor:
                      'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="type"
                    checked={
                      newTemplateType ===
                      'upload'
                    }
                    onChange={() =>
                      setNewTemplateType(
                        'upload'
                      )
                    }
                  />

                  <strong
                    style={{
                      display:
                        'block',

                      marginTop:
                        '8px',
                    }}
                  >
                    Upload Design
                  </strong>

                  <small
                    style={{
                      color:
                        '#7f889b',
                    }}
                  >
                    PDF or image
                  </small>
                </label>

                <label
                  style={{
                    padding:
                      '16px',

                    borderRadius:
                      '10px',

                    border:
                      `1px solid ${
                        newTemplateType ===
                        'editor'
                          ? '#6366f1'
                          : 'rgba(255,255,255,.08)'
                      }`,

                    background:
                      newTemplateType ===
                      'editor'
                        ? 'rgba(99,102,241,.1)'
                        : '#0c111d',

                    cursor:
                      'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="type"
                    checked={
                      newTemplateType ===
                      'editor'
                    }
                    onChange={() =>
                      setNewTemplateType(
                        'editor'
                      )
                    }
                  />

                  <strong
                    style={{
                      display:
                        'block',

                      marginTop:
                        '8px',
                    }}
                  >
                    From Scratch
                  </strong>

                  <small
                    style={{
                      color:
                        '#7f889b',
                    }}
                  >
                    Blank editor
                  </small>
                </label>
              </div>

              {newTemplateType ===
                'upload' && (
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={
                    handleFileUpload
                  }
                  style={{
                    color:
                      '#9ca3af',
                  }}
                  required
                />
              )}

              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  padding:
                    '14px',
                }}
              >
                Create & Open Editor
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

/* =====================================================
   FIELD PANEL
===================================================== */

function FieldPanel({
  onInsert,
}: {
  onInsert: (
    field: string
  ) => void;
}) {
  return (
    <div
      className="glass-panel"
      style={{
        padding:
          '20px',

        height:
          'fit-content',
      }}
    >
      <h3
        style={{
          margin:
            '0 0 5px',

          fontSize:
            '15px',
        }}
      >
        Insert Field
      </h3>

      <p
        style={{
          color:
            '#737d90',

          fontSize:
            '11px',

          lineHeight:
            1.5,

          marginBottom:
            '16px',
        }}
      >
        Click a field to add it to the certificate body.
      </p>

      <div
        style={{
          display:
            'flex',

          flexDirection:
            'column',

          gap:
            '7px',
        }}
      >
        {FIELD_LIST.map(
          (field) => (
            <button
              key={
                field.key
              }
              onClick={() =>
                onInsert(
                  field.key
                )
              }
              style={{
                display:
                  'flex',

                justifyContent:
                  'space-between',

                alignItems:
                  'center',

                padding:
                  '10px 12px',

                borderRadius:
                  '8px',

                border:
                  '1px solid rgba(255,255,255,.06)',

                background:
                  '#0c111d',

                color:
                  '#d1d5db',

                cursor:
                  'pointer',

                textAlign:
                  'left',
              }}
            >
              <span>
                {
                  field.label
                }
              </span>

              <span
                style={{
                  color:
                    '#818cf8',

                  fontSize:
                    '12px',
                }}
              >
                +
              </span>
            </button>
          )
        )}
      </div>
    </div>
  );
}

/* =====================================================
   INFO BOX
===================================================== */

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding:
          '14px',

        borderRadius:
          '9px',

        background:
          '#0c111d',

        border:
          '1px solid rgba(255,255,255,.06)',
      }}
    >
      <div
        style={{
          color:
            '#70798c',

          fontSize:
            '11px',

          marginBottom:
            '4px',
        }}
      >
        {label}
      </div>

      <strong
        style={{
          fontSize:
            '14px',
        }}
      >
        {value}
      </strong>
    </div>
  );
}

/* =====================================================
   INPUT STYLE
===================================================== */

const inputStyle: React.CSSProperties = {
  width:
    '100%',

  boxSizing:
    'border-box',

  padding:
    '13px 15px',

  borderRadius:
    '9px',

  border:
    '1px solid rgba(255,255,255,.08)',

  background:
    '#0c111d',

  color:
    '#f3f4f6',

  outline:
    'none',

  fontSize:
    '14px',
};