# Trevi Foundations Leave Management System - Backend API

A comprehensive REST API for managing employee leave requests, built with Node.js, Express, and PostgreSQL.

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Leave Management**: Submit, approve, reject, and track leave requests
- **Employee Management**: Complete CRUD operations for HR administrators
- **Dashboard Analytics**: Real-time statistics and insights
- **File Uploads**: Support for leave supporting documents
- **Email Notifications**: Automated email alerts for leave status changes
- **Audit Logging**: Complete audit trail of all system actions
- **Reports**: Comprehensive reporting for HR and management
- **Team Calendar**: Visual representation of team leave schedules

## 🛠 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL 15+
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer
- **Security**: Helmet, CORS, Rate Limiting
- **Password**: bcryptjs
- **Validation**: Joi, express-validator

## 📋 Prerequisites

- Node.js 18.0 or higher
- PostgreSQL 15.0 or higher
- npm or yarn package manager

## ⚡ Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/trevi-foundations/leave-management-api.git
cd leave-management-api
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://username:password@localhost:5432/leave_management
JWT_SECRET=your-super-secret-jwt-key
FRONTEND_URL=http://localhost:3001
```

### 4. Database Setup

Create PostgreSQL database:

```sql
CREATE DATABASE leave_management;
CREATE USER leave_admin WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE leave_management TO leave_admin;
```

### 5. Run the Application

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The API will be available at `http://localhost:3000`

## 🧪 Testing

Run the test suite:

```bash
npm test
```

## 📁 Project Structure

```
├── server.js              # Main application entry point
├── package.json           # Dependencies and scripts
├── .env.example           # Environment variables template
├── docker-compose.yml     # Docker configuration
├── Dockerfile             # Docker image definition
├── nginx.conf             # Nginx configuration
├── migrations/            # Database migration scripts
├── seeds/                 # Database seed data
├── uploads/               # File upload directory
├── logs/                  # Application logs
└── tests/                 # Test files
```

## 🔐 Authentication

### Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@trevi.com",
  "password": "admin123"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "employee_id": "EMP001",
    "email": "admin@trevi.com",
    "first_name": "System",
    "last_name": "Admin",
    "role": "admin",
    "department": "HR"
  }
}
```

### Using the Token

Include in all requests:
```bash
Authorization: Bearer <your-jwt-token>
```

## 📚 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/change-password` - Change password

### Employees
- `GET /api/employees/profile` - Get current user profile
- `GET /api/employees` - Get all employees (HR/Admin)
- `POST /api/employees` - Create new employee (HR/Admin)

### Leave Requests
- `GET /api/leave-requests` - Get leave requests
- `POST /api/leave-requests` - Submit leave request
- `PATCH /api/leave-requests/:id/approve` - Approve request
- `PATCH /api/leave-requests/:id/reject` - Reject request

### Leave Balances
- `GET /api/leave-balances` - Get user's leave balances

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Reports
- `GET /api/reports/leave-summary` - Leave summary report
- `GET /api/reports/employee-leave-history` - Employee history

### Master Data
- `GET /api/departments` - Get departments
- `GET /api/leave-types` - Get leave types
- `GET /api/holidays` - Get holidays

## 🔄 Database Schema

### Core Tables

1. **employees** - User accounts and employee information
2. **departments** - Company departments
3. **leave_types** - Types of leave (Annual, Sick, etc.)
4. **leave_requests** - Leave applications
5. **leave_balances** - Employee leave entitlements
6. **holidays** - Company holidays
7. **audit_logs** - System activity logs

### Relationships

- Employees belong to departments
- Employees can have managers (self-referential)
- Leave requests are linked to employees and leave types
- Leave balances track remaining days per employee/type/year

## 🚀 Deployment Options

### Option 1: Railway (Recommended)

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on git push

### Option 2: Heroku

```bash
heroku create trevi-leave-management
heroku addons:create heroku-postgresql:hobby-dev
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret-key
git push heroku main
```

### Option 3: Docker

```bash
docker-compose up -d
```

### Option 4: DigitalOcean App Platform

1. Create new app from GitHub
2. Add PostgreSQL database
3. Configure environment variables
4. Deploy

## 🔧 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | No | `development` |
| `PORT` | Server port | No | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `FRONTEND_URL` | Frontend application URL | Yes | - |
| `EMAIL_HOST` | SMTP server host | No | - |
| `EMAIL_USER` | SMTP username | No | - |
| `EMAIL_PASSWORD` | SMTP password | No | - |

## 🛡️ Security Features

- JWT authentication with configurable expiry
- Password hashing with bcrypt
- Rate limiting to prevent abuse
- CORS protection
- SQL injection prevention with parameterized queries
- File upload validation and size limits
- Security headers with Helmet.js
- Input validation and sanitization

## 📊 Monitoring & Logging

- Request logging with Morgan
- Error tracking and reporting
- Database query logging
- Performance metrics
- Health check endpoint: `GET /api/health`

## 🧪 Default Demo Data

The system initializes with demo data:

**Default Admin User:**
- Email: `admin@trevi.com`
- Password: `admin123`
- Role: Admin

**Demo Departments:**
- Engineering
- HR
- Operations
- Finance
- Marketing

**Leave Types:**
- Annual Leave (21 days)
- Sick Leave (10 days)
- Emergency Leave (5 days)
- Maternity Leave (90 days)
- Paternity Leave (10 days)

## 🔧 Development

### Running in Development

```bash
npm run dev  # Uses nodemon for auto-restart
```

### Database Migrations

```bash
npm run migrate
```

### Seeding Test Data

```bash
npm run seed
```

### Code Style

The project follows Node.js best practices:
- ESLint for linting
- Prettier for code formatting
- Async/await for asynchronous operations
- Error handling middleware
- Modular architecture

## 📈 Performance Optimization

- Database indexing on frequently queried columns
- Connection pooling for PostgreSQL
- Caching strategies for static data
- Optimized SQL queries
- File upload streaming
- Gzip compression
- Response caching headers

## 🐳 Docker Support

The application includes full Docker support:

```bash
# Build and run with Docker Compose
docker-compose up -d

# Build individual container
docker build -t trevi-leave-api .

# Run with custom environment
docker run -p 3000:3000 --env-file .env trevi-leave-api
```

## 🔍 Health Monitoring

Health check endpoint provides system status:

```bash
GET /api/health
```

Response:
```json
{
  "status": "OK",
  "timestamp": "2025-09-09T10:30:00.000Z",
  "database": "connected",
  "uptime": 3600
}
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support, email support@trevi.com or create an issue in the repository.

## 📞 Contact

- **Email**: hr@trevi.com
- **Website**: https://trevi.com
- **Address**: Lagos, Nigeria

---

**Built with ❤️ for Trevi Foundations Nigeria Limited**