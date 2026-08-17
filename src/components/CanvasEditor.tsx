'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './Icons';

export interface CanvasElement {
  id: string;
  type: 'text' | 'image' | 'shape';
  x: number; // relative to template width
  y: number; // relative to template height
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  src?: string; // image source base64
  shapeType?: 'rectangle' | 'line';
  fillColor?: string;
  strokeColor?: string;
  thickness?: number;
  zIndex?: number;
  locked?: boolean;
}

interface CanvasEditorProps {
  backgroundImage: string; // PDF or Image base64
  initialElements: CanvasElement[];
  width?: number; // design width
  height?: number; // design height
  onSave: (elements: CanvasElement[], width: number, height: number) => void;
  onCancel: () => void;
}

export default function CanvasEditor({
  backgroundImage,
  initialElements,
  width = 842,
  height = 595,
  onSave,
  onCancel,
}: CanvasEditorProps) {
  const [elements, setElements] = useState<CanvasElement[]>(initialElements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bgSrc, setBgSrc] = useState<string>('');
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 565 });
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [customFieldName, setCustomFieldName] = useState('');

  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragInfo = useRef<{
    isDragging: boolean;
    isResizing: boolean;
    resizeDir: string;
    startX: number;
    startY: number;
    startElX: number;
    startElY: number;
    startWidth: number;
    startHeight: number;
  }>({
    isDragging: false,
    isResizing: false,
    resizeDir: '',
    startX: 0,
    startY: 0,
    startElX: 0,
    startElY: 0,
    startWidth: 0,
    startHeight: 0,
  });

  // Scale factors between design points and editor display pixels
  const scaleX = canvasSize.w / width;
  const scaleY = canvasSize.h / height;

  // Render PDF to image client-side if it's a PDF upload
  useEffect(() => {
    if (backgroundImage.startsWith('data:application/pdf;base64,')) {
      setIsPdfLoading(true);
      (async () => {
        try {
          // Check if pdf.js is already loaded
          if (!(window as any).pdfjsLib) {
            await new Promise((resolve) => {
              const script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
              script.onload = resolve;
              document.head.appendChild(script);
            });
          }
          const pdfjsLib = (window as any).pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

          const binaryString = atob(backgroundImage.split(',')[1]);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const loadingTask = pdfjsLib.getDocument({ data: bytes });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          
          // Render page 1 to a hidden canvas at high scale for resolution
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({ canvasContext: context!, viewport }).promise;
          setBgSrc(canvas.toDataURL('image/png'));
        } catch (err) {
          console.error('Error rendering template PDF:', err);
        } finally {
          setIsPdfLoading(false);
        }
      })();
    } else {
      setBgSrc(backgroundImage);
    }
  }, [backgroundImage]);

  // Adjust canvas size to keep aspect ratio inside workspace container
  useEffect(() => {
    function handleResize() {
      if (workspaceRef.current) {
        const containerWidth = workspaceRef.current.clientWidth - 48; // padding margin
        const containerHeight = window.innerHeight - 240; // viewport bounds
        
        const designRatio = width / height;
        let w = containerWidth;
        let h = containerWidth / designRatio;

        if (h > containerHeight) {
          h = containerHeight;
          w = containerHeight * designRatio;
        }

        setCanvasSize({ w, h });
      }
    }
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [width, height, bgSrc]);

  const selectedEl = elements.find((e) => e.id === selectedId);

  // Add a text element
  const addTextElement = (textVal: string) => {
    const newEl: CanvasElement = {
      id: `el_${Date.now()}`,
      type: 'text',
      x: width * 0.1,
      y: height * 0.4,
      width: 400,
      height: 60,
      text: textVal,
      fontSize: 22,
      fontFamily: 'Helvetica',
      fontWeight: 'bold',
      fontStyle: 'normal',
      color: '#ffffff',
      align: 'center',
      lineHeight: 1.2,
      zIndex: elements.length + 1,
    };
    setElements([...elements, newEl]);
    setSelectedId(newEl.id);
  };

  // Add a line element
  const addLineElement = () => {
    const newEl: CanvasElement = {
      id: `el_${Date.now()}`,
      type: 'shape',
      x: width * 0.3,
      y: height * 0.6,
      width: 300,
      height: 10,
      shapeType: 'line',
      strokeColor: '#6366f1',
      thickness: 2,
      zIndex: elements.length + 1,
    };
    setElements([...elements, newEl]);
    setSelectedId(newEl.id);
  };

  // Add a signature placeholder
  const addSignatureElement = () => {
    const newEl: CanvasElement = {
      id: `el_${Date.now()}`,
      type: 'text',
      x: width * 0.7,
      y: height * 0.75,
      width: 200,
      height: 50,
      text: 'Jane Doe',
      fontSize: 28,
      fontFamily: 'TimesNewRoman-Italic', // Cursive style
      fontWeight: 'normal',
      fontStyle: 'italic',
      color: '#6366f1',
      align: 'center',
      zIndex: elements.length + 1,
    };
    setElements([...elements, newEl]);
    setSelectedId(newEl.id);
  };

  // Add logo image overlay placeholder
  const addImageElement = () => {
    // Generate a default small base64 rectangle for mockup logo, or trigger upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
          const src = readerEvent.target?.result as string;
          const newEl: CanvasElement = {
            id: `el_${Date.now()}`,
            type: 'image',
            x: width * 0.4,
            y: height * 0.1,
            width: 120,
            height: 60,
            src,
            zIndex: elements.length + 1,
          };
          setElements([...elements, newEl]);
          setSelectedId(newEl.id);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  // Delete element
  const deleteElement = () => {
    if (selectedId) {
      setElements(elements.filter((e) => e.id !== selectedId));
      setSelectedId(null);
    }
  };

  // Duplicate element
  const duplicateElement = () => {
    if (selectedEl) {
      const copy: CanvasElement = {
        ...selectedEl,
        id: `el_${Date.now()}`,
        x: Math.min(width - 50, selectedEl.x + 20),
        y: Math.min(height - 50, selectedEl.y + 20),
        zIndex: elements.length + 1,
        locked: false,
      };
      setElements([...elements, copy]);
      setSelectedId(copy.id);
    }
  };

  // Update properties of active element
  const updateElement = (fields: Partial<CanvasElement>) => {
    if (selectedId) {
      setElements(elements.map((e) => (e.id === selectedId ? { ...e, ...fields } : e)));
    }
  };

  // Re-layer ordering
  const changeLayer = (action: 'forward' | 'backward') => {
    if (!selectedEl) return;
    const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const index = sorted.findIndex((e) => e.id === selectedId);
    
    if (action === 'forward' && index < sorted.length - 1) {
      // Swap zIndexes
      const next = sorted[index + 1];
      const temp = selectedEl.zIndex || 0;
      selectedEl.zIndex = next.zIndex || 0;
      next.zIndex = temp;
    } else if (action === 'backward' && index > 0) {
      const prev = sorted[index - 1];
      const temp = selectedEl.zIndex || 0;
      selectedEl.zIndex = prev.zIndex || 0;
      prev.zIndex = temp;
    }
    
    setElements([...elements]);
  };

  // Mouse / Touch handlers for dragging and resizing
  const onMouseDown = (e: React.MouseEvent, el: CanvasElement, actionType: 'drag' | 'resize', dir = '') => {
    if (el.locked) return;
    e.stopPropagation();
    setSelectedId(el.id);

    const clientX = e.clientX;
    const clientY = e.clientY;

    dragInfo.current = {
      isDragging: actionType === 'drag',
      isResizing: actionType === 'resize',
      resizeDir: dir,
      startX: clientX,
      startY: clientY,
      startElX: el.x,
      startElY: el.y,
      startWidth: el.width,
      startHeight: el.height,
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    const { isDragging, isResizing, resizeDir, startX, startY, startElX, startElY, startWidth, startHeight } = dragInfo.current;
    if (!selectedId) return;

    const deltaX = (e.clientX - startX) / scaleX;
    const deltaY = (e.clientY - startY) / scaleY;

    if (isDragging) {
      const newX = Math.max(0, Math.min(width - startWidth, startElX + deltaX));
      const newY = Math.max(0, Math.min(height - startHeight, startElY + deltaY));
      
      setElements((prev) =>
        prev.map((el) => (el.id === selectedId ? { ...el, x: Math.round(newX), y: Math.round(newY) } : el))
      );
    } else if (isResizing) {
      let newW = startWidth;
      let newH = startHeight;
      let newX = startElX;
      let newY = startElY;

      if (resizeDir.includes('e')) {
        newW = Math.max(20, startWidth + deltaX);
      }
      if (resizeDir.includes('s')) {
        newH = Math.max(10, startHeight + deltaY);
      }
      if (resizeDir.includes('w')) {
        const potentialW = startWidth - deltaX;
        if (potentialW > 20) {
          newW = potentialW;
          newX = startElX + deltaX;
        }
      }
      if (resizeDir.includes('n')) {
        const potentialH = startHeight - deltaY;
        if (potentialH > 10) {
          newH = potentialH;
          newY = startElY + deltaY;
        }
      }

      setElements((prev) =>
        prev.map((el) =>
          el.id === selectedId
            ? {
                ...el,
                x: Math.round(newX),
                y: Math.round(newY),
                width: Math.round(newW),
                height: Math.round(newH),
              }
            : el
        )
      );
    }
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    dragInfo.current.isDragging = false;
    dragInfo.current.isResizing = false;
  };

  // Built-in Dynamic Variables List
  const defaultFields = [
    { label: 'Student Name', value: '{{student_name}}' },
    { label: 'Student Email', value: '{{email}}' },
    { label: 'College/Institution', value: '{{college_name}}' },
    { label: 'Internship/Course Role', value: '{{internship_role}}' },
    { label: 'Start Date', value: '{{start_date}}' },
    { label: 'End Date', value: '{{end_date}}' },
    { label: 'Organization Name', value: '{{organization_name}}' },
    { label: 'Certificate Date', value: '{{certificate_date}}' },
    { label: 'Certificate ID', value: '{{certificate_id}}' },
  ];

  return (
    <div style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 120px)' }}>
      {/* LEFT SIDEBAR: Add Elements */}
      <div className="glass-panel" style={{ width: '280px', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Elements Tool</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => addTextElement('Static Text Block')} style={{ width: '100%', justifyContent: 'flex-start' }}>
              <Icons.Plus size={16} /> Add Static Text
            </button>
            <button className="btn btn-secondary" onClick={addImageElement} style={{ width: '100%', justifyContent: 'flex-start' }}>
              <Icons.Plus size={16} /> Add Logo/Image
            </button>
            <button className="btn btn-secondary" onClick={addLineElement} style={{ width: '100%', justifyContent: 'flex-start' }}>
              <Icons.Plus size={16} /> Add Design Line
            </button>
            <button className="btn btn-secondary" onClick={addSignatureElement} style={{ width: '100%', justifyContent: 'flex-start' }}>
              <Icons.Plus size={16} /> Add Signature Text
            </button>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Dynamic Placeholders</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {defaultFields.map((f) => (
              <button
                key={f.value}
                className="btn btn-secondary"
                onClick={() => addTextElement(f.value)}
                style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '8px' }}
              >
                + {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Custom Field</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. grade"
              value={customFieldName}
              onChange={(e) => setCustomFieldName(e.target.value)}
              style={{ padding: '8px' }}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                if (customFieldName.trim()) {
                  addTextElement(`{{${customFieldName.trim().toLowerCase()}}}`);
                  setCustomFieldName('');
                }
              }}
              style={{ padding: '8px' }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* CENTER: Canvas Workspace */}
      <div 
        ref={workspaceRef} 
        style={{ 
          flex: 1, 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          background: '#090d16', 
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          overflow: 'hidden',
          position: 'relative'
        }}
        onClick={() => setSelectedId(null)}
      >
        {isPdfLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div className="spinner" />
            <span style={{ color: '#9ca3af', fontSize: '14px' }}>Rendering PDF layout...</span>
          </div>
        ) : (
          <div
            ref={canvasRef}
            style={{
              width: `${canvasSize.w}px`,
              height: `${canvasSize.h}px`,
              position: 'relative',
              backgroundColor: '#111827',
              backgroundImage: bgSrc ? `url(${bgSrc})` : 'none',
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            {elements.map((el) => {
              const left = el.x * scaleX;
              const top = el.y * scaleY;
              const widthPx = el.width * scaleX;
              const heightPx = el.height * scaleY;
              const isSelected = el.id === selectedId;

              return (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${widthPx}px`,
                    height: `${heightPx}px`,
                    border: isSelected ? '2px solid #6366f1' : '1px dashed rgba(99, 102, 241, 0.4)',
                    boxShadow: isSelected ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none',
                    cursor: el.locked ? 'not-allowed' : 'move',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: el.type === 'text' && el.align === 'center' ? 'center' : (el.type === 'text' && el.align === 'right' ? 'flex-end' : 'flex-start'),
                    padding: el.type === 'text' ? '4px' : '0',
                    zIndex: el.zIndex || 1,
                    userSelect: 'none',
                    pointerEvents: 'auto',
                  }}
                  onMouseDown={(e) => onMouseDown(e, el, 'drag')}
                >
                  {/* TEXT ELEMENT */}
                  {el.type === 'text' && (
                    <span
                      style={{
                        fontFamily: el.fontFamily?.includes('Times') ? 'Times New Roman, serif' : (el.fontFamily?.includes('Courier') ? 'Courier New, monospace' : 'inherit'),
                        fontSize: `${(el.fontSize || 14) * Math.min(scaleX, scaleY)}px`,
                        fontWeight: el.fontWeight || 'normal',
                        fontStyle: el.fontStyle || 'normal',
                        color: el.color || '#ffffff',
                        textAlign: el.align || 'left',
                        width: '100%',
                        lineHeight: el.lineHeight || 1.2,
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                      }}
                    >
                      {el.text}
                    </span>
                  )}

                  {/* IMAGE ELEMENT */}
                  {el.type === 'image' && el.src && (
                    <img src={el.src} alt="Overlay" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                  )}

                  {/* SHAPE ELEMENT */}
                  {el.type === 'shape' && el.shapeType === 'line' && (
                    <div style={{ width: '100%', height: `${(el.thickness || 2) * scaleY}px`, backgroundColor: el.strokeColor || '#6366f1' }} />
                  )}

                  {/* RESIZING HANDLES */}
                  {isSelected && !el.locked && (
                    <>
                      {/* Bottom-right corner handle */}
                      <div
                        style={{
                          position: 'absolute',
                          right: '-4px',
                          bottom: '-4px',
                          width: '10px',
                          height: '10px',
                          backgroundColor: '#6366f1',
                          border: '1px solid #ffffff',
                          borderRadius: '50%',
                          cursor: 'se-resize',
                          zIndex: 10,
                        }}
                        onMouseDown={(e) => onMouseDown(e, el, 'resize', 'se')}
                      />
                      {/* Left border handle */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '-4px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '8px',
                          height: '8px',
                          backgroundColor: '#6366f1',
                          border: '1px solid #ffffff',
                          cursor: 'w-resize',
                          zIndex: 10,
                        }}
                        onMouseDown={(e) => onMouseDown(e, el, 'resize', 'w')}
                      />
                      {/* Right border handle */}
                      <div
                        style={{
                          position: 'absolute',
                          right: '-4px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '8px',
                          height: '8px',
                          backgroundColor: '#6366f1',
                          border: '1px solid #ffffff',
                          cursor: 'e-resize',
                          zIndex: 10,
                        }}
                        onMouseDown={(e) => onMouseDown(e, el, 'resize', 'e')}
                      />
                    </>
                  )}

                  {/* Lock badge overlay */}
                  {el.locked && (
                    <div style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.5)', padding: '2px', borderRadius: '4px' }}>
                      <Icons.Lock size={12} style={{ color: '#ef4444' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT SIDEBAR: Element Properties Inspector */}
      <div className="glass-panel" style={{ width: '320px', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
          Properties Inspector
        </h3>

        {selectedEl ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Status & Locks */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="form-label">Lock Position</span>
              <button
                className={`btn ${selectedEl.locked ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => updateElement({ locked: !selectedEl.locked })}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                {selectedEl.locked ? <Icons.Lock size={12} /> : <Icons.Unlock size={12} />}
                {selectedEl.locked ? 'Locked' : 'Unlocked'}
              </button>
            </div>

            {/* Content Field */}
            {selectedEl.type === 'text' && (
              <div className="form-group">
                <label className="form-label">Text Content</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={selectedEl.text || ''}
                  onChange={(e) => updateElement({ text: e.target.value })}
                  style={{ resize: 'vertical' }}
                  disabled={selectedEl.locked}
                />
              </div>
            )}

            {/* Dimensions Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="form-group">
                <label className="form-label">X Pos (pts)</label>
                <input
                  type="number"
                  className="form-control"
                  value={selectedEl.x}
                  onChange={(e) => updateElement({ x: parseInt(e.target.value, 10) || 0 })}
                  disabled={selectedEl.locked}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Y Pos (pts)</label>
                <input
                  type="number"
                  className="form-control"
                  value={selectedEl.y}
                  onChange={(e) => updateElement({ y: parseInt(e.target.value, 10) || 0 })}
                  disabled={selectedEl.locked}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="form-group">
                <label className="form-label">Width (pts)</label>
                <input
                  type="number"
                  className="form-control"
                  value={selectedEl.width}
                  onChange={(e) => updateElement({ width: parseInt(e.target.value, 10) || 10 })}
                  disabled={selectedEl.locked}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Height (pts)</label>
                <input
                  type="number"
                  className="form-control"
                  value={selectedEl.height}
                  onChange={(e) => updateElement({ height: parseInt(e.target.value, 10) || 10 })}
                  disabled={selectedEl.locked}
                />
              </div>
            </div>

            {/* Styles Section */}
            {selectedEl.type === 'text' && (
              <>
                <div className="form-group">
                  <label className="form-label">Font Family</label>
                  <select
                    className="form-control"
                    value={selectedEl.fontFamily || 'Helvetica'}
                    onChange={(e) => updateElement({ fontFamily: e.target.value })}
                    disabled={selectedEl.locked}
                  >
                    <option value="Helvetica">Helvetica (Sans-Serif)</option>
                    <option value="Times">Times Roman (Serif)</option>
                    <option value="Courier">Courier (Monospace)</option>
                    <option value="GreatVibes">Great Vibes (cursive signature)</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group">
                    <label className="form-label">Font Size</label>
                    <input
                      type="number"
                      className="form-control"
                      value={selectedEl.fontSize || 14}
                      onChange={(e) => updateElement({ fontSize: parseInt(e.target.value, 10) || 10 })}
                      disabled={selectedEl.locked}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Text Color</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="color"
                        value={selectedEl.color || '#ffffff'}
                        onChange={(e) => updateElement({ color: e.target.value })}
                        style={{ border: 'none', width: '32px', height: '38px', cursor: 'pointer', borderRadius: '6px', background: 'transparent' }}
                        disabled={selectedEl.locked}
                      />
                      <input
                        type="text"
                        className="form-control"
                        value={selectedEl.color || '#ffffff'}
                        onChange={(e) => updateElement({ color: e.target.value })}
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        disabled={selectedEl.locked}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group">
                    <label className="form-label">Font Weight</label>
                    <select
                      className="form-control"
                      value={selectedEl.fontWeight || 'normal'}
                      onChange={(e) => updateElement({ fontWeight: e.target.value })}
                      disabled={selectedEl.locked}
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Font Style</label>
                    <select
                      className="form-control"
                      value={selectedEl.fontStyle || 'normal'}
                      onChange={(e) => updateElement({ fontStyle: e.target.value })}
                      disabled={selectedEl.locked}
                    >
                      <option value="normal">Normal</option>
                      <option value="italic">Italic</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Text Align</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button
                        key={a}
                        className={`btn ${selectedEl.align === a ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => updateElement({ align: a })}
                        style={{ padding: '6px', textTransform: 'capitalize', fontSize: '11px' }}
                        disabled={selectedEl.locked}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Line Height</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.8"
                    max="2.5"
                    className="form-control"
                    value={selectedEl.lineHeight || 1.2}
                    onChange={(e) => updateElement({ lineHeight: parseFloat(e.target.value) || 1.2 })}
                    disabled={selectedEl.locked}
                  />
                </div>
              </>
            )}

            {/* Layering & Actions */}
            <div className="form-group">
              <label className="form-label">Ordering</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => changeLayer('forward')} style={{ flex: 1 }} disabled={selectedEl.locked}>
                  Bring Forward
                </button>
                <button className="btn btn-secondary" onClick={() => changeLayer('backward')} style={{ flex: 1 }} disabled={selectedEl.locked}>
                  Send Backward
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={duplicateElement} style={{ flex: 1 }} disabled={selectedEl.locked}>
                <Icons.Duplicate size={14} /> Duplicate
              </button>
              <button className="btn btn-danger" onClick={deleteElement} style={{ flex: 1 }} disabled={selectedEl.locked}>
                <Icons.Trash size={14} /> Delete
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>
            <Icons.Eye size={28} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <span style={{ fontSize: '13px' }}>Click an element to configure styles and text values.</span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* SAVE & CANCEL CTAs */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button className="btn btn-primary" onClick={() => onSave(elements, width, height)} style={{ width: '100%' }}>
            ✓ Apply Layout Changes
          </button>
          <button className="btn btn-secondary" onClick={onCancel} style={{ width: '100%' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
