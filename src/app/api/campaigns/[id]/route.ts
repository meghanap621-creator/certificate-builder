import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';

function mapCampaign(campaign: any) {
  return {
    id: campaign.id,
    userId: campaign.user_id,
    name: campaign.name,
    description: campaign.description || '',
    templateId: campaign.template_id || '',
    emailSubject: campaign.email_subject || '',
    emailBody: campaign.email_body || '',
    status:
      campaign.status === 'draft'
        ? 'Draft'
        : campaign.status === 'processing'
          ? 'Processing'
          : campaign.status === 'completed'
            ? 'Completed'
            : campaign.status === 'failed'
              ? 'Failed'
              : campaign.status,
    totalStudents: campaign.total_students || 0,
    validStudents: campaign.valid_students || 0,
    invalidStudents: campaign.invalid_students || 0,
    certificatesGenerated:
      campaign.certificates_generated || 0,
    emailsSent: campaign.emails_sent || 0,
    emailsFailed: campaign.emails_failed || 0,
    pendingCount: campaign.pending_count || 0,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
  };
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

    const { id } = await params;

    console.log(
      '[Campaign GET] Looking for:',
      id,
      'user:',
      user.id
    );

    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error(
        '[Campaign GET] Supabase error:',
        error
      );

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      console.error(
        '[Campaign GET] Campaign not found:',
        {
          campaignId: id,
          userId: user.id,
        }
      );

      return NextResponse.json(
        { error: 'Campaign not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      campaign: mapCampaign(data),
    });
  } catch (err) {
    console.error(
      '[Campaign GET] Unexpected error:',
      err
    );

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Internal server error.',
      },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const { id } = await params;
    const updates = await request.json();

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof updates.name === 'string') {
      updateData.name = updates.name.trim();
    }

    if (typeof updates.description === 'string') {
      updateData.description =
        updates.description;
    }

    if (
      typeof updates.templateId === 'string' ||
      updates.templateId === null
    ) {
      updateData.template_id =
        updates.templateId || null;
    }

    if (
      typeof updates.emailSubject === 'string'
    ) {
      updateData.email_subject =
        updates.emailSubject;
    }

    if (
      typeof updates.emailBody === 'string'
    ) {
      updateData.email_body =
        updates.emailBody;
    }

    if (typeof updates.status === 'string') {
      updateData.status =
        updates.status.toLowerCase();
    }

    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error(
        '[Campaign PUT] Supabase error:',
        error
      );

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Campaign not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Campaign updated successfully!',
      campaign: mapCampaign(data),
    });
  } catch (err) {
    console.error(
      '[Campaign PUT] Unexpected error:',
      err
    );

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { id } = await params;

    const { data: campaign, error: findError } =
      await supabaseAdmin
        .from('campaigns')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

    if (findError) {
      console.error(
        '[Campaign DELETE] Find error:',
        findError
      );

      return NextResponse.json(
        { error: findError.message },
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
     * Delete dependent data first.
     */

    await supabaseAdmin
      .from('email_logs')
      .delete()
      .eq('campaign_id', id)
      .eq('user_id', user.id);

    await supabaseAdmin
      .from('column_mappings')
      .delete()
      .eq('campaign_id', id)
      .eq('user_id', user.id);

    await supabaseAdmin
      .from('students')
      .delete()
      .eq('campaign_id', id)
      .eq('user_id', user.id);

    await supabaseAdmin
      .from('student_imports')
      .delete()
      .eq('campaign_id', id)
      .eq('user_id', user.id);

    /*
     * Finally delete campaign.
     */
    const { error: deleteError } =
      await supabaseAdmin
        .from('campaigns')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (deleteError) {
      console.error(
        '[Campaign DELETE] Delete error:',
        deleteError
      );

      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message:
        'Campaign and associated data deleted successfully!',
    });
  } catch (err) {
    console.error(
      '[Campaign DELETE] Unexpected error:',
      err
    );

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}