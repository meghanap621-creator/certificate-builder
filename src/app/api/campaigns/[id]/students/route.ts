import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Campaign, Student, DeliveryLog } from '@/lib/db';
import crypto from 'crypto';

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
    
    // Ensure campaign belongs to user
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const students = await JsonDb.find<Student>('students', { campaignId });
    
    // Also fetch mappings
    const allMappings = await JsonDb.read<any>('mappings');
    const mapping = allMappings.find((m: any) => m.campaignId === campaignId) || { mappings: {} };

    // Fetch delivery logs to return along with student records
    const logs = await JsonDb.find<DeliveryLog>('delivery_logs', { campaignId });

    return NextResponse.json({ students, mappings: mapping.mappings || {}, logs });
  } catch (err) {
    console.error('Fetch campaign students error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

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
    
    // Ensure campaign exists
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const { students: rawStudents, mappings } = await request.json();

    if (!rawStudents || !Array.isArray(rawStudents) || !mappings) {
      return NextResponse.json(
        { error: 'Students list and mappings are required.' },
        { status: 400 }
      );
    }

    // 1. Delete existing students for this campaign (overwrite import)
    const allStudents = await JsonDb.read<Student>('students');
    const cleanStudentsList = allStudents.filter((s) => s.campaignId !== campaignId);

    // 2. Delete existing delivery logs for this campaign
    const allLogs = await JsonDb.read<DeliveryLog>('delivery_logs');
    const cleanLogsList = allLogs.filter((l) => l.campaignId !== campaignId);

    // 3. Map raw students into database structure
    const importDate = new Date().toISOString();
    const importedStudents: Student[] = [];
    const newDeliveryLogs: DeliveryLog[] = [];

    // Let's create a counter for certificate IDs
    let serialCounter = 1;
    const year = new Date().getFullYear();

    for (const raw of rawStudents) {
      const studentId = `STU${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      // Generate formatted Certificate ID: CERT-2026-00001
      const padSerial = String(serialCounter++).padStart(5, '0');
      const certId = `CERT-${year}-${padSerial}`;

      // Extract properties based on mappings
      const mappedName = raw[mappings.student_name] || '';
      const mappedEmail = raw[mappings.email] || '';
      const mappedCollege = raw[mappings.college_name] || '';
      const mappedCourse = raw[mappings.course] || '';
      const mappedDept = raw[mappings.department] || '';
      const mappedRole = raw[mappings.internship_role] || '';
      const mappedOrg = raw[mappings.organization_name] || '';
      const mappedStart = raw[mappings.start_date] || '';
      const mappedEnd = raw[mappings.end_date] || '';
      const mappedCertDate = raw[mappings.certificate_date] || '';

      // Collect custom fields (any fields in raw that are not standard mapped columns)
      const customFields: Record<string, string> = {};
      const standardMappedHeaders = Object.values(mappings);
      Object.entries(raw).forEach(([hdr, val]) => {
        if (!standardMappedHeaders.includes(hdr)) {
          customFields[hdr] = String(val);
        }
      });

      const student: Student = {
        id: studentId,
        campaignId,
        name: String(mappedName).trim(),
        email: String(mappedEmail).trim(),
        collegeName: mappedCollege ? String(mappedCollege).trim() : undefined,
        course: mappedCourse ? String(mappedCourse).trim() : undefined,
        department: mappedDept ? String(mappedDept).trim() : undefined,
        role: mappedRole ? String(mappedRole).trim() : undefined,
        organizationName: mappedOrg ? String(mappedOrg).trim() : undefined,
        startDate: mappedStart ? String(mappedStart).trim() : undefined,
        endDate: mappedEnd ? String(mappedEnd).trim() : undefined,
        certDate: mappedCertDate ? String(mappedCertDate).trim() : undefined,
        certId,
        customFields,
        createdAt: importDate,
      };

      importedStudents.push(student);

      // Create a pending delivery log record
      const deliveryLog: DeliveryLog = {
        id: crypto.randomUUID(),
        studentId,
        campaignId,
        certificateId: certId,
        recipientEmail: student.email,
        certStatus: 'Pending',
        emailStatus: 'Pending',
        attempts: 0,
      };

      newDeliveryLogs.push(deliveryLog);
    }

    // 4. Save students and logs
    cleanStudentsList.push(...importedStudents);
    await JsonDb.write('students', cleanStudentsList);

    cleanLogsList.push(...newDeliveryLogs);
    await JsonDb.write('delivery_logs', cleanLogsList);

    // 5. Save/update mappings
    const allMappings = await JsonDb.read<any>('mappings');
    const filteredMappings = allMappings.filter((m: any) => m.campaignId !== campaignId);
    filteredMappings.push({ campaignId, mappings });
    await JsonDb.write('mappings', filteredMappings);

    // 6. Update Campaign Status to Draft if it was empty, or preserve it
    await JsonDb.update<Campaign>('campaigns', campaignId, { updatedAt: importDate });

    return NextResponse.json({
      message: `Successfully imported ${importedStudents.length} students!`,
      count: importedStudents.length,
    });
  } catch (err) {
    console.error('Import students error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
