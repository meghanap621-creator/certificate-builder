import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Campaign, Student, DeliveryLog } from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id } = await params;
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (err) {
    console.error('Fetch campaign details error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id } = await params;
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const updates = await request.json();
    const updated = await JsonDb.update<Campaign>('campaigns', id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      message: 'Campaign updated successfully!',
      campaign: updated,
    });
  } catch (err) {
    console.error('Update campaign error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id } = await params;
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // 1. Delete campaign record
    await JsonDb.delete('campaigns', id);

    // 2. Cascading Delete: Mappings
    const allMappings = await JsonDb.read<any>('mappings');
    const filteredMappings = allMappings.filter((m: any) => m.campaignId !== id);
    await JsonDb.write('mappings', filteredMappings);

    // 3. Cascading Delete: Students
    const allStudents = await JsonDb.read<Student>('students');
    const filteredStudents = allStudents.filter((s) => s.campaignId !== id);
    await JsonDb.write('students', filteredStudents);

    // 4. Cascading Delete: Delivery Logs
    const allLogs = await JsonDb.read<DeliveryLog>('delivery_logs');
    const filteredLogs = allLogs.filter((l) => l.campaignId !== id);
    await JsonDb.write('delivery_logs', filteredLogs);

    // 5. Clean up certificate files from disk
    const campaignCertDir = path.join(process.cwd(), 'data', 'certificates', id);
    try {
      await fs.rm(campaignCertDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Could not delete certificates folder on disk for campaign ${id}:`, err);
    }

    return NextResponse.json({ message: 'Campaign and all associated data deleted successfully!' });
  } catch (err) {
    console.error('Delete campaign error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
