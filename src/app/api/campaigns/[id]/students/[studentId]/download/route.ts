import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  saveStudentPDF,
  getStoredStudentPDF,
} from '@/lib/pdf';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 }
      );
    }

    const {
      id: campaignId,
      studentId,
    } = await params;

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
       2. LOAD STUDENT
    --------------------------------------------- */

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
        { error: 'Student record not found.' },
        { status: 404 }
      );
    }

    /* ---------------------------------------------
       3. LOAD TEMPLATE
    --------------------------------------------- */

    if (!campaign.template_id) {
      return NextResponse.json(
        {
          error:
            'Certificate template not found.',
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
            'Certificate template not found.',
        },
        { status: 400 }
      );
    }

    /* ---------------------------------------------
       4. LOAD COLUMN MAPPINGS
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
            'Column mappings not found.',
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
        mappings[
          row.certificate_field
        ] = row.source_column;
      }
    }

    /* ---------------------------------------------
       5. CONVERT STUDENT
    --------------------------------------------- */

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

    /* ---------------------------------------------
       6. FIND EXISTING PDF
    --------------------------------------------- */

    const {
      data: existingLogs,
      error: logError,
    } = await supabaseAdmin
      .from('email_logs')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('student_id', studentId)
      .eq('user_id', user.id)
      .order('created_at', {
        ascending: false,
      })
      .limit(1);

    if (logError) {
      console.warn(
        'Email log lookup warning:',
        logError
      );
    }

    const log =
      existingLogs &&
      existingLogs.length > 0
        ? existingLogs[0]
        : null;

    let pdfPath =
      log?.pdf_path || null;

    let fileBytes: Buffer | null =
      null;

    /* ---------------------------------------------
       7. TRY SUPABASE STORAGE
    --------------------------------------------- */

    if (pdfPath) {
      try {
        fileBytes =
          await getStoredStudentPDF(
            pdfPath
          );
      } catch (error) {
        console.warn(
          'Existing certificate unavailable. Regenerating...',
          error
        );

        fileBytes = null;
      }
    }

    /* ---------------------------------------------
       8. GENERATE IF MISSING
    --------------------------------------------- */

    if (!fileBytes) {
      pdfPath =
        await saveStudentPDF(
          template,
          student,
          mappings
        );

      fileBytes =
        await getStoredStudentPDF(
          pdfPath
        );
    }

    /* ---------------------------------------------
       9. SAFE FILE NAME
    --------------------------------------------- */

    const safeName =
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
      `${safeName}_${safeCertId}.pdf`;

    /* ---------------------------------------------
       10. RETURN PDF
    --------------------------------------------- */

    return new NextResponse(
      new Uint8Array(
        fileBytes
      ),
      {
        status: 200,

        headers: {
          'Content-Type':
            'application/pdf',

          'Content-Disposition':
            `attachment; filename="${fileName}"`,

          'Content-Length':
            String(
              fileBytes.length
            ),
        },
      }
    );
  } catch (err: any) {
    console.error(
      'Individual PDF download error:',
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Download failed.',
      },
      { status: 500 }
    );
  }
}