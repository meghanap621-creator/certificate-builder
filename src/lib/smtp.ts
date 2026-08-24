import nodemailer from 'nodemailer';
import path from 'path';
import { JsonDb, Settings, Student } from './db';
import { supabaseAdmin } from './supabase-admin';

/* =========================================================
   CERTIFICATE / EMAIL ASSOCIATION VALIDATION
========================================================= */

export function verifyEmailAssociation(
  student: Student,
  recipientEmail: string,
  pdfPath: string
): boolean {
  console.log(
    '========== EMAIL ASSOCIATION CHECK =========='
  );

  console.log(
    'Student:',
    {
      id: student?.id,
      name: student?.name,
      email: student?.email,
      certId: student?.certId,
    }
  );

  console.log(
    'Recipient:',
    recipientEmail
  );

  console.log(
    'Certificate path:',
    pdfPath
  );

  /* -------------------------------------------------------
     CHECK 1 — STUDENT
  ------------------------------------------------------- */

  if (!student) {
    console.error(
      'ASSOCIATION FAILED: student is missing.'
    );

    return false;
  }

  /* -------------------------------------------------------
     CHECK 2 — STUDENT EMAIL
  ------------------------------------------------------- */

  if (
    !student.email ||
    !String(student.email).trim()
  ) {
    console.error(
      'ASSOCIATION FAILED: student email is missing.',
      {
        studentId: student.id,
        studentName: student.name,
      }
    );

    return false;
  }

  /* -------------------------------------------------------
     CHECK 3 — RECIPIENT EMAIL
  ------------------------------------------------------- */

  if (
    !recipientEmail ||
    !String(recipientEmail).trim()
  ) {
    console.error(
      'ASSOCIATION FAILED: recipient email is missing.',
      {
        studentId: student.id,
        studentName: student.name,
      }
    );

    return false;
  }

  /* -------------------------------------------------------
     NORMALIZE EMAILS
  ------------------------------------------------------- */

  const studentEmail =
    String(student.email)
      .trim()
      .toLowerCase();

  const targetEmail =
    String(recipientEmail)
      .trim()
      .toLowerCase();

  console.log(
    'Normalized student email:',
    studentEmail
  );

  console.log(
    'Normalized recipient email:',
    targetEmail
  );

  /* -------------------------------------------------------
     CHECK 4 — EMAIL ASSOCIATION
  ------------------------------------------------------- */

  if (
    studentEmail !== targetEmail
  ) {
    console.error(
      'ASSOCIATION FAILED: EMAIL MISMATCH.',
      {
        studentId:
          student.id,

        studentName:
          student.name,

        studentEmail,

        targetEmail,

        certificateId:
          student.certId,
      }
    );

    return false;
  }

  /* -------------------------------------------------------
     CHECK 5 — CERTIFICATE PATH
  ------------------------------------------------------- */

  if (
    !pdfPath ||
    !String(pdfPath).trim()
  ) {
    console.error(
      'ASSOCIATION FAILED: certificate storage path is missing.',
      {
        studentId:
          student.id,

        studentName:
          student.name,

        certificateId:
          student.certId,
      }
    );

    return false;
  }

  console.log(
    'ASSOCIATION PASSED.',
    {
      studentId:
        student.id,

      studentName:
        student.name,

      email:
        studentEmail,

      certificateId:
        student.certId,

      pdfPath,
    }
  );

  console.log(
    '============================================='
  );

  return true;
}

/* =========================================================
   DOWNLOAD CERTIFICATE FROM SUPABASE STORAGE
========================================================= */

async function downloadCertificate(
  pdfPath: string
): Promise<Buffer> {
  const storagePath =
    String(
      pdfPath || ''
    ).trim();

  if (!storagePath) {
    throw new Error(
      'Certificate storage path is missing.'
    );
  }

  console.log(
    'Downloading certificate from Supabase Storage:',
    storagePath
  );

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
    console.error(
      'Supabase certificate download error:',
      error
    );

    throw new Error(
      `Certificate PDF could not be retrieved from storage: ${
        error?.message ||
        'File not found.'
      }`
    );
  }

  const buffer =
    Buffer.from(
      await data.arrayBuffer()
    );

  if (
    buffer.length === 0
  ) {
    throw new Error(
      'Certificate PDF retrieved from storage is empty.'
    );
  }

  console.log(
    'Certificate downloaded successfully.',
    {
      path:
        storagePath,

      size:
        buffer.length,
    }
  );

  return buffer;
}

