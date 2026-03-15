import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db';
import { otpRequests } from '../db/schema';

export class InvalidOtpError extends Error {}

export interface OtpRequestResult {
  sent: boolean;
  secondsRemaining?: number; // present when an active OTP already exists
}

export async function requestOtp(email: string): Promise<OtpRequestResult> {
  const [existing] = await db
    .select({ expiresAt: otpRequests.expiresAt, otpCode: otpRequests.otpCode })
    .from(otpRequests)
    .where(
      and(
        eq(otpRequests.email, email),
        gt(otpRequests.expiresAt, new Date()),
        isNull(otpRequests.usedAt),
      )
    )
    .orderBy(otpRequests.id)
    .limit(1);

  if (existing) {
    const secondsRemaining = Math.ceil((existing.expiresAt.getTime() - Date.now()) / 1000);
    console.log(`[otp] ✉  Existing OTP for ${email}: ${existing.otpCode} (expires in ${Math.ceil(secondsRemaining / 60)} min)`);
    return { sent: false, secondsRemaining };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.insert(otpRequests).values({ email, otpCode: code, expiresAt });

  // Mock: in production replace with real email sending
  console.log(`[otp] ✉  OTP for ${email}: ${code} (expires in 10 min)`);
  return { sent: true };
}

// consume=true: marks OTP as used (one-time, e.g. booking creation)
// consume=false: validates without consuming (e.g. view bookings — reusable within 10 min window)
export async function verifyOtp(email: string, code: string, consume = false): Promise<void> {
  const [row] = await db
    .select()
    .from(otpRequests)
    .where(
      and(
        eq(otpRequests.email, email),
        eq(otpRequests.otpCode, code),
        gt(otpRequests.expiresAt, new Date()),
        isNull(otpRequests.usedAt),
      )
    )
    .orderBy(otpRequests.id)
    .limit(1);

  if (!row) throw new InvalidOtpError('Invalid or expired OTP');

  if (consume) {
    await db
      .update(otpRequests)
      .set({ usedAt: new Date() })
      .where(eq(otpRequests.id, row.id));
  }
}
