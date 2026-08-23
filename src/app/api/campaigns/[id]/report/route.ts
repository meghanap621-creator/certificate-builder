import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Helper to escape CSV cell contents
function escapeCSVCell(val: unknown): string {
  if (val === undefined || val === null) {
    return '';
  }

  let str = String(val);

  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }

  return str;
}

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

    // --------------------------------------------------
    // 1. Load campaign from Supabase
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
    // 2. Load students from Supabase
    // --------------------------------------------------

    const {
      data: students,
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

    // --------------------------------------------------
    // 3. Load email logs from Supabase
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 4. Create CSV
    // --------------------------------------------------

    const headers = [
      'Student Name',
      'Email',
      'Certificate ID',
      'Certificate Status',
      'Email Status',
      'Sent Time',
      'Error Log',
    ];

    let csvContent =
      headers.join(',') + '\n';

    for (const student of students || []) {
      const log =
        logs?.find(
          (item) =>
            item.student_id === student.id
        ) || null;

      const row = [
        student.student_name || '',
        student.email || '',
        student.external_student_id || '',

        // Supabase email_logs has one status field.
        // Use it as the email status.
        log?.status || 'Pending',

        log?.status || 'Pending',

        log?.sent_at || '',

        log?.error_message || '',
      ];

      csvContent +=
        row
          .map(escapeCSVCell)
          .join(',') + '\n';
    }

    // --------------------------------------------------
    // 5. Generate filename
    // --------------------------------------------------

    const safeName =
      String(campaign.name || 'Campaign')
        .replace(
          /[^a-zA-Z0-9]/g,
          '_'
        );

    const filename =
      `Delivery_Report_${safeName}.csv`;

    // --------------------------------------------------
    // 6. Return CSV
    // --------------------------------------------------

    return new NextResponse(
      csvContent,
      {
        status: 200,

        headers: {
          'Content-Type':
            'text/csv; charset=utf-8',

          'Content-Disposition':
            `attachment; filename="${filename}"`,

          'Cache-Control':
            'no-store',
        },
      }
    );
  } catch (err: any) {
    console.error(
      'CSV generation failed:',
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          'CSV download failed.',
      },
      { status: 500 }
    );
  }
}