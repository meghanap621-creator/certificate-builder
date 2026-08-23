import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  try {
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 }
      );
    }

    const { data: settings, error } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Fetch settings error:', error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    /*
     * Return defaults if the user has no settings yet.
     */
    const result = settings
      ? {
          id: settings.id,
          userId: settings.user_id,
          smtpHost: settings.smtp_host || '',
          smtpPort: Number(settings.smtp_port) || 587,
          smtpUser: settings.smtp_user || '',
          smtpPass: settings.smtp_pass
            ? '********'
            : '',
          smtpFromEmail:
            settings.smtp_from_email || '',
          smtpFrom:
            settings.smtp_from ||
            user.name ||
            '',
        }
      : {
          id: user.id,
          userId: user.id,
          smtpHost: '',
          smtpPort: 587,
          smtpUser: '',
          smtpPass: '',
          smtpFromEmail: '',
          smtpFrom: user.name || '',
        };

    return NextResponse.json({
      settings: result,
    });
  } catch (err: any) {
    console.error(
      'Fetch settings error:',
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
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFromEmail,
      smtpFrom,
    } = body;

    /*
     * Validate required fields.
     */
    if (
      !smtpHost ||
      !smtpPort ||
      !smtpUser ||
      !smtpFromEmail
    ) {
      return NextResponse.json(
        {
          error:
            'SMTP Host, Port, Username, and Sender Email are required.',
        },
        { status: 400 }
      );
    }

    const parsedPort = Number(smtpPort);

    if (
      !Number.isInteger(parsedPort) ||
      parsedPort <= 0 ||
      parsedPort > 65535
    ) {
      return NextResponse.json(
        {
          error:
            'SMTP port must be a valid number between 1 and 65535.',
        },
        { status: 400 }
      );
    }

    /*
     * Get existing settings so that
     * ******** is not saved as the password.
     */
    const {
      data: existingSettings,
      error: existingError,
    } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) {
      console.error(
        'Existing settings lookup error:',
        existingError
      );

      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    let finalPassword = '';

    if (
      smtpPass &&
      smtpPass !== '********'
    ) {
      finalPassword =
        String(smtpPass).trim();
    } else if (existingSettings?.smtp_pass) {
      finalPassword =
        existingSettings.smtp_pass;
    }

    /*
     * Gmail SMTP requires a password.
     */
    if (!finalPassword) {
      return NextResponse.json(
        {
          error:
            'SMTP password is required. For Gmail, use a Google App Password.',
        },
        { status: 400 }
      );
    }

    /*
     * Prepare Supabase record.
     */
    const settingsData = {
      user_id: user.id,
      smtp_host:
        String(smtpHost).trim(),

      smtp_port:
        parsedPort,

      smtp_user:
        String(smtpUser).trim(),

      smtp_pass:
        finalPassword,

      smtp_from_email:
        String(smtpFromEmail).trim(),

      smtp_from:
        smtpFrom
          ? String(smtpFrom).trim()
          : user.name || '',

      updated_at:
        new Date().toISOString(),
    };

    /*
     * Upsert means:
     * - create settings if they don't exist
     * - update them if they already exist
     */
    const {
      error: saveError,
    } = await supabaseAdmin
      .from('settings')
      .upsert(
        settingsData,
        {
          onConflict: 'user_id',
        }
      );

    if (saveError) {
      console.error(
        'Save settings error:',
        saveError
      );

      return NextResponse.json(
        {
          error:
            saveError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message:
        'Settings updated successfully!',
    });
  } catch (err: any) {
    console.error(
      'Update settings error:',
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