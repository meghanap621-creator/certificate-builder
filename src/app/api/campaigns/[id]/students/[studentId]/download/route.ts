import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { saveStudentPDF } from '@/lib/pdf';
import fs from 'fs/promises';

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      studentId: string;
    }>;
  }
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

    // --------------------------------------------------
    // 1. Load campaign
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 2. Load student
    // --------------------------------------------------

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

    // Convert Supabase row to the structure
    // expected by saveStudentPDF()

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

    // --------------------------------------------------
    // 3. Load template
    // --------------------------------------------------

    if (!campaign.template_id) {
      return NextResponse.json(
        {
          error:
            'Template not found. Please attach a certificate design first.',
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
        { error: 'Template not found.' },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 4. Load column mappings
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 5. Generate certificate PDF
    // --------------------------------------------------

    const pdfPath =
      await saveStudentPDF(
        template,
        student,
        mappings
      );

    const fileBytes =
      await fs.readFile(pdfPath);

    // --------------------------------------------------
    // 6. Create safe filename
    // --------------------------------------------------

    const safeStudentName =
      String(
        student.name || 'Student'
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

    const filename =
      `${safeStudentName}_${safeCertId}.pdf`;

    // --------------------------------------------------
    // 7. Return PDF
    // --------------------------------------------------

    return new NextResponse(
      new Uint8Array(fileBytes),
      {
        status: 200,

        headers: {
          'Content-Type':
            'application/pdf',

          'Content-Disposition':
            `attachment; filename="${filename}"`,

          'Cache-Control':
            'no-store',
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