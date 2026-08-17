import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Campaign, Student, DeliveryLog } from '@/lib/db';

// Helper to escape CSV cell contents
function escapeCSVCell(val: any): string {
  if (val === undefined || val === null) return '';
  let str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
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
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id: campaignId } = await params;

    // Load Campaign
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // Load Students and Logs
    const students = await JsonDb.find<Student>('students', { campaignId });
    const logs = await JsonDb.find<DeliveryLog>('delivery_logs', { campaignId });

    // CSV Header row
    const headers = ['Student Name', 'Email', 'Certificate ID', 'Certificate Status', 'Email Status', 'Sent Time', 'Error Log'];
    let csvContent = headers.join(',') + '\n';

    // CSV Data rows
    for (const student of students) {
      const log = logs.find((l) => l.studentId === student.id) || {
        certStatus: 'Pending',
        emailStatus: 'Pending',
        sentAt: '',
        error: '',
      };

      const row = [
        student.name,
        student.email,
        student.certId,
        log.certStatus,
        log.emailStatus,
        log.sentAt || '',
        log.error || '',
      ];

      csvContent += row.map(escapeCSVCell).join(',') + '\n';
    }

    const safeName = campaign.name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Delivery_Report_${safeName}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error('CSV generation failed:', err);
    return NextResponse.json({ error: err.message || 'CSV download failed.' }, { status: 500 });
  }
}
