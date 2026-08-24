import nodemailer from 'nodemailer';
import path from 'path';
import { JsonDb, Settings, Student } from './db';
import { supabaseAdmin } from './supabase-admin';

/* =========================================================
   CERTIFICATE / EMAIL SAFETY CHECK
========================================================= */

export function verifyEmailAssociation(
  student: Student,
  recipientEmail: string,
  pdfPath: string
): boolean {
  if (!student) {
    console.error(
      'Email association failed: student is missing.'
    );

    return false;
  }

  if (!student.email) {
    console.error(
      'Email association failed: student email is missing.',
      {
        studentId: student.id,
        studentName: student.name,
      }
    );

    return false;
  }

  if (!recipientEmail) {
    console.error(
      'Email association failed: recipient email is missing.'
    );

    return false;
  }

  /*
   * The email recipient MUST match the email
   * belonging to the current student.
   */
  const studentEmail =
    String(student.email)
      .trim()
      .toLowerCase();

  const targetEmail =
    String(recipientEmail)
      .trim()
      .toLowerCase();

  if (studentEmail !== targetEmail) {
    console.error(
      'Email association failed: recipient does not match student.',
      {
        studentId: student.id,
        studentName: student.name,
        studentEmail,
        targetEmail,
      }
    );

    return false;
  }

  /*
   * Certificate files are stored in Supabase Storage.
   *
   * The storage filename/path does NOT have to contain
   * the certificate ID because the application already
   * generated this certificate for the current student.
   */
  if (
    !pdfPath ||
    !String(pdfPath).trim()
  ) {
    console.error(
      'Email association failed: certificate storage path is missing.',
      {
        studentId: student.id,
        studentName: student.name,
        certificateId: student.certId,
      }
    );

    return false;
  }

  return true;
}

/* =========================================================
   DOWNLOAD CERTIFICATE FROM SUPABASE STORAGE
========================================================= */

async function downloadCertificate(
  pdfPath: string
): Promise<Buffer> {
  const storagePath =
    String(pdfPath || '').trim();

  if (!storagePath) {
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
      .download(storagePath);

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

  return Buffer.from(
    await data.arrayBuffer()
  );
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
     1. SECURITY VALIDATION
  ======================================================= */

  const isAssociationValid =
    verifyEmailAssociation(
      student,
      recipientEmail,
      pdfPath
    );

  if (!isAssociationValid) {
    throw new Error(
      'Certificate/email association validation failed.'
    );
  }

  /* =======================================================
     2. DOWNLOAD CERTIFICATE FROM SUPABASE STORAGE
  ======================================================= */

  const pdfBuffer =
    await downloadCertificate(
      pdfPath
    );

  if (
    !pdfBuffer ||
    pdfBuffer.length === 0
  ) {
    throw new Error(
      'Certificate PDF is empty.'
    );
  }

  /* =======================================================
     3. LOAD USER SMTP SETTINGS
  ======================================================= */

  const settings =
    await JsonDb.findOne<Settings>(
      'settings',
      {
        userId,
      }
    );

  if (
    !settings
  ) {
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

  /*
   * Port 465:
   * Implicit TLS
   *
   * Port 587:
   * STARTTLS
   *
   * Port 25:
   * Plain SMTP
   */
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
            requireTLS: true,
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
     5. VERIFY SMTP CONNECTION
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
    recipientEmail.trim();

  const safeSubject =
    subject?.trim() ||
    'Certificate';

  const safeBody =
    body || '';

  const fileName =
    path.basename(
      pdfPath
    ) || 'certificate.pdf';

  const fromName =
    settings.smtpFrom?.trim() ||
    'Certificate Builder';

  const mailOptions = {
    from:
      `"${fromName}" <${settings.smtpFromEmail.trim()}>`,

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