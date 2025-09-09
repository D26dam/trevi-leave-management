// server.js - Main Express Server
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/leave_management',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDF, and Word documents are allowed.'));
    }
  }
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Role-based authorization middleware
const authorize = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Database initialization
async function initDatabase() {
  try {
    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        role VARCHAR(20) CHECK (role IN ('employee', 'manager', 'hr', 'admin')) DEFAULT 'employee',
        department_id INTEGER REFERENCES departments(id),
        manager_id INTEGER REFERENCES employees(id),
        hire_date DATE NOT NULL,
        annual_leave_entitlement INTEGER DEFAULT 21,
        sick_leave_entitlement INTEGER DEFAULT 10,
        emergency_leave_entitlement INTEGER DEFAULT 5,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        max_days INTEGER,
        requires_approval BOOLEAN DEFAULT TRUE,
        requires_document BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) NOT NULL,
        leave_type_id INTEGER REFERENCES leave_types(id) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        duration VARCHAR(20) CHECK (duration IN ('full-day', 'half-day-morning', 'half-day-afternoon')) DEFAULT 'full-day',
        total_days DECIMAL(3,1) NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(20) CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')) DEFAULT 'pending',
        applied_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_by INTEGER REFERENCES employees(id),
        approved_date TIMESTAMP,
        rejection_reason TEXT,
        supporting_document VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) NOT NULL,
        leave_type_id INTEGER REFERENCES leave_types(id) NOT NULL,
        allocated_days INTEGER NOT NULL,
        used_days DECIMAL(3,1) DEFAULT 0,
        remaining_days DECIMAL(3,1) NOT NULL,
        year INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, leave_type_id, year)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        is_recurring BOOLEAN DEFAULT FALSE,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES employees(id),
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(50) NOT NULL,
        resource_id INTEGER,
        details JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default data
    await insertDefaultData();
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Insert default data
async function insertDefaultData() {
  try {
    // Insert departments
    const deptResult = await pool.query(`
      INSERT INTO departments (name) VALUES 
      ('Engineering'), ('HR'), ('Operations'), ('Finance'), ('Marketing')
      ON CONFLICT (name) DO NOTHING
      RETURNING id, name;
    `);

    // Insert leave types
    await pool.query(`
      INSERT INTO leave_types (name, description, max_days, requires_document) VALUES 
      ('Annual Leave', 'Yearly vacation leave', 21, false),
      ('Sick Leave', 'Medical leave', 10, true),
      ('Emergency Leave', 'Urgent personal matters', 5, false),
      ('Maternity Leave', 'Maternity leave for new mothers', 90, true),
      ('Paternity Leave', 'Paternity leave for new fathers', 10, true),
      ('Bereavement Leave', 'Leave for family bereavement', 3, false)
      ON CONFLICT (name) DO NOTHING;
    `);

    // Insert holidays
    const currentYear = new Date().getFullYear();
    await pool.query(`
      INSERT INTO holidays (name, date, is_recurring, description) VALUES 
      ('New Year Day', $1, true, 'New Year celebration'),
      ('Independence Day', $2, true, 'Nigeria Independence Day'),
      ('Christmas Day', $3, true, 'Christmas celebration'),
      ('Boxing Day', $4, true, 'Boxing Day'),
      ('Workers Day', $5, true, 'International Workers Day')
      ON CONFLICT DO NOTHING;
    `, [
      `${currentYear}-01-01`,
      `${currentYear}-10-01`,
      `${currentYear}-12-25`,
      `${currentYear}-12-26`,
      `${currentYear}-05-01`
    ]);

    // Insert default admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO employees (
        employee_id, email, password, first_name, last_name, 
        role, department_id, hire_date
      ) VALUES (
        'EMP001', 'admin@trevi.com', $1, 'System', 'Admin', 
        'admin', 1, CURRENT_DATE
      ) ON CONFLICT (email) DO NOTHING;
    `, [hashedPassword]);

  } catch (error) {
    console.error('Error inserting default data:', error);
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Authentication Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(`
      SELECT e.*, d.name as department_name 
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id 
      WHERE e.email = $1 AND e.is_active = true
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        employee_id: user.employee_id
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Log authentication
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
      VALUES ($1, 'LOGIN', 'auth', $2, $3)
    `, [user.id, req.ip, req.get('User-Agent')]);

    res.json({
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        department: user.department_name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    // Log logout
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
      VALUES ($1, 'LOGOUT', 'auth', $2, $3)
    `, [req.user.id, req.ip, req.get('User-Agent')]);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Employee Routes
