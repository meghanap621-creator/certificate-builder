import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';

function toDateOrNull(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().split('T')[0];
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

    const { id: campaignId } = await params;

    const { data: campaign, error: campaignError } =
      await supabaseAdmin
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .eq('user_id', user.id)
        .single();

    if (campaignError || !campaign) {
      console.error('Campaign lookup error:', campaignError);

      return NextResponse.json(
        { error: 'Campaign not found.' },
        { status: 404 }
      );
    }

    const { data: students, error: studentsError } =
      await supabaseAdmin
        .from('students')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id)
        .order('row_number', { ascending: true });

    if (studentsError) {
      console.error('Fetch students error:', studentsError);

      return NextResponse.json(
        { error: studentsError.message },
        { status: 500 }
      );
    }

    const { data: mappings, error: mappingsError } =
      await supabaseAdmin
        .from('column_mappings')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

    if (mappingsError) {
      console.warn('Fetch mappings warning:', mappingsError);
    }

    const { data: logs, error: logsError } =
      await supabaseAdmin
        .from('email_logs')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

    if (logsError) {
      console.warn('Fetch email logs warning:', logsError);
    }

    const mappingObject: Record<string, string> = {};

    for (const mapping of mappings || []) {
      if (
        mapping.certificate_field &&
        mapping.source_column
      ) {
        mappingObject[mapping.certificate_field] =
          mapping.source_column;
      }
    }

    return NextResponse.json({
      students: students || [],
      mappings: mappingObject,
      logs: logs || [],
    });
  } catch (err) {
    console.error('Fetch campaign students error:', err);

    return NextResponse.json(
      { error: 'Internal server error.' },
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

    /*
     * Verify campaign belongs to the logged-in user.
     */
    const { data: campaign, error: campaignError } =
      await supabaseAdmin
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .eq('user_id', user.id)
        .single();

    if (campaignError || !campaign) {
      console.error('Campaign lookup error:', campaignError);

      return NextResponse.json(
        { error: 'Campaign not found.' },
        { status: 404 }
      );
    }

    const body = await request.json();

    const {
      students: rawStudents,
      mappings,
      originalFilename,
      fileType,
      fileSize,
    } = body;

    if (
      !Array.isArray(rawStudents) ||
      !mappings ||
      typeof mappings !== 'object'
    ) {
      return NextResponse.json(
        {
          error:
            'Students list and mappings are required.',
        },
        { status: 400 }
      );
    }

    const importId = crypto.randomUUID();
    const importDate = new Date().toISOString();

    const filename =
      typeof originalFilename === 'string' &&
      originalFilename.trim()
        ? originalFilename.trim()
        : 'student-import';

    const detectedFileType =
      typeof fileType === 'string' &&
      fileType.trim()
        ? fileType.trim()
        : 'xlsx';

    const detectedFileSize =
      typeof fileSize === 'number' && fileSize >= 0
        ? fileSize
        : 0;

    /*
     * Create the parent import record FIRST.
     *
     * students.import_id references
     * student_imports.id.
     */
    const { data: importRecord, error: importError } =
      await supabaseAdmin
        .from('student_imports')
        .insert({
          id: importId,
          user_id: user.id,
          campaign_id: campaignId,
          original_filename: filename,
          storage_path: `imports/${user.id}/${importId}`,
          file_type: detectedFileType,
          file_size: detectedFileSize,
          row_count: rawStudents.length,
          column_count:
            rawStudents.length > 0
              ? Object.keys(rawStudents[0] || {}).length
              : 0,
          columns:
            rawStudents.length > 0
              ? Object.keys(rawStudents[0] || {})
              : [],
          parsing_status: 'completed',
          validation_errors: [],
          uploaded_at: importDate,
        })
        .select('id')
        .single();

    if (importError || !importRecord) {
      console.error(
        'Create student import error:',
        importError
      );

      return NextResponse.json(
        {
          error:
            importError?.message ||
            'Failed to create student import record.',
        },
        { status: 500 }
      );
    }

    /*
     * Delete previous students for this campaign.
     */
    const { error: deleteStudentsError } =
      await supabaseAdmin
        .from('students')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id);

    if (deleteStudentsError) {
      console.error(
        'Delete existing students error:',
        deleteStudentsError
      );

      return NextResponse.json(
        { error: deleteStudentsError.message },
        { status: 500 }
      );
    }

    /*
     * Delete previous email logs.
     */
    const { error: deleteLogsError } =
      await supabaseAdmin
        .from('email_logs')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id);

    if (deleteLogsError) {
      console.error(
        'Delete existing email logs error:',
        deleteLogsError
      );

      return NextResponse.json(
        { error: deleteLogsError.message },
        { status: 500 }
      );
    }

    /*
     * Delete previous mappings.
     */
    const { error: deleteMappingsError } =
      await supabaseAdmin
        .from('column_mappings')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id);

    if (deleteMappingsError) {
      console.error(
        'Delete existing mappings error:',
        deleteMappingsError
      );

      return NextResponse.json(
        { error: deleteMappingsError.message },
        { status: 500 }
      );
    }

    /*
     * Build student records.
     */
    const importedStudents: any[] = [];

    const mappingValues =
      Object.values(mappings) as string[];

    for (
      let index = 0;
      index < rawStudents.length;
      index++
    ) {
      const raw = rawStudents[index] || {};

      const getMappedValue = (field: string) => {
        const sourceColumn = mappings[field];

        if (!sourceColumn) {
          return '';
        }

        return raw[sourceColumn] ?? '';
      };

      const studentName =
        String(getMappedValue('student_name')).trim();

      const email =
        String(getMappedValue('email')).trim();

      const collegeName =
        String(getMappedValue('college_name')).trim();

      const course =
        String(getMappedValue('course')).trim();

      const department =
        String(getMappedValue('department')).trim();

      const internshipRole =
        String(
          getMappedValue('internship_role')
        ).trim();

      const organizationName =
        String(
          getMappedValue('organization_name')
        ).trim();

      const startDate =
        toDateOrNull(
          getMappedValue('start_date')
        );

      const endDate =
        toDateOrNull(
          getMappedValue('end_date')
        );

      const certificateDate =
        toDateOrNull(
          getMappedValue('certificate_date')
        );

      /*
       * Preserve unmapped Excel columns.
       */
      const customData: Record<string, string> = {};

      Object.entries(raw).forEach(
        ([header, value]) => {
          if (!mappingValues.includes(header)) {
            customData[header] =
              String(value ?? '');
          }
        }
      );

      importedStudents.push({
        id: crypto.randomUUID(),

        user_id: user.id,

        campaign_id: campaignId,

        import_id: importId,

        external_student_id:
          String(
            raw.id ??
            raw.student_id ??
            ''
          ).trim() || null,

        student_name: studentName,

        email,

        college_name:
          collegeName || null,

        course:
          course || null,

        department:
          department || null,

        internship_role:
          internshipRole || null,

        organization_name:
          organizationName || null,

        start_date: startDate,

        end_date: endDate,

        certificate_date:
          certificateDate,

        custom_data: customData,

        row_number: index + 1,

        validation_status:
          studentName && email
            ? 'valid'
            : 'invalid',

        validation_errors:
          studentName && email
            ? []
            : {
                missing: [
                  ...(!studentName
                    ? ['student_name']
                    : []),
                  ...(!email
                    ? ['email']
                    : []),
                ],
              },

        created_at: importDate,

        updated_at: importDate,
      });
    }

    /*
     * Insert students.
     */
    if (importedStudents.length > 0) {
      const {
        error: studentsInsertError,
      } = await supabaseAdmin
        .from('students')
        .insert(importedStudents);

      if (studentsInsertError) {
        console.error(
          'Insert students error:',
          studentsInsertError
        );

        /*
         * Remove the import record if
         * student insertion fails.
         */
        await supabaseAdmin
          .from('student_imports')
          .delete()
          .eq('id', importId)
          .eq('user_id', user.id);

        return NextResponse.json(
          {
            error:
              studentsInsertError.message,
          },
          { status: 500 }
        );
      }
    }

    /*
     * Save column mappings.
     *
     * Your schema stores mappings as
     * individual rows.
     */
    const mappingRows = Object.entries(mappings)
      .filter(
        ([certificateField, sourceColumn]) =>
          certificateField &&
          typeof sourceColumn === 'string' &&
          sourceColumn.length > 0
      )
      .map(
        ([certificateField, sourceColumn]) => ({
          id: crypto.randomUUID(),

          campaign_id: campaignId,

          user_id: user.id,

          certificate_field:
            certificateField,

          source_column:
            sourceColumn,

          created_at: importDate,

          updated_at: importDate,
        })
      );

    if (mappingRows.length > 0) {
      const {
        error: mappingInsertError,
      } = await supabaseAdmin
        .from('column_mappings')
        .insert(mappingRows);

      if (mappingInsertError) {
        console.error(
          'Insert mapping error:',
          mappingInsertError
        );

        return NextResponse.json(
          {
            error:
              mappingInsertError.message,
          },
          { status: 500 }
        );
      }
    }

    /*
     * Calculate campaign statistics.
     */
    const validStudents =
      importedStudents.filter(
        (student) =>
          student.validation_status ===
          'valid'
      ).length;

    const invalidStudents =
      importedStudents.length -
      validStudents;

    /*
     * Update campaign statistics.
     */
    const {
      error: campaignUpdateError,
    } = await supabaseAdmin
      .from('campaigns')
      .update({
        total_students:
          importedStudents.length,

        valid_students:
          validStudents,

        invalid_students:
          invalidStudents,

        certificates_generated: 0,

        emails_sent: 0,

        emails_failed: 0,

        pending_count:
          importedStudents.length,

        updated_at: importDate,
      })
      .eq('id', campaignId)
      .eq('user_id', user.id);

    if (campaignUpdateError) {
      console.warn(
        'Campaign statistics update warning:',
        campaignUpdateError
      );
    }

    return NextResponse.json({
      message:
        `Successfully imported ${importedStudents.length} students!`,

      count: importedStudents.length,

      importId,

      validStudents,

      invalidStudents,
    });
  } catch (err) {
    console.error(
      'Import students error:',
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