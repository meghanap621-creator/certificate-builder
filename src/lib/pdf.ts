import {
  PDFDocument,
  StandardFonts,
  rgb,
} from 'pdf-lib';

import {
  Template,
  Student,
} from './db';

import { supabaseAdmin } from './supabase-admin';

/* --------------------------------------------------
   COLORS
-------------------------------------------------- */

export function parseColor(hex?: string) {
  if (!hex) {
    return rgb(0, 0, 0);
  }

  const cleanHex = hex.replace('#', '');

  const r =
    parseInt(cleanHex.substring(0, 2), 16) / 255;

  const g =
    parseInt(cleanHex.substring(2, 4), 16) / 255;

  const b =
    parseInt(cleanHex.substring(4, 6), 16) / 255;

  return rgb(
    isNaN(r) ? 0 : r,
    isNaN(g) ? 0 : g,
    isNaN(b) ? 0 : b
  );
}

/* --------------------------------------------------
   WORD WRAPPING
-------------------------------------------------- */

export function wrapText(
  text: string,
  maxWidth: number,
  font: any,
  fontSize: number
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);

    let currentLine = '';

    if (
      words.length === 1 &&
      words[0] === ''
    ) {
      lines.push('');
      continue;
    }

    for (const word of words) {
      const testLine = currentLine
        ? `${currentLine} ${word}`
        : word;

      const width =
        font.widthOfTextAtSize(
          testLine,
          fontSize
        );

      if (
        width > maxWidth &&
        currentLine
      ) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/* --------------------------------------------------
   PLACEHOLDER DATA
-------------------------------------------------- */

export function replacePlaceholders(
  text: string,
  student: Student,
  mappings: Record<string, string>
): string {
  const data: Record<string, string> = {
    student_name: student.name || '',
    email: student.email || '',
    college_name: student.collegeName || '',
    course: student.course || '',
    department: student.department || '',
    internship_role: student.role || '',
    organization_name:
      student.organizationName || '',
    start_date: student.startDate || '',
    end_date: student.endDate || '',
    certificate_date:
      student.certDate || '',
    certificate_id:
      student.certId || '',
    ...(student.customFields || {}),
  };

  let replaced = text || '';

  Object.entries(data).forEach(
    ([key, value]) => {
      const safeValue = value || '';

      replaced = replaced.replace(
        new RegExp(
          `{{\\s*${escapeRegExp(
            key
          )}\\s*}}`,
          'gi'
        ),
        safeValue
      );

      const mappedHeader =
        mappings?.[key];

      if (mappedHeader) {
        replaced = replaced.replace(
          new RegExp(
            `{{\\s*${escapeRegExp(
              mappedHeader
            )}\\s*}}`,
            'gi'
          ),
          safeValue
        );
      }
    }
  );

  return replaced;
}

function escapeRegExp(
  value: string
) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}

/* --------------------------------------------------
   AUTO FIT
-------------------------------------------------- */

function getAutoFitFontSize(
  text: string,
  font: any,
  requestedSize: number,
  minSize: number,
  maxWidth: number
) {
  let size = requestedSize;

  while (
    size > minSize &&
    font.widthOfTextAtSize(
      text,
      size
    ) > maxWidth
  ) {
    size -= 1;
  }

  return Math.max(
    size,
    minSize
  );
}

/* --------------------------------------------------
   PDF GENERATOR
-------------------------------------------------- */