app.get('/api/employees/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, d.name as department_name,
             m.first_name || ' ' || m.last_name as manager_name
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id 
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = result.rows[0];
    delete employee.password; // Don't send password

    res.json(employee);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/employees', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
  try {
    const { page = 1, limit = 10, department, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT e.id, e.employee_id, e.email, e.first_name, e.last_name, 
             e.role, e.hire_date, e.is_active, d.name as department_name,
             m.first_name || ' ' || m.last_name as manager_name
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id 
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (department) {
      paramCount++;
      query += ` AND e.department_id = $${paramCount}`;
      params.push(department);
    }

    if (search) {
      paramCount++;
      query += ` AND (e.first_name ILIKE $${paramCount} OR e.last_name ILIKE $${paramCount} OR e.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY e.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM employees e WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;

    if (department) {
      countParamCount++;
      countQuery += ` AND e.department_id = $${countParamCount}`;
      countParams.push(department);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (e.first_name ILIKE $${countParamCount} OR e.last_name ILIKE $${countParamCount} OR e.email ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      employees: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/employees', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
  try {
    const {
      employee_id, email, first_name, last_name, role, 
      department_id, manager_id, hire_date, 
      annual_leave_entitlement = 21,
      sick_leave_entitlement = 10,
      emergency_leave_entitlement = 5
    } = req.body;

    // Validate required fields
    if (!employee_id || !email || !first_name || !last_name || !hire_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const result = await pool.query(`
      INSERT INTO employees (
        employee_id, email, password, first_name, last_name, 
        role, department_id, manager_id, hire_date,
        annual_leave_entitlement, sick_leave_entitlement, emergency_leave_entitlement
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, employee_id, email, first_name, last_name, role, hire_date
    `, [
      employee_id, email, hashedPassword, first_name, last_name,
      role, department_id, manager_id, hire_date,
      annual_leave_entitlement, sick_leave_entitlement, emergency_leave_entitlement
    ]);

    const newEmployee = result.rows[0];

    // Initialize leave balances for the current year
    await initializeEmployeeLeaveBalances(newEmployee.id);

    // Log action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
      VALUES ($1, 'CREATE', 'employee', $2, $3)
    `, [req.user.id, newEmployee.id, JSON.stringify({ employee_id, email, role })]);

    res.status(201).json({
      employee: newEmployee,
      temporary_password: tempPassword
    });

  } catch (error) {
    console.error('Create employee error:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Employee ID or email already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Leave Request Routes
app.get('/api/leave-requests', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, employee_id, start_date, end_date } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT lr.*, e.first_name, e.last_name, e.employee_id as emp_id, d.name as department,
             lt.name as leave_type_name, 
             approver.first_name || ' ' || approver.last_name as approved_by_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN employees approver ON lr.approved_by = approver.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    // Role-based filtering
    if (req.user.role === 'employee') {
      paramCount++;
      query += ` AND lr.employee_id = $${paramCount}`;
      params.push(req.user.id);
    } else if (req.user.role === 'manager') {
      paramCount++;
      query += ` AND e.manager_id = $${paramCount}`;
      params.push(req.user.id);
    }

    if (status) {
      paramCount++;
      query += ` AND lr.status = $${paramCount}`;
      params.push(status);
    }

    if (employee_id) {
      paramCount++;
      query += ` AND lr.employee_id = $${paramCount}`;
      params.push(employee_id);
    }

    if (start_date) {
      paramCount++;
      query += ` AND lr.start_date >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND lr.end_date <= $${paramCount}`;
      params.push(end_date);
    }

    query += ` ORDER BY lr.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      leave_requests: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get leave requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/leave-requests', authenticateToken, upload.single('supporting_document'), async (req, res) => {
  try {
    const {
      leave_type_id, start_date, end_date, duration = 'full-day', reason
    } = req.body;

    if (!leave_type_id || !start_date || !end_date || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'Start date cannot be after end date' });
    }

    // Calculate total days
    const totalDays = calculateLeaveDays(startDate, endDate, duration);

    // Check leave balance
    const canApply = await checkLeaveBalance(req.user.id, leave_type_id, totalDays);
    if (!canApply) {
      return res.status(400).json({ error: 'Insufficient leave balance' });
    }

    // Check for overlapping requests
    const hasOverlap = await checkOverlappingLeave(req.user.id, start_date, end_date);
    if (hasOverlap) {
      return res.status(400).json({ error: 'You have overlapping leave requests' });
    }

    const supportingDocument = req.file ? req.file.filename : null;

    const result = await pool.query(`
      INSERT INTO leave_requests (
        employee_id, leave_type_id, start_date, end_date, 
        duration, total_days, reason, supporting_document
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      req.user.id, leave_type_id, start_date, end_date,
      duration, totalDays, reason, supportingDocument
    ]);

    // Log action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
      VALUES ($1, 'CREATE', 'leave_request', $2, $3)
    `, [req.user.id, result.rows[0].id, JSON.stringify({ leave_type_id, start_date, end_date, total_days: totalDays })]);

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Create leave request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/leave-requests/:id/approve', authenticateToken, authorize(['manager', 'hr', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const result = await pool.query(`
      UPDATE leave_requests 
      SET status = 'approved', approved_by = $1, approved_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `, [req.user.id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found or already processed' });
    }

    const leaveRequest = result.rows[0];

    // Update leave balance
    await updateLeaveBalance(leaveRequest.employee_id, leaveRequest.leave_type_id, leaveRequest.total_days);

    // Log action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
      VALUES ($1, 'APPROVE', 'leave_request', $2, $3)
    `, [req.user.id, id, JSON.stringify({ comments })]);

    res.json(leaveRequest);

  } catch (error) {
    console.error('Approve leave request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/leave-requests/:id/reject', authenticateToken, authorize(['manager', 'hr', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await pool.query(`
      UPDATE leave_requests 
      SET status = 'rejected', approved_by = $1, approved_date = CURRENT_TIMESTAMP,
          rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND status = 'pending'
      RETURNING *
    `, [req.user.id, rejection_reason, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found or already processed' });
    }

    // Log action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
      VALUES ($1, 'REJECT', 'leave_request', $2, $3)
    `, [req.user.id, id, JSON.stringify({ rejection_reason })]);

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Reject leave request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave Balance Routes
app.get('/api/leave-balances', authenticateToken, async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    
    const result = await pool.query(`
      SELECT lb.*, lt.name as leave_type_name, lt.description
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2
      ORDER BY lt.name
    `, [req.user.id, year]);

    res.json(result.rows);

  } catch (error) {
    console.error('Get leave balances error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dashboard Routes
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    
    // Get employee's stats
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM leave_requests WHERE employee_id = $1 AND EXTRACT(YEAR FROM applied_date) = $2) as total_requests,
        (SELECT COUNT(*) FROM leave_requests WHERE employee_id = $1 AND status = 'approved' AND EXTRACT(YEAR FROM applied_date) = $2) as approved_requests,
        (SELECT COUNT(*) FROM leave_requests WHERE employee_id = $1 AND status = 'pending' AND EXTRACT(YEAR FROM applied_date) = $2) as pending_requests,
        (SELECT COALESCE(SUM(total_days), 0) FROM leave_requests WHERE employee_id = $1 AND status = 'approved' AND EXTRACT(YEAR FROM start_date) = $2) as total_days_taken
    `, [req.user.id, currentYear]);

    // Get leave balances
    const balances = await pool.query(`
      SELECT lt.name, lb.allocated_days, lb.used_days, lb.remaining_days
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = $1 AND lb.year = $2
    `, [req.user.id, currentYear]);

    // Get recent requests
    const recentRequests = await pool.query(`
      SELECT lr.*, lt.name as leave_type_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = $1
      ORDER BY lr.created_at DESC
      LIMIT 5
    `, [req.user.id]);

    // Get upcoming holidays
    const holidays = await pool.query(`
      SELECT name, date, description
      FROM holidays
      WHERE date >= CURRENT_DATE AND is_active = true
      ORDER BY date
      LIMIT 5
    `);

    res.json({
      stats: stats.rows[0],
      balances: balances.rows,
      recent_requests: recentRequests.rows,
      upcoming_holidays: holidays.rows
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Utility Functions
// Utility Functions
function calculateLeaveDays(startDate, endDate, duration) {
  const timeDiff = endDate.getTime() - startDate.getTime();
  let days = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
  
  if (duration === 'half-day-morning' || duration === 'half-day-afternoon') {
    days = 0.5;
  }
  
  return days;
}

async function checkLeaveBalance(employeeId, leaveTypeId, requestedDays) {
  try {
    const result = await pool.query(`
      SELECT remaining_days 
      FROM leave_balances 
      WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3
    `, [employeeId, leaveTypeId, new Date().getFullYear()]);

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].remaining_days >= requestedDays;
  } catch (error) {
    console.error('Check leave balance error:', error);
    return false;
  }
}

async function checkOverlappingLeave(employeeId, startDate, endDate) {
  try {
    const result = await pool.query(`
      SELECT id FROM leave_requests 
      WHERE employee_id = $1 
        AND status IN ('pending', 'approved')
        AND (
          (start_date <= $2 AND end_date >= $2) OR
          (start_date <= $3 AND end_date >= $3) OR
          (start_date >= $2 AND end_date <= $3)
        )
    `, [employeeId, startDate, endDate]);

    return result.rows.length > 0;
  } catch (error) {
    console.error('Check overlapping leave error:', error);
    return true; // Err on the side of caution
  }
}

async function updateLeaveBalance(employeeId, leaveTypeId, usedDays) {
  try {
    await pool.query(`
      UPDATE leave_balances 
      SET used_days = used_days + $1, 
          remaining_days = remaining_days - $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4
    `, [usedDays, employeeId, leaveTypeId, new Date().getFullYear()]);
  } catch (error) {
    console.error('Update leave balance error:', error);
  }
}

async function initializeEmployeeLeaveBalances(employeeId) {
  try {
    const currentYear = new Date().getFullYear();
    
    // Get employee's entitlements
    const employee = await pool.query(`
      SELECT annual_leave_entitlement, sick_leave_entitlement, emergency_leave_entitlement
      FROM employees WHERE id = $1
    `, [employeeId]);

    if (employee.rows.length === 0) return;

    const entitlements = employee.rows[0];

    // Get leave types
    const leaveTypes = await pool.query(`
      SELECT id, name FROM leave_types WHERE is_active = true
    `);

    // Initialize balances
    for (const leaveType of leaveTypes.rows) {
      let allocatedDays = 0;
      
      switch (leaveType.name.toLowerCase()) {
        case 'annual leave':
          allocatedDays = entitlements.annual_leave_entitlement;
          break;
        case 'sick leave':
          allocatedDays = entitlements.sick_leave_entitlement;
          break;
        case 'emergency leave':
          allocatedDays = entitlements.emergency_leave_entitlement;
          break;
        default:
          allocatedDays = 0;
      }

      await pool.query(`
        INSERT INTO leave_balances (employee_id, leave_type_id, allocated_days, remaining_days, year)
        VALUES ($1, $2, $3, $3, $4)
        ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING
      `, [employeeId, leaveType.id, allocatedDays, currentYear]);
    }
  } catch (error) {
    console.error('Initialize leave balances error:', error);
  }
}

// Reports Routes
app.get('/api/reports/leave-summary', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
  try {
    const { start_date, end_date, department_id } = req.query;
    
    let query = `
      SELECT 
        d.name as department,
        lt.name as leave_type,
        COUNT(lr.id) as total_requests,
        COUNT(CASE WHEN lr.status = 'approved' THEN 1 END) as approved_requests,
        COUNT(CASE WHEN lr.status = 'pending' THEN 1 END) as pending_requests,
        COUNT(CASE WHEN lr.status = 'rejected' THEN 1 END) as rejected_requests,
        COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN lr.total_days END), 0) as total_days_approved
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (start_date) {
      paramCount++;
      query += ` AND lr.applied_date >= ${paramCount}`;
      params.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      query += ` AND lr.applied_date <= ${paramCount}`;
      params.push(end_date);
    }
    
    if (department_id) {
      paramCount++;
      query += ` AND e.department_id = ${paramCount}`;
      params.push(department_id);
    }
    
    query += `
      GROUP BY d.name, lt.name
      ORDER BY d.name, lt.name
    `;
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get leave summary report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/reports/employee-leave-history', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
  try {
    const { employee_id, year = new Date().getFullYear() } = req.query;
    
    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }
    
    const result = await pool.query(`
      SELECT 
        lr.*,
        lt.name as leave_type_name,
        approver.first_name || ' ' || approver.last_name as approved_by_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN employees approver ON lr.approved_by = approver.id
      WHERE lr.employee_id = $1 AND EXTRACT(YEAR FROM lr.applied_date) = $2
      ORDER BY lr.applied_date DESC
    `, [employee_id, year]);
    
    // Get employee info
    const employeeResult = await pool.query(`
      SELECT e.first_name, e.last_name, e.employee_id, d.name as department
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      WHERE e.id = $1
    `, [employee_id]);
    
    res.json({
      employee: employeeResult.rows[0],
      leave_history: result.rows
    });
  } catch (error) {
    console.error('Get employee leave history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Department Routes
app.get('/api/departments', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM departments ORDER BY name
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave Types Routes
app.get('/api/leave-types', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM leave_types WHERE is_active = true ORDER BY name
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get leave types error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Holidays Routes
app.get('/api/holidays', authenticateToken, async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    
    const result = await pool.query(`
      SELECT * FROM holidays 
      WHERE EXTRACT(YEAR FROM date) = $1 AND is_active = true
      ORDER BY date
    `, [year]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get holidays error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/holidays', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
  try {
    const { name, date, is_recurring = false, description } = req.body;
    
    if (!name || !date) {
      return res.status(400).json({ error: 'Name and date are required' });
    }
    
    const result = await pool.query(`
      INSERT INTO holidays (name, date, is_recurring, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, date, is_recurring, description]);
    
    // Log action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
      VALUES ($1, 'CREATE', 'holiday', $2, $3)
    `, [req.user.id, result.rows[0].id, JSON.stringify({ name, date })]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create holiday error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Team Calendar Route
app.get('/api/team-calendar', authenticateToken, authorize(['manager', 'hr', 'admin']), async (req, res) => {
  try {
    const { month, year = new Date().getFullYear() } = req.query;
    
    let query = `
      SELECT 
        lr.start_date, 
        lr.end_date,
        lr.duration,
        e.first_name,
        e.last_name,
        lt.name as leave_type,
        d.name as department
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.status = 'approved'
        AND EXTRACT(YEAR FROM lr.start_date) = $1
    `;
    
    const params = [year];
    let paramCount = 1;
    
    if (month) {
      paramCount++;
      query += ` AND (
        EXTRACT(MONTH FROM lr.start_date) = ${paramCount} OR
        EXTRACT(MONTH FROM lr.end_date) = ${paramCount}
      )`;
      params.push(month);
    }
    
    // Filter by manager's team if user is manager
    if (req.user.role === 'manager') {
      paramCount++;
      query += ` AND e.manager_id = ${paramCount}`;
      params.push(req.user.id);
    }
    
    query += ` ORDER BY lr.start_date`;
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get team calendar error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// File download route
app.get('/api/files/:filename', authenticateToken, (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filepath);
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password reset routes
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await pool.query(`
      SELECT id, email, first_name, last_name FROM employees WHERE email = $1 AND is_active = true
    `, [email]);
    
    if (user.rows.length === 0) {
      // Don't reveal if email exists or not
      return res.json({ message: 'If the email exists, a reset link will be sent.' });
    }
    
    // Generate reset token (in production, use crypto.randomBytes)
    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const resetExpiry = new Date(Date.now() + 3600000); // 1 hour from now
    
    await pool.query(`
      UPDATE employees 
      SET password_reset_token = $1, password_reset_expires = $2
      WHERE id = $3
    `, [resetToken, resetExpiry, user.rows[0].id]);
    
    // In production, send email with reset link
    console.log(`Password reset token for ${email}: ${resetToken}`);
    
    res.json({ message: 'If the email exists, a reset link will be sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    
    if (!token || !new_password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    const user = await pool.query(`
      SELECT id FROM employees 
      WHERE password_reset_token = $1 
        AND password_reset_expires > CURRENT_TIMESTAMP
        AND is_active = true
    `, [token]);
    
    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    await pool.query(`
      UPDATE employees 
      SET password = $1, 
          password_reset_token = NULL, 
          password_reset_expires = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [hashedPassword, user.rows[0].id]);
    
    // Log action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, resource, details)
      VALUES ($1, 'PASSWORD_RESET', 'auth', $2)
    `, [user.rows[0].id, JSON.stringify({ method: 'reset_token' })]);
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password route
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }
    
    // Get current password hash
    const user = await pool.query(`
      SELECT password FROM employees WHERE id = $1
    `, [req.user.id]);
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(current_password, user.rows[0].password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update password
    await pool.query(`
      UPDATE employees 
      SET password = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [hashedPassword, req.user.id]);
    
    // Log action
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, resource, details)
      VALUES ($1, 'PASSWORD_CHANGE', 'auth', $2)
    `, [req.user.id, JSON.stringify({ method: 'user_initiated' })]);
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 Leave Management API Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Local PostgreSQL'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();