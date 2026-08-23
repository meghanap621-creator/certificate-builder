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
    certificatesGenerated: campaign.certificates_generated || 0,
    emailsSent: campaign.emails_sent || 0,
    emailsFailed: campaign.emails_failed || 0,
    pendingCount: campaign.pending_count || 0,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
  };
}

export async function GET() {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch campaigns Supabase error:', error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      campaigns: (data || []).map(mapCampaign),
    });
  } catch (err) {
    console.error('Fetch campaigns error:', err);

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    const {
      name,
      description,
      templateId,
      emailSubject,
      emailBody,
    } = body;

    if (
      !name ||
      typeof name !== 'string' ||
      !name.trim()
    ) {
      return NextResponse.json(
        { error: 'Campaign name is required.' },
        { status: 400 }
      );
    }

    const cleanTemplateId =
      typeof templateId === 'string' &&
      templateId.trim()
        ? templateId.trim()
        : null;

    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description:
          typeof description === 'string'
            ? description.trim()
            : '',
        template_id: cleanTemplateId,
        email_subject:
          typeof emailSubject === 'string'
            ? emailSubject
            : '',
        email_body:
          typeof emailBody === 'string'
            ? emailBody
            : '',
        status: 'draft',
      })
      .select('*')
      .single();

    if (error) {
      console.error(
        'Create campaign Supabase error:',
        error
      );

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Campaign created successfully!',
      campaign: mapCampaign(data),
    });
  } catch (err) {
    console.error('Create campaign error:', err);

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}