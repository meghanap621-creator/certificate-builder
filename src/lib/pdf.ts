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

/* =========================================================
   COLORS
========================================================= */

export function parseColor(hex?: string) {
  if (!hex) {
    return rgb(0, 0, 0);
  }

  let cleanHex = String(hex)
    .replace('#', '')
    .trim();

  // Support short HEX: #fff
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  const r =
    parseInt(cleanHex.substring(0, 2), 16) / 255;

  const g =
    parseInt(cleanHex.substring(2, 4), 16) / 255;

  const b =
    parseInt(cleanHex.substring(4, 6), 16) / 255;

  return rgb(
    Number.isNaN(r) ? 0 : r,
    Number.isNaN(g) ? 0 : g,
    Number.isNaN(b) ? 0 : b
  );
}

/* =========================================================
   REGEX ESCAPE
========================================================= */

function escapeRegExp(value: string) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}

/* =========================================================
   WORD WRAPPING
========================================================= */

export function wrapText(
  text: string,
  maxWidth: number,
  font: any,
  fontSize: number
): string[] {
  const paragraphs =
    String(text || '').split(/\r?\n/);

  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed =
      paragraph.trim();

    // Preserve blank lines
    if (!trimmed) {
      lines.push('');
      continue;
    }

    const words =
      trimmed.split(/\s+/);

    let currentLine = '';

    for (const word of words) {
      const testLine =
        currentLine
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
        lines.push(
          currentLine
        );

        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(
        currentLine
      );
    }
  }

  return lines;
}

/* =========================================================
   PLACEHOLDER REPLACEMENT
========================================================= */

