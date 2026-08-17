import fs from 'fs/promises';
import path from 'path';

// Table Type Definitions
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

export interface Template {
  id: string;
  userId: string;
  name: string;
  type: 'upload' | 'editor';
  backgroundImage?: string; // base64 or file path
  width: number;
  height: number;
  elements: any[]; // Text, shape, image elements
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  userId: string;
  name: string;
  description?: string;
  templateId: string;
  emailSubject: string;
  emailBody: string;
  status: 'Draft' | 'Processing' | 'Completed' | 'Failed';
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  campaignId: string;
  email: string;
  name: string;
  collegeName?: string;
  course?: string;
  department?: string;
  role?: string;
  organizationName?: string;
  startDate?: string;
  endDate?: string;
  certDate?: string;
  certId: string;
  customFields?: Record<string, string>;
  createdAt: string;
}

export interface DeliveryLog {
  id: string;
  studentId: string;
  campaignId: string;
  certificateId: string;
  recipientEmail: string;
  pdfPath?: string;
  certStatus: 'Pending' | 'Generating' | 'Generated' | 'Failed';
  emailStatus: 'Pending' | 'Sending' | 'Sent' | 'Failed';
  sentAt?: string;
  error?: string;
  attempts: number;
}

export interface Settings {
  id: string; // Matches userId
  userId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  smtpFrom: string;
}

// Global In-Memory Concurrency Locks to serialize writes per table
const writeLocks: Record<string, Promise<void>> = {};

export class JsonDb {
  private static dbDir = path.join(process.cwd(), 'data');

  private static getFilePath(table: string): string {
    return path.join(this.dbDir, `${table}.json`);
  }

  // Ensure DB folder and JSON files exist
  public static async init() {
    try {
      await fs.mkdir(this.dbDir, { recursive: true });
      const tables = ['users', 'templates', 'campaigns', 'students', 'delivery_logs', 'settings', 'mappings'];
      for (const table of tables) {
        const filePath = this.getFilePath(table);
        try {
          await fs.access(filePath);
        } catch {
          await fs.writeFile(filePath, '[]', 'utf8');
        }
      }
    } catch (err) {
      console.error('Database initialization failed:', err);
    }
  }

  // Read a table
  public static async read<T>(table: string): Promise<T[]> {
    await this.init();
    const filePath = this.getFilePath(table);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data) as T[];
    } catch (err) {
      console.error(`Error reading database table ${table}:`, err);
      return [];
    }
  }

  // Write a table atomically (with locking)
  public static async write<T>(table: string, records: T[]): Promise<void> {
    await this.init();
    const filePath = this.getFilePath(table);
    const tempPath = `${filePath}.tmp`;

    // Wait for the current lock on this table, if any, then register a new lock
    const currentLock = writeLocks[table] || Promise.resolve();
    
    let resolveLock: () => void;
    writeLocks[table] = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    try {
      await currentLock;
      const dataStr = JSON.stringify(records, null, 2);
      await fs.writeFile(tempPath, dataStr, 'utf8');
      await fs.rename(tempPath, filePath);
    } catch (err) {
      console.error(`Error writing database table ${table}:`, err);
      // Clean up temp file if write failed
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw err;
    } finally {
      resolveLock!();
    }
  }

  // Generic Helper methods
  public static async find<T extends { id?: string; userId?: string }>(
    table: string,
    query: Partial<T>
  ): Promise<T[]> {
    const records = await this.read<T>(table);
    return records.filter((r) => {
      return Object.entries(query).every(([key, value]) => {
        return (r as any)[key] === value;
      });
    });
  }

  public static async findOne<T extends { id?: string; userId?: string }>(
    table: string,
    query: Partial<T>
  ): Promise<T | null> {
    const records = await this.read<T>(table);
    const match = records.find((r) => {
      return Object.entries(query).every(([key, value]) => {
        return (r as any)[key] === value;
      });
    });
    return match || null;
  }

  public static async insert<T extends { id: string }>(table: string, record: T): Promise<T> {
    const records = await this.read<T>(table);
    records.push(record);
    await this.write(table, records);
    return record;
  }

  public static async update<T extends { id: string }>(
    table: string,
    id: string,
    updates: Partial<T>
  ): Promise<T | null> {
    const records = await this.read<T>(table);
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return null;

    records[index] = { ...records[index], ...updates };
    await this.write(table, records);
    return records[index];
  }

  public static async delete<T extends { id: string }>(table: string, id: string): Promise<boolean> {
    const records = await this.read<T>(table);
    const filtered = records.filter((r) => r.id !== id);
    if (filtered.length === records.length) return false;
    await this.write(table, filtered);
    return true;
  }
}