export async function generatePDF(
  template: Template,
  student: Student,
  mappings: Record<string, string>
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;

  const embedFonts = async (
    doc: PDFDocument
  ) => {
    return {
      helvetica:
        await doc.embedFont(
          StandardFonts.Helvetica
        ),

      helveticaBold:
        await doc.embedFont(
          StandardFonts.HelveticaBold
        ),

      helveticaOblique:
        await doc.embedFont(
          StandardFonts.HelveticaOblique
        ),

      timesRoman:
        await doc.embedFont(
          StandardFonts.TimesRoman
        ),

      timesRomanBold:
        await doc.embedFont(
          StandardFonts.TimesRomanBold
        ),

      timesRomanItalic:
        await doc.embedFont(
          StandardFonts.TimesRomanItalic
        ),

      courier:
        await doc.embedFont(
          StandardFonts.Courier
        ),

      courierBold:
        await doc.embedFont(
          StandardFonts.CourierBold
        ),
    };
  };

  /* ------------------------------------------------
     BACKGROUND
  ------------------------------------------------ */

  if (
    template.type === 'upload' &&
    template.backgroundImage?.startsWith(
      'data:application/pdf;base64,'
    )
  ) {
    const pdfBase64 =
      template.backgroundImage.split(',')[1];

    const pdfBytes =
      Buffer.from(
        pdfBase64,
        'base64'
      );

    const templateDoc =
      await PDFDocument.load(
        pdfBytes
      );

    pdfDoc =
      await PDFDocument.create();

    const [copiedPage] =
      await pdfDoc.copyPages(
        templateDoc,
        [0]
      );

    pdfDoc.addPage(
      copiedPage
    );
  } else {
    pdfDoc =
      await PDFDocument.create();

    const width =
      template.width || 842;

    const height =
      template.height || 595;

    const page =
      pdfDoc.addPage([
        width,
        height,
      ]);

    if (
      template.backgroundImage &&
      !template.backgroundImage.startsWith(
        'data:application/pdf;base64,'
      )
    ) {
      try {
        const parts =
          template.backgroundImage.split(',');

        const mime =
          parts[0]
            .match(/:(.*?);/)?.[1] || '';

        const imgBytes =
          Buffer.from(
            parts[1],
            'base64'
          );

        let image;

        if (
          mime.includes('png')
        ) {
          image =
            await pdfDoc.embedPng(
              imgBytes
            );
        } else {
          image =
            await pdfDoc.embedJpg(
              imgBytes
            );
        }

        page.drawImage(
          image,
          {
            x: 0,
            y: 0,
            width,
            height,
          }
        );
      } catch (error) {
        console.error(
          'Background image error:',
          error
        );
      }
    }
  }

  const page =
    pdfDoc.getPages()[0];

  const pdfWidth =
    page.getWidth();

  const pdfHeight =
    page.getHeight();

  const fonts =
    await embedFonts(
      pdfDoc
    );

  /* ------------------------------------------------
     FONT SELECTION
  ------------------------------------------------ */

  const getFont = (
    family?: string,
    weight?: string,
    style?: string
  ) => {
    const isBold =
      weight === 'bold' ||
      weight === '700';

    const isItalic =
      style === 'italic';

    const familyName =
      family?.toLowerCase() || '';

    if (
      familyName.includes('times') ||
      familyName.includes('serif')
    ) {
      if (isBold) {
        return fonts.timesRomanBold;
      }

      if (isItalic) {
        return fonts.timesRomanItalic;
      }

      return fonts.timesRoman;
    }

    if (
      familyName.includes('courier') ||
      familyName.includes('mono')
    ) {
      return isBold
        ? fonts.courierBold
        : fonts.courier;
    }

    if (isBold) {
      return fonts.helveticaBold;
    }

    if (isItalic) {
      return fonts.helveticaOblique;
    }

    return fonts.helvetica;
  };

  /* ------------------------------------------------
     CERTIFICATE BODY
  ------------------------------------------------ */

  const certificateBody =
    (template as any)
      .certificateBody;

  if (
    certificateBody &&
    certificateBody.trim()
  ) {
    const bodyText =
      replacePlaceholders(
        certificateBody,
        student,
        mappings
      );

    const bodyElement =
      (
        template.elements ||
        []
      ).find(
        (element: any) =>
          element.id ===
          'certificate_body'
      ) as any;

    if (bodyElement) {
      const designWidth =
        template.width || 842;

      const designHeight =
        template.height || 595;

      const scaleX =
        pdfWidth / designWidth;

      const scaleY =
        pdfHeight / designHeight;

      const x =
        bodyElement.x * scaleX;

      const topY =
        bodyElement.y * scaleY;

      const width =
        (bodyElement.width || 600) *
        scaleX;

      const height =
        (bodyElement.height || 180) *
        scaleY;

      const font =
        getFont(
          bodyElement.fontFamily,
          bodyElement.fontWeight,
          bodyElement.fontStyle
        );

      let fontSize =
        (bodyElement.fontSize || 16) *
        Math.min(
          scaleX,
          scaleY
        );

      const minFontSize =
        bodyElement.minFontSize ||
        10;

      let lines =
        wrapText(
          bodyText,
          width - 10,
          font,
          fontSize
        );

      let lineHeight =
        fontSize *
        (bodyElement.lineHeight ||
          1.35);

      const maxLines =
        Math.max(
          1,
          Math.floor(
            height /
              lineHeight
          )
        );

      while (
        lines.length >
          maxLines &&
        fontSize >
          minFontSize
      ) {
        fontSize -= 1;

        lineHeight =
          fontSize *
          (bodyElement.lineHeight ||
            1.35);

        lines =
          wrapText(
            bodyText,
            width - 10,
            font,
            fontSize
          );
      }

      const drawTop =
        pdfHeight -
        topY;

      lines
        .slice(0, maxLines)
        .forEach(
          (
            line,
            index
          ) => {
            const lineWidth =
              font.widthOfTextAtSize(
                line,
                fontSize
              );

            let drawX =
              x + 5;

            if (
              bodyElement.align ===
              'center'
            ) {
              drawX =
                x +
                (width -
                  lineWidth) /
                  2;
            } else if (
              bodyElement.align ===
              'right'
            ) {
              drawX =
                x +
                width -
                lineWidth -
                5;
            }

            const lineY =
              drawTop -
              fontSize -
              index *
                lineHeight;

            if (
              lineY > 0 &&
              lineY < pdfHeight
            ) {
              page.drawText(
                line,
                {
                  x: drawX,
                  y: lineY,
                  size: fontSize,
                  font,
                  color:
                    parseColor(
                      bodyElement.color ||
                        '#000000'
                    ),
                }
              );
            }
          }
        );
    }
  }

  /* ------------------------------------------------
     VISUAL ELEMENTS
  ------------------------------------------------ */

  const elements =
    [
      ...(template.elements || []),
    ].sort(
      (
        a: any,
        b: any
      ) =>
        (a.zIndex || 0) -
        (b.zIndex || 0)
    );

  for (
    const element of elements
  ) {
    /*
     * Certificate body is already
     * rendered above.
     */
    if (
      element.id ===
      'certificate_body'
    ) {
      continue;
    }

    const designWidth =
      template.width || 842;

    const designHeight =
      template.height || 595;

    const scaleX =
      pdfWidth / designWidth;

    const scaleY =
      pdfHeight / designHeight;

    const elX =
      element.x * scaleX;

    const elY =
      pdfHeight -
      element.y * scaleY;

    const elWidth =
      (element.width || 200) *
      scaleX;

    const elHeight =
      (element.height || 40) *
      scaleY;

    /* ----------------------------------------------
       TEXT
    ---------------------------------------------- */

    if (
      element.type === 'text'
    ) {
      const textRaw =
        element.text || '';

      const textContent =
        replacePlaceholders(
          textRaw,
          student,
          mappings
        );

      const font =
        getFont(
          element.fontFamily,
          element.fontWeight,
          element.fontStyle
        );

      const requestedSize =
        (element.fontSize || 14) *
        Math.min(
          scaleX,
          scaleY
        );

      const minSize =
        (element as any)
          .minFontSize || 8;

      let fontSize =
        requestedSize;

      const autoFit =
        (element as any)
          .autoFit === true;

      if (autoFit) {
        fontSize =
          getAutoFitFontSize(
            textContent,
            font,
            requestedSize,
            minSize,
            elWidth - 8
          );
      }

      const color =
        parseColor(
          element.color
        );

      let lines =
        wrapText(
          textContent,
          elWidth - 8,
          font,
          fontSize
        );

      let lineHeight =
        (element.lineHeight ||
          1.2) *
        fontSize;

      /*
       * If text is taller than
       * its element, reduce it.
       */
      const maxTextHeight =
        elHeight;

      while (
        lines.length *
          lineHeight >
          maxTextHeight &&
        fontSize >
          minSize
      ) {
        fontSize -= 1;

        lineHeight =
          (element.lineHeight ||
            1.2) *
          fontSize;

        lines =
          wrapText(
            textContent,
            elWidth - 8,
            font,
            fontSize
          );
      }

      lines.forEach(
        (
          line,
          index
        ) => {
          const lineY =
            elY -
            fontSize *
              0.8 -
            index *
              lineHeight;

          const lineWidth =
            font.widthOfTextAtSize(
              line,
              fontSize
            );

          let drawX =
            elX + 4;

          if (
            element.align ===
            'center'
          ) {
            drawX =
              elX +
              (elWidth -
                lineWidth) /
                2;
          } else if (
            element.align ===
            'right'
          ) {
            drawX =
              elX +
              elWidth -
              lineWidth -
              4;
          }

          if (
            lineY > 0 &&
            lineY < pdfHeight
          ) {
            page.drawText(
              line,
              {
                x: drawX,
                y: lineY,
                size: fontSize,
                font,
                color,
              }
            );
          }
        }
      );
    }

    /* ----------------------------------------------
       IMAGE
    ---------------------------------------------- */

    else if (
      element.type === 'image'
    ) {
      try {
        if (
          typeof element.src !==
          'string'
        ) {
          continue;
        }

        /*
         * Currently supports data URLs.
         */
        if (
          !element.src.includes(',')
        ) {
          continue;
        }

        const parts =
          element.src.split(',');

        const mime =
          parts[0]
            .match(
              /:(.*?);/
            )?.[1] || '';

        const imgBytes =
          Buffer.from(
            parts[1],
            'base64'
          );

        let image;

        if (
          mime.includes('png')
        ) {
          image =
            await pdfDoc.embedPng(
              imgBytes
            );
        } else {
          image =
            await pdfDoc.embedJpg(
              imgBytes
            );
        }

        page.drawImage(
          image,
          {
            x: elX,
            y:
              elY -
              elHeight,
            width: elWidth,
            height: elHeight,
          }
        );
      } catch (error) {
        console.error(
          'Image element error:',
          error
        );
      }
    }

    /* ----------------------------------------------
       SHAPE
    ---------------------------------------------- */

    else if (
      element.type === 'shape'
    ) {
      const color =
        parseColor(
          element.fillColor ||
            '#000000'
        );

      const drawY =
        elY -
        elHeight;

      if (
        element.shapeType ===
        'line'
      ) {
        page.drawLine(
          {
            start: {
              x: elX,
              y: elY,
            },

            end: {
              x:
                elX +
                elWidth,
              y: elY,
            },

            thickness:
              (element.thickness ||
                2) *
              Math.min(
                scaleX,
                scaleY
              ),

            color:
              parseColor(
                element.strokeColor ||
                  '#000000'
              ),
          }
        );
      } else {
        page.drawRectangle(
          {
            x: elX,
            y: drawY,
            width: elWidth,
            height: elHeight,
            color,
          }
        );
      }
    }
  }

  return await pdfDoc.save();
}

