import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Template } from '@/lib/db';

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
    const template = await JsonDb.findOne<Template>('templates', { id, userId: user.id });
    if (!template) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (err) {
    console.error('Fetch template details error:', err);
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
    const template = await JsonDb.findOne<Template>('templates', { id, userId: user.id });
    if (!template) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    }

    const updates = await request.json();
    const updated = await JsonDb.update<Template>('templates', id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      message: 'Template updated successfully!',
      template: updated,
    });
  } catch (err) {
    console.error('Update template error:', err);
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
    const deleted = await JsonDb.delete('templates', id);
    if (!deleted) {
      return NextResponse.json({ error: 'Template not found or could not be deleted.' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Template deleted successfully!' });
  } catch (err) {
    console.error('Delete template error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
