import { JsonDb, Campaign, Student, Template, DeliveryLog } from './db';
import { saveStudentPDF, replacePlaceholders } from './pdf';
import { sendEmail } from './smtp';
import path from 'path';

export interface CampaignJob {
  campaignId: string;
  userId: string;
  status: 'Processing' | 'Completed' | 'Failed';
  total: number;
  completed: number;
  failed: number;
  sent: number;
  pending: number;
  error?: string;
}

// In-Memory Global Job Registry
const activeJobs: Record<string, CampaignJob> = {};

// Helper to pause execution (SMTP throttling)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function getJobStatus(campaignId: string): CampaignJob | null {
  return activeJobs[campaignId] || null;
}

export function cancelJob(campaignId: string) {
  if (activeJobs[campaignId] && activeJobs[campaignId].status === 'Processing') {
    activeJobs[campaignId].status = 'Failed';
    activeJobs[campaignId].error = 'Campaign processing cancelled by user.';
  }
}

export async function startCampaignProcessing(userId: string, campaignId: string, onlyPendingFailed = false) {
  // If already processing, do not start again
  if (activeJobs[campaignId] && activeJobs[campaignId].status === 'Processing') {
    return;
  }

  // Fetch campaign, template, mappings, and students
  const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId });
  if (!campaign) throw new Error('Campaign not found.');

  const template = await JsonDb.findOne<Template>('templates', { id: campaign.templateId, userId });
  if (!template) throw new Error('Template not found. Please bind a certificate design first.');

  const allMappings = await JsonDb.read<any>('mappings');
  const mappingRecord = allMappings.find((m: any) => m.campaignId === campaignId);
  if (!mappingRecord || !mappingRecord.mappings) {
    throw new Error('Column mappings are missing. Please map your spreadsheet columns first.');
  }
  const mappings = mappingRecord.mappings;

  const students = await JsonDb.find<Student>('students', { campaignId });
  if (students.length === 0) {
    throw new Error('No students found in this campaign. Please upload an Excel/CSV file first.');
  }

  // Filter students based on delivery status if "onlyPendingFailed" is selected
  let targetStudents = students;
  const logs = await JsonDb.find<DeliveryLog>('delivery_logs', { campaignId });

  if (onlyPendingFailed) {
    targetStudents = students.filter((s) => {
      const log = logs.find((l) => l.studentId === s.id);
      return !log || log.emailStatus === 'Failed' || log.emailStatus === 'Pending';
    });
  }

  if (targetStudents.length === 0) {
    throw new Error('No pending or failed student records to process.');
  }

  // Update campaign status to Processing in database
  await JsonDb.update<Campaign>('campaigns', campaignId, { status: 'Processing' });

  // Initialize In-Memory Job state
  activeJobs[campaignId] = {
    campaignId,
    userId,
    status: 'Processing',
    total: targetStudents.length,
    completed: 0,
    failed: 0,
    sent: 0,
    pending: targetStudents.length,
  };

  // Run processing in background (do not await it in the route response)
  (async () => {
    const job = activeJobs[campaignId];
    
    // Read all logs once and map for performance
    const currentLogs = await JsonDb.read<DeliveryLog>('delivery_logs');

    for (const student of targetStudents) {
      // Check if job status changed to cancel
      if (job.status !== 'Processing') {
        break;
      }

      const logIndex = currentLogs.findIndex((l) => l.studentId === student.id && l.campaignId === campaignId);
      
      if (logIndex === -1) {
        // Safe check: If no log exists, skip or initialize
        job.failed++;
        job.pending--;
        continue;
      }

      const currentLog = currentLogs[logIndex];

      // Skip already Sent if in custom retry mode
      if (onlyPendingFailed && currentLog.emailStatus === 'Sent') {
        job.completed++;
        job.pending--;
        continue;
      }

      try {
        // Step A: Generate PDF Certificate
        currentLog.certStatus = 'Generating';
        currentLog.emailStatus = 'Pending';
        await JsonDb.write('delivery_logs', currentLogs); // Update database immediately

        const pdfPath = await saveStudentPDF(template, student, mappings);
        
        currentLog.certStatus = 'Generated';
        currentLog.pdfPath = pdfPath;
        await JsonDb.write('delivery_logs', currentLogs);

        // Step B: Send SMTP Email
        currentLog.emailStatus = 'Sending';
        currentLog.attempts += 1;
        await JsonDb.write('delivery_logs', currentLogs);

        // Customize email subject and body dynamically
        const emailSubject = replacePlaceholders(campaign.emailSubject, student, mappings);
        const emailBody = replacePlaceholders(campaign.emailBody, student, mappings);

        await sendEmail(userId, student, student.email, emailSubject, emailBody, pdfPath);

        // Success!
        currentLog.emailStatus = 'Sent';
        currentLog.sentAt = new Date().toISOString();
        currentLog.error = undefined;
        await JsonDb.write('delivery_logs', currentLogs);

        job.completed++;
        job.sent++;
      } catch (err: any) {
        console.error(`Failed to process student ${student.name} (${student.email}):`, err);
        currentLog.emailStatus = 'Failed';
        currentLog.error = err.message || String(err);
        await JsonDb.write('delivery_logs', currentLogs);

        job.failed++;
      } finally {
        job.pending--;
      }

      // Throttling: Throttle sending to avoid SMTP limits (1000ms delay)
      await sleep(1000);
    }

    // Processing Finalized!
    job.status = job.failed === job.total ? 'Failed' : 'Completed';
    
    // Save final status to campaign DB
    await JsonDb.update<Campaign>('campaigns', campaignId, {
      status: job.status === 'Completed' ? 'Completed' : 'Failed',
    });
  })().catch((err) => {
    console.error('Fatal background campaign worker error:', err);
    activeJobs[campaignId].status = 'Failed';
    activeJobs[campaignId].error = err.message || String(err);
  });
}
