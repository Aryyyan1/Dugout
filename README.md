# 🎱 The Dugout - Club Management System

**The Dugout** is a premium, full-stack web application designed specifically for managing sports clubs, snooker arenas, and cafes. Built with a robust Django backend and a modern React (Vite) frontend, it features a stunning, responsive "glassmorphism" UI.

## ✨ Key Features

- **Live Table Management:** Real-time tracking of snooker and pool tables, including automatic time elapsed and cost calculation.
- **Role-Based Access Control:** Separate dashboards for Club Managers and Members. Managers must approve new user registrations.
- **Advanced Booking System:** Members can schedule table reservations. The system automatically detects and prevents scheduling conflicts.
- **Financial Analytics:** Comprehensive manager dashboard featuring daily/monthly revenue tracking and 7-day visual trend charts.
- **Live Notifications:** Real-time alerts for booking approvals, rejections, and club announcements.
- **Fully Responsive Design:** A dark-themed, cinematic UI that works flawlessly on desktop, tablets, and mobile phones.

## 🛠 Tech Stack

**Frontend:**
- React.js (Vite)
- Vanilla CSS (Glassmorphism & Responsive Design)
- Context API for state management

**Backend:**
- Python / Django
- Django REST Framework (DRF)
- PostgreSQL (Production Ready) / SQLite (Local)
- `dj-database-url` for environment-based database routing

## 🚀 Quick Start (Local Development)

### 1. Clone the repository
```bash
git clone https://github.com/Aryyyan1/Dugout.git
cd Dugout
```

### 2. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 3. Frontend Setup
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` to view the application!

## 📸 Screenshots
*(Add screenshots of your application here)*

## 📄 License
This project is for educational and portfolio purposes.
