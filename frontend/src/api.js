const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const fetchTables = async () => {
  const res = await fetch(`${API_BASE}/tables/`);
  return res.json();
};

export const startGame = async (tableId) => {
  const res = await fetch(`${API_BASE}/tables/${tableId}/start_game/`, { method: 'POST' });
  return res.json();
};

export const stopGame = async (tableId) => {
  const res = await fetch(`${API_BASE}/tables/${tableId}/stop_game/`, { method: 'POST' });
  return res.json();
};

export const updateTransactionName = async (transactionId, userName) => {
  const res = await fetch(`${API_BASE}/transactions/${transactionId}/update_name/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_name: userName }),
  });
  return res.json();
};

export const loginUser = async (username, password) => {
  const res = await fetch(`${API_BASE}/users/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Login failed');
  }
  return res.json();
};

export const createBooking = async (bookingData) => {
  const res = await fetch(`${API_BASE}/bookings/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData),
  });
  return res.json();
};

export const rejectBooking = async (bookingId) => {
  const res = await fetch(`${API_BASE}/bookings/${bookingId}/reject/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
};
