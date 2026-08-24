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
   * IMPORTANT:
   * The recipient must belong to the student.
   */
  const studentEmail =
    student.email.trim().toLowerCase();

  const targetEmail =
    recipientEmail.trim().toLowerCase();

  if (studentEmail !== targetEmail) {
    console.error(
      'Email association failed: recipient does not match student.',
      {
        studentId: student.id,
        studentEmail,
        targetEmail,
      }
    );

    return false;
  }

  /*
   * Supabase Storage paths can use UUIDs or other
   * generated filenames. Therefore we must NOT
   * require the PDF filename to contain certId.
   *
   * We only require a valid storage path here.
   */
  if (!pdfPath || !pdfPath.trim()) {
    console.error(
      'Email association failed: certificate storage path is missing.',
      {
        studentId: student.id,
      }
    );

    return false;
  }

  return true;
}

/* --------------------------------------------------
   DOWNLOAD CERTIFICATE FROM SUPABASE STORAGE
-------------------------------------------------- */

async function downloadCertificate(
  pdfPath: string
): Promise<Buffer> {
  if (!pdfPath || !pdfPath.trim()) {
    throw new Error(
      'Certificate storage path is missing.'
    );
  }

  const {
    data,
    error,
  } = await supabaseAdmin.storage
    .from('certificates')
    .download(pdfPath);

  if (error || !data) {
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
  ------------------------------------------------ */

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
  ------------------------------------------------ */

  const pdfBuffer =
    await downloadCertificate(
      pdfPath
    );

  /* -----------------------------------------------
     3. LOAD SMTP SETTINGS
  ------------------------------------------------ */

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

  if (!settings.smtpFromEmail) {
    throw new Error(
      'Sender email address is not configured. Go to Settings and enter your Gmail address.'
    );
  }

  /* -----------------------------------------------
     4. SMTP CONFIGURATION
  ------------------------------------------------ */

  const port =
    Number(settings.smtpPort) || 587;

  const secure =
    port === 465;

  const requireTLS =
    port === 587;

  const transporter =
    nodemailer.createTransport({
      host: settings.smtpHost,

      port,

      secure,

      ...(requireTLS
        ? {
            requireTLS: true,
          }
        : {}),

      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },

      tls: {
        minVersion: 'TLSv1.2',
      },

      connectionTimeout: 30000,

      greetingTimeout: 30000,

      socketTimeout: 60000,
    });

  /* -----------------------------------------------
     5. VERIFY SMTP CONNECTION
  ------------------------------------------------ */

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
     6. CREATE EMAIL ATTACHMENT
  ------------------------------------------------ */

  const fileName =
    path.basename(pdfPath);

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
  ------------------------------------------------ */

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

        studentId:
          student.id,

        studentName:
          student.name,

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