/* --------------------------------------------------
   SAVE PDF TO SUPABASE STORAGE
-------------------------------------------------- */

export async function saveStudentPDF(
  template: Template,
  student: Student,
  mappings: Record<string, string>
): Promise<string> {
  const pdfBytes =
    await generatePDF(
      template,
      student,
      mappings
    );

  const safeName =
    (student.name || 'student')
      .replace(
        /[^a-zA-Z0-9]/g,
        '_'
      );

  const safeCertId =
    String(
      student.certId ||
        'certificate'
    ).replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );

  /*
   * Use userId when available.
   *
   * If your Student type doesn't
   * currently contain userId, the
   * fallback still keeps the file
   * inside the campaign directory.
   */
  const userFolder =
    (student as any).userId ||
    'users';

  const storagePath =
    `${userFolder}/${student.campaignId}/${safeName}_${safeCertId}.pdf`;

  /*
   * Upload PDF directly from memory.
   *
   * NO fs.mkdir()
   * NO fs.writeFile()
   * NO process.cwd()
   * NO /data directory
   */
  const {
    error,
  } =
    await supabaseAdmin.storage
      .from('certificates')
      .upload(
        storagePath,
        Buffer.from(pdfBytes),
        {
          contentType:
            'application/pdf',

          upsert: true,
        }
      );

  if (error) {
    console.error(
      'Supabase certificate upload error:',
      error
    );

    throw new Error(
      `Failed to store certificate: ${error.message}`
    );
  }

  return storagePath;
}

/* --------------------------------------------------
   DOWNLOAD PDF FROM SUPABASE STORAGE
-------------------------------------------------- */

export async function getStoredStudentPDF(
  storagePath: string
): Promise<Buffer> {
  if (
    !storagePath ||
    !storagePath.trim()
  ) {
    throw new Error(
      'Certificate storage path is missing.'
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin.storage
      .from('certificates')
      .download(
        storagePath
      );

  if (
    error ||
    !data
  ) {
    throw new Error(
      `Failed to download certificate: ${
        error?.message ||
        'Certificate not found.'
      }`
    );
  }

  return Buffer.from(
    await data.arrayBuffer()
  );
}