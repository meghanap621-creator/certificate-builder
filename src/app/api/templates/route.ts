import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Template } from '@/lib/db';
import crypto from 'crypto';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const templates = await JsonDb.find<Template>('templates', { userId: user.id });
    return NextResponse.json({ templates });
  } catch (err) {
    console.error('Fetch templates error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { name, type, backgroundImage, width, height, elements } = await request.json();

    if (!name || !type) {
      return NextResponse.json({ error: 'Template name and type are required.' }, { status: 400 });
    }

    const newTemplate: Template = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: name.trim(),
      type,
      backgroundImage: backgroundImage || '',
      width: width || 842,
      height: height || 595,
      elements: elements || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await JsonDb.insert<Template>('templates', newTemplate);

    return NextResponse.json({
      message: 'Template created successfully!',
      template: newTemplate,
    });
  } catch (err) {
    console.error('Create template error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
