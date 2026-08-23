import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { saveStudentPDF } from '@/lib/pdf';
import fs from 'fs/promises';
import JSZip from 'jszip';

export async function GET(
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
     * --------------------------------------------------
     * 2. Load template
     * --------------------------------------------------
     */

    if (!campaign.template_id) {
      return NextResponse.json(
        {
          error:
            'Certificate template not found. Map a template design first.',
        },
        { status: 400 }
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
            'Certificate template not found. Map a template design first.',
        },
        { status: 400 }
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
            'Spreadsheet column mappings are missing.',
        },
        { status: 400 }
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
      .eq('user_id', user.id)
      .order('row_number', {
        ascending: true,
      });

    if (studentsError) {
      console.error(
        'Students lookup error:',
        studentsError
      );

      return NextResponse.json(
        { error: studentsError.message },
        { status: 500 }
      );
    }

    if (
      !studentRows ||
      studentRows.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'No students found in this campaign.',
        },
        { status: 400 }
      );
    }

    /*
     * --------------------------------------------------
     * 5. Load email logs
     * --------------------------------------------------
     */

    const {
      data: logs,
      error: logsError,
    } = await supabaseAdmin
      .from('email_logs')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id);

    if (logsError) {
      console.error(
        'Email logs lookup error:',
        logsError
      );

      return NextResponse.json(
        { error: logsError.message },
        { status: 500 }
      );
    }

    /*
     * --------------------------------------------------
     * 6. Create ZIP
     * --------------------------------------------------
     */

    const zip = new JSZip();

    /*
     * Track log updates so we don't repeatedly
     * write the same record.
     */

    const logUpdates: Array<{
      id: string;
      pdfPath: string;
    }> = [];

    /*
     * --------------------------------------------------
     * 7. Generate/read certificates
     * --------------------------------------------------
     */

    for (const studentRow of studentRows) {
      /*
       * Convert Supabase row into the format expected
       * by the PDF generator.
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

      const log = logs?.find(
        (item) =>
          item.student_id === studentRow.id
      );

      let pdfPath =
        log?.pdf_path || null;

      let fileBytes: Buffer;

      /*
       * ------------------------------------------------
       * Try existing generated PDF first
       * ------------------------------------------------
       */

      let needToGenerate = true;

      if (pdfPath) {
        try {
          fileBytes =
            await fs.readFile(pdfPath);

          needToGenerate = false;
        } catch {
          /*
           * File no longer exists.
           * Generate a new one below.
           */
          needToGenerate = true;
        }
      }

      /*
       * ------------------------------------------------
       * Generate PDF if necessary
       * ------------------------------------------------
       */

      if (needToGenerate) {
        const generatedPath =
          await saveStudentPDF(
            template,
            student,
            mappings
          );

        pdfPath = generatedPath;

        fileBytes =
          await fs.readFile(generatedPath);

        if (log) {
          logUpdates.push({
            id: log.id,
            pdfPath: generatedPath,
          });
        }
      }

      /*
       * ------------------------------------------------
       * Add PDF to ZIP
       * ------------------------------------------------
       */

      const safeStudentName =
        String(student.name || 'Student')
          .replace(
            /[^a-zA-Z0-9]/g,
            '_'
          );

      const safeCertId =
        String(
          student.certId ||
            student.id
        ).replace(
          /[^a-zA-Z0-9_-]/g,
          '_'
        );

      const fileName =
        `${safeStudentName}_${safeCertId}.pdf`;

      zip.file(
        fileName,
        fileBytes!
      );
    }

    /*
     * --------------------------------------------------
     * 8. Update generated PDF paths
     * --------------------------------------------------
     */

    for (const update of logUpdates) {
      await supabaseAdmin
        .from('email_logs')
        .update({
          /*
           * Your database does not currently show
           * pdf_path in email_logs, so we don't try
           * to write it here.
           *
           * PDF files are still included in the ZIP.
           */
        })
        .eq('id', update.id);
    }

    /*
     * --------------------------------------------------
     * 9. Generate ZIP buffer
     * --------------------------------------------------
     */

    const zipBuffer =
      await zip.generateAsync({
        type: 'nodebuffer',
      });

    /*
     * --------------------------------------------------
     * 10. Send ZIP response
     * --------------------------------------------------
     */

    const safeCampaignName =
      String(
        campaign.name || 'Campaign'
      ).replace(
        /[^a-zA-Z0-9]/g,
        '_'
      );

    return new NextResponse(
      new Uint8Array(zipBuffer),
      {
        status: 200,

        headers: {
          'Content-Type':
            'application/zip',

          'Content-Disposition':
            `attachment; filename="Certificates_${safeCampaignName}.zip"`,

          'Content-Length':
            String(zipBuffer.length),
        },
      }
    );
  } catch (err: any) {
    console.error(
      'ZIP generation failed:',
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          'ZIP download failed.',
      },
      { status: 500 }
    );
  }
}