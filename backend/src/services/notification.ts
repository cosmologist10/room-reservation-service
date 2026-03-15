export interface BookingConfirmationData {
  bookingId: number;
  customerName: string;
  customerEmail: string;
  roomNumber: string;
  checkIn: Date;
  checkOut: Date;
  totalPrice: string;
}

/**
 * Sends a booking confirmation notification to the customer.
 *
 * In production: replace the console.log body with nodemailer, SendGrid,
 * AWS SES, etc. The interface stays the same — only the transport changes.
 */
export async function sendBookingConfirmation(data: BookingConfirmationData): Promise<void> {
  console.log(`[email] ✉  Booking confirmed — sending to ${data.customerEmail}`);
  console.log(`         Booking #${data.bookingId} | Guest: ${data.customerName}`);
  console.log(`         Room ${data.roomNumber} | ${data.checkIn.toDateString()} – ${data.checkOut.toDateString()}`);
  console.log(`         Total: $${data.totalPrice}`);
}
