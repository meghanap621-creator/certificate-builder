import nodemailer from 'nodemailer';
import path from 'path';
import { JsonDb, Settings, Student } from './db';
import { supabaseAdmin } from './supabase-admin';

/* --------------------------------------------------
   CERTIFICATE / EMAIL SAFETY CHECK
-------------------------------------------------- */

export function verifyEmailAssociation(
  student: Student,
  recipientEmail: string,
  pdfPath: string
): boolean {
  if (!student.email || !recipientEmail) {
    return false;
  }

  // Recipient must exactly match the student email.
  const matchEmail =
    student.email.trim().toLowerCase() ===
    recipientEmail.trim().toLowerCase();

  if (!matchEmail) {
    return false;
  }

  // pdfPath is now a Supabase Storage path.
  // Example:
  // userId/campaignId/Student_Name_CERT-2026-00001.pdf

  const fileName = path.basename(pdfPath);

  const matchCertId =
    !!student.certId &&
    fileName.includes(student.certId);

  return matchCertId;
}

/* --------------------------------------------------
   DOWNLOAD CERTIFICATE FROM SUPABASE STORAGE
-------------------------------------------------- */

async function downloadCertificate(
  pdfPath: string
): Promise<Buffer> {
  if (
    !pdfPath ||
    !pdfPath.trim()
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
        pdfPath
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

  return Buffer.from(
    await data.arrayBuffer()
  );
}

/* --------------------------------------------------
   SEND EMAIL
-------------------------------------------------- */

export async function sendEmail(
  userId: string,
  student: Student,
  recipientEmail: string,
  subject: string,
  body: string,
  pdfPath: string
): Promise<string> {

  /* -----------------------------------------------
     1. SECURITY VALIDATION
  ----------------------------------------------- */

  if (
    !verifyEmailAssociation(
      student,
      recipientEmail,
      pdfPath
    )
  ) {
    throw new Error(
      'Certificate/email association validation failed.'
    );
  }

  /* -----------------------------------------------
     2. DOWNLOAD PDF FROM SUPABASE STORAGE
  ----------------------------------------------- */

  const pdfBuffer =
    await downloadCertificate(
      pdfPath
    );

  /* -----------------------------------------------
     3. LOAD SMTP SETTINGS
  ----------------------------------------------- */

  const settings =
    await JsonDb.findOne<Settings>(
      'settings',
      { userId }
    );

  if (
    !settings ||
    !settings.smtpHost ||
    !settings.smtpUser ||
    !settings.smtpPass
  ) {
    throw new Error(
      'SMTP configuration is missing. Go to Settings to configure your email provider.'
    );
  }

  if (
    !settings.smtpFromEmail
  ) {
    throw new Error(
      'Sender email address is not configured. Go to Settings and enter your Gmail address.'
    );
  }

  /* -----------------------------------------------
     4. SMTP CONFIGURATION
  ----------------------------------------------- */

  const port =
    Number(settings.smtpPort) ||
    587;

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

  /* -----------------------------------------------
     5. VERIFY SMTP CONNECTION
  ----------------------------------------------- */

  try {
    await transporter.verify();
  } catch (error: any) {
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

  /* -----------------------------------------------
     6. CREATE ATTACHMENT
  ----------------------------------------------- */

  const fileName =
    path.basename(
      pdfPath
    );

  const mailOptions = {
    from:
      `"${settings.smtpFrom || 'Certificate Builder'}" <${settings.smtpFromEmail}>`,

    to:
      recipientEmail.trim(),

    subject:
      subject || 'Certificate',

    text:
      body || '',

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

  /* -----------------------------------------------
     7. SEND EMAIL
  ----------------------------------------------- */

  try {
    const info =
      await transporter.sendMail(
        mailOptions
      );

    console.log(
      `Certificate email sent successfully to ${recipientEmail}`,
      {
        messageId:
          info.messageId,

        certificate:
          student.certId,
      }
    );

    return info.messageId;
  } catch (error: any) {
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