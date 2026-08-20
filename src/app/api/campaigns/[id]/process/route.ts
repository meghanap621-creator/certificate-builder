import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startCampaignProcessing, getJobStatus } from '@/lib/jobs';

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

    /*
     * Verify that the campaign exists and belongs
     * to the currently authenticated user.
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
        'Fetch campaign for job status error:',
        campaignError
      );

      return NextResponse.json(
        {
          error: campaignError.message,
        },
        { status: 500 }
      );
    }

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found.' },
        { status: 404 }
      );
    }

    /*
     * Check in-memory active job status first.
     */
    const activeJob = getJobStatus(campaignId);

    if (activeJob) {
      return NextResponse.json({
        job: activeJob,
      });
    }

    /*
     * If there is no active job, use the counters
     * stored on the campaign.
     */
    const total =
      Number(campaign.total_students) || 0;

    const sent =
      Number(campaign.emails_sent) || 0;

    const failed =
      Number(campaign.emails_failed) || 0;

    const pending =
      Number(campaign.pending_count) || 0;

    let status = 'Failed';

    if (
      campaign.status === 'Processing'
    ) {
      status = 'Processing';
    } else if (
      campaign.status === 'Completed'
    ) {
      status = 'Completed';
    } else if (
      campaign.status === 'Draft'
    ) {
      status = 'Pending';
    }

    return NextResponse.json({
      job: {
        campaignId,
        userId: user.id,
        status,
        total,
        completed: sent,
        failed,
        sent,
        pending,
      },
    });
  } catch (err: any) {
    console.error(
      'Fetch job status error:',
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Internal server error.',
      },
      { status: 500 }
    );
  }
}

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

    let onlyPendingFailed = false;

    try {
      const body = await request.json();

      onlyPendingFailed =
        !!body?.onlyPendingFailed;
    } catch {
      /*
       * Empty request body is allowed.
       */
      onlyPendingFailed = false;
    }

    /*
     * Verify campaign ownership using Supabase.
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
     * Prevent duplicate processing.
     */
    if (campaign.status === 'Processing') {
      return NextResponse.json(
        {
          message:
            'Campaign processing is already running.',
          status: 'Processing',
        },
        { status: 409 }
      );
    }

    /*
     * Start background processing.
     *
     * NOTE:
     * startCampaignProcessing() itself must also use
     * Supabase internally. We check that next.
     */
    await startCampaignProcessing(
      user.id,
      campaignId,
      onlyPendingFailed
    );

    /*
     * Update campaign status immediately so
     * the frontend sees Processing.
     */
    const { error: updateError } =
      await supabaseAdmin
        .from('campaigns')
        .update({
          status: 'Processing',
          updated_at:
            new Date().toISOString(),
        })
        .eq('id', campaignId)
        .eq('user_id', user.id);

    if (updateError) {
      console.error(
        'Campaign status update error:',
        updateError
      );
    }

    return NextResponse.json({
      message:
        'Background processing started successfully!',
      status: 'Processing',
    });
  } catch (err: any) {
    console.error(
      'Start campaign processing error:',
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Internal server error.',
      },
      { status: 500 }
    );
  }
}