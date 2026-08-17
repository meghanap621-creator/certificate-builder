import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Campaign, Student, Template, DeliveryLog } from '@/lib/db';
import { saveStudentPDF } from '@/lib/pdf';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id: campaignId, studentId } = await params;

    // Load Campaign
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // Load Student
    const student = await JsonDb.findOne<Student>('students', { id: studentId, campaignId });
    if (!student) {
      return NextResponse.json({ error: 'Student record not found.' }, { status: 404 });
    }

    // Load Delivery Log
    const logs = await JsonDb.find<DeliveryLog>('delivery_logs', { campaignId });
    const log = logs.find((l) => l.studentId === studentId);

    let pdfPath = log?.pdfPath;
    let fileBytes: Buffer;
    let needToGenerate = true;

    if (pdfPath) {
      try {
        fileBytes = await fs.readFile(pdfPath);
        needToGenerate = false;
      } catch {}
    }

    if (needToGenerate) {
      // Load Template
      const template = await JsonDb.findOne<Template>('templates', { id: campaign.templateId, userId: user.id });
      if (!template) {
        return NextResponse.json({ error: 'Template not found.' }, { status: 400 });
      }

      // Load Mappings
      const allMappings = await JsonDb.read<any>('mappings');
      const mappingRecord = allMappings.find((m: any) => m.campaignId === campaignId);
      if (!mappingRecord || !mappingRecord.mappings) {
        return NextResponse.json({ error: 'Column mappings not found.' }, { status: 400 });
      }

      pdfPath = await saveStudentPDF(template, student, mappingRecord.mappings);
      fileBytes = await fs.readFile(pdfPath);

      if (log) {
        log.pdfPath = pdfPath;
        log.certStatus = 'Generated';
        await JsonDb.write('delivery_logs', logs);
      }
    }

    const safeName = `${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_${student.certId}.pdf`;
    return new NextResponse(new Uint8Array(fileBytes!), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
      },
    });
  } catch (err: any) {
    console.error('Individual PDF download error:', err);
    return NextResponse.json({ error: err.message || 'Download failed.' }, { status: 500 });
  }
}
