export const BookingStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED:       'CONFIRMED',
  CHECKED_IN:      'CHECKED_IN',
  CHECKED_OUT:     'CHECKED_OUT',
  CANCELLED:       'CANCELLED',
} as const;

export const PaymentStatus = {
  PENDING_AUTHORIZATION: 'pending_authorization',
  AUTHORIZED:            'authorized',
  CAPTURED:              'captured',
  FAILED:                'failed',
  REFUNDED:              'refunded',
} as const;

export type BookingStatusType  = typeof BookingStatus[keyof typeof BookingStatus];
export type PaymentStatusType  = typeof PaymentStatus[keyof typeof PaymentStatus];


const BOOKING_TRANSITIONS: Record<BookingStatusType, BookingStatusType[]> = {
  [BookingStatus.PENDING_PAYMENT]: [BookingStatus.CONFIRMED,   BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]:       [BookingStatus.CHECKED_IN,  BookingStatus.CANCELLED],
  [BookingStatus.CHECKED_IN]:      [BookingStatus.CHECKED_OUT],
  [BookingStatus.CHECKED_OUT]:     [],
  [BookingStatus.CANCELLED]:       [],
};

const PAYMENT_TRANSITIONS: Record<PaymentStatusType, PaymentStatusType[]> = {
  [PaymentStatus.PENDING_AUTHORIZATION]: [PaymentStatus.AUTHORIZED, PaymentStatus.FAILED],
  [PaymentStatus.AUTHORIZED]:            [PaymentStatus.CAPTURED,   PaymentStatus.REFUNDED],
  [PaymentStatus.CAPTURED]:              [],
  [PaymentStatus.FAILED]:                [],
  [PaymentStatus.REFUNDED]:              [],
};

export const BookingAction = {
  CANCEL:    'CANCEL',
  CHECK_IN:  'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
} as const;

export type BookingActionType = typeof BookingAction[keyof typeof BookingAction];

const ACTION_TO_STATUS: Record<BookingActionType, BookingStatusType> = {
  [BookingAction.CANCEL]:    BookingStatus.CANCELLED,
  [BookingAction.CHECK_IN]:  BookingStatus.CHECKED_IN,
  [BookingAction.CHECK_OUT]: BookingStatus.CHECKED_OUT,
};

export function isValidBookingTransition(from: BookingStatusType, to: BookingStatusType): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

// Returns the target status if the action is valid from the current state, otherwise null.
export function applyBookingAction(from: BookingStatusType, action: BookingActionType): BookingStatusType | null {
  const to = ACTION_TO_STATUS[action];
  return isValidBookingTransition(from, to) ? to : null;
}

export function isValidPaymentTransition(from: PaymentStatusType, to: PaymentStatusType): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
