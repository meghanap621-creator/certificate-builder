import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Campaign, Student, Template } from '@/lib/db';
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
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id: campaignId } = await params;
    const { studentId, testEmail } = await request.json();

    if (!studentId || !testEmail) {
      return NextResponse.json({ error: 'Student selection and target test email are required.' }, { status: 400 });
    }

    // Load campaign
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // Load student
    const student = await JsonDb.findOne<Student>('students', { id: studentId, campaignId });
    if (!student) {
      return NextResponse.json({ error: 'Student record not found.' }, { status: 404 });
    }

    // Load template
    const template = await JsonDb.findOne<Template>('templates', { id: campaign.templateId, userId: user.id });
    if (!template) {
      return NextResponse.json({ error: 'Template design not found. Please attach a design first.' }, { status: 404 });
    }

    // Load mappings
    const allMappings = await JsonDb.read<any>('mappings');
    const mappingRecord = allMappings.find((m: any) => m.campaignId === campaignId);
    if (!mappingRecord || !mappingRecord.mappings) {
      return NextResponse.json({ error: 'Column mappings are missing.' }, { status: 400 });
    }
    const mappings = mappingRecord.mappings;

    // CRITICAL SECURITY COMPLIANCE FOR TEST:
    // To send a test email, we clone the student record and set the email field to the target test email.
    // This allows verifyEmailAssociation to validate successfully.
    const testStudent: Student = {
      ...student,
      email: testEmail.trim(), // Override email for safety during the test
    };

    // 1. Generate live test PDF
    const pdfPath = await saveStudentPDF(template, testStudent, mappings);

    // 2. Format email
    const subject = replacePlaceholders(campaign.emailSubject, testStudent, mappings);
    const body = replacePlaceholders(campaign.emailBody, testStudent, mappings);

    // 3. Dispatch Email
    await sendEmail(user.id, testStudent, testEmail.trim(), subject, body, pdfPath);

    return NextResponse.json({ message: '✓ Test email sent successfully!' });
  } catch (err: any) {
    console.error('Test email sending failed:', err);
    return NextResponse.json({ error: err.message || 'Email delivery failed.' }, { status: 500 });
  }
}
