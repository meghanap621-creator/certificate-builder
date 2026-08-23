import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { saveStudentPDF, replacePlaceholders } from '@/lib/pdf';
import { sendEmail } from '@/lib/smtp';
import { startCampaignProcessing } from '@/lib/jobs';
import fs from 'fs/promises';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 }
      );
    }

    const { id: campaignId } = await params;

    const bodyData = await request
      .json()
      .catch(() => ({}));

    const { studentId } = bodyData;

    /*
     * --------------------------------------------------
     * 1. Load campaign from Supabase
     * --------------------------------------------------
     */

    const {
      data: campaign,
      error: campaignError,
    } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (campaignError) {
      console.error(
        'Campaign lookup error:',
        campaignError
      );

      return NextResponse.json(
        { error: campaignError.message },
        { status: 500 }
      );
    }

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found.' },
        { status: 404 }
      );
    }

    /*
     * ==================================================
     * INDIVIDUAL RETRY
     * ==================================================
     */

    if (studentId) {
      /*
       * ------------------------------------------------
       * 2. Load student
       * ------------------------------------------------
       */

      const {
        data: studentRow,
        error: studentError,
      } = await supabaseAdmin
        .from('students')
        .select('*')
        .eq('id', studentId)
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (studentError) {
        console.error(
          'Student lookup error:',
          studentError
        );

        return NextResponse.json(
          { error: studentError.message },
          { status: 500 }
        );
      }

      if (!studentRow) {
        return NextResponse.json(
          {
            error:
              'Student record not found.',
          },
          { status: 404 }
        );
      }

      /*
       * Convert Supabase student row into the
       * structure expected by PDF/email functions.
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
       * ------------------------------------------------
       * 3. Load template
       * ------------------------------------------------
       */

      if (!campaign.template_id) {
        return NextResponse.json(
          {
            error:
              'Certificate template design not found.',
          },
          { status: 404 }
        );
      }

      const {
        data: template,
        error: templateError,
      } = await supabaseAdmin
        .from('templates')
        .select('*')
        .eq('id', campaign.template_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (templateError) {
        console.error(
          'Template lookup error:',
          templateError
        );

        return NextResponse.json(
          { error: templateError.message },
          { status: 500 }
        );
      }

      if (!template) {
        return NextResponse.json(
          {
            error:
              'Certificate template design not found.',
          },
          { status: 404 }
        );
      }

      /*
       * ------------------------------------------------
       * 4. Load column mappings
       * ------------------------------------------------
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
        .eq('user_id', user.id);

      if (mappingError) {
        console.error(
          'Mapping lookup error:',
          mappingError
        );

        return NextResponse.json(
          { error: mappingError.message },
          { status: 500 }
        );
      }

      if (
        !mappingRows ||
        mappingRows.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              'Column mappings are missing.',
          },
          { status: 400 }
        );
      }

      const mappings: Record<
        string,
        string
      > = {};

      for (const row of mappingRows) {
        if (
          row.certificate_field &&
          row.source_column
        ) {
          mappings[
            row.certificate_field
          ] = row.source_column;
        }
      }

      /*
       * ------------------------------------------------
       * 5. Find existing email log
       * ------------------------------------------------
       */

      const {
        data: existingLog,
        error: logError,
      } = await supabaseAdmin
        .from('email_logs')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('student_id', studentId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (logError) {
        console.error(
          'Email log lookup error:',
          logError
        );

        return NextResponse.json(
          { error: logError.message },
          { status: 500 }
        );
      }

      /*
       * ------------------------------------------------
       * 6. Generate certificate
       * ------------------------------------------------
       */

      try {
        const retryCount =
          Number(
            existingLog?.retry_count
          ) + 1 || 1;

        if (existingLog) {
          await supabaseAdmin
            .from('email_logs')
            .update({
              status: 'Generating',
              retry_count: retryCount,
              error_message: null,
            })
            .eq('id', existingLog.id);
        } else {
          const {
            data: newLog,
            error: newLogError,
          } =
            await supabaseAdmin
              .from('email_logs')
              .insert({
                user_id: user.id,
                campaign_id: campaignId,
                student_id: studentId,
                recipient_email:
                  student.email,
                subject:
                  campaign.email_subject ||
                  '',
                status: 'Generating',
                provider: 'SMTP',
                retry_count: retryCount,
              })
              .select()
              .single();

          if (newLogError) {
            throw new Error(
              newLogError.message
            );
          }

          /*
           * Keep reference for later updates.
           */
          if (newLog) {
            // Nothing else required here.
          }
        }

        /*
         * ------------------------------------------------
         * 7. Generate/reuse PDF
         * ------------------------------------------------
         */

        /*
         * email_logs doesn't currently contain
         * pdf_path, so we generate the certificate
         * for this retry.
         */

        const pdfPath =
          await saveStudentPDF(
            template,
            student,
            mappings
          );

        /*
         * ------------------------------------------------
         * 8. Prepare email
         * ------------------------------------------------
         */

        const emailSubject =
          replacePlaceholders(
            campaign.email_subject ||
              '',
            student,
            mappings
          );

        const emailBody =
          replacePlaceholders(
            campaign.email_body ||
              '',
            student,
            mappings
          );

        /*
         * ------------------------------------------------
         * 9. Mark as sending
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
         * 10. Send email
         * ------------------------------------------------
         */

        await sendEmail(
          user.id,
          student,
          student.email,
          emailSubject,
          emailBody,
          pdfPath
        );

        /*
         * ------------------------------------------------
         * 11. Mark successful
         * ------------------------------------------------
         */

        if (existingLog) {
          await supabaseAdmin
            .from('email_logs')
            .update({
              status: 'Sent',
              subject: emailSubject,
              sent_at:
                new Date().toISOString(),
              error_message: null,
            })
            .eq('id', existingLog.id);
        } else {
          /*
           * The log was created above, so find it
           * and update it.
           */

          await supabaseAdmin
            .from('email_logs')
            .update({
              status: 'Sent',
              subject: emailSubject,
              sent_at:
                new Date().toISOString(),
              error_message: null,
            })
            .eq('campaign_id', campaignId)
            .eq('student_id', studentId)
            .eq('user_id', user.id);
        }

        /*
         * Update campaign counters.
         */

        const {
          data: currentCampaign,
        } = await supabaseAdmin
          .from('campaigns')
          .select(
            'emails_sent, emails_failed, pending_count'
          )
          .eq('id', campaignId)
          .eq('user_id', user.id)
          .maybeSingle();

        await supabaseAdmin
          .from('campaigns')
          .update({
            emails_sent:
              (Number(
                currentCampaign?.emails_sent
              ) || 0) + 1,

            pending_count: Math.max(
              0,
              (Number(
                currentCampaign?.pending_count
              ) || 0) - 1
            ),

            updated_at:
              new Date().toISOString(),
          })
          .eq('id', campaignId)
          .eq('user_id', user.id);

        return NextResponse.json({
          message:
            `Successfully resent certificate to ${student.name}!`,
        });
      } catch (err: any) {
        console.error(
          `Individual retry failed for student ${student.name}:`,
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
              user_id: user.id,
              campaign_id: campaignId,
              student_id: studentId,
              recipient_email:
                student.email,
              subject:
                campaign.email_subject ||
                '',
              status: 'Failed',
              provider: 'SMTP',
              error_message:
                errorMessage,
              retry_count: 1,
            });
        }

        return NextResponse.json(
          {
            error:
              errorMessage ||
              'Resend failed.',
          },
          { status: 500 }
        );
      }
    }

    /*
     * ==================================================
     * BULK RETRY
     * ==================================================
     */

    await startCampaignProcessing(
      user.id,
      campaignId,
      true
    );

    /*
     * Update campaign status.
     */

    await supabaseAdmin
      .from('campaigns')
      .update({
        status: 'Processing',
        updated_at:
          new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('user_id', user.id);

    return NextResponse.json({
      message:
        'Background retry job started successfully!',
      status: 'Processing',
    });
  } catch (err: any) {
    console.error(
      'Campaign retry error:',
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Internal server error.',
      },
      { status: 500 }
    );
  }
}