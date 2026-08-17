import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Campaign, DeliveryLog } from '@/lib/db';
import { startCampaignProcessing, getJobStatus } from '@/lib/jobs';

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

    // Verify campaign belongs to user
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // 1. Check in-memory active job status
    const activeJob = getJobStatus(campaignId);
    if (activeJob) {
      return NextResponse.json({ job: activeJob });
    }

    // 2. If not running, build a static report from the database delivery logs
    const logs = await JsonDb.find<DeliveryLog>('delivery_logs', { campaignId });
    const total = logs.length;
    const sent = logs.filter((l) => l.emailStatus === 'Sent').length;
    const failed = logs.filter((l) => l.emailStatus === 'Failed').length;
    const pending = logs.filter((l) => l.emailStatus === 'Pending').length;

    return NextResponse.json({
      job: {
        campaignId,
        userId: user.id,
        status: campaign.status === 'Processing' ? 'Processing' : (campaign.status === 'Completed' ? 'Completed' : 'Failed'),
        total,
        completed: sent,
        failed,
        sent,
        pending,
      },
    });
  } catch (err: any) {
    console.error('Fetch job status error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
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
    const { onlyPendingFailed } = await request.json();

    // Verify campaign ownership
    const campaign = await JsonDb.findOne<Campaign>('campaigns', { id: campaignId, userId: user.id });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // Start background processing
    await startCampaignProcessing(user.id, campaignId, !!onlyPendingFailed);

    return NextResponse.json({
      message: 'Background processing started successfully!',
      status: 'Processing',
    });
  } catch (err: any) {
    console.error('Start campaign processing error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}
