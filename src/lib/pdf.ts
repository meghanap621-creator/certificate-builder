import { PDFDocument, StandardFonts, rgb, PDFPage } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { Template, Student } from './db';

// Helper to parse hex colors to pdf-lib rgb format
export function parseColor(hex?: string) {
  if (!hex) return rgb(0, 0, 0); // Default black
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
}

// Word wrapping helper in PDF points space
export function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

// Replace template placeholders like {{student_name}} with actual student data
export function replacePlaceholders(text: string, student: Student, mappings: Record<string, string>): string {
  // Available variables
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
    certificate_id: student.certId || '',
    ...(student.customFields || {}),
  };

  // Perform replacing
  let replaced = text;
  Object.entries(data).forEach(([key, val]) => {
    // Dynamic mapping check
    const mappedHeader = mappings[key];
    const value = val || '';
    
    // Replace direct field e.g. {{student_name}}
    replaced = replaced.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'gi'), value);

    // Also replace the mapped header name if mapped e.g. if {{Name}} is used in custom
    if (mappedHeader) {
      replaced = replaced.replace(new RegExp(`{{\\s*${mappedHeader}\\s*}}`, 'gi'), value);
    }
  });

  return replaced;
}

export async function generatePDF(
  template: Template,
  student: Student,
  mappings: Record<string, string>
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;

  // Set up fonts map
  const embedFonts = async (doc: PDFDocument) => {
    return {
      helvetica: await doc.embedFont(StandardFonts.Helvetica),
      helveticaBold: await doc.embedFont(StandardFonts.HelveticaBold),
      helveticaOblique: await doc.embedFont(StandardFonts.HelveticaOblique),
      timesRoman: await doc.embedFont(StandardFonts.TimesRoman),
      timesRomanBold: await doc.embedFont(StandardFonts.TimesRomanBold),
      timesRomanItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
      courier: await doc.embedFont(StandardFonts.Courier),
      courierBold: await doc.embedFont(StandardFonts.CourierBold),
    };
  };

  if (template.type === 'upload' && template.backgroundImage?.startsWith('data:application/pdf;base64,')) {
    // Option A: Loaded from an existing PDF Template
    const pdfBase64 = template.backgroundImage.split(',')[1];
    const pdfBytes = Buffer.from(pdfBase64, 'base64');
    
    const templateDoc = await PDFDocument.load(pdfBytes);
    pdfDoc = await PDFDocument.create();
    const [copiedPage] = await pdfDoc.copyPages(templateDoc, [0]);
    pdfDoc.addPage(copiedPage);
  } else {
    // Option B: Visual editor from scratch or Option A from image background
    pdfDoc = await PDFDocument.create();
    const width = template.width || 842; // A4 Landscape points default
    const height = template.height || 595;
    const page = pdfDoc.addPage([width, height]);

    // Draw background image if present (non-PDF)
    if (template.backgroundImage && !template.backgroundImage.startsWith('data:application/pdf;base64,')) {
      try {
        const parts = template.backgroundImage.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || '';
        const base64Data = parts[1];
        const imgBytes = Buffer.from(base64Data, 'base64');

        let bgImage;
        if (mime.includes('png')) {
          bgImage = await pdfDoc.embedPng(imgBytes);
        } else {
          bgImage = await pdfDoc.embedJpg(imgBytes);
        }

        page.drawImage(bgImage, {
          x: 0,
          y: 0,
          width,
          height,
        });
      } catch (err) {
        console.error('Failed to draw background image:', err);
      }
    }
  }

  const page = pdfDoc.getPages()[0];
  const pdfWidth = page.getWidth();
  const pdfHeight = page.getHeight();

  const fonts = await embedFonts(pdfDoc);

  // Helper to map font keys
  const getFont = (family?: string, weight?: string, style?: string) => {
    const isBold = weight === 'bold' || weight === '700';
    const isItalic = style === 'italic' || family?.toLowerCase().includes('vibes') || family?.toLowerCase().includes('script');
    
    if (family?.toLowerCase().includes('times') || family?.toLowerCase().includes('serif')) {
      if (isBold && isItalic) return fonts.timesRomanBold; // fallback
      if (isBold) return fonts.timesRomanBold;
      if (isItalic) return fonts.timesRomanItalic;
      return fonts.timesRoman;
    }
    if (family?.toLowerCase().includes('courier') || family?.toLowerCase().includes('mono')) {
      if (isBold) return fonts.courierBold;
      return fonts.courier;
    }
    // Default Helvetica
    if (isBold) return fonts.helveticaBold;
    if (isItalic) return fonts.helveticaOblique;
    return fonts.helvetica;
  };

  // Draw overlay elements
  const elements = template.elements || [];
  
  // Sorting elements by layer order (zIndex or simple order in editor)
  const sortedElements = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  for (const element of sortedElements) {
    // Normalization Scale Factors
    const designWidth = template.width || 842;
    const designHeight = template.height || 595;
    const scaleX = pdfWidth / designWidth;
    const scaleY = pdfHeight / designHeight;

    const elX = element.x * scaleX;
    // Translate y-coordinate from top-left (editor) to bottom-left (pdf-lib)
    const elY = pdfHeight - (element.y * scaleY);
    const elWidth = (element.width || 200) * scaleX;
    const elHeight = (element.height || 40) * scaleY;

    if (element.type === 'text') {
      const textRaw = element.text || '';
      const textContent = replacePlaceholders(textRaw, student, mappings);
      const fontSize = (element.fontSize || 14) * Math.min(scaleX, scaleY);
      const font = getFont(element.fontFamily, element.fontWeight, element.fontStyle);
      const color = parseColor(element.color);

      // Max width constraint for wrapping
      const padding = 2;
      const wrapWidth = elWidth - (padding * 2);
      const lines = wrapText(textContent, wrapWidth, font, fontSize);

      const lineHeight = (element.lineHeight || 1.2) * fontSize;

      lines.forEach((line, index) => {
        const lineY = elY - (fontSize * 0.8) - (index * lineHeight);
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        
        let drawX = elX + padding;
        if (element.align === 'center') {
          drawX = elX + (elWidth - lineWidth) / 2;
        } else if (element.align === 'right') {
          drawX = elX + elWidth - lineWidth - padding;
        }

        // Draw text if it falls inside the page boundary
        if (lineY > 0 && lineY < pdfHeight) {
          page.drawText(line, {
            x: drawX,
            y: lineY,
            size: fontSize,
            font,
            color,
          });
        }
      });
    } else if (element.type === 'image') {
      try {
        const parts = element.src.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || '';
        const base64Data = parts[1];
        const imgBytes = Buffer.from(base64Data, 'base64');

        let img;
        if (mime.includes('png')) {
          img = await pdfDoc.embedPng(imgBytes);
        } else {
          img = await pdfDoc.embedJpg(imgBytes);
        }

        // Translate bottom coordinate for image placement
        const drawY = elY - elHeight;
        page.drawImage(img, {
          x: elX,
          y: drawY,
          width: elWidth,
          height: elHeight,
        });
      } catch (err) {
        console.error('Failed to draw overlay image element:', err);
      }
    } else if (element.type === 'shape') {
      const color = parseColor(element.fillColor || '#000000');
      const drawY = elY - elHeight;

      if (element.shapeType === 'line') {
        const strokeColor = parseColor(element.strokeColor || '#000000');
        const thickness = element.thickness || 2;
        page.drawLine({
          start: { x: elX, y: elY },
          end: { x: elX + elWidth, y: elY },
          thickness: thickness * Math.min(scaleX, scaleY),
          color: strokeColor,
        });
      } else {
        // Rectangle default
        page.drawRectangle({
          x: elX,
          y: drawY,
          width: elWidth,
          height: elHeight,
          color,
        });
      }
    }
  }

  return await pdfDoc.save();
}

export async function saveStudentPDF(
  template: Template,
  student: Student,
  mappings: Record<string, string>
): Promise<string> {
  const pdfBytes = await generatePDF(template, student, mappings);
  const dirPath = path.join(process.cwd(), 'data', 'certificates', student.campaignId);
  await fs.mkdir(dirPath, { recursive: true });
  
  // Safe URL-friendly filename: Ankitha_R_CERT-2026-00001.pdf
  const safeName = `${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_${student.certId}.pdf`;
  const filePath = path.join(dirPath, safeName);
  await fs.writeFile(filePath, pdfBytes);
  return filePath;
}
