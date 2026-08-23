import { supabaseAdmin } from './supabase-admin';
import { saveStudentPDF, replacePlaceholders } from './pdf';
import { sendEmail } from './smtp';

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

const activeJobs: Record<string, CampaignJob> = {};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function getJobStatus(
  campaignId: string
): CampaignJob | null {
  return activeJobs[campaignId] || null;
}

export function cancelJob(
  campaignId: string
) {
  const job = activeJobs[campaignId];

  if (
    job &&
    job.status === 'Processing'
  ) {
    job.status = 'Failed';
    job.error =
      'Campaign processing cancelled by user.';
  }
}

export async function startCampaignProcessing(
  userId: string,
  campaignId: string,
  onlyPendingFailed = false
) {
  /*
   * Prevent duplicate jobs.
   */
  if (
    activeJobs[campaignId] &&
    activeJobs[campaignId].status === 'Processing'
  ) {
    return;
  }

  /*
   * --------------------------------------------------
   * 1. Load campaign
   * --------------------------------------------------
   */

  const {
    data: campaign,
    error: campaignError,
  } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();

  if (campaignError) {
    console.error(
      'Campaign lookup error:',
      campaignError
    );

    throw new Error(
      campaignError.message
    );
  }

  if (!campaign) {
    throw new Error(
      'Campaign not found.'
    );
  }

  /*
   * --------------------------------------------------
   * 2. Load template
   * --------------------------------------------------
   */

  if (!campaign.template_id) {
    throw new Error(
      'Template not found. Please bind a certificate design first.'
    );
  }

  const {
    data: template,
    error: templateError,
  } = await supabaseAdmin
    .from('templates')
    .select('*')
    .eq('id', campaign.template_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (templateError) {
    console.error(
      'Template lookup error:',
      templateError
    );

    throw new Error(
      templateError.message
    );
  }

  if (!template) {
    throw new Error(
      'Template not found. Please bind a certificate design first.'
    );
  }

  /*
   * --------------------------------------------------
   * 3. Load column mappings
   * --------------------------------------------------
   */

  const {
    data: mappingRows,
    error: mappingError,
  } = await supabaseAdmin
    .from('column_mappings')
    .select(
      'certificate_field, source_column'
    )
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);

  if (mappingError) {
    console.error(
      'Mapping lookup error:',
      mappingError
    );

    throw new Error(
      mappingError.message
    );
  }

  if (
    !mappingRows ||
    mappingRows.length === 0
  ) {
    throw new Error(
      'Column mappings are missing. Please map your spreadsheet columns first.'
    );
  }

  const mappings: Record<string, string> = {};

  for (const row of mappingRows) {
    if (
      row.certificate_field &&
      row.source_column
    ) {
      mappings[row.certificate_field] =
        row.source_column;
    }
  }

  /*
   * --------------------------------------------------
   * 4. Load students
   * --------------------------------------------------
   */

  const {
    data: studentRows,
    error: studentsError,
  } = await supabaseAdmin
    .from('students')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('row_number', {
      ascending: true,
    });

  if (studentsError) {
    console.error(
      'Students lookup error:',
      studentsError
    );

    throw new Error(
      studentsError.message
    );
  }

  if (
    !studentRows ||
    studentRows.length === 0
  ) {
    throw new Error(
      'No students found in this campaign. Please upload an Excel/CSV file first.'
    );
  }

  /*
   * --------------------------------------------------
   * 5. Load email logs
   * --------------------------------------------------
   */

  const {
    data: emailLogs,
    error: logsError,
  } = await supabaseAdmin
    .from('email_logs')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);

  if (logsError) {
    console.error(
      'Email logs lookup error:',
      logsError
    );

    throw new Error(
      logsError.message
    );
  }

  /*
   * --------------------------------------------------
   * 6. Determine target students
   * --------------------------------------------------
   */

  let targetStudents = studentRows;

  if (onlyPendingFailed) {
    targetStudents =
      studentRows.filter((student) => {
        const log =
          emailLogs?.find(
            (item) =>
              item.student_id === student.id
          );

        return (
          !log ||
          log.status === 'Failed' ||
          log.status === 'Pending'
        );
      });
  }

  if (
    targetStudents.length === 0
  ) {
    throw new Error(
      'No pending or failed student records to process.'
    );
  }

  /*
   * --------------------------------------------------
   * 7. Mark campaign Processing
   * --------------------------------------------------
   */

  await supabaseAdmin
    .from('campaigns')
    .update({
      status: 'Processing',
      updated_at:
        new Date().toISOString(),
    })
    .eq('id', campaignId)
    .eq('user_id', userId);

  /*
   * --------------------------------------------------
   * 8. Initialize job
   * --------------------------------------------------
   */

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

  /*
   * --------------------------------------------------
   * 9. Background worker
   * --------------------------------------------------
   */

  (async () => {
    const job =
      activeJobs[campaignId];

    if (!job) {
      return;
    }

    for (const studentRow of targetStudents) {
      if (
        job.status !== 'Processing'
      ) {
        break;
      }

      /*
       * Convert Supabase student format
       * to the format expected by PDF/email code.
       */

      const student: any = {
        id: studentRow.id,

        campaignId:
          studentRow.campaign_id,

        userId:
          studentRow.user_id,

        name:
          studentRow.student_name || '',

        email:
          studentRow.email || '',

        collegeName:
          studentRow.college_name || '',

        course:
          studentRow.course || '',

        department:
          studentRow.department || '',

        role:
          studentRow.internship_role || '',

        organizationName:
          studentRow.organization_name || '',

        startDate:
          studentRow.start_date || '',

        endDate:
          studentRow.end_date || '',

        certDate:
          studentRow.certificate_date || '',

        certId:
          studentRow.external_student_id || '',

        customFields:
          studentRow.custom_data || {},
      };

      /*
       * Find existing email log.
       */

      const existingLog =
        emailLogs?.find(
          (item) =>
            item.student_id ===
            studentRow.id
        );

      /*
       * Retry mode:
       * skip already-sent records.
       */

      if (
        onlyPendingFailed &&
        existingLog?.status === 'Sent'
      ) {
        job.completed++;
        job.sent++;
        job.pending--;

        continue;
      }

      /*
       * If there is no email address,
       * mark the record failed.
       */

      if (!student.email) {
        job.failed++;
        job.pending--;

        if (existingLog) {
          await supabaseAdmin
            .from('email_logs')
            .update({
              status: 'Failed',
              error_message:
                'Student email address is missing.',
              retry_count:
                (existingLog.retry_count || 0) + 1,
            })
            .eq('id', existingLog.id);
        }

        continue;
      }

      try {
        /*
         * ------------------------------------------------
         * A. Mark email as processing
         * ------------------------------------------------
         */

        if (existingLog) {
          await supabaseAdmin
            .from('email_logs')
            .update({
              status: 'Generating',
              retry_count:
                (existingLog.retry_count || 0) + 1,
            })
            .eq('id', existingLog.id);
        } else {
          await supabaseAdmin
            .from('email_logs')
            .insert({
              user_id: userId,
              campaign_id: campaignId,
              student_id: studentRow.id,
              recipient_email:
                student.email,
              subject:
                campaign.email_subject || '',
              status: 'Generating',
              provider: 'SMTP',
              retry_count: 1,
            });
        }

        /*
         * ------------------------------------------------
         * B. Generate certificate PDF
         * ------------------------------------------------
         */

        const pdfPath =
          await saveStudentPDF(
            template,
            student,
            mappings
          );

        /*
         * ------------------------------------------------
         * C. Build email
         * ------------------------------------------------
         */

        const emailSubject =
          replacePlaceholders(
            campaign.email_subject || '',
            student,
            mappings
          );

        const emailBody =
          replacePlaceholders(
            campaign.email_body || '',
            student,
            mappings
          );

        /*
         * ------------------------------------------------
         * D. Mark Sending
         * ------------------------------------------------
         */

        if (existingLog) {
          await supabaseAdmin
            .from('email_logs')
            .update({
              status: 'Sending',
              subject: emailSubject,
            })
            .eq('id', existingLog.id);
        }

        /*
         * ------------------------------------------------
         * E. Send email
         * ------------------------------------------------
         */

        await sendEmail(
          userId,
          student,
          student.email,
          emailSubject,
          emailBody,
          pdfPath
        );

        /*
         * ------------------------------------------------
         * F. Success
         * ------------------------------------------------
         */

        if (existingLog) {
          await supabaseAdmin
            .from('email_logs')
            .update({
              status: 'Sent',
              sent_at:
                new Date().toISOString(),
              error_message: null,
              subject: emailSubject,
            })
            .eq('id', existingLog.id);
        }

        job.completed++;
        job.sent++;
      } catch (err: any) {
        console.error(
          `Failed to process student ${student.name} (${student.email}):`,
          err
        );

        const errorMessage =
          err?.message ||
          String(err);

        if (existingLog) {
          await supabaseAdmin
            .from('email_logs')
            .update({
              status: 'Failed',
              error_message:
                errorMessage,
            })
            .eq('id', existingLog.id);
        } else {
          await supabaseAdmin
            .from('email_logs')
            .insert({
              user_id: userId,
              campaign_id: campaignId,
              student_id: studentRow.id,
              recipient_email:
                student.email,
              subject:
                campaign.email_subject || '',
              status: 'Failed',
              provider: 'SMTP',
              error_message:
                errorMessage,
              retry_count: 1,
            });
        }

        job.failed++;

        /*
         * Keep the actual error on the job so
         * the frontend can display it.
         */

        job.error = errorMessage;
      } finally {
        job.pending--;
      }

      /*
       * SMTP throttling.
       */

      await sleep(1000);
    }

    /*
     * --------------------------------------------------
     * 10. Final status
     * --------------------------------------------------
     */

    if (
      job.failed === job.total
    ) {
      job.status = 'Failed';
    } else {
      job.status = 'Completed';
    }

    /*
     * Update campaign counters.
     */

    const {
      data: currentCampaign,
    } = await supabaseAdmin
      .from('campaigns')
      .select(
        'total_students, emails_sent, emails_failed, pending_count'
      )
      .eq('id', campaignId)
      .eq('user_id', userId)
      .maybeSingle();

    const currentTotal =
      Number(
        currentCampaign?.total_students
      ) || job.total;

    const currentSent =
      Number(
        currentCampaign?.emails_sent
      ) || 0;

    const currentFailed =
      Number(
        currentCampaign?.emails_failed
      ) || 0;

    await supabaseAdmin
      .from('campaigns')
      .update({
        status:
          job.status === 'Completed'
            ? 'Completed'
            : 'Failed',

        total_students:
          currentTotal,

        emails_sent:
          currentSent + job.sent,

        emails_failed:
          currentFailed + job.failed,

        pending_count:
          job.pending,

        updated_at:
          new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('user_id', userId);
  })().catch(async (err: any) => {
    console.error(
      'Fatal background campaign worker error:',
      err
    );

    const job =
      activeJobs[campaignId];

    if (job) {
      job.status = 'Failed';
      job.error =
        err?.message ||
        String(err);
    }

    await supabaseAdmin
      .from('campaigns')
      .update({
        status: 'Failed',
        updated_at:
          new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('user_id', userId);
  });
}