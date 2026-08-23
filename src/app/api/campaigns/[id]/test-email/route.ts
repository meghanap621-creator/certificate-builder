import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { saveStudentPDF } from '@/lib/pdf';
import { sendEmail } from '@/lib/smtp';
import { replacePlaceholders } from '@/lib/pdf';

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

    const {
      studentId,
      testEmail,
    } = await request.json();

    if (!studentId || !testEmail) {
      return NextResponse.json(
        {
          error:
            'Student selection and target test email are required.',
        },
        { status: 400 }
      );
    }

    const recipientEmail =
      String(testEmail).trim();

    if (!recipientEmail) {
      return NextResponse.json(
        {
          error:
            'A valid test email address is required.',
        },
        { status: 400 }
      );
    }

    /*
     * ----------------------------------------------------
     * 1. Load campaign from Supabase
     * ----------------------------------------------------
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
        {
          error:
            campaignError.message,
        },
        { status: 500 }
      );
    }

    if (!campaign) {
      return NextResponse.json(
        {
          error: 'Campaign not found.',
        },
        { status: 404 }
      );
    }

    /*
     * ----------------------------------------------------
     * 2. Load student from Supabase
     * ----------------------------------------------------
     */

    const {
      data: student,
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
        {
          error:
            studentError.message,
        },
        { status: 500 }
      );
    }

    if (!student) {
      return NextResponse.json(
        {
          error:
            'Student record not found.',
        },
        { status: 404 }
      );
    }

    /*
     * ----------------------------------------------------
     * 3. Load template from Supabase
     * ----------------------------------------------------
     */

    if (!campaign.template_id) {
      return NextResponse.json(
        {
          error:
            'No template is attached to this campaign. Please attach a template first.',
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
        {
          error:
            templateError.message,
        },
        { status: 500 }
      );
    }

    if (!template) {
      return NextResponse.json(
        {
          error:
            'Template design not found. Please attach a design first.',
        },
        { status: 404 }
      );
    }

    /*
     * ----------------------------------------------------
     * 4. Load column mappings
     * ----------------------------------------------------
     *
     * Supabase stores mappings as individual rows:
     *
     * certificate_field
     * source_column
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
        {
          error:
            mappingError.message,
        },
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
            'Column mappings are missing. Please import your student data again.',
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
     * ----------------------------------------------------
     * 5. Convert Supabase student format into
     *    the format expected by the existing PDF
     *    and placeholder utilities.
     * ----------------------------------------------------
     */

    const testStudent: any = {
      id: student.id,

      campaignId:
        student.campaign_id,

      userId:
        student.user_id,

      name:
        student.student_name || '',

      email:
        recipientEmail,

      collegeName:
        student.college_name || '',

      course:
        student.course || '',

      department:
        student.department || '',

      role:
        student.internship_role || '',

      organizationName:
        student.organization_name || '',

      startDate:
        student.start_date || '',

      endDate:
        student.end_date || '',

      certDate:
        student.certificate_date || '',

      certId:
        student.external_student_id || '',

      customFields:
        student.custom_data || {},
    };

    /*
     * ----------------------------------------------------
     * 6. Generate PDF
     * ----------------------------------------------------
     */

    const pdfPath = await saveStudentPDF(
      template,
      testStudent,
      mappings
    );

    /*
     * ----------------------------------------------------
     * 7. Build email
     * ----------------------------------------------------
     */

    const subject =
      replacePlaceholders(
        campaign.email_subject || '',
        testStudent,
        mappings
      );

    const body =
      replacePlaceholders(
        campaign.email_body || '',
        testStudent,
        mappings
      );

    /*
     * ----------------------------------------------------
     * 8. Send email
     * ----------------------------------------------------
     */

    await sendEmail(
      user.id,
      testStudent,
      recipientEmail,
      subject,
      body,
      pdfPath
    );

    /*
     * ----------------------------------------------------
     * 9. Success
     * ----------------------------------------------------
     */

    return NextResponse.json({
      message:
        '✓ Test email sent successfully!',
    });
  } catch (err: any) {
    console.error(
      'Test email sending failed:',
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Email delivery failed.',
      },
      { status: 500 }
    );
  }
}