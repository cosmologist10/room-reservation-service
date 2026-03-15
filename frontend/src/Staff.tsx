import * as React from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import {
  Box, Container, Typography, Paper, Stack, Button, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Snackbar, Alert, TablePagination,
  FormControl, InputLabel, Select, Divider,
} from '@mui/material';

export const BookingAction = {
  CHECK_IN:  'checkin',
  CHECK_OUT: 'checkout',
  CANCEL:    'cancel',
} as const;

export type BookingActionType = typeof BookingAction[keyof typeof BookingAction];


const API = 'http://localhost:3000';
const PAGE_SIZE = 10;
const TOKEN_KEY = 'staff_token';

interface StaffMember { id: number; name: string; role: string; }
interface Category { id: number; name: string; }
interface SearchedRoom { id: number; hotel_id: number; room_number: string; floor: number; category: string; base_price: string; capacity: number; }

interface DashboardData {
  hotelId: number;
  summary: { total_rooms: number; available: number; occupied: number; maintenance: number; out_of_service: number };
}

interface BookingsPage { bookings: any[]; total: number; page: number; limit: number; }

const emptySearch = { checkIn: '', checkOut: '', categoryId: '' };
const emptyCustomer = { name: '', email: '' };

export default function Staff() {
  const [token, setToken] = React.useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loggedInStaff, setLoggedInStaff] = React.useState<StaffMember | null>(() => {
    try { return JSON.parse(localStorage.getItem('staff_info') ?? 'null'); } catch { return null; }
  });
  const [loginForm, setLoginForm] = React.useState({ email: '', password: '' });
  const [loginError, setLoginError] = React.useState('');
  const [loggingIn, setLoggingIn] = React.useState(false);

  const [dashboard, setDashboard] = React.useState<DashboardData | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loadingId, setLoadingId] = React.useState<number | null>(null);
  const [snack, setSnack] = React.useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Dialog state
  const [search, setSearch] = React.useState(emptySearch);
  const [searching, setSearching] = React.useState(false);
  const [searchedRooms, setSearchedRooms] = React.useState<SearchedRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = React.useState<SearchedRoom | null>(null);
  const [customer, setCustomer] = React.useState(emptyCustomer);

  const [showBookings, setShowBookings] = React.useState(false);
  const [activeData, setActiveData] = React.useState<BookingsPage | null>(null);
  const [activePage, setActivePage] = React.useState(0);

  const [showHistory, setShowHistory] = React.useState(false);
  const [historyData, setHistoryData] = React.useState<BookingsPage | null>(null);
  const [historyPage, setHistoryPage] = React.useState(0);

  const authHeaders = React.useCallback(() => ({
    Authorization: `Bearer ${token}`,
  }), [token]);

  const handleUnauthorized = React.useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setSnack({ msg: 'Session expired. Please log in again.', severity: 'error' });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch(`${API}/api/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const body = await res.json();
      if (!res.ok) {
        setLoginError(body.error ?? 'Login failed');
      } else {
        localStorage.setItem(TOKEN_KEY, body.token);
        localStorage.setItem('staff_info', JSON.stringify(body.staff));
        setToken(body.token);
        setLoggedInStaff(body.staff);
        setLoginForm({ email: '', password: '' });
      }
    } catch {
      setLoginError('Network error');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('staff_info');
    setToken(null);
    setLoggedInStaff(null);
  };

  const fetchDashboard = React.useCallback(() => {
    if (!token) return;
    fetch(`${API}/api/staff/dashboard`, { headers: authHeaders() })
      .then(res => { if (res.status === 401) { handleUnauthorized(); throw new Error('401'); } return res.json(); })
      .then(data => setDashboard(data))
      .catch(() => {});
  }, [token, authHeaders, handleUnauthorized]);

  const fetchActive = React.useCallback((page: number) => {
    if (!token) return;
    fetch(`${API}/api/staff/bookings/active?page=${page + 1}&limit=${PAGE_SIZE}`, { headers: authHeaders() })
      .then(res => { if (res.status === 401) { handleUnauthorized(); throw new Error('401'); } return res.json(); })
      .then(data => setActiveData(data))
      .catch(() => {});
  }, [token, authHeaders, handleUnauthorized]);

  const fetchHistory = React.useCallback((page: number) => {
    if (!token) return;
    fetch(`${API}/api/staff/bookings/history?page=${page + 1}&limit=${PAGE_SIZE}`, { headers: authHeaders() })
      .then(res => { if (res.status === 401) { handleUnauthorized(); throw new Error('401'); } return res.json(); })
      .then(data => setHistoryData(data))
      .catch(() => {});
  }, [token, authHeaders, handleUnauthorized]);

  React.useEffect(() => {
    if (!token) return;
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30_000);
    return () => clearInterval(interval);
  }, [token, fetchDashboard]);

  React.useEffect(() => {
    fetch(`${API}/api/rooms/category`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (showBookings) fetchActive(activePage);
  }, [showBookings, activePage, fetchActive]);

  React.useEffect(() => {
    if (showHistory) fetchHistory(historyPage);
  }, [showHistory, historyPage, fetchHistory]);

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSearch(emptySearch);
    setSearchedRooms([]);
    setSelectedRoom(null);
    setCustomer(emptyCustomer);
  };

  const handleSearchRooms = React.useCallback(async (categoryId?: string) => {
    if (!search.checkIn || !search.checkOut) return;
    setSearching(true);
    setSelectedRoom(null);
    setSearchedRooms([]);
    const cat = categoryId !== undefined ? categoryId : search.categoryId;
    const params = new URLSearchParams({ check_in: search.checkIn, check_out: search.checkOut, limit: '50' });
    if (cat) params.set('categoryId', cat);
    try {
      const res = await fetch(`${API}/api/rooms/available?${params}`);
      const data = await res.json();
      if (data.error) { setSnack({ msg: data.error, severity: 'error' }); return; }
      setSearchedRooms(data.rooms);
    } catch {
      setSnack({ msg: 'Failed to search rooms', severity: 'error' });
    } finally {
      setSearching(false);
    }
  }, [search.checkIn, search.checkOut, search.categoryId]);

  const performAction = async (id: number, action: BookingActionType) => {
    setLoadingId(id);
    try {
      const res = await fetch(`${API}/api/staff/${id}/${action}`, { method: 'PUT', headers: authHeaders() });
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) {
        const body = await res.json();
        setSnack({ msg: body.error ?? 'Action failed', severity: 'error' });
      } else {
        fetchDashboard();
        fetchActive(activePage);
        if (showHistory) fetchHistory(historyPage);
      }
    } catch {
      setSnack({ msg: 'Network error', severity: 'error' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
          ...authHeaders(),
        },
        body: JSON.stringify({
          room_id: selectedRoom!.id,
          hotel_id: selectedRoom!.hotel_id,
          check_in: search.checkIn,
          check_out: search.checkOut,
          source: 'reception',
          booked_by_staff_id: loggedInStaff!.id,
          customer: { name: customer.name, email: customer.email },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSnack({ msg: body.error ?? 'Failed to create booking', severity: 'error' });
      } else {
        setSnack({ msg: 'Booking confirmed — payment collected at reception. It will appear in Active Bookings shortly.', severity: 'success' });
        handleCloseDialog();
        fetchDashboard();
        if (showBookings) fetchActive(activePage);
      }
    } catch {
      setSnack({ msg: 'Network error', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const canSearch = search.checkIn && search.checkOut;
  const canCreate = selectedRoom && customer.name && customer.email.includes('@');

  // Login screen
  if (!token) {
    return (
      <React.Fragment>
        <CssBaseline />
        <Box sx={{ bgcolor: '#e3f2fd', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Paper sx={{ p: 4, width: 360 }}>
            <Typography variant="h5" fontWeight={700} color="#1a237e" sx={{ mb: 3 }}>Staff Login</Typography>
            <form onSubmit={handleLogin}>
              <Stack spacing={2}>
                <TextField label="Email" type="email" value={loginForm.email} required
                  onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} fullWidth />
                <TextField label="Password" type="password" value={loginForm.password} required
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} fullWidth />
                {loginError && <Alert severity="error">{loginError}</Alert>}
                <Button type="submit" variant="contained" disabled={loggingIn} fullWidth>
                  {loggingIn ? 'Logging in…' : 'Login'}
                </Button>
              </Stack>
            </form>
          </Paper>
        </Box>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <CssBaseline />
      <Box sx={{ bgcolor: '#e3f2fd', minHeight: '100vh' }}>
        <Container maxWidth="md">
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pt: 8, mb: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a237e' }}>
              Staff Dashboard
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              {loggedInStaff && (
                <Typography variant="body2" color="text.secondary">{loggedInStaff.name} ({loggedInStaff.role})</Typography>
              )}
              <Button variant="contained" onClick={() => setDialogOpen(true)}>New Booking</Button>
              <Button variant="outlined" onClick={handleLogout}>Logout</Button>
            </Stack>
          </Stack>

          <Typography variant="h6" fontWeight={600} sx={{ mt: 3, mb: 1 }}>Room Status</Typography>
          {dashboard?.summary && (
            <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
              {[
                { label: 'Total Rooms', value: dashboard.summary.total_rooms },
                { label: 'Available', value: dashboard.summary.available },
                { label: 'Occupied', value: dashboard.summary.occupied },
                { label: 'Maintenance', value: dashboard.summary.maintenance },
                { label: 'Out of Service', value: dashboard.summary.out_of_service },
              ].map(card => (
                <Paper key={card.label} sx={{ p: 2, flex: 1, textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={700}>{card.value}</Typography>
                  <Typography variant="body2" color="text.secondary">{card.label}</Typography>
                </Paper>
              ))}
            </Stack>
          )}

          {/* Active Bookings */}
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>Active Bookings</Typography>
            <Button size="small" variant="outlined" onClick={() => setShowBookings(p => !p)}>
              {showBookings ? 'Hide' : 'Show'}
            </Button>
          </Stack>
          {showBookings && (
            <Box sx={{ mb: 4 }}>
              {activeData?.bookings.map(b => (
                <Paper key={b.id} sx={{ p: 2, mb: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>Room {b.roomNumber}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {b.customerName} · {b.customerEmail}
                        {b.bookedByStaffName && ` · Booked by ${b.bookedByStaffName}`}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip label={b.status} color={b.status === 'CHECKED_IN' ? 'success' : 'primary'} size="small" />
                      {b.status === 'CONFIRMED' && (
                        <Button size="small" variant="contained" disabled={loadingId === b.id}
                          onClick={() => performAction(b.id, BookingAction.CHECK_IN)}>Check In</Button>
                      )}
                      {b.status === 'CHECKED_IN' && (
                        <Button size="small" variant="contained" color="secondary" disabled={loadingId === b.id}
                          onClick={() => performAction(b.id, BookingAction.CHECK_OUT)}>Check Out</Button>
                      )}
                      {(b.status === 'CONFIRMED' || b.status === 'CHECKED_IN') && (
                        <Button size="small" variant="outlined" color="error" disabled={loadingId === b.id}
                          onClick={() => performAction(b.id, BookingAction.CANCEL)}>Cancel</Button>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              ))}
              {activeData && activeData.total > PAGE_SIZE && (
                <TablePagination
                  component="div"
                  count={activeData.total}
                  page={activePage}
                  onPageChange={(_, p) => setActivePage(p)}
                  rowsPerPage={PAGE_SIZE}
                  rowsPerPageOptions={[PAGE_SIZE]}
                />
              )}
            </Box>
          )}

          {/* History */}
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>History</Typography>
            <Button size="small" variant="outlined" onClick={() => setShowHistory(p => !p)}>
              {showHistory ? 'Hide' : 'Show'}
            </Button>
          </Stack>
          {showHistory && (
            <Box>
              {historyData?.bookings.map(b => (
                <Paper key={b.id} sx={{ p: 2, mb: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>Room {b.roomNumber}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {b.customerName} · {b.customerEmail}
                        {b.bookedByStaffName && ` · Booked by ${b.bookedByStaffName}`}
                      </Typography>
                    </Box>
                    <Chip label={b.status} color={b.status === 'CANCELLED' ? 'error' : 'default'} size="small" />
                  </Stack>
                </Paper>
              ))}
              {historyData && historyData.total > PAGE_SIZE && (
                <TablePagination
                  component="div"
                  count={historyData.total}
                  page={historyPage}
                  onPageChange={(_, p) => setHistoryPage(p)}
                  rowsPerPage={PAGE_SIZE}
                  rowsPerPageOptions={[PAGE_SIZE]}
                />
              )}
            </Box>
          )}

        </Container>
      </Box>

      {/* New Booking Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>New Booking</DialogTitle>
        <DialogContent>
          {/* Step 1: Search */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>Search available rooms</Typography>
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField label="Check-in" type="date" value={search.checkIn}
              onChange={e => setSearch(s => ({ ...s, checkIn: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }} size="small" />
            <TextField label="Check-out" type="date" value={search.checkOut}
              onChange={e => setSearch(s => ({ ...s, checkOut: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }} size="small" />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel shrink>Category</InputLabel>
              <Select value={search.categoryId} label="Category" displayEmpty
                onChange={e => {
                  const val = e.target.value as string;
                  setSearch(s => ({ ...s, categoryId: val }));
                  if (search.checkIn && search.checkOut) handleSearchRooms(val);
                }}>
                <MenuItem value="">All</MenuItem>
                {categories.map(c => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="outlined" size="small" disabled={!canSearch || searching}
              onClick={() => handleSearchRooms()}>
              {searching ? 'Searching…' : 'Search'}
            </Button>
          </Stack>

          {/* Room results */}
          {searchedRooms.length > 0 && (
            <Box sx={{ mt: 2, maxHeight: 200, overflowY: 'auto' }}>
              {searchedRooms.map(r => (
                <Paper key={r.id} variant="outlined"
                  onClick={() => setSelectedRoom(r)}
                  sx={{ p: 1.5, mb: 1, cursor: 'pointer',
                    borderColor: selectedRoom?.id === r.id ? 'primary.main' : 'divider',
                    borderWidth: selectedRoom?.id === r.id ? 2 : 1,
                  }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600}>Room {r.room_number} — {r.category} (Floor {r.floor})</Typography>
                    <Typography variant="body2" color="primary">${r.base_price}/night</Typography>
                  </Stack>
                </Paper>
              ))}
            </Box>
          )}
          {searchedRooms.length === 0 && search.checkIn && search.checkOut && !searching && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              No rooms found. Try different dates or category.
            </Typography>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Step 2: Customer details */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Customer details · Booking will be recorded under {loggedInStaff?.name}
          </Typography>
          <Stack spacing={2}>
            <TextField label="Customer Name" value={customer.name} size="small"
              onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} fullWidth />
            <TextField label="Customer Email" type="email" value={customer.email} size="small"
              onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!canCreate || submitting}>
            {submitting ? 'Creating…' : 'Create Booking'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={8000} onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.severity} onClose={() => setSnack(null)}>{snack?.msg}</Alert>
      </Snackbar>
    </React.Fragment>
  );
}
