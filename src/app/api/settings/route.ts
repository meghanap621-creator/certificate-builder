import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';
import { JsonDb, Settings } from '@/lib/db';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    let settings = await JsonDb.findOne<Settings>('settings', { userId: user.id });
    if (!settings) {
      // Return default empty structure
      settings = {
        userId: user.id,
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        smtpSecure: false,
        smtpFrom: user.name,
      };
    }

    // Hide password for safety, but indicate if it is set
    const sanitizedSettings = {
      ...settings,
      smtpPass: settings.smtpPass ? '********' : '',
    };

    return NextResponse.json({ settings: sanitizedSettings });
  } catch (err) {
    console.error('Fetch settings error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, smtpFrom } = await request.json();

    if (!smtpHost || !smtpPort || !smtpUser) {
      return NextResponse.json(
        { error: 'SMTP Host, Port, and User are required.' },
        { status: 400 }
      );
    }

    let settings = await JsonDb.findOne<Settings>('settings', { userId: user.id });

    // Determine password update logic
    let finalPassword = smtpPass;
    if (settings && smtpPass === '********') {
      finalPassword = settings.smtpPass; // Keep original password if unchanged
    }

    const newSettings: Settings = {
      userId: user.id,
      smtpHost: smtpHost.trim(),
      smtpPort: parseInt(smtpPort, 10),
      smtpUser: smtpUser.trim(),
      smtpPass: finalPassword ? finalPassword.trim() : '',
      smtpSecure: !!smtpSecure,
      smtpFrom: smtpFrom ? smtpFrom.trim() : user.name,
    };

    if (settings) {
      await JsonDb.update<Settings>('settings', settings.userId, newSettings); // settings.userId acts as key
      // Note: we can use a custom update or save
      // Let's rewrite the settings table with updated record for this user
      const allSettings = await JsonDb.read<Settings>('settings');
      const filtered = allSettings.filter((s) => s.userId !== user.id);
      filtered.push(newSettings);
      await JsonDb.write<Settings>('settings', filtered);
    } else {
      await JsonDb.insert<Settings>('settings', newSettings);
    }

    return NextResponse.json({ message: 'Settings updated successfully!' });
  } catch (err) {
    console.error('Update settings error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