/* =========================================================
   SEND EMAIL
========================================================= */

export async function sendEmail(
  userId: string,
  student: Student,
  recipientEmail: string,
  subject: string,
  body: string,
  pdfPath: string
): Promise<string> {
  /* =======================================================
     1. SECURITY / ASSOCIATION VALIDATION
  ======================================================= */

  const associationValid =
    verifyEmailAssociation(
      student,
      recipientEmail,
      pdfPath
    );

  if (
    !associationValid
  ) {
    throw new Error(
      'Certificate/email association validation failed.'
    );
  }

  /* =======================================================
     2. DOWNLOAD PDF
  ======================================================= */

  const pdfBuffer =
    await downloadCertificate(
      pdfPath
    );

  /* =======================================================
     3. LOAD SMTP SETTINGS
  ======================================================= */

  const settings =
    await JsonDb.findOne<Settings>(
      'settings',
      {
        userId,
      }
    );

  if (!settings) {
    throw new Error(
      'SMTP configuration is missing. Go to Settings to configure your email provider.'
    );
  }

  if (
    !settings.smtpHost ||
    !settings.smtpUser ||
    !settings.smtpPass
  ) {
    throw new Error(
      'SMTP configuration is incomplete. Please configure SMTP Host, Username, and Password in Settings.'
    );
  }

  if (
    !settings.smtpFromEmail
  ) {
    throw new Error(
      'Sender email address is not configured. Go to Settings and enter your verified sender email.'
    );
  }

  /* =======================================================
     4. SMTP CONFIGURATION
  ======================================================= */

  const port =
    Number(
      settings.smtpPort
    ) || 587;

  const secure =
    port === 465;

  const requireTLS =
    port === 587;

  const transporter =
    nodemailer.createTransport({
      host:
        settings.smtpHost,

      port,

      secure,

      ...(requireTLS
        ? {
            requireTLS:
              true,
          }
        : {}),

      auth: {
        user:
          settings.smtpUser,

        pass:
          settings.smtpPass,
      },

      tls: {
        minVersion:
          'TLSv1.2',
      },

      connectionTimeout:
        30000,

      greetingTimeout:
        30000,

      socketTimeout:
        60000,
    });

  /* =======================================================
     5. VERIFY SMTP
  ======================================================= */

  try {
    await transporter.verify();

    console.log(
      'SMTP connection verified successfully.',
      {
        host:
          settings.smtpHost,

        port,

        user:
          settings.smtpUser,
      }
    );
  } catch (
    error: any
  ) {
    console.error(
      'SMTP verification failed:',
      error
    );

    throw new Error(
      `SMTP connection failed: ${
        error?.message ||
        'Unable to connect to SMTP server.'
      }`
    );
  }

  /* =======================================================
     6. PREPARE EMAIL
  ======================================================= */

  const safeRecipient =
    String(
      recipientEmail
    ).trim();

  const safeSubject =
    String(
      subject || ''
    ).trim() ||
    'Certificate';

  const safeBody =
    String(
      body || ''
    );

  const fileName =
    path.basename(
      pdfPath
    ) ||
    'certificate.pdf';

  const fromName =
    String(
      settings.smtpFrom ||
        'Certificate Builder'
    ).trim();

  const senderEmail =
    String(
      settings.smtpFromEmail
    ).trim();

  const mailOptions = {
    from:
      `"${fromName}" <${senderEmail}>`,

    to:
      safeRecipient,

    subject:
      safeSubject,

    text:
      safeBody,

    attachments: [
      {
        filename:
          fileName,

        content:
          pdfBuffer,

        contentType:
          'application/pdf',
      },
    ],
  };

  /* =======================================================
     7. SEND EMAIL
  ======================================================= */

  try {
    console.log(
      'Sending certificate email...',
      {
        studentId:
          student.id,

        studentName:
          student.name,

        recipient:
          safeRecipient,

        certificateId:
          student.certId,

        fileName,
      }
    );

    const info =
      await transporter.sendMail(
        mailOptions
      );

    console.log(
      'Certificate email sent successfully.',
      {
        messageId:
          info.messageId,

        studentId:
          student.id,

        studentName:
          student.name,

        recipient:
          safeRecipient,

        certificateId:
          student.certId,

        fileName,
      }
    );

    return info.messageId;
  } catch (
    error: any
  ) {
    console.error(
      'SMTP email sending failed:',
      error
    );

    throw new Error(
      `Email delivery failed: ${
        error?.message ||
        'Unknown SMTP error.'
      }`
    );
  }
}