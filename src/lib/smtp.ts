import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs/promises';
import { JsonDb, Settings, Student } from './db';

// CRITICAL SAFETY CHECK:
// Before every email is sent, verify:
// certificate.student_id === email.student_id AND certificate.recipient_email === student.email
export function verifyEmailAssociation(
  student: Student,
  recipientEmail: string,
  pdfPath: string
): boolean {
  // 1. Check if recipient email matches student email
  const matchEmail = student.email.trim().toLowerCase() === recipientEmail.trim().toLowerCase();
  
  // 2. Check if the PDF file name corresponds to this student's certId (which is unique)
  const fileName = path.basename(pdfPath);
  const matchCertId = fileName.includes(student.certId);

  return matchEmail && matchCertId;
}

export async function sendEmail(
  userId: string,
  student: Student,
  recipientEmail: string,
  subject: string,
  body: string,
  pdfPath: string
): Promise<string> {
  // 1. CRITICAL Safety Association Guard
  if (!verifyEmailAssociation(student, recipientEmail, pdfPath)) {
    throw new Error('Certificate/email association validation failed.');
  }

  // 2. Verify PDF file exists on disk
  try {
    await fs.access(pdfPath);
  } catch {
    throw new Error(`Certificate PDF file not found at path: ${pdfPath}`);
  }

  // 3. Fetch user SMTP settings
  const settings = await JsonDb.findOne<Settings>('settings', { userId });
  if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
    throw new Error('SMTP configuration is missing. Go to Settings to configure your email provider.');
  }
  if (!settings.smtpFromEmail) {
    throw new Error('Sender email address (smtpFromEmail) is not configured. Go to Settings and enter your verified sender address.');
  }

  // 4. Create Nodemailer Transport
  // Security is determined by port:
  //   465  → implicit TLS  (secure: true)
  //   587  → STARTTLS      (secure: false, requireTLS: true)
  //   25   → plain SMTP    (secure: false)
  const port = settings.smtpPort ?? 587;
  const secure = port === 465;
  const requireTLS = port === 587;

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure,
    ...(requireTLS ? { requireTLS: true } : {}),
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
  });

  // 5. Build and send mail message
  // smtpUser is the SMTP auth credential (e.g. "resend") — NOT used as the From address.
  // smtpFromEmail is the verified sender address that appears in the From header.
  const fromName = settings.smtpFrom || 'Certificate Builder';
  const mailOptions = {
    from: `"${fromName}" <${settings.smtpFromEmail}>`,
    to: recipientEmail,
    subject: subject,
    text: body, // plain text
    attachments: [
      {
        filename: path.basename(pdfPath),
        path: pdfPath,
      },
    ],
  };

  const info = await transporter.sendMail(mailOptions);
  return info.messageId;
}
