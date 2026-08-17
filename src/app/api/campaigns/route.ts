import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Campaign } from '@/lib/db';
import crypto from 'crypto';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const campaigns = await JsonDb.find<Campaign>('campaigns', { userId: user.id });
    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error('Fetch campaigns error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { name, description, templateId, emailSubject, emailBody } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Campaign name is required.' }, { status: 400 });
    }

    const newCampaign: Campaign = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: name.trim(),
      description: description || '',
      templateId: templateId || '',
      emailSubject: emailSubject || '',
      emailBody: emailBody || '',
      status: 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await JsonDb.insert<Campaign>('campaigns', newCampaign);

    return NextResponse.json({
      message: 'Campaign created successfully!',
      campaign: newCampaign,
    });
  } catch (err) {
    console.error('Create campaign error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
