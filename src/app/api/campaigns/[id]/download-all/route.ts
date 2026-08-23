import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  saveStudentPDF,
  getStoredStudentPDF,
} from '@/lib/pdf';
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

    /* ---------------------------------------------
       1. LOAD CAMPAIGN
    --------------------------------------------- */

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

    /* ---------------------------------------------
       2. LOAD TEMPLATE
    --------------------------------------------- */

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

    /* ---------------------------------------------
       3. LOAD COLUMN MAPPINGS
    --------------------------------------------- */

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

    /* ---------------------------------------------
       4. LOAD STUDENTS
    --------------------------------------------- */

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

    /* ---------------------------------------------
       5. LOAD EMAIL LOGS
    --------------------------------------------- */

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

    /* ---------------------------------------------
       6. CREATE ZIP
    --------------------------------------------- */

    const zip = new JSZip();

    /* ---------------------------------------------
       7. PROCESS EACH STUDENT
    --------------------------------------------- */

    for (const studentRow of studentRows) {
      try {
        /*
         * Convert Supabase student row
         * to PDF generator format.
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
            studentRow.external_student_id ||
            '',

          customFields:
            studentRow.custom_data || {},
        };

        /*
         * Find existing email log.
         */

        const log =
          logs?.find(
            (item) =>
              item.student_id ===
              studentRow.id
          );

        /*
         * The log may contain a PDF path
         * if your email workflow stores it.
         */

        let pdfPath =
          log?.pdf_path || null;

        let fileBytes: Buffer | null =
          null;

        /* -----------------------------------------
           TRY EXISTING SUPABASE PDF
        ----------------------------------------- */

        if (pdfPath) {
          try {
            fileBytes =
              await getStoredStudentPDF(
                pdfPath
              );
          } catch (error) {
            console.warn(
              `Existing certificate unavailable for ${student.name}. Regenerating...`,
              error
            );

            fileBytes = null;
          }
        }

        /* -----------------------------------------
           GENERATE IF NO PDF EXISTS
        ----------------------------------------- */

        if (!fileBytes) {
          pdfPath =
            await saveStudentPDF(
              template,
              student,
              mappings
            );

          /*
           * IMPORTANT:
           *
           * saveStudentPDF() returns a
           * Supabase Storage path.
           *
           * It does NOT return a local
           * filesystem path.
           */

          fileBytes =
            await getStoredStudentPDF(
              pdfPath
            );
        }

        /* -----------------------------------------
           SAFE FILE NAME
        ----------------------------------------- */

        const safeStudentName =
          String(
            student.name ||
              'Student'
          ).replace(
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

        /* -----------------------------------------
           ADD TO ZIP
        ----------------------------------------- */

        zip.file(
          fileName,
          fileBytes
        );
      } catch (studentError: any) {
        /*
         * Do not fail the entire ZIP because
         * of one student.
         */

        console.error(
          `Failed to generate certificate for ${studentRow.student_name}:`,
          studentError
        );
      }
    }

    /* ---------------------------------------------
       8. GENERATE ZIP
    --------------------------------------------- */

    const zipBuffer =
      await zip.generateAsync({
        type: 'nodebuffer',

        compression:
          'DEFLATE',

        compressionOptions: {
          level: 6,
        },
      });

    /* ---------------------------------------------
       9. SAFE CAMPAIGN FILE NAME
    --------------------------------------------- */

    const safeCampaignName =
      String(
        campaign.name ||
          'Campaign'
      ).replace(
        /[^a-zA-Z0-9]/g,
        '_'
      );

    /* ---------------------------------------------
       10. RETURN ZIP
    --------------------------------------------- */

    return new NextResponse(
      new Uint8Array(
        zipBuffer
      ),
      {
        status: 200,

        headers: {
          'Content-Type':
            'application/zip',

          'Content-Disposition':
            `attachment; filename="Certificates_${safeCampaignName}.zip"`,

          'Content-Length':
            String(
              zipBuffer.length
            ),
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