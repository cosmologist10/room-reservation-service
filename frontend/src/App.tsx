import * as React from 'react';
import { useState } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, Container, Typography, Paper, Stack, TextField, Button,
  MenuItem, Select, FormControl, InputLabel, Alert,
  TablePagination } from '@mui/material';
import './App.css'

const API = 'http://localhost:3000';


function App() {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomsTotal, setRoomsTotal] = useState(0);
  const [roomsPage, setRoomsPage] = useState(0); // 0-indexed for MUI
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [_selectedRoom, setSelectedRoom] = useState<any | null>(null);


  React.useEffect(() => {
    fetch(`${API}/api/rooms/category`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch((err) => console.error(err));
  }, []);

  const handleSearch = (page = 0) => {
    setError('');
    setSearched(false);
    const params = new URLSearchParams({ check_in: checkIn, check_out: checkOut, page: String(page + 1), limit: '10' });
    if (categoryId) params.set('categoryId', String(categoryId));
    fetch(`${API}/api/rooms/available?${params}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setRooms(data.rooms);
        setRoomsTotal(data.total);
        setRoomsPage(page);
        setSearched(true);
      })
      .catch((err) => console.error(err));
  };

  return (
    <React.Fragment>
      <CssBaseline />
      <Box sx={{ bgcolor: '#e3f2fd', minHeight: '100vh' }}>
        <Container maxWidth="md">
          <Typography variant="h4" sx={{ pt: 8, textAlign: 'center', fontWeight: 700, color: '#1a237e' }}>
            Find Your Perfect Room
          </Typography>
          <Typography variant="subtitle1" sx={{ textAlign: 'center', color: 'text.secondary', mt: 1 }}>
            Search availability and book instantly
          </Typography>

          <Paper sx={{ p: 3, mb: 4 }}>
            <Stack direction="row" spacing={2} alignItems="center">
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

          {searched && rooms.length === 0 && (
            <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              No rooms available for the selected dates.
            </Typography>
          )}

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
            <TablePagination
              component="div"
              count={roomsTotal}
              page={roomsPage}
              onPageChange={(_, p) => handleSearch(p)}
              rowsPerPage={10}
              rowsPerPageOptions={[10]}
            />
          )}
        </Container>
      </Box>
    </React.Fragment>
  );
}

export default App
