import { describe, it, expect } from 'vitest';
import {
  applyBookingAction,
  isValidBookingTransition,
  isValidPaymentTransition,
  BookingStatus,
  PaymentStatus,
  BookingAction,
} from '../utils/stateMachine';

// ---------------------------------------------------------------------------
// Booking state transitions
// ---------------------------------------------------------------------------
describe('isValidBookingTransition', () => {
  it('allows PENDING_PAYMENT → CONFIRMED', () => {
    expect(isValidBookingTransition(BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED)).toBe(true);
  });

  it('allows PENDING_PAYMENT → CANCELLED', () => {
    expect(isValidBookingTransition(BookingStatus.PENDING_PAYMENT, BookingStatus.CANCELLED)).toBe(true);
  });

  it('allows CONFIRMED → CHECKED_IN', () => {
    expect(isValidBookingTransition(BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN)).toBe(true);
  });

  it('allows CONFIRMED → CANCELLED', () => {
    expect(isValidBookingTransition(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)).toBe(true);
  });

  it('allows CHECKED_IN → CHECKED_OUT', () => {
    expect(isValidBookingTransition(BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT)).toBe(true);
  });

  it('rejects CHECKED_IN → CANCELLED (cannot cancel mid-stay)', () => {
    expect(isValidBookingTransition(BookingStatus.CHECKED_IN, BookingStatus.CANCELLED)).toBe(false);
  });

  it('rejects CHECKED_OUT → any further transition', () => {
    expect(isValidBookingTransition(BookingStatus.CHECKED_OUT, BookingStatus.CANCELLED)).toBe(false);
    expect(isValidBookingTransition(BookingStatus.CHECKED_OUT, BookingStatus.CONFIRMED)).toBe(false);
  });

  it('rejects CANCELLED → any further transition', () => {
    expect(isValidBookingTransition(BookingStatus.CANCELLED, BookingStatus.CONFIRMED)).toBe(false);
    expect(isValidBookingTransition(BookingStatus.CANCELLED, BookingStatus.CHECKED_IN)).toBe(false);
  });

  it('rejects PENDING_PAYMENT → CHECKED_IN (skipping CONFIRMED)', () => {
    expect(isValidBookingTransition(BookingStatus.PENDING_PAYMENT, BookingStatus.CHECKED_IN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyBookingAction
// ---------------------------------------------------------------------------
describe('applyBookingAction', () => {
  it('CHECK_IN from CONFIRMED returns CHECKED_IN', () => {
    expect(applyBookingAction(BookingStatus.CONFIRMED, BookingAction.CHECK_IN)).toBe(BookingStatus.CHECKED_IN);
  });

  it('CHECK_OUT from CHECKED_IN returns CHECKED_OUT', () => {
    expect(applyBookingAction(BookingStatus.CHECKED_IN, BookingAction.CHECK_OUT)).toBe(BookingStatus.CHECKED_OUT);
  });

  it('CANCEL from CONFIRMED returns CANCELLED', () => {
    expect(applyBookingAction(BookingStatus.CONFIRMED, BookingAction.CANCEL)).toBe(BookingStatus.CANCELLED);
  });

  it('CANCEL from PENDING_PAYMENT returns CANCELLED', () => {
    expect(applyBookingAction(BookingStatus.PENDING_PAYMENT, BookingAction.CANCEL)).toBe(BookingStatus.CANCELLED);
  });

  it('CHECK_IN from PENDING_PAYMENT returns null (invalid)', () => {
    expect(applyBookingAction(BookingStatus.PENDING_PAYMENT, BookingAction.CHECK_IN)).toBeNull();
  });

  it('CANCEL from CHECKED_IN returns null (cannot cancel mid-stay)', () => {
    expect(applyBookingAction(BookingStatus.CHECKED_IN, BookingAction.CANCEL)).toBeNull();
  });

  it('CHECK_OUT from CONFIRMED returns null (must check in first)', () => {
    expect(applyBookingAction(BookingStatus.CONFIRMED, BookingAction.CHECK_OUT)).toBeNull();
  });

  it('any action from CHECKED_OUT returns null (terminal state)', () => {
    expect(applyBookingAction(BookingStatus.CHECKED_OUT, BookingAction.CANCEL)).toBeNull();
    expect(applyBookingAction(BookingStatus.CHECKED_OUT, BookingAction.CHECK_IN)).toBeNull();
  });

  it('any action from CANCELLED returns null (terminal state)', () => {
    expect(applyBookingAction(BookingStatus.CANCELLED, BookingAction.CHECK_IN)).toBeNull();
    expect(applyBookingAction(BookingStatus.CANCELLED, BookingAction.CHECK_OUT)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Payment state transitions
// ---------------------------------------------------------------------------
describe('isValidPaymentTransition', () => {
  it('allows PENDING_AUTHORIZATION → AUTHORIZED', () => {
    expect(isValidPaymentTransition(PaymentStatus.PENDING_AUTHORIZATION, PaymentStatus.AUTHORIZED)).toBe(true);
  });

  it('allows PENDING_AUTHORIZATION → FAILED', () => {
    expect(isValidPaymentTransition(PaymentStatus.PENDING_AUTHORIZATION, PaymentStatus.FAILED)).toBe(true);
  });

  it('allows AUTHORIZED → CAPTURED', () => {
    expect(isValidPaymentTransition(PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED)).toBe(true);
  });

  it('allows AUTHORIZED → REFUNDED', () => {
    expect(isValidPaymentTransition(PaymentStatus.AUTHORIZED, PaymentStatus.REFUNDED)).toBe(true);
  });

  it('rejects CAPTURED → any further transition (terminal)', () => {
    expect(isValidPaymentTransition(PaymentStatus.CAPTURED, PaymentStatus.REFUNDED)).toBe(false);
  });

  it('rejects FAILED → any further transition (terminal)', () => {
    expect(isValidPaymentTransition(PaymentStatus.FAILED, PaymentStatus.AUTHORIZED)).toBe(false);
  });

  it('rejects PENDING_AUTHORIZATION → CAPTURED (skipping AUTHORIZED)', () => {
    expect(isValidPaymentTransition(PaymentStatus.PENDING_AUTHORIZATION, PaymentStatus.CAPTURED)).toBe(false);
  });
});