export function replacePlaceholders(
  text: string,
  student: Student,
  mappings: Record<string, string>
): string {
  const data: Record<
    string,
    string
  > = {
    student_name:
      student.name || '',

    email:
      student.email || '',

    college_name:
      student.collegeName || '',

    course:
      student.course || '',

    department:
      student.department || '',

    internship_role:
      student.role || '',

    organization_name:
      student.organizationName || '',

    start_date:
      student.startDate || '',

    end_date:
      student.endDate || '',

    certificate_date:
      student.certDate || '',

    certificate_id:
      student.certId || '',

    ...(student.customFields || {}),
  };

  let replaced =
    String(text || '');

  Object.entries(
    data
  ).forEach(
    ([key, value]) => {
      const safeValue =
        String(value || '');

      /*
       * Standard placeholder:
       * {{student_name}}
       */
      replaced =
        replaced.replace(
          new RegExp(
            `{{\\s*${escapeRegExp(
              key
            )}\\s*}}`,
            'gi'
          ),
          safeValue
        );

      /*
       * Excel mapped placeholder.
       */
      const mappedHeader =
        mappings?.[key];

      if (
        mappedHeader
      ) {
        replaced =
          replaced.replace(
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

/* =========================================================
   AUTO FIT SINGLE LINE
========================================================= */

function getAutoFitFontSize(
  text: string,
  font: any,
  requestedSize: number,
  minSize: number,
  maxWidth: number
) {
  let size =
    requestedSize;

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

/* =========================================================
   AUTO FIT MULTI-LINE BODY
========================================================= */

function fitMultilineText(
  text: string,
  font: any,
  requestedSize: number,
  minSize: number,
  maxWidth: number,
  maxHeight: number,
  lineHeightMultiplier: number
) {
  let fontSize =
    requestedSize;

  let lineHeight =
    fontSize *
    lineHeightMultiplier;

  let lines =
    wrapText(
      text,
      maxWidth,
      font,
      fontSize
    );

  while (
    lines.length *
      lineHeight >
      maxHeight &&
    fontSize >
      minSize
  ) {
    fontSize -= 1;

    lineHeight =
      fontSize *
      lineHeightMultiplier;

    lines =
      wrapText(
        text,
        maxWidth,
        font,
        fontSize
      );
  }

  return {
    fontSize,
    lineHeight,
    lines,
  };
}

/* =========================================================
   LOAD FONTS
========================================================= */

async function embedFonts(
  doc: PDFDocument
) {
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
}

/* =========================================================
   FONT SELECTOR
========================================================= */

function selectFont(
  fonts: any,
  family?: string,
  weight?: string,
  style?: string
) {
  const isBold =
    weight === 'bold' ||
    weight === '700' ||
    Number(weight) >= 600;

  const isItalic =
    style === 'italic';

  const familyName =
    String(
      family || ''
    ).toLowerCase();

  if (
    familyName.includes(
      'times'
    ) ||
    familyName.includes(
      'serif'
    )
  ) {
    if (
      isBold
    ) {
      return fonts.timesRomanBold;
    }

    if (
      isItalic
    ) {
      return fonts.timesRomanItalic;
    }

    return fonts.timesRoman;
  }

  if (
    familyName.includes(
      'courier'
    ) ||
    familyName.includes(
      'mono'
    )
  ) {
    return isBold
      ? fonts.courierBold
      : fonts.courier;
  }

  if (
    isBold
  ) {
    return fonts.helveticaBold;
  }

  if (
    isItalic
  ) {
    return fonts.helveticaOblique;
  }

  return fonts.helvetica;
}

/* =========================================================
   DRAW MULTILINE TEXT
========================================================= */

function drawMultilineText(
  page: any,
  text: string,
  options: {
    x: number;
    topY: number;
    width: number;
    height: number;
    font: any;
    fontSize: number;
    lineHeight: number;
    color: any;
    align?: string;
  }
) {
  const {
    x,
    topY,
    width,
    height,
    font,
    fontSize,
    lineHeight,
    color,
    align,
  } = options;

  const lines =
    wrapText(
      text,
      Math.max(
        1,
        width - 10
      ),
      font,
      fontSize
    );

  const maxLines =
    Math.max(
      1,
      Math.floor(
        height /
          lineHeight
      )
    );

  const visibleLines =
    lines.slice(
      0,
      maxLines
    );

  visibleLines.forEach(
    (
      line: string,
      index: number
    ) => {
      if (
        line === ''
      ) {
        return;
      }

      const lineWidth =
        font.widthOfTextAtSize(
          line,
          fontSize
        );

      let drawX =
        x + 5;

      if (
        align === 'center'
      ) {
        drawX =
          x +
          (width -
            lineWidth) /
            2;
      } else if (
        align === 'right'
      ) {
        drawX =
          x +
          width -
          lineWidth -
          5;
      }

      const lineY =
        topY -
        fontSize -
        index *
          lineHeight;

      if (
        lineY > 0
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

/* =========================================================
   PDF GENERATOR
========================================================= */

export async function generatePDF(
  template: Template,
  student: Student,
  mappings: Record<string, string>
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;

  /* =====================================================
     CREATE PDF / BACKGROUND
  ===================================================== */

  if (
    template.type ===
      'upload' &&
    template.backgroundImage?.startsWith(
      'data:application/pdf;base64,'
    )
  ) {
    const pdfBase64 =
      template.backgroundImage.split(
        ','
      )[1];

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

    const copiedPages =
      await pdfDoc.copyPages(
        templateDoc,
        [0]
      );

    pdfDoc.addPage(
      copiedPages[0]
    );
  } else {
    pdfDoc =
      await PDFDocument.create();

    const width =
      Number(
        template.width || 842
      );

    const height =
      Number(
        template.height || 595
      );

    const page =
      pdfDoc.addPage([
        width,
        height,
      ]);

    /*
     * Draw uploaded image background.
     */
    if (
      template.backgroundImage &&
      !template.backgroundImage.startsWith(
        'data:application/pdf;base64,'
      )
    ) {
      try {
        const parts =
          template.backgroundImage.split(
            ','
          );

        if (
          parts.length >= 2
        ) {
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
            mime.includes(
              'png'
            )
          ) {
            image =
              await pdfDoc.embedPng(
                imgBytes
              );
          } else if (
            mime.includes(
              'jpeg'
            ) ||
            mime.includes(
              'jpg'
            )
          ) {
            image =
              await pdfDoc.embedJpg(
                imgBytes
              );
          }

          if (
            image
          ) {
            page.drawImage(
              image,
              {
                x: 0,
                y: 0,
                width,
                height,
              }
            );
          }
        }
      } catch (
        error
      ) {
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

  const designWidth =
    Number(
      template.width || 842
    );

  const designHeight =
    Number(
      template.height || 595
    );

  const scaleX =
    pdfWidth /
    designWidth;

  const scaleY =
    pdfHeight /
    designHeight;

  const uniformScale =
    Math.min(
      scaleX,
      scaleY
    );

  /* =====================================================
     CERTIFICATE BODY
     
     IMPORTANT:
     The body is stored in:
       template.certificateBody

     The position/style is stored in:
       certificate_body element
  ===================================================== */

  const certificateBody =
    String(
      (template as any)
        .certificateBody ||
        ''
    ).trim();

  const bodyElement =
    (
      template.elements ||
      []
    ).find(
      (element: any) =>
        element.id ===
          'certificate_body' ||
        element.id ===
          'certificateBody'
    ) as any;

  /*
   * Render certificate body when it exists.
   */
  if (
    certificateBody
  ) {
    const bodyText =
      replacePlaceholders(
        certificateBody,
        student,
        mappings
      ).trim();

    /*
     * If body element doesn't exist,
     * use a safe default area.
     *
     * This makes old templates work too.
     */
    const element =
      bodyElement || {
        x: 121,
        y: 370,
        width: 600,
        height: 140,
        fontSize: 16,
        fontFamily:
          'Helvetica',
        fontWeight:
          'normal',
        fontStyle:
          'normal',
        color:
          '#000000',
        align:
          'center',
        lineHeight:
          1.35,
        minFontSize:
          10,
      };

    const x =
      Number(
        element.x ?? 121
      ) * scaleX;

    const topY =
      pdfHeight -
      Number(
        element.y ?? 370
      ) * scaleY;

    const width =
      Number(
        element.width ?? 600
      ) * scaleX;

    const height =
      Number(
        element.height ?? 140
      ) * scaleY;

    const requestedFontSize =
      Number(
        element.fontSize ?? 16
      ) * uniformScale;

    const minFontSize =
      Number(
        element.minFontSize ??
          10
      ) * uniformScale;

    const lineHeightMultiplier =
      Number(
        element.lineHeight ??
          1.35
      );

    const font =
      selectFont(
        fonts,
        element.fontFamily,
        element.fontWeight,
        element.fontStyle
      );

    const fitted =
      fitMultilineText(
        bodyText,
        font,
        requestedFontSize,
        minFontSize,
        Math.max(
          1,
          width - 10
        ),
        height,
        lineHeightMultiplier
      );

    drawMultilineText(
      page,
      bodyText,
      {
        x,
        topY,
        width,
        height,
        font,
        fontSize:
          fitted.fontSize,
        lineHeight:
          fitted.lineHeight,
        color:
          parseColor(
            element.color ||
              '#000000'
          ),
        align:
          element.align ||
          'center',
      }
    );
  }

  /* =====================================================
     VISUAL CANVAS ELEMENTS
  ===================================================== */

  const elements =
    [
      ...(template.elements ||
        []),
    ].sort(
      (
        a: any,
        b: any
      ) =>
        Number(
          a.zIndex || 0
        ) -
        Number(
          b.zIndex || 0
        )
    );

  for (
    const element of elements
  ) {
    /*
     * Certificate body has already
     * been rendered above.
     */
    if (
      element.id ===
        'certificate_body' ||
      element.id ===
        'certificateBody'
    ) {
      continue;
    }

    /* ===================================================
       TEXT ELEMENT
    =================================================== */

    if (
      element.type ===
      'text'
    ) {
      const rawText =
        String(
          element.text ||
            ''
        );

      /*
       * Allow a body element using
       * {{certificate_body}} too.
       */
      const bodyPlaceholder =
        rawText.replace(
          /{{\s*certificate_body\s*}}/gi,
          certificateBody
        );

      const textContent =
        replacePlaceholders(
          bodyPlaceholder,
          student,
          mappings
        );

      if (
        !textContent.trim()
      ) {
        continue;
      }

      const x =
        Number(
          element.x || 0
        ) * scaleX;

      const topY =
        pdfHeight -
        Number(
          element.y || 0
        ) * scaleY;

      const width =
        Number(
          element.width ||
            200
        ) * scaleX;

      const height =
        Number(
          element.height ||
            40
        ) * scaleY;

      const font =
        selectFont(
          fonts,
          element.fontFamily,
          element.fontWeight,
          element.fontStyle
        );

      const requestedFontSize =
        Number(
          element.fontSize ||
            14
        ) * uniformScale;

      const minFontSize =
        Number(
          (element as any)
            .minFontSize ||
            8
        ) * uniformScale;

      let fontSize =
        requestedFontSize;

      /*
       * Auto-fit long names and roles.
       */
      if (
        (element as any)
          .autoFit === true &&
        !textContent.includes(
          '\n'
        )
      ) {
        fontSize =
          getAutoFitFontSize(
            textContent,
            font,
            requestedFontSize,
            minFontSize,
            Math.max(
              1,
              width - 8
            )
          );
      }

      const lineHeightMultiplier =
        Number(
          element.lineHeight ||
            1.2
        );

      let lineHeight =
        fontSize *
        lineHeightMultiplier;

      let lines =
        wrapText(
          textContent,
          Math.max(
            1,
            width - 8
          ),
          font,
          fontSize
        );

      /*
       * Reduce font until the text
       * fits vertically.
       */
      while (
        lines.length *
          lineHeight >
          height &&
        fontSize >
          minFontSize
      ) {
        fontSize -= 1;

        lineHeight =
          fontSize *
          lineHeightMultiplier;

        lines =
          wrapText(
            textContent,
            Math.max(
              1,
              width - 8
            ),
            font,
            fontSize
          );
      }

      const color =
        parseColor(
          element.color
        );

      lines.forEach(
        (
          line: string,
          index: number
        ) => {
          if (
            line === ''
          ) {
            return;
          }

          const lineWidth =
            font.widthOfTextAtSize(
              line,
              fontSize
            );

          let drawX =
            x + 4;

          if (
            element.align ===
            'center'
          ) {
            drawX =
              x +
              (width -
                lineWidth) /
                2;
          } else if (
            element.align ===
            'right'
          ) {
            drawX =
              x +
              width -
              lineWidth -
              4;
          }

          const lineY =
            topY -
            fontSize *
              0.8 -
            index *
              lineHeight;

          if (
            lineY >
              0 &&
            lineY <
              pdfHeight
          ) {
            page.drawText(
              line,
              {
                x: drawX,
                y: lineY,
                size:
                  fontSize,
                font,
                color,
              }
            );
          }
        }
      );
    }

    /* ===================================================
       IMAGE ELEMENT
    =================================================== */

    else if (
      element.type ===
      'image'
    ) {
      try {
        const src =
          String(
            element.src ||
              ''
          );

        if (
          !src.includes(
            ','
          )
        ) {
          continue;
        }

        const parts =
          src.split(
            ','
          );

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

        let image:
          | any
          | undefined;

        if (
          mime.includes(
            'png'
          )
        ) {
          image =
            await pdfDoc.embedPng(
              imgBytes
            );
        } else if (
          mime.includes(
            'jpeg'
          ) ||
          mime.includes(
            'jpg'
          )
        ) {
          image =
            await pdfDoc.embedJpg(
              imgBytes
            );
        }

        if (
          !image
        ) {
          continue;
        }

        const x =
          Number(
            element.x || 0
          ) * scaleX;

        const width =
          Number(
            element.width ||
              200
          ) * scaleX;

        const height =
          Number(
            element.height ||
              100
          ) * scaleY;

        const y =
          pdfHeight -
          Number(
            element.y || 0
          ) *
            scaleY -
          height;

        page.drawImage(
          image,
          {
            x,
            y,
            width,
            height,
          }
        );
      } catch (
        error
      ) {
        console.error(
          'Image element error:',
          error
        );
      }
    }

    /* ===================================================
       SHAPE ELEMENT
    =================================================== */

    else if (
      element.type ===
      'shape'
    ) {
      const x =
        Number(
          element.x || 0
        ) * scaleX;

      const width =
        Number(
          element.width ||
            200
        ) * scaleX;

      const height =
        Number(
          element.height ||
            40
        ) * scaleY;

      const topY =
        pdfHeight -
        Number(
          element.y || 0
        ) * scaleY;

      const color =
        parseColor(
          element.fillColor ||
            '#000000'
        );

      if (
        element.shapeType ===
        'line'
      ) {
        page.drawLine(
          {
            start: {
              x,
              y: topY,
            },

            end: {
              x:
                x +
                width,
              y: topY,
            },

            thickness:
              Number(
                element.thickness ||
                  2
              ) *
              uniformScale,

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
            x,
            y:
              topY -
              height,
            width,
            height,
            color,
          }
        );
      }
    }
  }

  return await pdfDoc.save();
}

/* =========================================================
   SAVE PDF TO SUPABASE STORAGE
========================================================= */

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
    (
      student.name ||
      'student'
    )
      .replace(
        /[^a-zA-Z0-9]/g,
        '_'
      )
      .replace(
        /_+/g,
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
   * Prefer userId if it exists.
   */
  const userFolder =
    String(
      (student as any)
        .userId ||
        'users'
    );

  const campaignFolder =
    String(
      student.campaignId ||
        'campaign'
    );

  const storagePath =
    `${userFolder}/${campaignFolder}/${safeName}_${safeCertId}.pdf`;

  /*
   * IMPORTANT:
   *
   * No local filesystem is used.
   *
   * This works on Vercel because
   * the certificate goes directly
   * to Supabase Storage.
   */
  const {
    error,
  } =
    await supabaseAdmin.storage
      .from(
        'certificates'
      )
      .upload(
        storagePath,
        Buffer.from(
          pdfBytes
        ),
        {
          contentType:
            'application/pdf',

          upsert:
            true,
        }
      );

  if (
    error
  ) {
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

/* =========================================================
   DOWNLOAD STORED PDF
========================================================= */

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
      .from(
        'certificates'
      )
      .download(
        storagePath
      );

  if (
    error ||
    !data
  ) {
    console.error(
      'Supabase certificate download error:',
      error
    );

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