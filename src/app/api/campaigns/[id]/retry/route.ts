import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Campaign, Student, Template, DeliveryLog } from '@/lib/db';
import { saveStudentPDF } from '@/lib/pdf';
import { sendEmail } from '@/lib/smtp';
import { replacePlaceholders } from '@/lib/pdf';
import { startCampaignProcessing } from '@/lib/jobs';
import fs from 'fs/promises';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id: campaignId } = await params;
    const bodyData = await request.json().catch(() => ({}));
    const { studentId } = bodyData;

    // Load Campaign
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // 1. INDIVIDUAL RESEND/RETRY MODE
    if (studentId) {
      const student = await JsonDb.findOne<Student>('students', { id: studentId, campaignId });
      if (!student) {
        return NextResponse.json({ error: 'Student record not found.' }, { status: 404 });
      }

      const template = await JsonDb.findOne<Template>('templates', { id: campaign.templateId, userId: user.id });
      if (!template) {
        return NextResponse.json({ error: 'Certificate template design not found.' }, { status: 404 });
      }

      const allMappings = await JsonDb.read<any>('mappings');
      const mappingRecord = allMappings.find((m: any) => m.campaignId === campaignId);
      if (!mappingRecord || !mappingRecord.mappings) {
        return NextResponse.json({ error: 'Column mappings are missing.' }, { status: 400 });
      }
      const mappings = mappingRecord.mappings;

      const allLogs = await JsonDb.read<DeliveryLog>('delivery_logs');
      const logIndex = allLogs.findIndex((l) => l.studentId === studentId && l.campaignId === campaignId);
      if (logIndex === -1) {
        return NextResponse.json({ error: 'Delivery log not found.' }, { status: 404 });
      }
      
      const currentLog = allLogs[logIndex];

      try {
        currentLog.attempts += 1;
        currentLog.certStatus = 'Generating';
        currentLog.emailStatus = 'Pending';
        await JsonDb.write('delivery_logs', allLogs);

        // Check if PDF exists, otherwise generate it
        let pdfPath = currentLog.pdfPath;
        let generateNew = true;
        if (pdfPath) {
          try {
            await fs.access(pdfPath);
            generateNew = false; // File exists on disk, reuse it!
          } catch {}
        }

        if (generateNew) {
          pdfPath = await saveStudentPDF(template, student, mappings);
          currentLog.pdfPath = pdfPath;
          currentLog.certStatus = 'Generated';
          await JsonDb.write('delivery_logs', allLogs);
        } else {
          currentLog.certStatus = 'Generated';
          await JsonDb.write('delivery_logs', allLogs);
        }

        // Send Email
        currentLog.emailStatus = 'Sending';
        await JsonDb.write('delivery_logs', allLogs);

        const emailSubject = replacePlaceholders(campaign.emailSubject, student, mappings);
        const emailBody = replacePlaceholders(campaign.emailBody, student, mappings);

        await sendEmail(user.id, student, student.email, emailSubject, emailBody, pdfPath!);

        // Success
        currentLog.emailStatus = 'Sent';
        currentLog.sentAt = new Date().toISOString();
        currentLog.error = undefined;
        await JsonDb.write('delivery_logs', allLogs);

        return NextResponse.json({ message: `Successfully resent certificate to ${student.name}!` });
      } catch (err: any) {
        console.error(`Individual retry failed for student ${student.name}:`, err);
        currentLog.emailStatus = 'Failed';
        currentLog.error = err.message || String(err);
        await JsonDb.write('delivery_logs', allLogs);
        return NextResponse.json({ error: err.message || 'Resend failed.' }, { status: 500 });
      }
    }

    // 2. BULK RETRY MODE (all pending/failed)
    await startCampaignProcessing(user.id, campaignId, true);
    return NextResponse.json({
      message: 'Background retry job started successfully!',
      status: 'Processing',
    });
  } catch (err: any) {
    console.error('Campaign retry error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}
