import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';

/* =========================================================
   MAP DATABASE TEMPLATE → FRONTEND TEMPLATE
========================================================= */

function mapTemplate(template: any) {
  const editorData = template?.editor_data;

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

    width: Number(
      template.page_width || 842
    ),

    height: Number(
      template.page_height || 595
    ),

    elements,

    /*
     * IMPORTANT:
     * Certificate body is stored separately
     * in templates.certificate_body.
     */
    certificateBody:
      typeof template.certificate_body === 'string'
        ? template.certificate_body
        : '',

    /*
     * Keep dynamic fields available
     * for the editor if they exist.
     */
    dynamicFields:
      Array.isArray(template.dynamic_fields)
        ? template.dynamic_fields
        : [],

    createdAt:
      template.created_at,

    updatedAt:
      template.updated_at,
  };
}

/* =========================================================
   GET - FETCH SINGLE TEMPLATE
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
    const user =
      await getAuthUser();

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

    const { id } =
      await params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            'Template ID is required.',
        },
        {
          status: 400,
        }
      );
    }

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from('templates')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (
      error ||
      !data
    ) {
      console.error(
        'Fetch template error:',
        error
      );

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
    const user =
      await getAuthUser();

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

    const { id } =
      await params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            'Template ID is required.',
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       READ REQUEST BODY
    ===================================================== */

    let updates: any;

    try {
      updates =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            'Invalid request body.',
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       FIND EXISTING TEMPLATE
    ===================================================== */

    const {
      data: existing,
      error: existingError,
    } =
      await supabaseAdmin
        .from('templates')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (
      existingError ||
      !existing
    ) {
      console.error(
        'Existing template lookup error:',
        existingError
      );

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

    /* =====================================================
       EXISTING EDITOR DATA
    ===================================================== */

    const existingEditorData =
      existing.editor_data &&
      typeof existing.editor_data ===
        'object'
        ? existing.editor_data
        : {};

    /* =====================================================
       ELEMENTS
    ===================================================== */

    let elements: any[];

    if (
      Array.isArray(
        updates.elements
      )
    ) {
      elements =
        updates.elements;
    } else if (
      Array.isArray(
        existingEditorData.elements
      )
    ) {
      elements =
        existingEditorData.elements;
    } else {
      elements = [];
    }

    /*
     * Make sure the certificate body
     * element exists in the editor data.
     *
     * This is important for old templates
     * created before the Certificate Body
     * feature was added.
     */

    const certificateBodyElementIndex =
      elements.findIndex(
        (element: any) =>
          element?.id ===
            'certificate_body' ||
          element?.id ===
            'certificateBody'
      );

    if (
      certificateBodyElementIndex === -1
    ) {
      elements = [
        ...elements,

        {
          id: 'certificate_body',

          type: 'text',

          x: 121,

          y: 370,

          width: 600,

          height: 140,

          text:
            '{{certificate_body}}',

          fontSize: 16,

          fontFamily:
            'Helvetica',

          fontWeight:
            'normal',

          color:
            '#000000',

          align:
            'center',

          lineHeight:
            1.35,

          zIndex: 5,

          autoFit:
            true,

          minFontSize:
            10,
        },
      ];
    } else {
      /*
       * Make sure an existing body element
       * continues to use the correct placeholder.
       */

      const existingBodyElement =
        elements[
          certificateBodyElementIndex
        ];

      elements[
        certificateBodyElementIndex
      ] = {
        ...existingBodyElement,

        id: 'certificate_body',

        type:
          existingBodyElement?.type ||
          'text',

        text:
          '{{certificate_body}}',
      };
    }

    /* =====================================================
       BACKGROUND IMAGE
    ===================================================== */

    const backgroundImage =
      typeof updates.backgroundImage ===
      'string'
        ? updates.backgroundImage
        : typeof existingEditorData.backgroundImage ===
            'string'
          ? existingEditorData.backgroundImage
          : '';

    /* =====================================================
       PAGE SIZE
    ===================================================== */

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

    /* =====================================================
       CERTIFICATE BODY
    ===================================================== */

    /*
     * CRITICAL:
     *
     * If certificateBody was supplied by the frontend,
     * save it.
     *
     * If it was NOT supplied, preserve the old value.
     *
     * Therefore:
     *
     * Design Save
     *    ↓
     * does NOT erase Certificate Body.
     *
     * Certificate Body Save
     *    ↓
     * updates certificate_body.
     */

    let certificateBody =
      typeof existing.certificate_body ===
      'string'
        ? existing.certificate_body
        : '';

    if (
      typeof updates.certificateBody ===
      'string'
    ) {
      certificateBody =
        updates.certificateBody.trim();
    }

    /* =====================================================
       DYNAMIC FIELDS
    ===================================================== */

    let dynamicFields =
      Array.isArray(
        existing.dynamic_fields
      )
        ? existing.dynamic_fields
        : [];

    if (
      Array.isArray(
        updates.dynamicFields
      )
    ) {
      dynamicFields =
        updates.dynamicFields;
    }

    /* =====================================================
       UPDATE DATA
    ===================================================== */

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

      certificate_body:
        certificateBody,

      dynamic_fields:
        dynamicFields,

      updated_at:
        new Date().toISOString(),
    };

    /* =====================================================
       NAME
    ===================================================== */

    if (
      typeof updates.name ===
        'string' &&
      updates.name.trim()
    ) {
      updateData.name =
        updates.name.trim();
    }

    /* =====================================================
       TEMPLATE TYPE
    ===================================================== */

    if (
      typeof updates.type ===
        'string' &&
      updates.type.trim()
    ) {
      updateData.template_type =
        updates.type.trim();
    }

    /* =====================================================
       UPDATE SUPABASE
    ===================================================== */

    const {
      data,
      error,
    } =
      await supabaseAdmin
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
        'Update template Supabase error:',
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
   DELETE - DELETE TEMPLATE
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
    const user =
      await getAuthUser();

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

    const { id } =
      await params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            'Template ID is required.',
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       CHECK OWNERSHIP
    ===================================================== */

    const {
      data: existing,
      error: existingError,
    } =
      await supabaseAdmin
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

    /* =====================================================
       DELETE
    ===================================================== */

    const {
      error,
    } =
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