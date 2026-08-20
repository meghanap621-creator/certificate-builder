import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';

function mapTemplate(template: any) {
  const editorData = template.editor_data;

  let elements: any[] = [];
  let backgroundImage = '';

  if (Array.isArray(editorData)) {
    elements = editorData;
  } else if (
    editorData &&
    typeof editorData === 'object'
  ) {
    elements = Array.isArray(editorData.elements)
      ? editorData.elements
      : [];

    backgroundImage =
      typeof editorData.backgroundImage === 'string'
        ? editorData.backgroundImage
        : '';
  }

  return {
    id: template.id,
    userId: template.user_id,
    name: template.name,
    type: template.template_type,
    backgroundImage,
    width: Number(template.page_width || 842),
    height: Number(template.page_height || 595),
    elements,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
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
      .from('templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(
        'Fetch templates Supabase error:',
        error
      );

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      templates: (data || []).map(mapTemplate),
    });
  } catch (err) {
    console.error('Fetch templates error:', err);

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
      type,
      backgroundImage,
      width,
      height,
      elements,
    } = body;

    if (
      !name ||
      typeof name !== 'string' ||
      !name.trim()
    ) {
      return NextResponse.json(
        { error: 'Template name is required.' },
        { status: 400 }
      );
    }

    if (
      !type ||
      typeof type !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Template type is required.' },
        { status: 400 }
      );
    }

    const pageWidth =
      typeof width === 'number' && width > 0
        ? width
        : 842;

    const pageHeight =
      typeof height === 'number' && height > 0
        ? height
        : 595;

    const editorData = {
      elements: Array.isArray(elements)
        ? elements
        : [],
      backgroundImage:
        typeof backgroundImage === 'string'
          ? backgroundImage
          : '',
    };

    const { data, error } = await supabaseAdmin
      .from('templates')
      .insert({
        user_id: user.id,
        name: name.trim(),
        template_type: type,
        editor_data: editorData,
        page_width: pageWidth,
        page_height: pageHeight,
        dynamic_fields: [],
      })
      .select('*')
      .single();

    if (error) {
      console.error(
        'Create template Supabase error:',
        error
      );

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Template created successfully!',
      template: mapTemplate(data),
    });
  } catch (err) {
    console.error('Create template error:', err);

    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}