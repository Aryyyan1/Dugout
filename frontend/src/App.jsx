import { useState, useEffect, useContext, useRef } from 'react'
import { motion, useScroll, useTransform, useSpring } from 'framer-motion'
import { fetchTables, startGame, stopGame, loginUser, createBooking, rejectBooking, updateTransactionName, updatePaymentStatus } from './api'
import './index.css'
import CharacterGroup from './components/CharacterGroup'
import AuthInteractionContext from './context/AuthInteractionContext'

function App() {
  const [user, setUser] = useState(null)
  const [tables, setTables] = useState([])
  const [transactions, setTransactions] = useState([])
  const [requests, setRequests] = useState([])
  const [approvedBookings, setApprovedBookings] = useState([])
  const [activeAlert, setActiveAlert] = useState(null)
  const [allUsers, setAllUsers] = useState([])
  const [view, setView] = useState('home') // home, dashboard, login
  const [managerTab, setManagerTab] = useState('overview') // overview, requests, members, finance
  const [isRegistering, setIsRegistering] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({ username: '', password: '', email: '', phone: '' })
  const { interactionState, setInteractionState } = useContext(AuthInteractionContext)
  
  const canvasRef = useRef(null)
  const [images, setImages] = useState([])
  const { scrollYProgress } = useScroll()
  
  const smoothScrollProgress = useSpring(scrollYProgress, {
    stiffness: 1000,
    damping: 100,
    mass: 0.1,
    restDelta: 0.0001
  })

  // Pre-load all 240 frames for "Flawless" performance
  useEffect(() => {
    const loadedImages = []
    const frameCount = 240
    let loadedCount = 0

    for (let i = 1; i <= frameCount; i++) {
      const img = new Image()
      const frameIndex = i.toString().padStart(3, '0')
      img.src = `/ezgif-frame-${frameIndex}.jpg`
      img.onload = () => {
        loadedCount++
        if (loadedCount === frameCount) {
          setImages(loadedImages)
        }
      }
      loadedImages.push(img)
    }
  }, [])

  // Flawless Canvas Render Loop
  useEffect(() => {
    if (!canvasRef.current || images.length < 240) return
    let rafId;
    
    const renderCanvas = () => {
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')
      
      // Calculate which frame to show
      const frameCount = 240
      const index = Math.min(
        frameCount - 1,
        Math.floor(smoothScrollProgress.get() * frameCount)
      )

      if (images[index]) {
        // Handle Canvas Sizing (Fill container)
        const img = images[index]
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight * 1.5 // Account for parallax height
        
        // Draw image with "Object Fit: Cover" logic
        const imgRatio = img.width / img.height
        const canvasRatio = canvas.width / canvas.height
        let dWidth, dHeight, dx, dy

        if (imgRatio > canvasRatio) {
          dHeight = canvas.height
          dWidth = dHeight * imgRatio
          dx = (canvas.width - dWidth) / 2
          dy = 0
        } else {
          dWidth = canvas.width
          dHeight = dWidth / imgRatio
          dx = 0
          dy = (canvas.height - dHeight) / 2
        }

        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(img, dx, dy, dWidth, dHeight)
      }
      
      rafId = requestAnimationFrame(renderCanvas)
    }

    rafId = requestAnimationFrame(renderCanvas)
    return () => cancelAnimationFrame(rafId)
  }, [images, smoothScrollProgress])

  const y = useTransform(smoothScrollProgress, [0, 1], [0, -200])

  const [bookingModal, setBookingModal] = useState({ open: false, table: null, date: '', time: '', estimatedTime: '30-40 mins', success: false })
  const [gameResultModal, setGameResultModal] = useState({ open: false, data: null, userName: '' })
  const [myBookings, setMyBookings] = useState([])
  const [notifications, setNotifications] = useState(() => {
    const savedUser = localStorage.getItem('dugout_user')
    if (!savedUser) return []
    const saved = localStorage.getItem(`dugout_notifications_${JSON.parse(savedUser).id}`)
    return saved ? JSON.parse(saved) : []
  })
  const [showNotifs, setShowNotifs] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [tick, setTick] = useState(0)
  const [alertedIds, setAlertedIds] = useState(new Set())
  const [showPendingModal, setShowPendingModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [errorModal, setErrorModal] = useState({ show: false, message: '', title: 'Notice', type: 'info' })
  const [memberTab, setMemberTab] = useState('my') // my, club
  const [memberSubView, setMemberSubView] = useState('arena') // arena, schedule
  const [conflictModal, setConflictModal] = useState({ open: false, msg: '', onConfirm: null })
  const [stats, setStats] = useState({ today_revenue: 0, month_revenue: 0, daily_stats: [], tables_perf: [] })
  const [announcements, setAnnouncements] = useState([])
  const [newAnn, setNewAnn] = useState({ title: '', content: '', ann_type: 'NEWS' })
  const [historyFilterTab, setHistoryFilterTab] = useState('All tables')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const prevMyBookings = useRef([])
  const prevAnnouncements = useRef([])
  const isFirstLoad = useRef(true)

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    // Check for persisted user once on mount
    const savedUser = localStorage.getItem('dugout_user')
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      setUser(parsed)
      setView('dashboard')
    }
    loadTables()
  }, [])

  useEffect(() => {
    if (user) {
      loadMyBookings()
      if (user.is_manager) {
        loadTransactions()
        loadRequests()
        loadUsers()
        fetchStats()
        loadAnnouncements()
      }
    }
    const interval = setInterval(() => {
      loadTables()
      if (user?.is_manager) {
        loadTransactions()
        loadRequests()
        loadUsers()
        fetchStats()
        loadAnnouncements()
      } else if (user) {
        loadMyBookings()
        checkUserStatus()
        loadAnnouncements()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [user])

  // Notification Engine for Bookings & Announcements
  useEffect(() => {
    if (!user) return;

    // 1. Check for Booking Status Changes (using persistence to avoid duplicates)
    if (myBookings.length > 0) {
      const notifiedKey = `notified_ids_${user.id}`
      const notifiedIds = JSON.parse(localStorage.getItem(notifiedKey) || '[]')
      let newNotifiedIds = [...notifiedIds]
      let foundNew = false

      myBookings.forEach(b => {
        const uniqueKey = `${b.id}_${b.status}`
        if ((b.status === 'APPROVED' || b.status === 'CANCELLED') && !notifiedIds.includes(uniqueKey)) {
          let msg = `Booking for ${b.table_name} is now ${b.status}!`
          if (b.status === 'CANCELLED') {
            msg = `Unfortunately, your request for ${b.table_name} was rejected by the manager.`
          }
          
          const newNotif = { 
            id: Date.now() + Math.random(), 
            msg, 
            time: new Date(), 
            type: b.status === 'CANCELLED' ? 'error' : 'success',
            bookingId: b.id
          }
          
          setNotifications(prev => {
            const updated = [newNotif, ...prev].slice(0, 20) // Keep last 20
            localStorage.setItem(`dugout_notifications_${user.id}`, JSON.stringify(updated))
            return updated
          })
          
          setHasUnread(true)
          setToast({ msg, type: b.status === 'APPROVED' ? 'success' : 'error' })
          setTimeout(() => setToast(null), 6000)
          
          newNotifiedIds.push(uniqueKey)
          foundNew = true
        }
      })

      if (foundNew) {
        localStorage.setItem(notifiedKey, JSON.stringify(newNotifiedIds))
      }
    }
    prevMyBookings.current = myBookings

    // 2. Check for New Announcements/Notices
    if (!isFirstLoad.current && announcements.length > prevAnnouncements.current.length) {
      const latest = announcements[0] 
      const msg = `📢 NEW ${latest.ann_type}: ${latest.title}`
      const newNotif = { id: Date.now(), msg, time: new Date(), type: 'info' }
      
      setNotifications(prev => {
        const updated = [newNotif, ...prev].slice(0, 20)
        localStorage.setItem(`dugout_notifications_${user.id}`, JSON.stringify(updated))
        return updated
      })
      
      setHasUnread(true)
      setToast({ msg: `New Club Notice: ${latest.title}`, type: 'success' })
      setTimeout(() => setToast(null), 5000)
    }
    
    if (announcements.length > 0 || myBookings.length > 0) {
      isFirstLoad.current = false
    }
    prevAnnouncements.current = announcements
  }, [myBookings, announcements, user])

  // Load persisted notifications on login
  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`dugout_notifications_${user.id}`)
      if (saved) setNotifications(JSON.parse(saved))
      else setNotifications([])
    }
  }, [user])

  const loadTables = async () => {
    try {
      const data = await fetchTables()
      // Sort tables by ID to maintain consistent UI order when status updates
      setTables(data.sort((a, b) => a.id - b.id))
    } catch (err) {
      console.error("Failed to load tables", err)
    }
  }
  const loadMyBookings = async () => {
    if (!user) return;
    try {
      const res = await fetch(`http://localhost:8000/api/bookings/`)
      const data = await res.json()
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      
      const current = data.filter(b => {
        const isUser = b.user === user.id
        const startTime = new Date(b.start_time)
        const oneHourAfter = new Date(startTime.getTime() + 60 * 60 * 1000)
        
        // Show if it's the user's booking AND (it's in the future OR it's less than 1 hour old)
        return isUser && oneHourAfter > now
      }).reverse()
      
      setMyBookings(current)
      
      // Also load ALL approved bookings for the club schedule
      const todayDate = now.toLocaleDateString('en-CA')

      setApprovedBookings(data.filter(b => 
        b.status === 'APPROVED' && 
        b.start_time.includes(todayDate) && 
        new Date(b.start_time) > now
      ))
    } catch (err) {
      console.error("Failed to load my bookings", err)
    }
  }

  const checkUserStatus = async () => {
    if (!user) return
    try {
      const res = await fetch(`http://localhost:8000/api/users/${user.id}/`)
      const data = await res.json()
      if (data.is_approved !== user.is_approved) {
        if (data.is_approved && !user.is_approved) {
          const msg = "🎉 Great news! Your account has been approved by the manager. You can now schedule bookings."
          const newNotif = { id: Date.now(), msg, time: new Date(), type: 'success' }
          setNotifications(prev => [newNotif, ...prev])
          setHasUnread(true)
          setToast({ msg, type: 'success' })
          setTimeout(() => setToast(null), 8000)
        }
        
        const newUser = { ...user, is_approved: data.is_approved }
        setUser(newUser)
        localStorage.setItem('dugout_user', JSON.stringify(newUser))
      }
    } catch (err) {
      console.error("Failed to check user status", err)
    }
  }

  const loadTransactions = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/transactions/')
      const data = await res.json()
      setTransactions(data.reverse())
    } catch (err) {
      console.error("Failed to load transactions", err)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/transactions/stats/')
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error("Failed to load stats", err)
    }
  }
  const loadAnnouncements = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/announcements/')
      const data = await res.json()
      setAnnouncements(data)
    } catch (err) {
      console.error("Failed to load announcements", err)
    }
  }

  const handleAddAnnouncement = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('http://localhost:8000/api/announcements/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAnn)
      })
      if (res.ok) {
        setNewAnn({ title: '', content: '', ann_type: 'NEWS' })
        loadAnnouncements()
        setToast({ msg: "Announcement posted!", type: 'success' })
        setTimeout(() => setToast(null), 3000)
      }
    } catch (err) {
      console.error("Failed to post announcement", err)
    }
  }

  const handleDeleteAnnouncement = async (id) => {
    try {
      await fetch(`http://localhost:8000/api/announcements/${id}/`, { method: 'DELETE' })
      loadAnnouncements()
    } catch (err) {
      console.error("Failed to delete announcement", err)
    }
  }

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm("Are you sure you want to delete this game record? This will permanently affect your revenue statistics.")) return;
    try {
      await fetch(`http://localhost:8000/api/transactions/${id}/`, { method: 'DELETE' });
      loadTransactions();
      fetchStats();
    } catch (err) {
      console.error("Failed to delete transaction", err);
    }
  }

  const loadRequests = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/bookings/')
      const data = await res.json()
      setRequests(data.filter(r => r.status === 'PENDING'))
      
      const now = new Date()
      const today = now.toLocaleDateString('en-CA')

      setApprovedBookings(data.filter(b => {
        const startTime = new Date(b.start_time)
        return b.status === 'APPROVED' && 
               b.start_time.includes(today) && 
               startTime > now
      }))
    } catch (err) {
      console.error("Failed to load requests", err)
    }
  }

  useEffect(() => {
    if (user?.is_manager && approvedBookings.length > 0) {
      const now = new Date()
      approvedBookings.forEach(b => {
        const start = new Date(b.start_time)
        const diff = (now - start) / 1000 // seconds
        
        // Alert if time has passed (up to 30 mins ago) and not already alerted
        if (diff >= 0 && diff < 1800 && !alertedIds.has(b.id)) {
          const userInfo = allUsers.find(u => u.id === b.user)
          console.log("Triggering alert for:", b.id, userInfo?.username)
          setActiveAlert({ ...b, userInfo })
          setAlertedIds(prev => {
            const next = new Set(prev)
            next.add(b.id)
            return next
          })
        }
      })
    }
  }, [tick, user, approvedBookings, allUsers, alertedIds])

  const loadUsers = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/users/')
      const data = await res.json()
      setAllUsers(data)
    } catch (err) {
      console.error("Failed to load users", err)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const userData = await loginUser(formData.username, formData.password)
      setUser(userData)
      if (rememberMe) {
        localStorage.setItem('dugout_user', JSON.stringify(userData))
      }
      setInteractionState('success')
      setTimeout(() => {
        setMemberSubView('arena')
        setManagerTab('overview')
        setView('dashboard')
        setInteractionState('idle')
      }, 1000)
    } catch (err) {
      setErrorModal({ show: true, message: err.message || "Login failed. Please check your credentials.", title: "Sign In Error", type: "error" });
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    
    // Validate Phone Number: Must be exactly 10 digits
    const phoneRegex = /^[0-9]{10}$/
    if (!phoneRegex.test(formData.phone)) {
      setErrorModal({ show: true, message: "Invalid Phone Number: Please enter a valid 10-digit number.", title: "Invalid Input", type: "error" })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/api/users/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          email: formData.email,
          phone_number: formData.phone,
          is_manager: false
        })
      })
      if (res.ok) {
        setErrorModal({ show: true, message: "Registration successful! Please login to your account.", title: "Success", type: "success" })
        setIsRegistering(false)
      } else {
        const errData = await res.json()
        let errMsg = "Registration failed."
        if (errData.username) errMsg = "This username is already taken."
        else if (errData.email) errMsg = "This email is already registered."
        else if (errData.phone_number) errMsg = "This phone number is already in use."
        else if (errData.error) errMsg = errData.error
        
        setErrorModal({ show: true, message: errMsg, title: "Registration Error", type: "error" })
      }
    } catch (err) {
      setErrorModal({ show: true, message: "Registration failed. Server error.", title: "Error", type: "error" })
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (table) => {
    try {
      if (table.is_free) {
        // Check for upcoming reservations within 1 hour
        const now = new Date()
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
        
        // Use all approved bookings (which we already have in state)
        const conflict = approvedBookings.find(b => 
          b.table === table.id && 
          new Date(b.start_time) > now && 
          new Date(b.start_time) < oneHourLater
        )

        if (conflict) {
          const diffMs = new Date(conflict.start_time) - now
          const minsLeft = Math.floor(diffMs / 60000)
          const timeStr = new Date(conflict.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
          
          setConflictModal({
            open: true,
            msg: `This table has a reservation starting in just ${minsLeft} minutes (at ${timeStr}).`,
            onConfirm: () => {
              startGame(table.id).then(() => loadTables())
              setConflictModal({ open: false, msg: '', onConfirm: null })
            }
          })
          return
        }

        await startGame(table.id)
      } else {
        const data = await stopGame(table.id)
        setGameResultModal({ open: true, data: { ...data, tableName: table.name }, userName: '' })
        if (user?.is_manager) {
          loadTransactions()
          fetchStats()
        }
      }
      loadTables()
    } catch (err) {
      console.error("Action failed", err)
    }
  }

  const getTimeElapsed = (startTime) => {
    if (!startTime) return "--:--"
    const start = new Date(startTime)
    const now = new Date()
    const diff = Math.floor((now - start) / 1000)
    const mins = Math.floor(diff / 60)
    const secs = diff % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleBook = async (e) => {
    e.preventDefault()
    if (!bookingModal.date || !bookingModal.time) return setErrorModal({ show: true, message: "Please select both date and time to continue.", title: "Selection Required", type: "info" })
    
    setLoading(true)
    try {
      // Create a date object in local time and convert to ISO for backend consistency
      const localDateTime = new Date(`${bookingModal.date}T${bookingModal.time}`)
      
      // Check if the selected time is in the past
      if (localDateTime < new Date()) {
        setLoading(false);
        return setErrorModal({ 
          show: true, 
          message: "You cannot schedule a booking for a time that has already passed. Please select a future time.", 
          title: "Invalid Time", 
          type: "error" 
        });
      }

      const dateTime = localDateTime.toISOString()
      const response = await fetch('http://localhost:8000/api/bookings/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: user.id,
          table: bookingModal.table.id,
          start_time: dateTime,
          estimated_time: bookingModal.estimatedTime,
          status: 'PENDING'
        })
      })
      if (response.ok) {
        setBookingModal({ ...bookingModal, success: true })
        loadMyBookings()
        if (user?.is_manager) loadRequests()
      } else {
        const errorData = await response.json()
        setErrorModal({ show: true, message: errorData.error || "Booking failed.", title: "Reservation Conflict", type: "error" })
      }
    } catch (err) {
      console.error("Booking failed", err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id) => {
    try {
      const response = await fetch(`http://localhost:8000/api/bookings/${id}/approve/`, { method: 'POST' })
      if (!response.ok) {
        const errorData = await response.json()
        setErrorModal({ show: true, message: errorData.error || "Failed to approve booking.", title: "Approval Conflict", type: "error" })
        return
      }
      loadRequests()
      loadTables()
    } catch (err) {
      console.error("Approve failed", err)
    }
  }

  const handleReject = async (id) => {
    try {
      await rejectBooking(id)
      loadRequests()
    } catch (err) {
      console.error("Reject failed", err)
    }
  }

  const handleApproveUser = async (id) => {
    try {
      await fetch(`http://localhost:8000/api/users/${id}/approve/`, { method: 'POST' })
      loadUsers()
    } catch (err) {
      console.error("User approval failed", err)
    }
  }

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Are you sure you want to permanently remove this member? This action cannot be undone.")) return
    try {
      await fetch(`http://localhost:8000/api/users/${id}/`, { method: 'DELETE' })
      loadUsers()
    } catch (err) {
      console.error("User deletion failed", err)
    }
  }


  const renderHome = () => (
    <div className="fade-in" style={{ width: '100%' }}>
      <section className="hero-section" style={{ height: 'auto', minHeight: '80vh', padding: '8rem 5%', background: 'transparent' }}>
        <div className="hero-overlay"></div>
        <div style={{ maxWidth: '900px', zIndex: 1 }}>
          <h1 style={{ fontSize: 'clamp(3.5rem, 10vw, 6rem)', marginBottom: '1.5rem', lineHeight: 1, letterSpacing: '-0.04em', fontWeight: 900, color: '#ffffff', textShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
            The <span className="gradient-text" style={{ fontSize: 'inherit', display: 'inline' }}>Dugout</span> <br />
            <span style={{ fontSize: '0.5em', opacity: 1, display: 'block', marginTop: '0.5rem', color: '#ffffff' }}>Sports & Cafe</span>
          </h1>
          <p style={{ color: '#cbd5e1', fontSize: '1.6rem', marginBottom: '3.5rem', maxWidth: '850px', margin: '0 auto 3.5rem', fontStyle: 'italic', fontWeight: 600, lineHeight: 1.4, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            "Enjoy the Sip of coffee while chasing the perfect shot 🎱"
          </p>
          <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', marginBottom: '3rem' }}>
            <button className="btn btn-primary" onClick={() => { setIsRegistering(false); setView('login'); }} style={{ padding: '1rem 2.5rem', fontSize: '1.2rem', fontWeight: 'bold' }}>Enter Club</button>
            <button className="btn btn-outline" onClick={() => { setIsRegistering(true); setView('login'); }} style={{ padding: '1rem 2.5rem', fontSize: '1.2rem', fontWeight: 'bold' }}>Join Dugout</button>
          </div>
        </div>
      </section>

      <div className="container" style={{ marginTop: '4rem' }}>
        <div className="table-grid" style={{ position: 'relative', zIndex: 10 }}>
          <div className="glass-card" style={{ textAlign: 'center' }}>
            <div className="logo-icon" style={{ margin: '0 auto 1.5rem', background: 'var(--gold-gradient)' }}>
              <i className="ri-map-pin-2-line"></i>
            </div>
            <h3 style={{ color: 'var(--accent)', marginBottom: '1rem' }}>Find Us</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>
              A-162, Ramnagariya Rd, Opp. Kidzee School,<br />
              Jagatpura, Jaipur, Rajasthan 302017
            </p>
          </div>
          <div className="glass-card" style={{ textAlign: 'center' }}>
            <div className="logo-icon" style={{ margin: '0 auto 1.5rem', background: 'var(--primary)' }}>
              <i className="ri-time-line"></i>
            </div>
            <h3 style={{ color: 'var(--primary)', marginBottom: '1rem' }}>Timings</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>
              Monday - Sunday:<br />
              10:30 AM - 11:00 PM
            </p>
          </div>
          <div className="glass-card" style={{ textAlign: 'center' }}>
            <div className="logo-icon" style={{ margin: '0 auto 1.5rem', background: '#ff4747' }}>
              <i className="ri-phone-line"></i>
            </div>
            <h3 style={{ color: '#ff4747', marginBottom: '1rem' }}>Contact Us</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>
              Phone: +91 85030 01200<br />
              Insta: @thedugoutjaipur
            </p>
          </div>
        </div>

        {/* New Experience Section */}
        <section style={{ padding: '6rem 0' }}>
          <div className="experience-grid" style={{ display: 'grid', gap: '4rem', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '3.5rem', marginBottom: '2rem', lineHeight: 1.1, fontWeight: 900 }}>
                Experience the <br />
                <span className="gradient-text" style={{ fontSize: '5rem', display: 'block', marginTop: '0.5rem' }}>Elite Lifestyle</span>
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', lineHeight: 1.8, marginBottom: '2rem' }}>
                At The Dugout, we believe sports and leisure go hand-in-hand. Whether you're here for a professional snooker match or a relaxing cup of coffee, we provide the perfect ambiance.
              </p>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {[
                  'Professional Snooker Tables',
                  'Pool Tables & Legend Snooker Table',
                  'Gourmet Sports Cafe',
                  'PS5, Carrom & Chess Zone',
                  'Amazing Food & Refreshments',
                  'Elite Membership Benefits'
                ].map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', fontSize: '1.2rem', fontWeight: 600, color: '#fff' }}>
                    <i className="ri-checkbox-circle-fill" style={{ color: 'var(--primary)', fontSize: '1.5rem' }}></i>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div style={{ position: 'relative', height: '400px', borderRadius: '24px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
                <img src="/real_snooker_1.jpg" alt="Real Snooker Table" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ position: 'relative', height: '190px', borderRadius: '24px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
                  <img src="/real_snooker_2.jpg" alt="Dugout Club View" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div className="glass-card" style={{ 
                  height: '190px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  backgroundImage: 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url("/elite_bg.png")',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  color: '#fff', 
                  border: 'none', 
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <h4 style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--accent)', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>Elite</h4>
                  <p style={{ fontWeight: 600, opacity: 0.9 }}>Sports Hub</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.8 }}>Jagatpura, Jaipur</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

    </div>
  )

  const renderTableGrid = () => (
    <div className="table-grid">
      {tables.map(table => (
        <div key={table.id} className="snooker-table-card" data-name={table.name} data-type={table.table_type}>
          <div className="table-header">
            <div>
              <h4 style={{ fontSize: '1.2rem', color: '#fff' }}>{table.name}</h4>
              <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>{table.table_type}</p>
            </div>
            <span className={`status-badge ${table.is_free ? 'status-free' : 'status-busy'}`}>
              {table.is_free ? 'FREE' : 'IN PLAY'}
            </span>
          </div>
          
          <div className="table-stats">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Rate:</span>
              <span>₹{table.hourly_rate}/hr</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Time:</span>
              <span style={{ fontWeight: 'bold', color: table.is_free ? 'rgba(255,255,255,0.4)' : 'var(--accent)' }}>
                {table.is_free ? '--:--' : getTimeElapsed(table.last_start_time)}
              </span>
            </div>
          </div>

          <div style={{ position: 'relative', zIndex: 2 }}>
            {user?.is_manager ? (
              <button 
                className={`btn ${table.is_free ? 'btn-primary' : 'btn-stop'}`} 
                style={{ width: '100%', marginTop: '1.5rem', fontWeight: 800, textTransform: 'uppercase' }}
                onClick={() => handleToggle(table)}
              >
                {table.is_free ? 'Start Game' : 'Stop Game'}
              </button>
            ) : (
              <button 
                className="btn btn-outline" 
                style={{ width: '100%', marginTop: '1.5rem', borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 800 }}
                onClick={() => {
                  if (!user?.is_approved && !user?.is_manager) {
                    setShowPendingModal(true);
                    return;
                  }
                  const now = new Date();
                  const date = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
                  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // HH:mm
                  setBookingModal({ open: true, table: table, date, time, estimatedTime: '30-40 mins', success: false });
                }}
              >
                SCHEDULE BOOKING
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  const renderLogin = () => (
    <div className="fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '2rem' }}>
      <div className="glass-card login-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', maxWidth: '900px', padding: 0, overflow: 'hidden', minHeight: '550px' }}>
        {/* Left Side: Mascot */}
        <div className="login-mascot" style={{ background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--glass-border)', padding: '2rem' }}>
          <CharacterGroup />
        </div>

        {/* Right Side: Form */}
        <div className="auth-form-container" style={{ padding: '3.5rem' }}>
          <h2 style={{ marginBottom: '2rem', textAlign: 'center', fontSize: '2.5rem' }}>
            {isRegistering ? 'Join' : 'Login to'} <span className="brand-serif">Dugout</span>
          </h2>
          <form onSubmit={isRegistering ? handleRegister : handleLogin}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Username</label>
              <input 
                type="text" 
                className="glass-card" 
                style={{ width: '100%', padding: '1rem', background: 'rgba(212, 198, 185, 0.05)', borderRadius: '16px', fontSize: '1rem', color: 'var(--text-main)', border: '1px solid var(--glass-border)' }}
                value={formData.username}
                onChange={(e) => {
                  setFormData({...formData, username: e.target.value});
                  setInteractionState('typing');
                }}
                onFocus={() => setInteractionState('email_focus')}
                onBlur={() => setInteractionState('idle')}
                required
              />
            </div>
            {isRegistering && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Email</label>
                <input 
                  type="email" 
                  className="glass-card" 
                  style={{ width: '100%', padding: '1rem', background: 'rgba(212, 198, 185, 0.05)', borderRadius: '16px', fontSize: '1rem', color: 'var(--text-main)', border: '1px solid var(--glass-border)' }}
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({...formData, email: e.target.value});
                    setInteractionState('typing');
                  }}
                  onFocus={() => setInteractionState('email_focus')}
                  onBlur={() => setInteractionState('idle')}
                  required
                />
              </div>
            )}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Password</label>
              <input 
                type="password" 
                className="glass-card" 
                style={{ width: '100%', padding: '1rem', background: 'rgba(212, 198, 185, 0.05)', borderRadius: '16px', fontSize: '1rem', color: 'var(--text-main)', border: '1px solid var(--glass-border)' }}
                value={formData.password}
                onChange={(e) => {
                  setFormData({...formData, password: e.target.value});
                  setInteractionState('typing');
                }}
                onFocus={() => setInteractionState('password_focus')}
                onBlur={() => setInteractionState('idle')}
                required
              />
            </div>
            {isRegistering && (
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Phone Number</label>
                <input 
                  type="text" 
                  className="glass-card" 
                  style={{ width: '100%', padding: '1rem', background: 'rgba(212, 198, 185, 0.05)', borderRadius: '16px', fontSize: '1rem', color: 'var(--text-main)', border: '1px solid var(--glass-border)' }}
                  value={formData.phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '').substring(0, 10);
                    setFormData({...formData, phone: val});
                    setInteractionState('typing');
                  }}
                  onFocus={() => setInteractionState('email_focus')}
                  onBlur={() => setInteractionState('idle')}
                  placeholder="e.g. 9876543210"
                  required
                />
              </div>
            )}
            {!isRegistering && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', cursor: 'pointer' }} onClick={() => setRememberMe(!rememberMe)}>
                <input 
                  type="checkbox" 
                  checked={rememberMe} 
                  onChange={() => {}} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }} 
                />
                <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Keep me signed in</span>
              </div>
            )}
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', justifyContent: 'center', padding: '1.2rem', fontSize: '1.1rem', marginTop: '1rem' }} 
              disabled={loading}
              onMouseEnter={() => setInteractionState('button_hover')}
              onMouseLeave={() => setInteractionState('idle')}
            >
              {loading ? 'Processing...' : (isRegistering ? 'CREATE ACCOUNT' : 'SIGN IN')}
            </button>
          </form>
          <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
            <span 
              style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }} 
              onClick={() => setIsRegistering(!isRegistering)}
            >
              {isRegistering ? 'Sign In' : 'Join Now'}
            </span>
          </p>
        </div>
      </div>
    </div>
  )

  const renderDashboard = () => (
    <div className="fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '2rem' }}>Welcome, <span className="gradient-text">{user?.username}</span></h2>
        <p style={{ color: 'var(--text-muted)' }}>{user?.is_manager ? 'Club Manager Console' : 'Member Dashboard'}</p>
      </div>

      {user?.is_manager ? (
        <div className="manager-layout">
          {/* Sidebar Navigation */}
          <div className="sidebar-nav">
            <div className="sidebar-nav-header">
              <h4 style={{ color: 'var(--primary)', marginBottom: '0.2rem' }}>THE DUGOUT</h4>
              <p style={{ fontSize: '0.65rem', opacity: 0.5, letterSpacing: '0.1em' }}>CONTROL PANEL v2.0</p>
            </div>

            <div className="sidebar-section-divider" />
            
            <div className="sidebar-nav-header"><h4>OPERATIONS</h4></div>
            <button className={`sidebar-item ${managerTab === 'overview' ? 'active' : ''}`} onClick={() => setManagerTab('overview')}>
              <i className="ri-dashboard-3-line"></i> Overview
            </button>
            <button className={`sidebar-item ${managerTab === 'requests' ? 'active' : ''}`} onClick={() => setManagerTab('requests')}>
              <i className="ri-questionnaire-line"></i> Requests
              {requests.length > 0 && <span style={{ marginLeft: 'auto', background: '#ff4747', color: '#fff', fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '10px' }}>{requests.length}</span>}
            </button>
            <button className={`sidebar-item ${managerTab === 'upcoming' ? 'active' : ''}`} onClick={() => setManagerTab('upcoming')}>
              <i className="ri-calendar-event-line"></i> Upcoming
            </button>

            <div className="sidebar-section-divider" />
            
            <div className="sidebar-nav-header"><h4>MANAGEMENT</h4></div>
            <button className={`sidebar-item ${managerTab === 'members' ? 'active' : ''}`} onClick={() => setManagerTab('members')}>
              <i className="ri-group-line"></i> Members
            </button>
            <button className={`sidebar-item ${managerTab === 'notices' ? 'active' : ''}`} onClick={() => setManagerTab('notices')}>
              <i className="ri-notification-3-line"></i> Notice Board
            </button>

            <div className="sidebar-section-divider" />

            <div className="sidebar-nav-header"><h4>PERFORMANCE</h4></div>
            <button className={`sidebar-item ${managerTab === 'finance' ? 'active' : ''}`} onClick={() => setManagerTab('finance')}>
              <i className="ri-history-line"></i> History
            </button>
            <button className={`sidebar-item ${managerTab === 'analytics' ? 'active' : ''}`} onClick={() => setManagerTab('analytics')}>
              <i className="ri-pie-chart-line"></i> Insights
            </button>
          </div>

          <div className="manager-content">
            {/* Summary Cards */}
            <div className="table-grid stats-grid" style={{ marginBottom: '3rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--primary)', background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800 }}>ACTIVE TABLES</p>
                <h4 style={{ fontSize: '2.5rem', marginTop: '0.5rem' }}>{tables.filter(t => !t.is_free).length}</h4>
              </div>
              <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent)', background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800 }}>PENDING TABLE REQUESTS</p>
                <h4 style={{ fontSize: '2.5rem', marginTop: '0.5rem' }}>{requests.length}</h4>
              </div>
              <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid #6366f1', background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800 }}>TOTAL MEMBERS</p>
                <h4 style={{ fontSize: '2.5rem', marginTop: '0.5rem' }}>{allUsers.length}</h4>
              </div>
            </div>

          {/* Tab Content */}
          {managerTab === 'overview' && (
            <div className="fade-in">
              <h3 style={{ marginBottom: '1.5rem' }}>Live Table Status</h3>
              {renderTableGrid()}
            </div>
          )}

          {managerTab === 'requests' && (
            <div className="glass-card fade-in" style={{ background: 'rgba(255, 215, 0, 0.05)', border: '1px solid var(--accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>Pending Booking Requests</h3>
                <button 
                  className="btn btn-outline" 
                  style={{ fontSize: '0.7rem', padding: '0.4rem 0.8rem' }}
                  onClick={() => {
                    setActiveAlert({
                      id: 'test',
                      table_name: 'Test Table',
                      start_time: new Date(),
                      userInfo: { username: 'Test User', email: 'test@example.com', phone_number: '9876543210' }
                    })
                  }}
                >
                  TEST ALERT POPUP
                </button>
              </div>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Table</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(req => (
                      <tr key={req.id}>
                        <td>{req.user_name}</td>
                        <td>{req.table_name}</td>
                        <td>{new Date(req.start_time).toLocaleDateString()}</td>
                        <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                          <div>{new Date(req.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                          {req.estimated_time && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Est: {req.estimated_time}</div>
                          )}
                        </td>
                        <td style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={() => handleApprove(req.id)}>APPROVE</button>
                          <button className="btn btn-stop" style={{ padding: '0.5rem 1rem' }} onClick={() => handleReject(req.id)}>REJECT</button>
                        </td>
                      </tr>
                    ))}
                    {requests.length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No pending requests.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {managerTab === 'upcoming' && (
            <div className="glass-card fade-in" style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid var(--primary)' }}>
              <h3>Approved Reservations (Today)</h3>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Table</th>
                      <th>Scheduled Time</th>
                      <th>Contact Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedBookings.map(b => {
                      const u = allUsers.find(user => user.id === b.user);
                      return (
                        <tr key={b.id}>
                          <td><strong>{b.user_name}</strong></td>
                          <td>{b.table_name}</td>
                          <td style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                            <div>{new Date(b.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                            {b.estimated_time && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Est: {b.estimated_time}</div>
                            )}
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>
                            <div><i className="ri-mail-line" style={{ marginRight: '0.4rem' }}></i>{u?.email || 'N/A'}</div>
                            <div style={{ color: 'var(--text-muted)' }}><i className="ri-phone-line" style={{ marginRight: '0.4rem' }}></i>{u?.phone_number || 'N/A'}</div>
                          </td>
                        </tr>
                      );
                    })}
                    {approvedBookings.length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No upcoming reservations for today.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {managerTab === 'members' && (
            <div className="glass-card fade-in">
              <h3>Club Membership Oversight</h3>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Role & Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map(u => (
                      <tr key={u.id}>
                        <td>{u.username}</td>
                        <td>{u.email}</td>
                        <td>{u.phone_number || 'N/A'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={`status-badge ${u.is_manager ? 'status-busy' : 'status-free'}`}>
                              {u.is_manager ? 'MANAGER' : 'MEMBER'}
                            </span>
                            {!u.is_manager && (
                              <span className={`status-badge`} style={{ 
                                background: u.is_approved ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 215, 0, 0.1)',
                                color: u.is_approved ? 'var(--primary)' : 'var(--accent)',
                                border: `1px solid ${u.is_approved ? 'var(--primary)' : 'var(--accent)'}`
                              }}>
                                {u.is_approved ? 'APPROVED' : 'PENDING'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {!u.is_manager && !u.is_approved && (
                              <button 
                                className="btn btn-primary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                onClick={() => handleApproveUser(u.id)}
                              >
                                APPROVE
                              </button>
                            )}
                            {!u.is_manager && (
                              <button 
                                className="btn" 
                                style={{ 
                                  padding: '0.4rem 0.8rem', 
                                  fontSize: '0.8rem', 
                                  background: 'rgba(239, 68, 68, 0.1)', 
                                  color: '#ef4444', 
                                  border: '1px solid #ef4444' 
                                }}
                                onClick={() => handleDeleteUser(u.id)}
                              >
                                REMOVE
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {managerTab === 'finance' && (
            <div className="glass-card fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>Game History Management</h3>
              </div>

              {/* Table Filter Tabs */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                {['All tables', 'Pool Table 1', 'Pool Table 2', 'Pool Table 3', 'Royal Table', 'Legend Table'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setHistoryFilterTab(tab)}
                    className={`btn ${historyFilterTab === tab ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderColor: historyFilterTab === tab ? 'transparent' : 'rgba(255,255,255,0.2)', color: historyFilterTab === tab ? '#000' : '#fff' }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Table</th>
                      <th>Paid By</th>
                      <th>Time & Duration</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions
                      .filter(tx => tx.description.includes('Game session') || tx.description.includes('Recorded game'))
                      .map(tx => {
                        const isRecorded = tx.description.includes('Recorded game');
                        let tableName = '--';
                        let paidBy = '--';
                        let durationSecs = tx.duration || 0;

                        if (isRecorded) {
                           const match = tx.description.match(/Recorded game on (.*?) for (.*?) \(/);
                           if (match) {
                             tableName = match[1];
                             paidBy = match[2];
                           }
                        } else {
                           const match = tx.description.match(/Game session on (.*?) for/);
                           if (match) tableName = match[1];
                           if (tx.description.includes('- Paid by: ')) {
                             paidBy = tx.description.split('- Paid by: ')[1].trim();
                           }
                        }
                        return { ...tx, tableName, paidBy, durationSecs };
                      })
                      .filter(tx => {
                        if (historyFilterTab === 'All tables') return true;
                        let dbName = historyFilterTab;
                        if (historyFilterTab === 'Royal Table') dbName = 'Royal';
                        if (historyFilterTab === 'Legend Table') dbName = 'Legend';
                        if (historyFilterTab === 'Pool Table 1') dbName = 'Pool 1';
                        if (historyFilterTab === 'Pool Table 2') dbName = 'Pool 2';
                        if (historyFilterTab === 'Pool Table 3') dbName = 'Pool 3';
                        return tx.tableName === dbName;
                      })
                      .map(tx => {
                        // Time Window calculation
                        const endTime = new Date(tx.timestamp);
                        const startTime = new Date(endTime.getTime() - (tx.durationSecs * 1000));
                        const formatTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                        const timeStr = `${formatTime(startTime)} - ${formatTime(endTime)}`;
                        const durationStr = `${Math.floor(tx.durationSecs/60)}m ${tx.durationSecs%60}s`;

                        return (
                          <tr key={tx.id}>
                            <td style={{ color: 'var(--text-muted)' }}>#{tx.id}</td>
                            <td style={{ fontWeight: 800, color: '#fff' }}>{tx.tableName}</td>
                            <td style={{ opacity: tx.paidBy !== '--' ? 1 : 0.5 }}>{tx.paidBy}</td>
                            <td>
                              <div style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{durationStr}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{timeStr}</div>
                              <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{endTime.toLocaleDateString()}</div>
                            </td>
                            <td style={{ color: 'var(--primary)', fontWeight: 900, fontSize: '1.1rem' }}>₹{tx.amount}</td>
                            <td>
                              <select 
                                value={tx.payment_status}
                                onChange={async (e) => {
                                  try {
                                    await updatePaymentStatus(tx.id, e.target.value);
                                    loadTransactions();
                                  } catch (err) {
                                    console.error("Failed to update payment status", err);
                                  }
                                }}
                                style={{
                                  background: tx.payment_status === 'PAID' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 71, 71, 0.1)',
                                  color: tx.payment_status === 'PAID' ? 'var(--primary)' : '#ff4747',
                                  border: `1px solid ${tx.payment_status === 'PAID' ? 'var(--primary)' : '#ff4747'}`,
                                  borderRadius: '20px',
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  outline: 'none',
                                  width: '100px',
                                  textAlign: 'center'
                                }}
                              >
                                <option value="UNPAID" style={{ background: '#0f172a', color: '#ff4747' }}>UNPAID</option>
                                <option value="PAID" style={{ background: '#0f172a', color: 'var(--primary)' }}>PAID</option>
                              </select>
                            </td>
                            <td>
                              <button 
                                onClick={() => handleDeleteTransaction(tx.id)} 
                                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', padding: '0.4rem 0.6rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                title="Delete Record"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            </td>
                          </tr>
                        );
                    })}
                    {transactions.filter(tx => tx.description.includes('Game session') || tx.description.includes('Recorded game')).filter(tx => {
                        const match = tx.description.match(/(Game session|Recorded game) on (.*?) for/);
                        const tName = match ? match[2] : '--';
                        if (historyFilterTab === 'All tables') return true;
                        let dbName = historyFilterTab;
                        if (historyFilterTab === 'Royal Table') dbName = 'Royal';
                        if (historyFilterTab === 'Legend Table') dbName = 'Legend';
                        if (historyFilterTab === 'Pool Table 1') dbName = 'Pool 1';
                        if (historyFilterTab === 'Pool Table 2') dbName = 'Pool 2';
                        if (historyFilterTab === 'Pool Table 3') dbName = 'Pool 3';
                        return tName === dbName;
                    }).length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No records found for {historyFilterTab}.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {managerTab === 'analytics' && (
            <div className="fade-in">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
                <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 7, 10, 0.8) 100%)' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>REVENUE TODAY</p>
                  <h2 style={{ fontSize: '3rem', margin: '1rem 0' }}>₹{stats.today_revenue}</h2>
                  <div style={{ color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 800 }}>+12% vs yesterday</div>
                </div>
                <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(5, 7, 10, 0.8) 100%)' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>MONTHLY EARNINGS</p>
                  <h2 style={{ fontSize: '3rem', margin: '1rem 0' }}>₹{stats.month_revenue}</h2>
                  <div style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 800 }}>On track for target</div>
                </div>
              </div>

              <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                <div className="glass-card" style={{ padding: '2.5rem' }}>
                  <h3 style={{ marginBottom: '2rem', color: 'var(--accent)' }}>7-Day Revenue Trend</h3>
                  <div style={{ display: 'flex', alignItems: 'flex-end', height: '250px', gap: '1rem', paddingBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    {stats.daily_stats.map(d => {
                      const max = Math.max(...stats.daily_stats.map(s => s.revenue), 1)
                      const height = (d.revenue / max) * 100
                      return (
                        <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 800 }}>₹{Math.round(d.revenue)}</div>
                          <div style={{ 
                            width: '100%', 
                            height: `${height}%`, 
                            background: 'var(--primary)', 
                            borderRadius: '8px 8px 2px 2px',
                            minHeight: '4px',
                            transition: 'height 1s ease-out'
                          }}></div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>{d.date}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '2.5rem' }}>
                  <h3 style={{ marginBottom: '2rem', color: 'var(--accent)' }}>Top Tables</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {stats.tables_perf.sort((a,b) => b.revenue - a.revenue).map((t, idx) => {
                      const max = Math.max(...stats.tables_perf.map(s => s.revenue), 1)
                      const width = (t.revenue / max) * 100
                      return (
                        <div key={t.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                            <span style={{ fontWeight: 800 }}>{t.name}</span>
                            <span style={{ color: 'var(--primary)' }}>₹{Math.round(t.revenue)}</span>
                          </div>
                          <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${width}%`, height: '100%', background: idx === 0 ? 'var(--accent)' : 'var(--primary)', borderRadius: '4px' }}></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
          {managerTab === 'notices' && (
            <div className="fade-in">
              <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                <div className="glass-card">
                  <h3 style={{ color: 'var(--accent)', marginBottom: '1.5rem' }}>Post New Notice</h3>
                  <form onSubmit={handleAddAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input 
                      className="form-input" 
                      placeholder="Title" 
                      value={newAnn.title} 
                      onChange={e => setNewAnn({...newAnn, title: e.target.value})} 
                      required 
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '12px', color: '#fff' }}
                    />
                    <select 
                      value={newAnn.ann_type} 
                      onChange={e => setNewAnn({...newAnn, ann_type: e.target.value})}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '12px', color: '#fff' }}
                    >
                      <option value="NEWS">Club News</option>
                      <option value="RULE">Club Rules</option>
                      <option value="EVENT">Tournament/Event</option>
                    </select>
                    <textarea 
                      className="form-input" 
                      placeholder="Content..." 
                      rows="5"
                      value={newAnn.content} 
                      onChange={e => setNewAnn({...newAnn, content: e.target.value})} 
                      required 
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: '12px', color: '#fff', resize: 'none' }}
                    />
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>PUBLISH NOTICE</button>
                  </form>
                </div>

                <div className="glass-card">
                  <h3 style={{ color: 'var(--accent)', marginBottom: '1.5rem' }}>Active Notices</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {announcements.map(ann => (
                      <div key={ann.id} style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span className="status-badge" style={{ background: ann.ann_type === 'RULE' ? 'rgba(255,71,71,0.1)' : 'rgba(16, 185, 129, 0.1)', color: ann.ann_type === 'RULE' ? '#ff4747' : 'var(--primary)', marginBottom: '0.5rem', display: 'inline-block' }}>
                              {ann.ann_type}
                            </span>
                            <h4 style={{ fontSize: '1.1rem', margin: '0.25rem 0' }}>{ann.title}</h4>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{ann.content}</p>
                            <small style={{ opacity: 0.5, fontSize: '0.7rem' }}>{new Date(ann.created_at).toLocaleDateString()}</small>
                          </div>
                          <button onClick={() => handleDeleteAnnouncement(ann.id)} style={{ background: 'none', border: 'none', color: '#ff4747', cursor: 'pointer' }}>
                            <i className="ri-delete-bin-line"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                    {announcements.length === 0 && <p style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>No notices published yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      ) : (
        <div style={{ width: '100%' }}>
          {/* Member Sub-Nav */}
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '2.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
            <button 
              onClick={() => setMemberSubView('arena')}
              style={{
                background: 'none',
                border: 'none',
                color: memberSubView === 'arena' ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: '1.1rem',
                fontWeight: 800,
                cursor: 'pointer',
                position: 'relative',
                padding: '0 0.5rem'
              }}
            >
              TABLE ARENA
              {memberSubView === 'arena' && <div style={{ position: 'absolute', bottom: '-1.1rem', left: 0, width: '100%', height: '3px', background: 'var(--primary)', borderRadius: '2px' }}></div>}
            </button>
            <button 
              onClick={() => setMemberSubView('schedule')}
              style={{
                background: 'none',
                border: 'none',
                color: memberSubView === 'schedule' ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: '1.1rem',
                fontWeight: 800,
                cursor: 'pointer',
                position: 'relative',
                padding: '0 0.5rem'
              }}
            >
              MY SCHEDULE
              {memberSubView === 'schedule' && <div style={{ position: 'absolute', bottom: '-1.1rem', left: 0, width: '100%', height: '3px', background: 'var(--primary)', borderRadius: '2px' }}></div>}
            </button>
            <button 
              onClick={() => setMemberSubView('notices')}
              style={{
                background: 'none',
                border: 'none',
                color: memberSubView === 'notices' ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: '1.1rem',
                fontWeight: 800,
                cursor: 'pointer',
                position: 'relative',
                padding: '0 0.5rem'
              }}
            >
              CLUB NOTICES
              {memberSubView === 'notices' && <div style={{ position: 'absolute', bottom: '-1.1rem', left: 0, width: '100%', height: '3px', background: 'var(--primary)', borderRadius: '2px' }}></div>}
            </button>
          </div>

          {memberSubView === 'arena' ? (
            <div className="fade-in">
              <h3 style={{ marginBottom: '2rem', color: 'var(--accent)', fontSize: '1.5rem', letterSpacing: '0.05em' }}>AVAILABLE TABLES</h3>
              {renderTableGrid()}
            </div>
          ) : memberSubView === 'schedule' ? (
            <div className="fade-in responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
              {/* My Reservations Section */}
              <div className="glass-card fade-in" style={{ padding: '2.5rem', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                  <h3 style={{ color: 'var(--accent)', fontSize: '1.6rem' }}>My Reservations</h3>
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', padding: '0.5rem 1rem', borderRadius: '30px', fontSize: '0.8rem', fontWeight: 800 }}>
                    {myBookings.length} ACTIVE
                  </div>
                </div>
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>TABLE</th>
                        <th>SCHEDULED TIME</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myBookings.map(b => (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 800, color: '#fff' }}>{b.table_name}</td>
                          <td style={{ color: 'var(--accent)', fontWeight: 600 }}>
                            <div>{new Date(b.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                            {b.estimated_time && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Est: {b.estimated_time}</div>
                            )}
                          </td>
                          <td>
                            <span className="status-badge" style={{ 
                              background: b.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(212, 175, 55, 0.1)',
                              color: b.status === 'APPROVED' ? 'var(--primary)' : 'var(--accent)',
                              border: `1px solid ${b.status === 'APPROVED' ? 'var(--primary)' : 'var(--accent)'}`,
                              fontSize: '0.7rem'
                            }}>
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {myBookings.length === 0 && (
                        <tr>
                          <td colSpan="3" style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
                            <i className="ri-calendar-line" style={{ fontSize: '3rem', opacity: 0.2, display: 'block', marginBottom: '1rem' }}></i>
                            No active reservations.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Club Schedule Section */}
              <div className="glass-card fade-in" style={{ padding: '2.5rem', background: 'rgba(212, 175, 55, 0.02)', border: '1px solid rgba(212, 175, 55, 0.1)' }}>
                <h3 style={{ color: 'var(--accent)', fontSize: '1.6rem', marginBottom: '2.5rem' }}>Club Schedule (Today)</h3>
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>TIME</th>
                        <th>TABLE</th>
                        <th>MEMBER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedBookings.map(b => (
                        <tr key={b.id}>
                          <td style={{ color: 'var(--accent)', fontWeight: 800 }}>
                            <div>{new Date(b.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                            {b.estimated_time && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>Est: {b.estimated_time}</div>
                            )}
                          </td>
                          <td style={{ color: '#fff', fontWeight: 600 }}>{b.table_name}</td>
                          <td style={{ opacity: 0.7 }}>{b.user_name}</td>
                        </tr>
                      ))}
                      {approvedBookings.length === 0 && (
                        <tr>
                          <td colSpan="3" style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
                            No other bookings scheduled for today.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="fade-in">
              <h3 style={{ marginBottom: '2rem', color: 'var(--accent)', fontSize: '1.5rem', letterSpacing: '0.05em' }}>CLUB NOTICES & RULES</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2rem' }}>
                {announcements.map(ann => (
                  <div key={ann.id} className="glass-card" style={{ 
                    padding: '2.5rem', 
                    borderLeft: `6px solid ${ann.ann_type === 'RULE' ? '#ff4747' : ann.ann_type === 'EVENT' ? 'var(--accent)' : 'var(--primary)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ 
                        fontSize: '0.8rem', 
                        fontWeight: 900, 
                        color: ann.ann_type === 'RULE' ? '#ff4747' : 'var(--primary)',
                        letterSpacing: '0.1em'
                      }}>
                        {ann.ann_type === 'EVENT' ? '🏆 TOURNAMENT' : ann.ann_type === 'RULE' ? '⚠️ CLUB RULE' : '📢 CLUB NEWS'}
                      </span>
                      <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>{new Date(ann.created_at).toLocaleDateString()}</span>
                    </div>
                    <h4 style={{ fontSize: '1.5rem', color: '#fff' }}>{ann.title}</h4>
                    <p style={{ fontSize: '1rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>{ann.content}</p>
                    {ann.ann_type === 'EVENT' && (
                      <button className="btn btn-primary" style={{ marginTop: '1rem', width: 'fit-content' }}>REGISTER NOW</button>
                    )}
                  </div>
                ))}
                {announcements.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '20px' }}>
                    <i className="ri-notification-off-line" style={{ fontSize: '4rem', color: 'var(--text-muted)', display: 'block', marginBottom: '1rem' }}></i>
                    <p style={{ color: 'var(--text-muted)' }}>No new announcements at the moment.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="App">
      <motion.div 
        className="video-bg-container"
        style={{ y }}
      >
        <canvas 
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
        <div className="video-overlay"></div>
      </motion.div>

      <nav className="navbar glass">
        <div className="logo" onClick={() => setView('home')} style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
          <img src="/logo.jpg" alt="Dugout Logo" style={{ height: '50px', borderRadius: '8px' }} />
          <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--accent)' }}>THE DUGOUT</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {user && !user.is_manager && (
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => {
              setShowNotifs(!showNotifs);
              setHasUnread(false);
            }}>
              <span style={{ fontSize: '1.5rem' }}>🔔</span>
              {hasUnread && <div className="pulse-badge"></div>}
            </div>
          )}
          {view !== 'login' && !user && (
            <button className="btn btn-outline" onClick={() => setView('login')}>Login</button>
          )}
          {user && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {view === 'dashboard' ? (
                <button className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }} onClick={() => setView('home')}>
                  <i className="ri-home-line" style={{ marginRight: '0.5rem' }}></i> Home
                </button>
              ) : (
                <button className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }} onClick={() => setView('dashboard')}>
                  <i className="ri-dashboard-line" style={{ marginRight: '0.5rem' }}></i> Dashboard
                </button>
              )}

              <div style={{ position: 'relative' }}>
                <button 
                  className="glass-card" 
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '0.75rem', 
                    padding: '0.4rem 1rem', paddingRight: '0.6rem', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    color: '#fff', background: 'rgba(255,255,255,0.05)',
                    borderRadius: '30px', cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: 'none'
                  }}
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                >
                  <div style={{ background: 'var(--primary)', color: '#000', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600, letterSpacing: '0.02em', fontSize: '0.95rem' }}>{user.username}</span>
                  <i className={`ri-arrow-${profileMenuOpen ? 'up' : 'down'}-s-line`} style={{ fontSize: '1rem', opacity: 0.5 }}></i>
                </button>
                
                {profileMenuOpen && (
                  <div className="glass-card fade-in" style={{ 
                    position: 'absolute', 
                    top: '120%', 
                    right: 0, 
                    width: '180px', 
                    padding: '0.5rem', 
                    zIndex: 10000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }}>
                    <button className="btn" style={{ background: 'transparent', color: '#ef4444', textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.9rem' }} onClick={() => { 
                      setUser(null); 
                      localStorage.removeItem('dugout_user'); 
                      setMemberSubView('arena');
                      setManagerTab('overview');
                      setView('home'); 
                      setProfileMenuOpen(false);
                    }}>
                      <i className="ri-logout-box-r-line" style={{ marginRight: '0.5rem' }}></i> Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {showNotifs && (
        <div className="glass-card fade-in" style={{ position: 'fixed', top: '80px', right: '2rem', width: '320px', zIndex: 3000, padding: '1rem', background: '#1e293b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
            <h4 style={{ color: 'var(--accent)' }}>Notifications</h4>
            <button onClick={() => setShowNotifs(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>Close</button>
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No new notifications</p>
            ) : (
              notifications.map(n => (
                <div key={n.id} style={{ padding: '0.75rem', borderBottom: '1px solid #334155', fontSize: '0.85rem' }}>
                  <p style={{ color: '#f8fafc', marginBottom: '0.25rem' }}>{n.msg}</p>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{new Date(n.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                </div>
              ))
            )}
          </div>
          {notifications.length > 0 && (
            <button 
              onClick={() => {
                setNotifications([]);
                localStorage.setItem(`dugout_notifications_${user.id}`, JSON.stringify([]));
              }} 
              style={{ width: '100%', marginTop: '1rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Clear All
            </button>
          )}
        </div>
      )}

      <main className="container">
        {view === 'home' && renderHome()}
        {view === 'login' && renderLogin()}
        {view === 'dashboard' && renderDashboard()}
      </main>

      {bookingModal.open && (
        <div className="modal-overlay">
          <div className="glass-card fade-in" style={{ maxWidth: '450px', width: '90%', padding: '2.5rem', position: 'relative', background: '#0f172a', border: '1px solid var(--accent)' }}>
            <button 
              onClick={() => setBookingModal({ open: false, table: null, date: '', time: '', estimatedTime: '30-40 mins', success: false })}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}
            >
              &times;
            </button>
            
            {bookingModal.success ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <div style={{ fontSize: '4rem', color: 'var(--primary)', marginBottom: '1.5rem' }}>
                  <i className="ri-checkbox-circle-line"></i>
                </div>
                <h3 style={{ color: '#fff', marginBottom: '1rem' }}>Request Sent!</h3>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '2rem' }}>
                  Booking request for <strong>{bookingModal.table?.name}</strong> sent! <br />
                  Wait for manager approval.
                </p>
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '1rem' }}
                  onClick={() => setBookingModal({ open: false, table: null, date: '', time: '', estimatedTime: '30-40 mins', success: false })}
                >
                  GOT IT
                </button>
              </div>
            ) : (
              <>
                <h2 style={{ marginBottom: '1.5rem', color: 'var(--accent)', textAlign: 'center' }}>Schedule {bookingModal.table?.name}</h2>
                <form onSubmit={handleBook}>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 600 }}>Booking Date</label>
                    <input 
                      type="date" 
                      className="glass-card"
                      style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '12px', border: '1px solid var(--glass-border)', fontSize: '1.1rem' }}
                      value={bookingModal.date}
                      onChange={(e) => setBookingModal({ ...bookingModal, date: e.target.value })}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 600 }}>Booking Time</label>
                    <input 
                      type="time" 
                      className="glass-card"
                      style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '12px', border: '1px solid var(--glass-border)', fontSize: '1.1rem' }}
                      value={bookingModal.time}
                      onChange={(e) => setBookingModal({ ...bookingModal, time: e.target.value })}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 600 }}>Estimate playing time</label>
                    <select 
                      className="glass-card"
                      style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '12px', border: '1px solid var(--glass-border)', appearance: 'none', fontSize: '1.1rem' }}
                      value={bookingModal.estimatedTime}
                      onChange={(e) => setBookingModal({ ...bookingModal, estimatedTime: e.target.value })}
                      required
                    >
                      <option value="10-20 mins" style={{ background: '#0f172a' }}>10-20 mins</option>
                      <option value="30-40 mins" style={{ background: '#0f172a' }}>30-40 mins</option>
                      <option value="More than 1 hr" style={{ background: '#0f172a' }}>More than 1 hr</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1.25rem', fontSize: '1.1rem', fontWeight: '800' }}>
                    CONFIRM RESERVATION
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {gameResultModal.open && gameResultModal.data && (
        <div className="modal-overlay">
          <div className="glass-card fade-in" style={{ 
            maxWidth: '400px', 
            width: '90%', 
            padding: '2.5rem', 
            position: 'relative', 
            background: 'linear-gradient(180deg, #0f172a 0%, #05070a 100%)', 
            border: '2px solid var(--accent)',
            textAlign: 'center'
          }}>
            <div style={{ 
              width: '80px', 
              height: '80px', 
              background: 'var(--gold-gradient)', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 1.5rem',
              boxShadow: '0 0 20px rgba(212, 175, 55, 0.4)'
            }}>
              <i className="ri-trophy-fill" style={{ fontSize: '2.5rem', color: '#fff' }}></i>
            </div>
            
            <h2 className="gradient-text" style={{ marginBottom: '0.5rem' }}>Game Finished!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{gameResultModal.data.tableName}</p>
            
            <div style={{ 
              background: 'rgba(255,255,255,0.03)', 
              borderRadius: '16px', 
              padding: '1.5rem', 
              marginBottom: '2rem',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Duration</span>
                <span style={{ fontWeight: 800 }}>
                  {Math.floor(gameResultModal.data.total_seconds / 60)}m {gameResultModal.data.total_seconds % 60}s
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Amount</span>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--primary)' }}>
                  ₹{gameResultModal.data.amount}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '2rem', textAlign: 'left' }}>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>User who has to pay</label>
              <input 
                type="text" 
                className="glass-card"
                style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '12px', border: '1px solid var(--glass-border)' }}
                value={gameResultModal.userName}
                onChange={(e) => setGameResultModal({ ...gameResultModal, userName: e.target.value })}
                placeholder="Enter name (optional)"
              />
            </div>
            
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '1.25rem', fontSize: '1.1rem', fontWeight: '800' }}
              onClick={async () => {
                if (gameResultModal.userName && gameResultModal.data.transaction_id) {
                  try {
                    await updateTransactionName(gameResultModal.data.transaction_id, gameResultModal.userName);
                    if (user?.is_manager) {
                      loadTransactions();
                    }
                  } catch (e) {
                    console.error("Failed to update transaction name", e);
                  }
                }
                setGameResultModal({ open: false, data: null, userName: '' });
              }}
            >
              AMOUNT RECEIVED
            </button>
          </div>
        </div>
      )}

      <footer style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        &copy; 2026 Dugout Snooker Club. Managed Effortlessly.
      </footer>
      {activeAlert && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="glass-card fade-in" style={{ 
            maxWidth: '500px', 
            width: '90%', 
            padding: '2.5rem', 
            textAlign: 'center', 
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            border: '2px solid var(--accent)',
            boxShadow: '0 0 50px rgba(212, 175, 55, 0.3)'
          }}>
            <div style={{ fontSize: '3rem', color: 'var(--accent)', marginBottom: '1rem' }}>
              <i className="ri-alarm-warning-line"></i>
            </div>
            <h2 style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>Reservation Arrival!</h2>
            <p style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '1.5rem' }}>
              <strong>{activeAlert.userInfo?.username || 'Customer'}</strong> has a booking for <strong>{activeAlert.table_name}</strong>
            </p>
            
            <div className="glass-card" style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', marginBottom: '2rem', textAlign: 'left' }}>
              <p style={{ marginBottom: '0.5rem' }}><i className="ri-user-line" style={{ color: 'var(--accent)', marginRight: '0.5rem' }}></i> {activeAlert.userInfo?.username}</p>
              <p style={{ marginBottom: '0.5rem' }}><i className="ri-mail-line" style={{ color: 'var(--accent)', marginRight: '0.5rem' }}></i> {activeAlert.userInfo?.email || 'N/A'}</p>
              <p style={{ marginBottom: '0.5rem' }}><i className="ri-phone-line" style={{ color: 'var(--accent)', marginRight: '0.5rem' }}></i> {activeAlert.userInfo?.phone_number || 'N/A'}</p>
              <p><i className="ri-time-line" style={{ color: 'var(--accent)', marginRight: '0.5rem' }}></i> {new Date(activeAlert.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                className="btn btn-outline" 
                style={{ flex: 1 }}
                onClick={() => setActiveAlert(null)}
              >
                DISMISS
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 2 }}
                onClick={() => {
                  setManagerTab('overview')
                  setActiveAlert(null)
                }}
              >
                GO TO TABLES
              </button>
            </div>
          </div>
        </div>
      )}
      {showPendingModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="glass-card fade-in" style={{ 
            maxWidth: '500px', 
            width: '95%', 
            padding: '3rem', 
            textAlign: 'center', 
            background: 'linear-gradient(135deg, #0f172a 0%, #05070a 100%)',
            border: '2px solid var(--accent)',
            boxShadow: '0 0 50px rgba(212, 175, 55, 0.2)'
          }}>
            <div style={{ fontSize: '4rem', color: 'var(--accent)', marginBottom: '1.5rem' }}>
              <i className="ri-shield-user-line"></i>
            </div>
            <h2 style={{ color: 'var(--accent)', marginBottom: '1rem', fontSize: '2rem' }}>Verification Pending</h2>
            <p style={{ color: '#cbd5e1', fontSize: '1.1rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
              Welcome to the Dugout! Your account is currently being reviewed by our team. <br/><br/>
              Only <strong>verified members</strong> can access the reservation system. We usually approve accounts within a few hours.
            </p>
            
            <div className="glass-card" style={{ background: 'rgba(212, 175, 55, 0.05)', border: '1px solid rgba(212, 175, 55, 0.2)', marginBottom: '2.5rem', padding: '1rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--accent)' }}>
                Need urgent access? Contact us:
                <strong style={{ display: 'block', fontSize: '1.2rem', marginTop: '0.5rem' }}>+91 85030 01200</strong>
              </p>
            </div>

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '1.25rem', fontSize: '1.1rem', fontWeight: 800 }}
              onClick={() => setShowPendingModal(false)}
            >
              UNDERSTOOD
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fade-in" style={{ 
          position: 'fixed', 
          bottom: '2rem', 
          right: '2rem', 
          zIndex: 9999, 
          background: toast.type === 'success' ? 'var(--primary)' : '#ff4747',
          color: '#000',
          padding: '1rem 2rem',
          borderRadius: '12px',
          fontWeight: '800',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <i className={toast.type === 'success' ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'}></i>
          {toast.msg}
        </div>
      )}
      {errorModal.show && (
        <div className="modal-overlay" style={{ zIndex: 11000 }}>
          <div className="glass-card fade-in" style={{ 
            maxWidth: '450px', 
            width: '90%', 
            padding: '2.5rem', 
            textAlign: 'center', 
            background: '#0f172a',
            border: `2px solid ${errorModal.type === 'error' ? '#ff4747' : errorModal.type === 'success' ? 'var(--primary)' : 'var(--accent)'}`,
            boxShadow: `0 0 40px ${errorModal.type === 'error' ? 'rgba(255, 71, 71, 0.2)' : 'rgba(212, 175, 55, 0.2)'}`
          }}>
            <div style={{ 
              fontSize: '3.5rem', 
              color: errorModal.type === 'error' ? '#ff4747' : errorModal.type === 'success' ? 'var(--primary)' : 'var(--accent)', 
              marginBottom: '1rem' 
            }}>
              <i className={
                errorModal.type === 'error' ? 'ri-error-warning-line' : 
                errorModal.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-information-line'
              }></i>
            </div>
            <h3 style={{ marginBottom: '0.75rem' }}>{errorModal.title}</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '2rem' }}>
              {errorModal.message}
            </p>
            <button 
              className="btn btn-primary" 
              style={{ 
                width: '100%', 
                padding: '1rem', 
                background: errorModal.type === 'error' ? '#ff4747' : 'var(--primary)',
                color: errorModal.type === 'error' ? '#fff' : '#000'
              }}
              onClick={() => setErrorModal({ ...errorModal, show: false })}
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
      {conflictModal.open && (
        <div className="modal-overlay" style={{ zIndex: 12000 }}>
          <div className="glass-card fade-in" style={{ 
            maxWidth: '450px', 
            width: '90%', 
            padding: '2.5rem', 
            textAlign: 'center', 
            background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
            border: '2px solid var(--accent)',
            boxShadow: '0 0 50px rgba(212, 175, 55, 0.2)'
          }}>
            <div style={{ fontSize: '3.5rem', color: 'var(--accent)', marginBottom: '1rem' }}>
              <i className="ri-calendar-check-line"></i>
            </div>
            <h2 style={{ color: 'var(--accent)', marginBottom: '1rem' }}>Reservation Conflict</h2>
            <p style={{ color: '#fff', fontSize: '1.1rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
              {conflictModal.msg} <br/><br/>
              <strong>Do you want to start a new game anyway?</strong>
            </p>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                className="btn btn-outline" 
                style={{ flex: 1, padding: '1rem' }}
                onClick={() => setConflictModal({ open: false, msg: '', onConfirm: null })}
              >
                CANCEL
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1.5, padding: '1rem', background: 'var(--accent)', color: '#000' }}
                onClick={conflictModal.onConfirm}
              >
                START ANYWAY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
