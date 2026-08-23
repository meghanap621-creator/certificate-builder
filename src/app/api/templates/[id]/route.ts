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
      typeof editorData.backgroundImage ===
      'string'
        ? editorData.backgroundImage
        : '';
  }

  return {
    id: template.id,

    userId: template.user_id,

    name: template.name,

    type: template.template_type,

    backgroundImage,

    width: Number(
      template.page_width || 842
    ),

    height: Number(
      template.page_height || 595
    ),

    elements,

    certificateBody:
      typeof template.certificate_body ===
      'string'
        ? template.certificate_body
        : '',

    createdAt: template.created_at,

    updatedAt: template.updated_at,
  };
}

/* =========================================================
   GET SINGLE TEMPLATE
========================================================= */

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        {
          error: 'Unauthorized.',
        },
        {
          status: 401,
        }
      );
    }

    const { id } = await params;

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('templates')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          error:
            'Template not found.',
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      template:
        mapTemplate(data),
    });
  } catch (err) {
    console.error(
      'Fetch template error:',
      err
    );

    return NextResponse.json(
      {
        error:
          'Internal server error.',
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   PUT - UPDATE TEMPLATE
========================================================= */

export async function PUT(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        {
          error: 'Unauthorized.',
        },
        {
          status: 401,
        }
      );
    }

    const { id } = await params;

    const updates =
      await request.json();

    /* -----------------------------------------------------
       FIND EXISTING TEMPLATE
    ----------------------------------------------------- */

    const {
      data: existing,
      error: existingError,
    } = await supabaseAdmin
      .from('templates')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (
      existingError ||
      !existing
    ) {
      return NextResponse.json(
        {
          error:
            'Template not found.',
        },
        {
          status: 404,
        }
      );
    }

    /* -----------------------------------------------------
       EXISTING EDITOR DATA
    ----------------------------------------------------- */

    const existingEditorData =
      existing.editor_data &&
      typeof existing.editor_data ===
        'object'
        ? existing.editor_data
        : {};

    /* -----------------------------------------------------
       ELEMENTS
    ----------------------------------------------------- */

    const elements =
      Array.isArray(
        updates.elements
      )
        ? updates.elements
        : Array.isArray(
            existingEditorData.elements
          )
          ? existingEditorData.elements
          : [];

    /* -----------------------------------------------------
       BACKGROUND IMAGE
    ----------------------------------------------------- */

    const backgroundImage =
      typeof updates.backgroundImage ===
      'string'
        ? updates.backgroundImage
        : typeof existingEditorData.backgroundImage ===
            'string'
          ? existingEditorData.backgroundImage
          : '';

    /* -----------------------------------------------------
       PAGE SIZE
    ----------------------------------------------------- */

    const pageWidth =
      typeof updates.width ===
        'number' &&
      updates.width > 0
        ? updates.width
        : Number(
            existing.page_width ||
              842
          );

    const pageHeight =
      typeof updates.height ===
        'number' &&
      updates.height > 0
        ? updates.height
        : Number(
            existing.page_height ||
              595
          );

    /* -----------------------------------------------------
       UPDATE DATA
    ----------------------------------------------------- */

    const updateData: Record<
      string,
      unknown
    > = {
      editor_data: {
        elements,

        backgroundImage,
      },

      page_width:
        pageWidth,

      page_height:
        pageHeight,

      updated_at:
        new Date().toISOString(),
    };

    /* -----------------------------------------------------
       NAME
    ----------------------------------------------------- */

    if (
      typeof updates.name ===
        'string' &&
      updates.name.trim()
    ) {
      updateData.name =
        updates.name.trim();
    }

    /* -----------------------------------------------------
       TEMPLATE TYPE
    ----------------------------------------------------- */

    if (
      typeof updates.type ===
        'string' &&
      updates.type.trim()
    ) {
      updateData.template_type =
        updates.type.trim();
    }

    /* -----------------------------------------------------
       CERTIFICATE BODY
       
       IMPORTANT:
       Only update when certificateBody
       was actually supplied.
       
       This prevents Design tab saves
       from accidentally clearing the body.
    ----------------------------------------------------- */

    if (
      typeof updates.certificateBody ===
      'string'
    ) {
      updateData.certificate_body =
        updates.certificateBody;
    }

    /* -----------------------------------------------------
       DYNAMIC FIELDS
    ----------------------------------------------------- */

    if (
      Array.isArray(
        updates.dynamicFields
      )
    ) {
      updateData.dynamic_fields =
        updates.dynamicFields;
    }

    /* -----------------------------------------------------
       UPDATE SUPABASE
    ----------------------------------------------------- */

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('templates')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (
      error ||
      !data
    ) {
      console.error(
        'Update template error:',
        error
      );

      return NextResponse.json(
        {
          error:
            error?.message ||
            'Template update failed.',
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      message:
        'Template updated successfully!',

      template:
        mapTemplate(data),
    });
  } catch (err) {
    console.error(
      'Update template error:',
      err
    );

    return NextResponse.json(
      {
        error:
          'Internal server error.',
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   DELETE TEMPLATE
========================================================= */

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        {
          error: 'Unauthorized.',
        },
        {
          status: 401,
        }
      );
    }

    const { id } = await params;

    /* -----------------------------------------------------
       CHECK OWNERSHIP
    ----------------------------------------------------- */

    const {
      data: existing,
      error: existingError,
    } = await supabaseAdmin
      .from('templates')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (
      existingError ||
      !existing
    ) {
      return NextResponse.json(
        {
          error:
            'Template not found.',
        },
        {
          status: 404,
        }
      );
    }

    /* -----------------------------------------------------
       DELETE
    ----------------------------------------------------- */

    const { error } =
      await supabaseAdmin
        .from('templates')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) {
      console.error(
        'Delete template error:',
        error
      );

      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      message:
        'Template deleted successfully!',
    });
  } catch (err) {
    console.error(
      'Delete template error:',
      err
    );

    return NextResponse.json(
      {
        error:
          'Internal server error.',
      },
      {
        status: 500,
      }
    );
  }
}