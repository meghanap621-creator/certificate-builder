import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Campaign, Student, Template, DeliveryLog } from '@/lib/db';
import { saveStudentPDF } from '@/lib/pdf';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';

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

    // Load campaign
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // Load template
    const template = await JsonDb.findOne<Template>('templates', { id: campaign.templateId, userId: user.id });
    if (!template) {
      return NextResponse.json({ error: 'Certificate template not found. Map a template design first.' }, { status: 400 });
    }

    // Load mapping
    const allMappings = await JsonDb.read<any>('mappings');
    const mappingRecord = allMappings.find((m: any) => m.campaignId === campaignId);
    if (!mappingRecord || !mappingRecord.mappings) {
      return NextResponse.json({ error: 'Spreadsheet column mappings are missing.' }, { status: 400 });
    }
    const mappings = mappingRecord.mappings;

    // Load all students
    const students = await JsonDb.find<Student>('students', { campaignId });
    if (students.length === 0) {
      return NextResponse.json({ error: 'No students found in this campaign.' }, { status: 400 });
    }

    // Load logs
    const logs = await JsonDb.find<DeliveryLog>('delivery_logs', { campaignId });

    const zip = new JSZip();

    // Loop through each student, read or generate PDF, and add to zip
    for (const student of students) {
      const log = logs.find((l) => l.studentId === student.id);
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
        // Generate on-the-fly
        const generatedBytes = await saveStudentPDF(template, student, mappings);
        pdfPath = generatedBytes;
        fileBytes = await fs.readFile(pdfPath);
        
        // Update log if it exists
        if (log) {
          log.pdfPath = pdfPath;
          log.certStatus = 'Generated';
        }
      }

      const safeName = `${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_${student.certId}.pdf`;
      zip.file(safeName, fileBytes!);
    }

    // Save logs updates if any generated on fly
    await JsonDb.write('delivery_logs', logs);

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Stream download back
    const response = new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Certificates_${campaign.name.replace(/[^a-zA-Z0-9]/g, '_')}.zip"`,
      },
    });

    return response;
  } catch (err: any) {
    console.error('ZIP generation failed:', err);
    return NextResponse.json({ error: err.message || 'ZIP download failed.' }, { status: 500 });
  }
}
