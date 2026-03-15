import * as React from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import {
  Box, Container, Typography, Paper, Stack, TextField, Button,
  MenuItem, Select, FormControl, InputLabel, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stepper, Step, StepLabel, TablePagination, Chip, Tab, Tabs,
} from '@mui/material';

const API = 'http://localhost:3000';
const STEPS = ['Your Details', 'Payment Method', 'Verify OTP', 'Confirmation'];

export default function App() {
  const [tab, setTab] = React.useState(0);
  const [checkIn, setCheckIn] = React.useState('');
  const [checkOut, setCheckOut] = React.useState('');
  const [categoryId, setCategoryId] = React.useState<number | ''>('');
  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([]);
  const [rooms, setRooms] = React.useState<any[]>([]);
  const [roomsTotal, setRoomsTotal] = React.useState(0);
  const [roomsPage, setRoomsPage] = React.useState(0);
  const [searched, setSearched] = React.useState(false);
  const [error, setError] = React.useState('');
  const [selectedRoom, setSelectedRoom] = React.useState<any>(null);
  const [customer, setCustomer] = React.useState({ name: '', email: '', phone: '' });
  const [step, setStep] = React.useState(0);
  const [otp, setOtp] = React.useState('');
  const [otpError, setOtpError] = React.useState('');
  const [bookingError, setBookingError] = React.useState('');
  const [booking, setBooking] = React.useState<any>(null);
  const [bookingLoading, setBookingLoading] = React.useState(false);
  const idempotencyKey = React.useRef('');

  // My Bookings
  const [myEmail, setMyEmail] = React.useState('');
  const [myBookings, setMyBookings] = React.useState<any[]>([]);
  const [myTotal, setMyTotal] = React.useState(0);
  const [myPage, setMyPage] = React.useState(0);
  const [mySearched, setMySearched] = React.useState(false);
  const [myError, setMyError] = React.useState('');
  const [myOtpSent, setMyOtpSent] = React.useState(false);
  const [myOtp, setMyOtp] = React.useState('');
  const [myOtpError, setMyOtpError] = React.useState('');
  const [mySendingOtp, setMySendingOtp] = React.useState(false);
  const [otpResending, setOtpResending] = React.useState(false);
  const [myOtpCooldown, setMyOtpCooldown] = React.useState(0);
  const [bookingOtpCooldown, setBookingOtpCooldown] = React.useState(0);

  React.useEffect(() => {
    if (myOtpCooldown <= 0 && bookingOtpCooldown <= 0) return;
    const id = setInterval(() => {
      setMyOtpCooldown(s => Math.max(0, s - 1));
      setBookingOtpCooldown(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [myOtpCooldown, bookingOtpCooldown]);

  const fmtCooldown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  React.useEffect(() => {
    fetch(`${API}/api/rooms/category`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(() => {});
  }, []);

  const handleSearch = (page = 0) => {
    setError(''); setSearched(false);
    const params = new URLSearchParams({ check_in: checkIn, check_out: checkOut, page: String(page + 1), limit: '10' });
    if (categoryId) params.set('categoryId', String(categoryId));
    fetch(`${API}/api/rooms/available?${params}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setRooms(data.rooms); setRoomsTotal(data.total); setRoomsPage(page); setSearched(true);
      })
      .catch(() => {});
  };

  const handleRequestMyOtp = async () => {
    setMyOtpError(''); setMySendingOtp(true);
    try {
      const res = await fetch(`${API}/api/bookings/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: myEmail }) });
      const body = await res.json();
      if (!res.ok) { setMyError(body.error ?? 'Failed to send OTP'); return; }
      setMyOtpSent(true); setMyOtpCooldown(600); setMyBookings([]); setMySearched(false);
    } catch { setMyError('Network error'); } finally { setMySendingOtp(false); }
  };

  const handleMyBookings = async (page = 0) => {
    setMyOtpError(''); setMyError('');
    const params = new URLSearchParams({ email: myEmail, page: String(page + 1), limit: '10' });
    try {
      const res = await fetch(`${API}/api/bookings?${params}`, { headers: { 'X-OTP': myOtp } });
      const data = await res.json();
      if (res.status === 401) { setMyOtpError(data.error ?? 'Invalid OTP'); return; }
      if (data.error) { setMyError(data.error); return; }
      setMyBookings(data.bookings); setMyTotal(data.total); setMyPage(page); setMySearched(true);
    } catch { setMyError('Failed to fetch bookings'); }
  };

  const handleResendMyOtp = async () => {
    setOtpResending(true); setMyOtpError(''); setMyOtp('');
    try {
      const res = await fetch(`${API}/api/bookings/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: myEmail }) });
      const body = await res.json();
      if (!res.ok) setMyOtpError(body.error ?? 'Failed to resend OTP');
      else setMyOtpCooldown(600);
    } catch { setMyOtpError('Network error'); } finally { setOtpResending(false); }
  };

  const handleRequestBookingOtp = async () => {
    setOtpError('');
    try {
      const res = await fetch(`${API}/api/bookings/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customer.email }) });
      if (!res.ok) { const body = await res.json(); setOtpError(body.error ?? 'Failed to send OTP'); return; }
      setBookingOtpCooldown(600); setStep(2);
    } catch { setOtpError('Network error'); }
  };

  const handleCompletePayment = () => {
    setOtpError(''); setBookingError(''); setBookingLoading(true);
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    fetch(`${API}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey.current, 'X-OTP': otp },
      body: JSON.stringify({
        room_id: selectedRoom.id, hotel_id: selectedRoom.hotel_id,
        check_in: checkIn, check_out: checkOut, source: 'website',
        customer: { name: customer.name, email: customer.email, ...(customer.phone ? { phone: customer.phone } : {}) },
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) { setBookingError(data.error); return; }
        setBooking(data.booking); setStep(3);
        setRooms(prev => prev.filter(r => r.id !== selectedRoom.id));
      })
      .catch(() => setBookingError('Something went wrong. Please try again.'))
      .finally(() => setBookingLoading(false));
  };

  const handleCloseDialog = () => {
    setSelectedRoom(null); setCustomer({ name: '', email: '', phone: '' }); setStep(0);
    setOtp(''); setOtpError(''); setBookingError(''); setBooking(null);
    setBookingLoading(false); setBookingOtpCooldown(0); idempotencyKey.current = '';
  };

  return (
    <React.Fragment>
      <CssBaseline />
      <Box sx={{ bgcolor: '#e3f2fd', minHeight: '100vh' }}>
        <Container maxWidth="md">
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ pt: 3, mb: 2 }}>
            <Tab label="Book a Room" />
            <Tab label="My Bookings" />
          </Tabs>

          {/* ── TAB 0: Book a room ─────────────────────────────────────────── */}
          {tab === 0 && (
            <>
              <Typography variant="h4" sx={{ textAlign: 'center', fontWeight: 700, color: '#1a237e', mb: 1 }}>
                Find Your Perfect Room
              </Typography>
              <Typography variant="subtitle1" sx={{ textAlign: 'center', color: 'text.secondary', mb: 3 }}>
                Search availability and book instantly
              </Typography>

              <Paper sx={{ p: 3, mb: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                  <TextField label="Check In" onChange={(e) => setCheckIn(e.target.value)} type="date" InputLabelProps={{ shrink: true }} />
                  <TextField label="Check Out" onChange={(e) => setCheckOut(e.target.value)} type="date" InputLabelProps={{ shrink: true }} />
                  <FormControl sx={{ minWidth: 160 }}>
                    <InputLabel shrink>Category</InputLabel>
                    <Select value={categoryId} label="Category" displayEmpty onChange={(e) => setCategoryId(Number(e.target.value) || '')}>
                      <MenuItem value="">All</MenuItem>
                      {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Button variant="contained" onClick={() => handleSearch(0)}>Search</Button>
                </Stack>
              </Paper>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              {searched && rooms.length === 0 && <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>No rooms available for the selected dates.</Typography>}

              {rooms.map(room => (
                <Paper key={room.id} sx={{ p: 2, mb: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>Room {room.room_number}</Typography>
                      <Typography variant="body2" color="text.secondary">{room.category} · Floor {room.floor} · Up to {room.capacity} guests</Typography>
                    </Box>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Typography variant="h6" color="primary">${room.base_price}<Typography component="span" variant="body2" color="text.secondary">/night</Typography></Typography>
                      <Button variant="contained" size="small" disabled={!checkIn || !checkOut} onClick={() => setSelectedRoom(room)}>Book Now</Button>
                    </Stack>
                  </Stack>
                </Paper>
              ))}

              {searched && roomsTotal > 10 && (
                <TablePagination component="div" count={roomsTotal} page={roomsPage} onPageChange={(_, p) => handleSearch(p)} rowsPerPage={10} rowsPerPageOptions={[10]} />
              )}
            </>
          )}

          {/* ── TAB 1: My bookings ─────────────────────────────────────────── */}
          {tab === 1 && (
            <>
              <Typography variant="h5" fontWeight={700} color="#1a237e" sx={{ mb: 2 }}>My Bookings</Typography>
              <Paper sx={{ p: 3, mb: 3 }}>
                {!myOtpSent ? (
                  <Stack direction="row" spacing={2} alignItems="center">
                    <TextField label="Your Email" type="email" value={myEmail} autoComplete="off"
                      onChange={e => { setMyEmail(e.target.value); setMyError(''); }}
                      onKeyDown={e => e.key === 'Enter' && myEmail.includes('@') && handleRequestMyOtp()}
                      sx={{ flex: 1 }} />
                    <Button variant="contained" disabled={!myEmail.includes('@') || mySendingOtp} onClick={handleRequestMyOtp}>
                      {mySendingOtp ? 'Sending…' : 'Send OTP'}
                    </Button>
                  </Stack>
                ) : (
                  <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">OTP sent to <strong>{myEmail}</strong>. Check your server console in dev.</Typography>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <TextField label="Enter OTP" value={myOtp}
                        onChange={e => { setMyOtp(e.target.value); setMyOtpError(''); }}
                        onKeyDown={e => e.key === 'Enter' && myOtp.length === 6 && handleMyBookings(0)}
                        error={!!myOtpError} helperText={myOtpError}
                        slotProps={{ htmlInput: { maxLength: 6 } }} sx={{ width: 160 }} />
                      <Button variant="contained" disabled={myOtp.length !== 6} onClick={() => handleMyBookings(0)}>View Bookings</Button>
                      <Button variant="text" size="small" disabled={otpResending || myOtpCooldown > 0} onClick={handleResendMyOtp}>
                        {otpResending ? 'Sending…' : myOtpCooldown > 0 ? `Resend in ${fmtCooldown(myOtpCooldown)}` : 'Resend OTP'}
                      </Button>
                      <Button variant="text" size="small" onClick={() => { setMyOtpSent(false); setMyOtp(''); setMyOtpError(''); setMySearched(false); setMyBookings([]); setMyOtpCooldown(0); }}>
                        Change Email
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Paper>

              {myError && <Alert severity="error" sx={{ mb: 2 }}>{myError}</Alert>}
              {mySearched && myBookings.length === 0 && <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 2, mb: 4 }}>No bookings found for {myEmail}.</Typography>}

              {myBookings.map(b => (
                <Paper key={b.id} sx={{ p: 2, mb: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>Room {b.roomNumber}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(b.checkIn).toLocaleDateString()} – {new Date(b.checkOut).toLocaleDateString()} · ${b.totalPrice}
                      </Typography>
                    </Box>
                    <Chip label={b.status} size="small"
                      color={b.status === 'CONFIRMED' || b.status === 'CHECKED_IN' ? 'success' : b.status === 'CANCELLED' ? 'error' : 'default'} />
                  </Stack>
                </Paper>
              ))}

              {mySearched && myTotal > 10 && (
                <TablePagination component="div" count={myTotal} page={myPage} onPageChange={(_, p) => handleMyBookings(p)} rowsPerPage={10} rowsPerPageOptions={[10]} />
              )}
            </>
          )}
        </Container>
      </Box>

      {/* ── Booking dialog ──────────────────────────────────────────────────── */}
      <Dialog open={!!selectedRoom} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>Book Room {selectedRoom?.room_number}</DialogTitle>
        <DialogContent>
          <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
            {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
          </Stepper>

          {step === 0 && (
            <Stack spacing={2}>
              <TextField label="Full Name" required value={customer.name} onChange={(e) => setCustomer(c => ({ ...c, name: e.target.value }))} />
              <TextField label="Email" required type="email" value={customer.email} onChange={(e) => setCustomer(c => ({ ...c, email: e.target.value }))} />
              <TextField label="Phone" value={customer.phone} onChange={(e) => setCustomer(c => ({ ...c, phone: e.target.value }))} />
            </Stack>
          )}

          {step === 1 && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">Select how you'd like to pay.</Typography>
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', borderColor: 'primary.main', borderWidth: 2 }}>
                <Typography fontSize={28}>🅥</Typography>
                <Box>
                  <Typography fontWeight={600}>Vipps</Typography>
                  <Typography variant="body2" color="text.secondary">Pay securely with Vipps</Typography>
                </Box>
              </Paper>
            </Stack>
          )}

          {step === 2 && (
            <Stack spacing={2}>
              {bookingError && <Alert severity="error">{bookingError}</Alert>}
              <TextField label="OTP" value={otp}
                onChange={(e) => { setOtp(e.target.value); setOtpError(''); }}
                error={!!otpError} helperText={otpError || `Enter the 6-digit OTP sent to ${customer.email}`}
                slotProps={{ htmlInput: { maxLength: 6 } }} />
              <Button variant="text" size="small" sx={{ alignSelf: 'flex-start' }} disabled={bookingOtpCooldown > 0} onClick={handleRequestBookingOtp}>
                {bookingOtpCooldown > 0 ? `Resend in ${fmtCooldown(bookingOtpCooldown)}` : 'Resend OTP'}
              </Button>
            </Stack>
          )}

          {step === 3 && booking && (
            <Alert severity="success">
              <Typography fontWeight={600}>Booking confirmed!</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>Booking ID: <strong>#{booking.id}</strong></Typography>
              <Typography variant="body2">Total: <strong>${booking.totalPrice}</strong></Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>A confirmation has been sent to <strong>{customer.email}</strong>.</Typography>
            </Alert>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDialog}>{step === 3 ? 'Close' : 'Cancel'}</Button>
          {step === 0 && <Button variant="contained" disabled={!customer.name || !customer.email.includes('@')} onClick={() => setStep(1)}>Next</Button>}
          {step === 1 && <Button variant="contained" onClick={handleRequestBookingOtp}>Continue with Vipps</Button>}
          {step === 2 && <Button variant="contained" disabled={otp.length !== 6 || bookingLoading} onClick={handleCompletePayment}>{bookingLoading ? 'Processing...' : 'Complete Payment'}</Button>}
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );
}
